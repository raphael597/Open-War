import { PlayerView } from "../../src/client/view";
import { Gold, Player, UnitType } from "../../src/core/game/Game";
import { OverrideFactory } from "./ArenaConfig";

export interface Variant {
  name: string;
  description: string;
  overrides: OverrideFactory;
}

/**
 * The variants the arena can run. `baseline` must always exist and must never
 * override anything — every comparison is measured against it.
 *
 * The three demo variants below are deliberately simple, well-understood
 * levers. They exist to show the harness detects a change at all; the real
 * variants get added next to whatever balance question is being asked.
 */
export const VARIANTS: Record<string, Variant> = {
  baseline: {
    name: "baseline",
    description: "Unmodified config",
    overrides: () => ({}),
  },

  "gold-x2": {
    name: "gold-x2",
    description: "Passive gold income doubled",
    overrides: (base) => ({
      goldAdditionRate: (player: Player | PlayerView): Gold =>
        base.goldAdditionRate(player) * 2n,
    }),
  },

  "city-cost-x2": {
    name: "city-cost-x2",
    description: "Cities cost twice as much to build",
    overrides: (base) => ({
      unitInfo: (type: UnitType) => {
        const info = base.unitInfo(type);
        if (type !== UnitType.City) return info;
        return { ...info, cost: (g, p) => info.cost(g, p) * 2n };
      },
    }),
  },

  "gold-storage-off": {
    name: "gold-storage-off",
    description:
      "Treasury ceiling effectively removed — the control for Ideenliste 9",
    overrides: () => ({
      goldStorageFloor: () => 10n ** 30n,
      maxGold: () => 10n ** 30n,
    }),
  },

  "gold-storage-tight": {
    name: "gold-storage-tight",
    description:
      "Treasury ceiling at a tenth of the default (Ideenliste 9 calibration)",
    overrides: (base) => ({
      goldStorageBase: () => base.goldStorageBase() / 10n,
      goldStoragePerCity: () => base.goldStoragePerCity() / 10n,
      goldStorageFloor: () => base.goldStorageFloor() / 10n,
      mirvMaxCost: () => base.mirvMaxCost() / 10n,
    }),
  },

  "sam-fast": {
    name: "sam-fast",
    description: "SAM cooldown halved (90 -> 45 ticks)",
    overrides: () => ({ SAMCooldown: () => 45 }),
  },
};

export function resolveVariant(name: string): Variant {
  const v = VARIANTS[name];
  if (v === undefined) {
    throw new Error(
      `unknown variant "${name}". Available: ${Object.keys(VARIANTS).join(", ")}`,
    );
  }
  return v;
}
