import { Config } from "../../src/core/configuration/Config";
import { Executor } from "../../src/core/execution/ExecutionManager";
import {
  Difficulty,
  Game,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  Player,
  UnitType,
} from "../../src/core/game/Game";
import { createGame } from "../../src/core/game/GameImpl";
import { GameUpdateType, HashUpdate } from "../../src/core/game/GameUpdates";
import { createNationsForGame } from "../../src/core/game/NationCreation";
import { GameRunner } from "../../src/core/GameRunner";
import { PseudoRandom } from "../../src/core/PseudoRandom";
import { GameConfig, GameStartInfo } from "../../src/core/Schemas";
import { simpleHash } from "../../src/core/Util";
import { OverrideFactory, withOverrides } from "./ArenaConfig";
import { ArenaMapSource } from "./ArenaMap";
import {
  ArenaRunResult,
  ArenaSample,
  decidedTickOf,
  gini,
  RunWinner,
  settledOf,
  StructureCounts,
  TRACKED_STRUCTURES,
} from "./Metrics";

const MAX_SPAWN_TURNS = 1000;

export interface ArenaRunOptions {
  variant: string;
  seed: string;
  map: GameMapType;
  mapSize: GameMapSize;
  bots: number;
  nations: "default" | "disabled" | number;
  difficulty: Difficulty;
  /** Ticks to simulate after the spawn phase. */
  maxTicks: number;
  /** Sample the game state every N ticks. */
  sampleEvery: number;
  overrides: OverrideFactory;
  mapSource: ArenaMapSource;
}

function countStructures(game: Game): StructureCounts {
  const counts: StructureCounts = {};
  for (const type of TRACKED_STRUCTURES) counts[type] = 0;
  for (const unit of game.units(TRACKED_STRUCTURES as readonly UnitType[])) {
    if (!unit.isActive()) continue;
    counts[unit.type()] = (counts[unit.type()] ?? 0) + 1;
  }
  return counts;
}

function takeSample(game: Game, alivePlayers: Player[]): ArenaSample {
  let ownedTiles = 0;
  let goldHeld = 0n;
  let leaderID: number | null = null;
  let leaderTiles = 0;
  const territories: number[] = [];

  for (const p of alivePlayers) {
    const tiles = p.numTilesOwned();
    ownedTiles += tiles;
    goldHeld += p.gold();
    territories.push(tiles);
    if (tiles > leaderTiles) {
      leaderTiles = tiles;
      leaderID = p.smallID();
    }
  }

  return {
    tick: game.ticks(),
    alive: alivePlayers.length,
    ownedTiles,
    leaderID,
    leaderTiles,
    leadShare: ownedTiles === 0 ? 0 : leaderTiles / ownedTiles,
    gini: gini(territories),
    goldHeld: Number(goldHeld),
    structures: countStructures(game),
  };
}

function describeWinner(winner: Player | string): RunWinner {
  if (typeof winner === "string") {
    return { kind: "team", name: winner, playerType: null };
  }
  return {
    kind: "player",
    name: winner.displayName(),
    playerType: winner.type(),
  };
}

/** Runs one headless game to completion or to the tick budget. */
export async function runArenaGame(
  opts: ArenaRunOptions,
): Promise<ArenaRunResult> {
  const started = performance.now();

  const gameConfig: GameConfig = {
    gameMap: opts.map,
    gameMapSize: opts.mapSize,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    difficulty: opts.difficulty,
    nations: opts.nations,
    donateGold: false,
    donateTroops: false,
    bots: opts.bots,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  };
  const gameStart: GameStartInfo = {
    gameID: opts.seed,
    lobbyCreatedAt: 0,
    config: gameConfig,
    players: [],
  };

  const baseConfig = new Config(gameConfig, null, false);
  const config = withOverrides(baseConfig, opts.overrides(baseConfig));

  // Fresh terrain per run — see ArenaMapSource for why this cannot be shared.
  const terrain = await opts.mapSource.load(opts.map, opts.mapSize);
  const random = new PseudoRandom(simpleHash(gameStart.gameID));
  const nations = createNationsForGame(
    gameStart,
    terrain.nations,
    terrain.additionalNations,
    0,
    random,
  );
  const game = createGame(
    [],
    nations,
    terrain.gameMap,
    terrain.miniGameMap,
    config,
    terrain.teamGameSpawnAreas,
  );

  let lastHash: HashUpdate | undefined;
  let fatalError: string | undefined;
  const runner = new GameRunner(
    game,
    new Executor(game, gameStart.gameID, undefined),
    (gu) => {
      if ("errMsg" in gu) {
        fatalError = `${gu.errMsg}\n${gu.stack ?? ""}`;
        return;
      }
      const hashes = gu.updates[GameUpdateType.Hash] as HashUpdate[];
      if (hashes.length > 0) lastHash = hashes[hashes.length - 1];
    },
  );
  runner.init();

  let turnNumber = 0;
  const tick = (): void => {
    runner.addTurn({ turnNumber: turnNumber++, intents: [] });
    runner.executeNextTick();
    if (fatalError !== undefined) {
      throw new Error(
        `${opts.variant}/${opts.seed} errored at tick ${game.ticks()}:\n${fatalError}`,
      );
    }
  };

  while (game.inSpawnPhase()) {
    if (turnNumber >= MAX_SPAWN_TURNS) {
      throw new Error(`spawn phase did not end after ${MAX_SPAWN_TURNS} turns`);
    }
    tick();
  }
  const spawnTurns = turnNumber;

  const samples: ArenaSample[] = [];
  const alive = (): Player[] => game.players().filter((p) => p.isAlive());
  samples.push(takeSample(game, alive()));

  let winner: RunWinner | null = null;
  let winTick: number | null = null;
  let ticksRun = 0;

  for (let i = 0; i < opts.maxTicks; i++) {
    tick();
    ticksRun++;

    const w = game.getWinner();
    if (w !== null) {
      winner = describeWinner(w);
      winTick = game.ticks();
      samples.push(takeSample(game, alive()));
      break;
    }
    if ((i + 1) % opts.sampleEvery === 0) {
      samples.push(takeSample(game, alive()));
    }
  }

  if (samples[samples.length - 1].tick !== game.ticks()) {
    samples.push(takeSample(game, alive()));
  }

  return {
    variant: opts.variant,
    seed: opts.seed,
    spawnTurns,
    ticksRun,
    winner,
    winTick,
    decidedTick: decidedTickOf(samples),
    settled: settledOf(samples),
    finalAlive: alive().length,
    samples,
    finalHash: lastHash?.hash ?? null,
    wallMs: performance.now() - started,
  };
}
