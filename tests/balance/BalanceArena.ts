/**
 * Balance arena for src/core.
 *
 * Runs the real simulation headlessly across a series of seeds for one or more
 * config variants, then reports the outcome metrics that balance questions
 * actually turn on — how long games last, how early they are decided, how
 * concentrated territory becomes, and how many structures the economy carries
 * — with a delta against the baseline and a noise estimate, so a change can be
 * called an effect or dismissed as seed variance.
 *
 * Usage:
 *   npm run balance -- [--variants baseline,gold-x2] [--seeds 5]
 *                      [--map pangaea] [--bots 40] [--nations default]
 *                      [--ticks 6000] [--sample 250] [--difficulty Medium]
 *                      [--json out.json] [--list]
 *
 * Every run is deterministic for a given seed + variant; the final simulation
 * hash is printed so an unintended behaviour change shows up immediately.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  UnitType,
} from "../../src/core/game/Game";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";
import { ArenaMapSource } from "./ArenaMap";
import { runArenaGame } from "./ArenaRun";
import { ArenaRunResult, sampleAt, stat, Stat } from "./Metrics";
import { resolveVariant, VARIANTS } from "./Variants";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

interface Options {
  variants: string[];
  seeds: number;
  map: GameMapType;
  mapSize: GameMapSize;
  bots: number;
  nations: "default" | "disabled" | number;
  difficulty: Difficulty;
  ticks: number;
  sample: number;
  json: string | null;
  list: boolean;
}

function resolveMap(name: string): GameMapType {
  const key = Object.keys(GameMapType).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (key === undefined) {
    throw new Error(`unknown map "${name}"`);
  }
  return GameMapType[key as keyof typeof GameMapType];
}

function resolveDifficulty(name: string): Difficulty {
  const key = Object.keys(Difficulty).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (key === undefined) {
    throw new Error(
      `unknown difficulty "${name}". Available: ${Object.keys(Difficulty).join(", ")}`,
    );
  }
  return Difficulty[key as keyof typeof Difficulty];
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    variants: ["baseline"],
    seeds: 5,
    map: GameMapType.Pangaea,
    mapSize: GameMapSize.Normal,
    bots: 40,
    nations: "default",
    difficulty: Difficulty.Medium,
    ticks: 6000,
    sample: 250,
    json: null,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case "--variants":
        opts.variants = next()
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        break;
      case "--seeds":
        opts.seeds = parseInt(next(), 10);
        break;
      case "--map":
        opts.map = resolveMap(next());
        break;
      case "--compact":
        opts.mapSize = GameMapSize.Compact;
        break;
      case "--bots":
        opts.bots = parseInt(next(), 10);
        break;
      case "--nations": {
        const v = next();
        opts.nations =
          v === "default" || v === "disabled" ? v : parseInt(v, 10);
        break;
      }
      case "--difficulty":
        opts.difficulty = resolveDifficulty(next());
        break;
      case "--ticks":
        opts.ticks = parseInt(next(), 10);
        break;
      case "--sample":
        opts.sample = parseInt(next(), 10);
        break;
      case "--json":
        opts.json = next();
        break;
      case "--list":
        opts.list = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Runs `fn` with the simulation's own chatter muted. The nation AI and
 * GameImpl log freely per tick ("cannot build Defense Post", constructor
 * timings); across a series that buries the report. console.error is left
 * alone so real failures still surface.
 */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const saved = {
    log: console.log,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };
  const noop = () => {};
  console.log = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ");
  return [
    line(headers),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...rows.map(line),
  ].join("\n");
}

