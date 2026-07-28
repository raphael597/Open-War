# Balance Arena

A headless harness for answering "did this config change make the game better
or worse" with numbers instead of intuition. It runs the real `src/core`
simulation across a series of seeds for one or more config variants and reports
outcome metrics with a delta against the baseline and a noise estimate.

Lives entirely in `tests/balance/`. It touches no game code, no wire schema and
no translations.

## Usage

```bash
npm run balance -- --list # show available variants
npm run balance -- --variants baseline,gold-x2 --seeds 5
npm run balance -- --variants baseline --ticks 12000 --map world --bots 200
npm run balance -- --variants baseline,gold-x2 --json out/run.json
```

| Flag           | Default    | Meaning                                    |
| -------------- | ---------- | ------------------------------------------ |
| `--variants`   | `baseline` | Comma-separated variant names              |
| `--seeds`      | `5`        | Runs per variant (`arena-0`, `arena-1`, …) |
| `--map`        | `pangaea`  | Any production map                         |
| `--compact`    | off        | Use the compact (4x) map size              |
| `--bots`       | `40`       | Bot count                                  |
| `--nations`    | `default`  | `default`, `disabled`, or a number         |
| `--difficulty` | `Medium`   | Nation AI difficulty                       |
| `--ticks`      | `6000`     | Ticks simulated after the spawn phase      |
| `--sample`     | `250`      | Sample the game state every N ticks        |
| `--json`       | —          | Write raw per-run results for offline work |

Roughly 10 seconds per 4000-tick game on `pangaea` with 30 bots, so a
2-variant × 5-seed series is about two minutes.

## Metrics

- **decided at tick** — earliest tick from which the eventual territory leader
  never changed again. The "when was it effectively over" number.
- **settled** — whether the lead had stopped changing by the end of the run.
  Runs that are still contested at the tick budget are _excluded_ from the
  decided-at-tick average, because their value is censored at the budget; a
  low settled rate means `--ticks` is too short to compare game length at all.
- **leader share %** — the leader's share of all owned land. The snowball curve.
- **territory gini** — territory inequality across living players. Catches what
  leader share misses: two players at 40% is a very different game from one
  at 80%.
- **gold held / cities / factories / ports / warships** — where the economy
  ended up. The saturation questions in `docs/Ideenliste.md` are read here.

`*` marks a difference larger than two standard errors of the difference of
means; `(ns)` marks one inside seed noise. With 3–5 seeds only large effects
clear the bar — raise `--seeds` before believing a small delta.

## Adding a variant

Variants live in `tests/balance/Variants.ts`. An override is a partial `Config`;
the factory receives the untouched config so a variant can wrap the original
rather than restate it.

```ts
"city-cost-x2": {
  name: "city-cost-x2",
  description: "Cities cost twice as much to build",
  overrides: (base) => ({
    unitInfo: (type) => {
      const info = base.unitInfo(type);
      if (type !== UnitType.City) return info;
      return { ...info, cost: (g, p) => info.cost(g, p) * 2n };
    },
  }),
},
```

Call `base.foo()` for the original value — calling it on the overridden config
would recurse. Overrides are applied through a proxy that rebinds every method
to itself, so `Config`'s own internal `this.foo()` calls also see them.

## Why runs cannot share a map

`loadTerrainMap()` memoises `TerrainMapData` in a module-level cache, and a
`GameMap` owns both the mutable ownership/fallout state _and_ the terrain bytes,
which `WaterManager` rewrites at runtime. Running several games in one process
through the normal loader therefore starts run N+1 on run N's finished map.

This was measured, not assumed: two runs with an identical seed produced
different final hashes (`3267067694461049` vs `2640079332405125`), 49 vs 30
survivors, and `cannot spawn` errors on the second run — while still looking
like plausible results.

`ArenaMapSource` reads each map file exactly once and rebuilds a `GameMap` over
a fresh copy of the bytes for every run. `tests/balance/BalanceArena.test.ts`
guards both halves of this (ownership and terrain), plus determinism: the same
seed and variant must produce the same final simulation hash.
