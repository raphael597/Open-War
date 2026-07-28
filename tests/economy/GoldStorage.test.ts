import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../../src/core/game/Game";
import { setup } from "../util/Setup";

describe("Gold storage ceiling (Ideenliste 9)", () => {
  let game: Game;
  let player: Player;
  const playerInfo = new PlayerInfo(
    "hoarder",
    PlayerType.Human,
    null,
    "hoarder_id",
  );

  beforeEach(async () => {
    game = await setup(
      "plains",
      { infiniteGold: false, instantBuild: true, infiniteTroops: true },
      [playerInfo],
    );
    player = game.player(playerInfo.id);
    player.conquer(game.ref(0, 10));
  });

  test("gold is clamped to the ceiling and the overflow is lost", () => {
    const max = game.config().maxGold(player);
    player.addGold(max * 10n);
    expect(player.gold()).toBe(max);

    // Still clamped on a later deposit, rather than accumulating a debt that
    // silently unlocks later.
    player.addGold(1_000_000n);
    expect(player.gold()).toBe(max);
  });

  test("the ceiling is never below the dearest single purchase", () => {
    // A ceiling under the MIRV price would not make MIRVs expensive, it would
    // make them unbuildable.
    const mirvCost = game.config().unitInfo(UnitType.MIRV).cost(game, player);
    expect(game.config().maxGold(player)).toBeGreaterThanOrEqual(mirvCost);
    expect(game.config().maxGold(player)).toBeGreaterThanOrEqual(
      game.config().mirvMaxCost(),
    );
  });

  test("the ceiling grows with cities", () => {
    const before = game.config().maxGold(player);
    for (let i = 0; i < 30; i++) {
      player.conquer(game.ref(i, 11));
      player.buildUnit(UnitType.City, game.ref(i, 11), {});
    }
    expect(player.unitsOwned(UnitType.City)).toBe(30);
    const after = game.config().maxGold(player);
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(
      game.config().goldStorageBase() +
        30n * game.config().goldStoragePerCity(),
    );
  });

  test("spending below the ceiling still works normally", () => {
    player.addGold(game.config().maxGold(player));
    const removed = player.removeGold(1_000_000n);
    expect(removed).toBe(1_000_000n);
    expect(player.gold()).toBe(game.config().maxGold(player) - 1_000_000n);
  });
});

describe("Gold storage with infinite gold", () => {
  test("the ceiling does not apply in infinite-gold games", async () => {
    const playerInfo = new PlayerInfo(
      "rich",
      PlayerType.Human,
      null,
      "rich_id",
    );
    const game = await setup(
      "plains",
      { infiniteGold: true, instantBuild: true, infiniteTroops: true },
      [playerInfo],
    );
    const player = game.player(playerInfo.id);
    player.conquer(game.ref(0, 10));

    const huge = game.config().maxGold(player) * 100n;
    player.addGold(huge);
    expect(player.gold()).toBeGreaterThanOrEqual(huge);
  });
});

describe("MIRV price ceiling (docs/Kostenmodell.md)", () => {
  test("the global counter stops raising the price at the cap", async () => {
    const playerInfo = new PlayerInfo(
      "launcher",
      PlayerType.Human,
      null,
      "launcher_id",
    );
    const game = await setup(
      "plains",
      { infiniteGold: false, instantBuild: true, infiniteTroops: true },
      [playerInfo],
    );
    const player = game.player(playerInfo.id);
    const cap = game.config().mirvMaxCost();
    const price = () =>
      game.config().unitInfo(UnitType.MIRV).cost(game, player);

    expect(price()).toBe(25_000_000n);

    // Drive the real global counter the way a launch does.
    const launch = () => game.stats().bombLaunch(player, player, UnitType.MIRV);

    launch();
    expect(price()).toBe(40_000_000n); // still below the cap: counter applies

    for (let i = 0; i < 4; i++) launch();
    expect(game.stats().numMirvsLaunched()).toBe(5n);
    expect(price()).toBe(cap); // 25M + 5*15M = 100M, exactly the cap

    // Past the cap the counter no longer moves the price.
    for (let i = 0; i < 50; i++) launch();
    expect(game.stats().numMirvsLaunched()).toBe(55n);
    expect(price()).toBe(cap);
  });
});