function fmt(n: number, digits = 1): string {
  if (Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

/**
 * Delta against baseline, annotated with whether it clears the noise floor.
 * The standard error of the difference of two means is sqrt(sA²/nA + sB²/nB);
 * anything inside two of those is seed variance, not an effect.
 */
function delta(base: Stat, other: Stat): string {
  if (base.n === 0 || other.n === 0 || Number.isNaN(base.mean)) return "-";
  const diff = other.mean - base.mean;
  const se = Math.sqrt(
    (base.stdev * base.stdev) / Math.max(base.n, 1) +
      (other.stdev * other.stdev) / Math.max(other.n, 1),
  );
  const pct = base.mean === 0 ? NaN : (diff / Math.abs(base.mean)) * 100;
  const sign = diff >= 0 ? "+" : "";
  const magnitude = Number.isNaN(pct)
    ? `${sign}${fmt(diff, 2)}`
    : `${sign}${fmt(pct, 1)}%`;
  if (se === 0) return magnitude;
  return Math.abs(diff) > 2 * se ? `${magnitude} *` : `${magnitude} (ns)`;
}

interface VariantStats {
  name: string;
  runs: ArenaRunResult[];
  decidedTick: Stat;
  settledRate: number;
  finalAlive: Stat;
  leadShare: Stat;
  gini: Stat;
  goldHeld: Stat;
  cities: Stat;
  factories: Stat;
  ports: Stat;
  warships: Stat;
  winRate: number;
  winTick: Stat;
  wallMs: Stat;
}

function summarizeVariant(name: string, runs: ArenaRunResult[]): VariantStats {
  const last = (r: ArenaRunResult) => r.samples[r.samples.length - 1];
  const structure = (type: UnitType) =>
    stat(runs.map((r) => last(r).structures[type] ?? 0));
  return {
    name,
    runs,
    // Censored runs excluded: a run still changing leaders at the budget has
    // no meaningful "decided" tick, and averaging it in makes a shorter budget
    // look like a faster game.
    decidedTick: stat(
      runs
        .filter((r) => r.settled)
        .map((r) => r.decidedTick)
        .filter((t): t is number => t !== null),
    ),
    settledRate: runs.filter((r) => r.settled).length / runs.length,
    finalAlive: stat(runs.map((r) => r.finalAlive)),
    leadShare: stat(runs.map((r) => last(r).leadShare * 100)),
    gini: stat(runs.map((r) => last(r).gini)),
    goldHeld: stat(runs.map((r) => last(r).goldHeld)),
    cities: structure(UnitType.City),
    factories: structure(UnitType.Factory),
    ports: structure(UnitType.Port),
    warships: structure(UnitType.Warship),
    winRate: runs.filter((r) => r.winner !== null).length / runs.length,
    winTick: stat(
      runs.map((r) => r.winTick).filter((t): t is number => t !== null),
    ),
    wallMs: stat(runs.map((r) => r.wallMs)),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    console.log(
      table(
        ["variant", "description"],
        Object.values(VARIANTS).map((v) => [v.name, v.description]),
      ),
    );
    return;
  }

  console.debug = () => {}; // silence per-tick debug logging
  const variants = opts.variants.map(resolveVariant);
  const seeds = Array.from({ length: opts.seeds }, (_, i) => `arena-${i}`);
  const mapSource = new ArenaMapSource(
    new NodeGameMapLoader(path.join(PROJECT_ROOT, "resources/maps")),
  );

  console.log(
    `Balance arena: ${variants.length} variant(s) x ${seeds.length} seed(s) = ` +
      `${variants.length * seeds.length} games\n` +
      `map=${opts.map} bots=${opts.bots} nations=${opts.nations} ` +
      `difficulty=${opts.difficulty} ticks=${opts.ticks} sample=${opts.sample}\n`,
  );

  const byVariant = new Map<string, ArenaRunResult[]>();
  const startedAll = performance.now();

  for (const variant of variants) {
    const runs: ArenaRunResult[] = [];
    for (const seed of seeds) {
      const result = await quietly(() =>
        runArenaGame({
          variant: variant.name,
          seed,
          map: opts.map,
          mapSize: opts.mapSize,
          bots: opts.bots,
          nations: opts.nations,
          difficulty: opts.difficulty,
          maxTicks: opts.ticks,
          sampleEvery: opts.sample,
          overrides: variant.overrides,
          mapSource,
        }),
      );
      runs.push(result);
      const winTxt =
        result.winner === null
          ? "no winner"
          : `winner ${result.winner.name} @${result.winTick}`;
      console.log(
        `  ${variant.name.padEnd(14)} ${seed.padEnd(9)} ` +
          `${(result.wallMs / 1000).toFixed(1)}s  ` +
          `alive ${String(result.finalAlive).padStart(3)}  ` +
          `${
            result.settled
              ? `decided @${String(result.decidedTick).padStart(5)}`
              : "still contested".padEnd(15)
          }  hash ${result.finalHash}  ${winTxt}`,
      );
    }
    byVariant.set(variant.name, runs);
  }

  const stats = [...byVariant.entries()].map(([name, runs]) =>
    summarizeVariant(name, runs),
  );
  const baseline = stats.find((s) => s.name === "baseline") ?? stats[0];

  const rows: string[][] = [];
  const metric = (
    label: string,
    pick: (s: VariantStats) => Stat,
    digits = 1,
  ) => {
    for (const s of stats) {
      rows.push([
        s === stats[0] ? label : "",
        s.name,
        `${fmt(pick(s).mean, digits)} +/- ${fmt(pick(s).stdev, digits)}`,
        `${fmt(pick(s).min, digits)}..${fmt(pick(s).max, digits)}`,
        s === baseline ? "" : delta(pick(baseline), pick(s)),
      ]);
    }
    rows.push(["", "", "", "", ""]);
  };

  metric("decided at tick", (s) => s.decidedTick, 0);
  metric("players alive", (s) => s.finalAlive, 1);
  metric("leader share %", (s) => s.leadShare, 1);
  metric("territory gini", (s) => s.gini, 3);
  metric("gold held", (s) => s.goldHeld, 0);
  metric("cities", (s) => s.cities, 1);
  metric("factories", (s) => s.factories, 1);
  metric("ports", (s) => s.ports, 1);
  metric("warships", (s) => s.warships, 1);

  console.log(`\n${"=".repeat(78)}\nRun outcomes\n${"=".repeat(78)}`);
  console.log(
    table(
      [
        "variant",
        "games",
        "won within budget",
        "settled (lead stopped changing)",
      ],
      stats.map((s) => [
        s.name,
        String(s.runs.length),
        `${(s.winRate * 100).toFixed(0)}%`,
        `${(s.settledRate * 100).toFixed(0)}%`,
      ]),
    ),
  );
  if (stats.some((s) => s.settledRate < 1)) {
    console.log(
      "\nNote: 'decided at tick' below covers settled runs only. A low settled\n" +
        "rate means the budget (--ticks) is too short to compare game length.",
    );
  }

  console.log(
    `\n${"=".repeat(78)}\nOutcome metrics (at end of run)\n${"=".repeat(78)}`,
  );
  console.log(
    table(["metric", "variant", "mean +/- sd", "range", "vs baseline"], rows),
  );
  console.log(
    "\n* = difference exceeds 2 standard errors, (ns) = within seed noise.",
  );

  // Curves on a shared grid, so snowballing can be read over time rather than
  // only at the end.
  const grid: number[] = [];
  for (let t = 0; t <= opts.ticks; t += Math.max(opts.sample, 1) * 4) {
    grid.push(t);
  }
  const curveRows: string[][] = [];
  for (const s of stats) {
    for (const [label, pick] of [
      ["leader share %", (x: { leadShare: number }) => x.leadShare * 100],
      ["alive", (x: { alive: number }) => x.alive],
    ] as const) {
      curveRows.push([
        s.name,
        label,
        ...grid.map((t) => {
          const vals = s.runs
            .map((r) => sampleAt(r.samples, t, pick))
            .filter((v): v is number => v !== null);
          return vals.length === 0
            ? "-"
            : fmt(vals.reduce((a, b) => a + b, 0) / vals.length, 1);
        }),
      ]);
    }
  }
  console.log(
    `\n${"=".repeat(78)}\nCurves (mean over seeds, by tick)\n${"=".repeat(78)}`,
  );
  console.log(
    table(["variant", "metric", ...grid.map((t) => `t${t}`)], curveRows),
  );

  console.log(
    `\nTotal wall time: ${((performance.now() - startedAll) / 1000).toFixed(1)}s`,
  );

  if (opts.json !== null) {
    const out = path.resolve(opts.json);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        { options: { ...opts }, results: Object.fromEntries(byVariant) },
        null,
        2,
      ),
    );
    console.log(`Wrote ${out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
