import fs from "fs";
import path from "path";
import {
  Difficulty,
  Game,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  Player,
  PlayerInfo,
  PlayerType,
} from "../../src/core/game/Game";
import { createGame } from "../../src/core/game/GameImpl";
import { AllResourceTypes, ResourceType } from "../../src/core/game/Industry";
import {
  genTerrainFromBin,
  MapManifest,
} from "../../src/core/game/TerrainMapLoader";
import { UserSettings } from "../../src/core/game/UserSettings";
import { GameConfig } from "../../src/core/Schemas";
import { TestConfig } from "./TestConfig";

export async function setup(
  mapName: string,
  _gameConfig: Partial<GameConfig> = {},
  humans: PlayerInfo[] = [],
  currentDir: string = __dirname,
  ConfigClass: typeof TestConfig = TestConfig,
  autoEndSpawnPhase: boolean = true,
): Promise<Game> {
  // Suppress console.debug for tests.
  console.debug = () => {};

  // Simple binary file loading using fs.readFileSync()
  const mapBinPath = path.join(
    currentDir,
    `../testdata/maps/${mapName}/map.bin`,
  );
  const miniMapBinPath = path.join(
    currentDir,
    `../testdata/maps/${mapName}/map4x.bin`,
  );
  const manifestPath = path.join(
    currentDir,
    `../testdata/maps/${mapName}/manifest.json`,
  );

  const mapBinBuffer = fs.readFileSync(mapBinPath);
  const miniMapBinBuffer = fs.readFileSync(miniMapBinPath);
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) satisfies MapManifest;

  const gameMap = await genTerrainFromBin(manifest.map, mapBinBuffer);
  const miniGameMap = await genTerrainFromBin(manifest.map4x, miniMapBinBuffer);

  const gameConfig: GameConfig = {
    gameMap: GameMapType.Asia,
    gameMapSize: GameMapSize.Normal,
    gameMode: GameMode.FFA,
    gameType: GameType.Singleplayer,
    difficulty: Difficulty.Medium,
    nations: "default",
    donateGold: false,
    donateTroops: false,
    bots: 0,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    ..._gameConfig,
  };
  const config = new ConfigClass(gameConfig, new UserSettings(), false);

  const game = createGame(humans, [], gameMap, miniGameMap, config);
  if (autoEndSpawnPhase) game.endSpawnPhase();

  // Human nukes require controlled uranium deposits (see
  // PlayerImpl.hasNuclearMaterialFor). Test maps are tiny and territory is
  // placed by hand, so a test player would almost never sit on a deposit and
  // every suite that builds a nuke would have to hand-place one first. Stock
  // every test player instead; the suite that exercises the gate itself sets
  // the count explicitly.
  const addPlayer = game.addPlayer.bind(game);
  game.addPlayer = (playerInfo: PlayerInfo) => {
    const player = addPlayer(playerInfo);
    grantDeposits(player, ResourceType.Uranium, TEST_URANIUM_STOCK);
    return player;
  };
  // Players passed in as `humans` are created by createGame itself and never
  // pass through addPlayer, so stock them here too. allPlayers() rather than
  // players(), which filters to the ones already holding territory.
  for (const player of game.allPlayers()) {
    grantDeposits(player, ResourceType.Uranium, TEST_URANIUM_STOCK);
  }

  return game;
}

/** Uranium every test player starts with. Enough for a MIRV, which needs 8. */
export const TEST_URANIUM_STOCK = 20;

/**
 * Test-only shortcut for handing a player controlled deposits. In a real game
 * these only move through GameImpl.conquer/relinquish.
 */
export function grantDeposits(
  player: Player,
  type: ResourceType,
  count: number,
): void {
  const deposits = (player as unknown as { _deposits: number[] })._deposits;
  deposits[AllResourceTypes.indexOf(type)] = count;
}

export function playerInfo(name: string, type: PlayerType): PlayerInfo {
  return new PlayerInfo(name, type, null, name);
}
