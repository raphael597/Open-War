import {
  GameMapSize,
  GameMapType,
  TeamGameSpawnAreas,
} from "../../src/core/game/Game";
import { GameMap } from "../../src/core/game/GameMap";
import { GameMapLoader } from "../../src/core/game/GameMapLoader";
import {
  AdditionalNation,
  genTerrainFromBin,
  MapManifest,
  MapMetadata,
  Nation,
} from "../../src/core/game/TerrainMapLoader";

export interface ArenaTerrain {
  nations: Nation[];
  additionalNations: AdditionalNation[];
  gameMap: GameMap;
  miniGameMap: GameMap;
  teamGameSpawnAreas?: TeamGameSpawnAreas;
}

interface CachedFiles {
  manifest: MapManifest;
  mapBin: Uint8Array;
  map4xBin: Uint8Array;
  map16xBin: Uint8Array;
}

/**
 * Per-run map source for the balance arena.
 *
 * The arena runs many games back to back in one process, which the normal
 * loader cannot support: `loadTerrainMap()` memoises TerrainMapData in a
 * module-level cache, and a GameMap owns *both* the mutable ownership/fallout
 * state and the terrain bytes — which WaterManager rewrites at runtime
 * (setWater/setOcean/setMagnitude). Reusing a cached map therefore starts run
 * N+1 on run N's finished map. Measured, not assumed: two runs with an
 * identical seed produced different final hashes (3267067694461049 vs
 * 2640079332405125), 49 vs 30 survivors, and "cannot spawn" errors on the
 * second run.
 *
 * So each map file is read exactly once and every run gets a GameMap built
 * over a fresh copy of the bytes. Copying is ~2 MB per map — negligible next
 * to a multi-thousand-tick game, and the alternative is silently invalid
 * results that still look plausible.
 */
export class ArenaMapSource {
  private cache = new Map<GameMapType, CachedFiles>();

  constructor(private loader: GameMapLoader) {}

  private async files(map: GameMapType): Promise<CachedFiles> {
    const cached = this.cache.get(map);
    if (cached !== undefined) return cached;
    const data = this.loader.getMapData(map);
    const files: CachedFiles = {
      manifest: await data.manifest(),
      mapBin: await data.mapBin(),
      map4xBin: await data.map4xBin(),
      map16xBin: await data.map16xBin(),
    };
    this.cache.set(map, files);
    return files;
  }

  private static async build(
    meta: MapMetadata,
    bytes: Uint8Array,
  ): Promise<GameMap> {
    // The copy is the point: GameMapImpl keeps this array as its terrain and
    // WaterManager writes through it.
    return genTerrainFromBin(meta, new Uint8Array(bytes));
  }

  /** Returns a terrain set no previous run holds a reference to. */
  async load(map: GameMapType, size: GameMapSize): Promise<ArenaTerrain> {
    const { manifest, mapBin, map4xBin, map16xBin } = await this.files(map);
    const compact = size === GameMapSize.Compact;

    const gameMap = compact
      ? await ArenaMapSource.build(manifest.map4x, map4xBin)
      : await ArenaMapSource.build(manifest.map, mapBin);
    const miniGameMap = compact
      ? await ArenaMapSource.build(manifest.map16x, map16xBin)
      : await ArenaMapSource.build(manifest.map4x, map4xBin);

    // Cloned before scaling: loadTerrainMap() halves nation coordinates in
    // place, which would compound across runs if the manifest were shared.
    const half = (n: Nation | AdditionalNation): Nation | AdditionalNation =>
      compact && n.coordinates !== undefined
        ? {
            ...n,
            coordinates: [
              Math.floor(n.coordinates[0] / 2),
              Math.floor(n.coordinates[1] / 2),
            ],
          }
        : { ...n };

    let teamGameSpawnAreas = manifest.teamGameSpawnAreas;
    if (compact && teamGameSpawnAreas !== undefined) {
      const scaled: TeamGameSpawnAreas = {};
      for (const [key, areas] of Object.entries(teamGameSpawnAreas)) {
        scaled[key] = areas.map((a) => ({
          x: Math.floor(a.x / 2),
          y: Math.floor(a.y / 2),
          width: Math.max(1, Math.floor(a.width / 2)),
          height: Math.max(1, Math.floor(a.height / 2)),
        }));
      }
      teamGameSpawnAreas = scaled;
    }

    return {
      nations: manifest.nations.map(half) as Nation[],
      additionalNations: (manifest.additionalNations ?? []).map(
        half,
      ) as AdditionalNation[],
      gameMap,
      miniGameMap,
      teamGameSpawnAreas,
    };
  }
}
