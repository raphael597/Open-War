/**
 * Industry, resources and cyber warfare — the systems layered on top of the
 * base territorial game.
 *
 * Everything here runs inside the deterministic simulation, so it must not
 * touch Math.random, Date, or anything else that differs between clients.
 * Resource deposits are derived from the tile index with an integer hash: no
 * map data changes, and every client computes the same deposits.
 */

import { UnitType } from "./Game";
import type { TileRef } from "./GameMap";

/** Raw resources found on the map. */
export enum ResourceType {
  Steel = "Steel",
  Oil = "Oil",
  Uranium = "Uranium",
}

export const AllResourceTypes: readonly ResourceType[] = [
  ResourceType.Steel,
  ResourceType.Oil,
  ResourceType.Uranium,
] as const;

/** What a city is specialized for. Cities start Unspecialized. */
export enum CityRole {
  Unspecialized = "Unspecialized",
  Metropolis = "Metropolis",
  Garrison = "Garrison",
  Shipyard = "Shipyard",
  Research = "Research",
}

export const SpecializedCityRoles: readonly CityRole[] = [
  CityRole.Metropolis,
  CityRole.Garrison,
  CityRole.Shipyard,
  CityRole.Research,
] as const;

/** Offensive cyber operations. Each hits one enemy player for a duration. */
export enum CyberOp {
  /** Target loses map/leaderboard vision. */
  Blackout = "Blackout",
  /** Target's missile silos are jammed and cannot launch. */
  Stuxnet = "Stuxnet",
  /** Target's trade income is redirected to the attacker. */
  TradeHack = "TradeHack",
  /** Target's attacks are attributed to a third player. */
  FalseFlag = "FalseFlag",
}

export const AllCyberOps: readonly CyberOp[] = [
  CyberOp.Blackout,
  CyberOp.Stuxnet,
  CyberOp.TradeHack,
  CyberOp.FalseFlag,
] as const;

/** Global events that periodically shake up the whole match. */
export enum WorldEventType {
  /** All resource deposits yield double for the duration. */
  ResourceBoom = "ResourceBoom",
  /** Trade ships earn nothing — sea routes are closed. */
  Storm = "Storm",
  /** Nukes cannot be built for the duration. */
  NukeMoratorium = "NukeMoratorium",
}

export const AllWorldEventTypes: readonly WorldEventType[] = [
  WorldEventType.ResourceBoom,
  WorldEventType.Storm,
  WorldEventType.NukeMoratorium,
] as const;

export interface WorldEvent {
  type: WorldEventType;
  startTick: number;
  endTick: number;
}

/**
 * An unattributed cyber hit the victim knows about but cannot yet trace. The
 * attacker only becomes visible once the game reaches `revealAtTick`.
 */
export interface CyberIncident {
  op: CyberOp;
  /** smallID of the real attacker. */
  attacker: number;
  startedAt: number;
  revealAtTick: number;
  /** Set once the victim has been told who was behind it. */
  revealed?: boolean;
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

/**
 * 32-bit integer mix (murmur3 finalizer). Stays in int32 range the whole way,
 * so every JS engine produces identical results — required for determinism.
 */
function hash32(value: number): number {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * One land tile in `DEPOSIT_SPACING` carries a deposit. Deposits are sparse on
 * purpose: they should be worth fighting a war over, not something every
 * player trips into.
 */
const DEPOSIT_SPACING = 179;

/** Cumulative distribution over deposit types, in percent. */
const STEEL_SHARE = 50;
const OIL_SHARE = 85; // 85 - 50 = 35% oil, remaining 15% uranium

/**
 * The deposit on a tile, or null. Caller must check the tile is land — water
 * tiles never hold deposits, and this function does not know the terrain.
 */
export function depositAt(tile: TileRef): ResourceType | null {
  if (hash32(tile ^ 0x9e3779b9) % DEPOSIT_SPACING !== 0) {
    return null;
  }
  const roll = hash32(tile + 0x7f4a7c15) % 100;
  if (roll < STEEL_SHARE) return ResourceType.Steel;
  if (roll < OIL_SHARE) return ResourceType.Oil;
  return ResourceType.Uranium;
}

// ---------------------------------------------------------------------------
// Nuclear material requirements
// ---------------------------------------------------------------------------

/** Uranium deposits a player must control to build the given unit. */
export function uraniumRequiredFor(type: UnitType): number {
  switch (type) {
    case UnitType.AtomBomb:
      return 1;
    case UnitType.HydrogenBomb:
      return 3;
    case UnitType.MIRV:
      return 8;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Player-visible snapshot
// ---------------------------------------------------------------------------

/**
 * The industry/cyber state that rides along on PlayerUpdate. Kept as one
 * object so the diffing in GameUpdateUtils stays a single comparison.
 */
export interface IndustryUpdate {
  steel: number;
  oil: number;
  uranium: number;
  production: number;
  intel: number;
  /** Tile of the player's capital city, or null if they have none. */
  capital: TileRef | null;
  /** Number of factories in the player's largest rail-connected cluster. */
  industrialZone: number;
  /**
   * Cities per role weighted by supply: a city cut off from the capital
   * counts as a fraction of one. This is what the economy formulas read, so
   * the sim and the HUD always agree on it.
   */
  suppliedCities: Partial<Record<CityRole, number>>;
  /** Tick each active cyber effect expires on; absent key = not affected. */
  cyberEffects: Partial<Record<CyberOp, number>>;
  /** Incidents the victim can see; `attacker` is -1 until traced. */
  incidents: CyberIncident[];
  /** Earliest tick this player may launch another cyber op. */
  cyberReadyAt: number;
}

export function emptyIndustryUpdate(): IndustryUpdate {
  return {
    steel: 0,
    oil: 0,
    uranium: 0,
    production: 0,
    intel: 0,
    capital: null,
    industrialZone: 0,
    suppliedCities: {},
    cyberEffects: {},
    incidents: [],
    cyberReadyAt: 0,
  };
}

export function industryUpdateEqual(
  a: IndustryUpdate | undefined,
  b: IndustryUpdate | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (
    a.steel !== b.steel ||
    a.oil !== b.oil ||
    a.uranium !== b.uranium ||
    a.production !== b.production ||
    a.intel !== b.intel ||
    a.capital !== b.capital ||
    a.industrialZone !== b.industrialZone ||
    a.cyberReadyAt !== b.cyberReadyAt ||
    a.incidents.length !== b.incidents.length
  ) {
    return false;
  }
  for (const op of AllCyberOps) {
    if (a.cyberEffects[op] !== b.cyberEffects[op]) return false;
  }
  for (const role of SpecializedCityRoles) {
    if (a.suppliedCities[role] !== b.suppliedCities[role]) return false;
  }
  for (let i = 0; i < a.incidents.length; i++) {
    const x = a.incidents[i];
    const y = b.incidents[i];
    if (
      x.op !== y.op ||
      x.attacker !== y.attacker ||
      x.startedAt !== y.startedAt ||
      x.revealAtTick !== y.revealAtTick
    ) {
      return false;
    }
  }
  return true;
}
