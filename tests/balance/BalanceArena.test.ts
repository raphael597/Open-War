import path from "path";
import { describe, expect, it } from "vitest";
import { Config } from "../../src/core/configuration/Config";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
} from "../../src/core/game/Game";
import { GameConfig } from "../../src/core/Schemas";
import { NodeGameMapLoader } from "../perf/fullgame/NodeGameMapLoader";
import { withOverrides } from "./ArenaConfig";
import { ArenaMapSource } from "./ArenaMap";
import { runArenaGame } from "./ArenaRun";
import { decidedTickOf, gini, sampleAt, stat } from "./Metrics";

const PROJECT_ROOT = path.resolve(__dirname, "../..");

function baseConfig(): Config {
  const gameConfig: GameConfig = {
    gameMap: GameMapType.Pangaea,
    gameMapSize: GameMapSize.Normal,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty: Difficulty.Medium,
    nations: "default",
    donateGold: false,
    donateTroops: false,
    bots: 10,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  return new Config(gameConfig, null, false);
}

function mapSource(): ArenaMapSource {
  return new ArenaMapSource(
    new NodeGameMapLoader(path.join(PROJECT_ROOT, "resources/maps")),
  );
}

const runOpts = {
  map: GameMapType.Pangaea,
  mapSize: GameMapSize.Normal,
  bots: 10,
  nations: "default" as const,
  difficulty: Difficulty.Medium,
  maxTicks: 300,
  sampleEvery: 100,
};

describe("withOverrides", () => {
  it("returns the base config untouched when nothing is overridden", () => {
    const base = baseConfig();
    expect(withOverrides(base, {})).toBe(base);
  });

  it("replaces the overridden method and leaves the rest alone", () => {
    const base = baseConfig();
    const cfg = withOverrides(base, { SAMCooldown: () => 45 });
    expect(cfg.SAMCooldown()).toBe(45);
    expect(cfg.SiloCooldown()).toBe(base.SiloCooldown());
    expect(base.SAMCooldown()).toBe(90); // base itself is not mutated
  });

  it("propagates overrides into Config's own internal this-calls", () => {
    // railroadMaxSize() is trainStationMaxRange() * 1.4142, read through
    // `this`. If the proxy bound methods to the target instead of to itself,
    // this would silently return the unmodified value — the failure mode that
    // makes a variant look like it changed nothing.
    const base = baseConfig();
    const cfg = withOverrides(base, { trainStationMaxRange: () => 200 });
    expect(cfg.trainStationMaxRange()).toBe(200);
    expect(cfg.railroadMaxSize()).toBeCloseTo(200 * 1.4142, 5);
    expect(base.railroadMaxSize()).toBeCloseTo(110 * 1.4142, 5);
  });

  it("lets an override wrap the original behaviour via the base config", () => {
    const base = baseConfig();
    const original = base.unitInfo(UnitType.City);
    const cfg = withOverrides(base, {
      unitInfo: (type: UnitType) => {
        const info = base.unitInfo(type);
        if (type !== UnitType.City) return info;
        return { ...info, cost: () => 7n };
      },
    });
    expect(cfg.unitInfo(UnitType.City).cost({} as never, {} as never)).toBe(7n);
    expect(cfg.unitInfo(UnitType.Port)).toBe(base.unitInfo(UnitType.Port));
    expect(original.constructionDuration).toBe(
      cfg.unitInfo(UnitType.City).constructionDuration,
    );
  });
});

describe("ArenaMapSource", () => {
  it("hands out an unowned map on every load", async () => {
    const source = mapSource();
    const first = await source.load(GameMapType.Pangaea, GameMapSize.Normal);
    // Claim a land tile, as a game would.
    let landTile = -1;
    first.gameMap.forEachTile((t) => {
      if (landTile === -1 && first.gameMap.isLand(t)) landTile = t;
    });
    expect(landTile).toBeGreaterThanOrEqual(0);
    first.gameMap.setOwnerID(landTile, 42);
    expect(first.gameMap.ownerID(landTile)).toBe(42);

    const second = await source.load(GameMapType.Pangaea, GameMapSize.Normal);
    expect(second.gameMap).not.toBe(first.gameMap);
    expect(second.gameMap.ownerID(landTile)).toBe(0);
  });

  it("does not share terrain bytes between loads", async () => {
    // WaterManager rewrites terrain during a game, so a shared terrain array
    // would leak map edits across runs even though ownership is per-instance.
    const source = mapSource();
    const first = await source.load(GameMapType.Pangaea, GameMapSize.Normal);
    let landTile = -1;
    first.gameMap.forEachTile((t) => {
      if (landTile === -1 && first.gameMap.isLand(t)) landTile = t;
    });
    first.gameMap.setWater(landTile);
    expect(first.gameMap.isLand(landTile)).toBe(false);

    const second = await source.load(GameMapType.Pangaea, GameMapSize.Normal);
    expect(second.gameMap.isLand(landTile)).toBe(true);
  });
});

describe("metrics", () => {
  it("gini is 0 for equal shares and approaches 1 for a monopoly", () => {
    expect(gini([10, 10, 10, 10])).toBeCloseTo(0, 6);
    expect(gini([0, 0, 0, 100])).toBeGreaterThan(0.7);
    expect(gini([])).toBe(0);
    expect(gini([0, 0])).toBe(0);
  });

  it("decidedTickOf finds the first tick of the final leader's unbroken run", () => {
    const s = (tick: number, leaderID: number | null) =>
      ({
        tick,
        leaderID,
        alive: 0,
        ownedTiles: 0,
        leaderTiles: 0,
        leadShare: 0,
        gini: 0,
        goldHeld: 0,
        structures: {},
      }) as const;
    expect(decidedTickOf([s(0, 1), s(100, 2), s(200, 3), s(300, 3)])).toBe(200);
    expect(decidedTickOf([s(0, 5), s(100, 5), s(200, 5)])).toBe(0);
    // A leader who led early, lost the lead, and regained it is only decided
    // from the point the lead stopped changing.
    expect(decidedTickOf([s(0, 1), s(100, 2), s(200, 1)])).toBe(200);
    expect(decidedTickOf([])).toBe(null);
  });

  it("stat reports mean, median and spread", () => {
    const s = stat([1, 2, 3, 4]);
    expect(s.n).toBe(4);
    expect(s.mean).toBe(2.5);
    expect(s.median).toBe(2.5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(4);
    expect(s.stdev).toBeCloseTo(1.2909944, 5);
    expect(stat([]).n).toBe(0);
    expect(stat([7]).stdev).toBe(0);
  });

  it("sampleAt interpolates and refuses to extrapolate past the run", () => {
    const s = (tick: number, alive: number) =>
      ({
        tick,
        alive,
        leaderID: null,
        ownedTiles: 0,
        leaderTiles: 0,
        leadShare: 0,
        gini: 0,
        goldHeld: 0,
        structures: {},
      }) as const;
    const samples = [s(0, 10), s(100, 20)];
    expect(sampleAt(samples, 50, (x) => x.alive)).toBe(15);
    expect(sampleAt(samples, 0, (x) => x.alive)).toBe(10);
    expect(sampleAt(samples, 500, (x) => x.alive)).toBe(null);
  });
});

describe("arena runs", () => {
  it("is deterministic: same seed and variant give the same hash", async () => {
    const source = mapSource();
    const opts = {
      ...runOpts,
      variant: "baseline",
      seed: "determinism",
      overrides: () => ({}),
      mapSource: source,
    };
    const a = await runArenaGame(opts);
    const b = await runArenaGame(opts);
    expect(a.finalHash).not.toBeNull();
    expect(b.finalHash).toBe(a.finalHash);
    expect(b.finalAlive).toBe(a.finalAlive);
    expect(b.samples.map((s) => s.ownedTiles)).toEqual(
      a.samples.map((s) => s.ownedTiles),
    );
  }, 120_000);

  it("isolates consecutive runs from each other", async () => {
    // The regression this whole harness is built around: with the shared
    // module-level map cache, run B on the same seed diverged from run A.
    const source = mapSource();
    const first = await runArenaGame({
      ...runOpts,
      variant: "baseline",
      seed: "isolation",
      overrides: () => ({}),
      mapSource: source,
    });
    await runArenaGame({
      ...runOpts,
      variant: "baseline",
      seed: "some-other-seed",
      overrides: () => ({}),
      mapSource: source,
    });
    const repeat = await runArenaGame({
      ...runOpts,
      variant: "baseline",
      seed: "isolation",
      overrides: () => ({}),
      mapSource: source,
    });
    expect(repeat.finalHash).toBe(first.finalHash);
  }, 180_000);

  it("a config variant actually changes the simulation", async () => {
    const source = mapSource();
    const base = await runArenaGame({
      ...runOpts,
      variant: "baseline",
      seed: "variant-effect",
      overrides: () => ({}),
      mapSource: source,
    });
    const rich = await runArenaGame({
      ...runOpts,
      variant: "gold-x10",
      seed: "variant-effect",
      overrides: (cfg) => ({
        goldAdditionRate: (p) => cfg.goldAdditionRate(p) * 10n,
      }),
      mapSource: source,
    });
    expect(rich.finalHash).not.toBe(base.finalHash);
    const goldOf = (r: typeof base) => r.samples[r.samples.length - 1].goldHeld;
    expect(goldOf(rich)).toBeGreaterThan(goldOf(base));
  }, 180_000);
});
