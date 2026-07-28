import { UnitType } from "../../src/core/game/Game";

/** Structures whose count over time says something about the economy. */
export const TRACKED_STRUCTURES = [
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
  UnitType.MissileSilo,
  UnitType.SAMLauncher,
  UnitType.DefensePost,
  UnitType.Warship,
] as const;

export type StructureCounts = Record<string, number>;

export interface ArenaSample {
  tick: number;
  /** Players still alive. */
  alive: number;
  /** Land tiles held by any player (excludes unclaimed land). */
  ownedTiles: number;
  /** smallID of the current territory leader, null if nobody owns anything. */
  leaderID: number | null;
  leaderTiles: number;
  /** leaderTiles / ownedTiles — the snowball curve. */
  leadShare: number;
  /** Territory inequality across living players, 0 = equal, 1 = one player owns all. */
  gini: number;
  /** Gold held by all living players. Hoarding shows up here. */
  goldHeld: number;
  structures: StructureCounts;
}

export interface RunWinner {
  kind: "player" | "team";
  name: string;
  /** PlayerType for a player winner, null for a team. */
  playerType: string | null;
}

export interface ArenaRunResult {
  variant: string;
  seed: string;
  /** Turns the spawn phase consumed. */
  spawnTurns: number;
  /** Ticks simulated after the spawn phase. */
  ticksRun: number;
  /** Null if no winner within the tick budget — the common case for long games. */
  winner: RunWinner | null;
  winTick: number | null;
  /**
   * Earliest sampled tick from which the eventual leader never changed again.
   * The "when was it effectively over" number: low means the game decides
   * early and the rest is mopping up.
   */
  decidedTick: number | null;
  /**
   * False when the lead was still changing at the last sample — the run hit
   * the tick budget before settling, so its `decidedTick` is censored at the
   * end of the run and must be excluded from any average. Reporting censored
   * runs as if they had decided is the easiest way to read a shorter budget as
   * a faster game.
   */
  settled: boolean;
  finalAlive: number;
  samples: ArenaSample[];
  /** Simulation hash of the last tick — same seed + same config must match. */
  finalHash: number | null;
  wallMs: number;
}

/**
 * Gini coefficient over territory. 0 = everyone equal, → 1 = one player owns
 * everything. This is the snowball measure that a single leader-share number
 * misses: two players at 40% each is a very different game from one at 80%.
 */
export function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    sum += sorted[i];
    weighted += (i + 1) * sorted[i];
  }
  if (sum === 0) return 0;
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

export interface Stat {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  /** Sample standard deviation; 0 when n < 2. */
  stdev: number;
}

export function stat(values: number[]): Stat {
  const n = values.length;
  if (n === 0)
    return { n: 0, mean: NaN, median: NaN, min: NaN, max: NaN, stdev: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance =
    n < 2 ? 0 : values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return {
    n,
    mean,
    median,
    min: sorted[0],
    max: sorted[n - 1],
    stdev: Math.sqrt(variance),
  };
}

/**
 * Computes the earliest sampled tick from which `leaderID` stayed constant
 * through the end of the run. Returns null when there is no leader at all.
 */
export function settledOf(samples: ArenaSample[]): boolean {
  if (samples.length < 2) return false;
  const decided = decidedTickOf(samples);
  return decided !== null && decided < samples[samples.length - 1].tick;
}

export function decidedTickOf(samples: ArenaSample[]): number | null {
  if (samples.length === 0) return null;
  const finalLeader = samples[samples.length - 1].leaderID;
  if (finalLeader === null) return null;
  let decided = samples[samples.length - 1].tick;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].leaderID !== finalLeader) break;
    decided = samples[i].tick;
  }
  return decided;
}

/** Linear interpolation of a per-run curve onto a shared tick grid. */
export function sampleAt(
  samples: ArenaSample[],
  tick: number,
  pick: (s: ArenaSample) => number,
): number | null {
  if (samples.length === 0) return null;
  if (tick <= samples[0].tick) return pick(samples[0]);
  const last = samples[samples.length - 1];
  if (tick >= last.tick) return null; // run ended before this tick: no data
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].tick >= tick) {
      const a = samples[i - 1];
      const b = samples[i];
      const span = b.tick - a.tick;
      if (span === 0) return pick(b);
      const t = (tick - a.tick) / span;
      return pick(a) + (pick(b) - pick(a)) * t;
    }
  }
  return null;
}
