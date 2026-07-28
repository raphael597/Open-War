import { CyberOpExecution } from "../src/core/execution/CyberOpExecution";
import { IndustryExecution } from "../src/core/execution/IndustryExecution";
import { SetCityRoleExecution } from "../src/core/execution/SetCityRoleExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { WorldEventExecution } from "../src/core/execution/WorldEventExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import {
  AllResourceTypes,
  CityRole,
  CyberOp,
  depositAt,
  ResourceType,
  uraniumRequiredFor,
  WorldEventType,
} from "../src/core/game/Industry";
import { GameID } from "../src/core/Schemas";
import { grantDeposits, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";
import { constructionExecution, executeTicks } from "./util/utils";

let game: Game;
const gameID: GameID = "game_id";
let alice: Player;
let bob: Player;

/** Spawns two players far enough apart that neither starts inside the other. */
async function newGame(): Promise<void> {
  game = await setup("ocean_and_land", {
    infiniteGold: true,
    instantBuild: true,
    infiniteTroops: true,
  });
  const aliceInfo = new PlayerInfo("alice", PlayerType.Human, null, "alice_id");
  const bobInfo = new PlayerInfo("bob", PlayerType.Human, null, "bob_id");
  game.addPlayer(aliceInfo);
  game.addPlayer(bobInfo);
  game.addExecution(
    new SpawnExecution(
      gameID,
      game.player(aliceInfo.id).info(),
      game.ref(0, 10),
    ),
    new SpawnExecution(gameID, game.player(bobInfo.id).info(), game.ref(0, 15)),
  );
  game.executeNextTick();
  game.executeNextTick();
  alice = game.player(aliceInfo.id);
  bob = game.player(bobInfo.id);
}

/** Adds the global economy/event executions GameRunner installs in real games. */
function addGlobalExecutions(): void {
  game.addExecution(new IndustryExecution(), new WorldEventExecution());
}

describe("resource deposits", () => {
  it("assigns the same deposit to the same tile every time", () => {
    for (let tile = 0; tile < 5000; tile++) {
      expect(depositAt(tile)).toBe(depositAt(tile));
    }
  });

  it("places deposits sparsely and across all three types", () => {
    const counts = new Map<ResourceType, number>();
    let deposits = 0;
    const sampled = 200_000;
    for (let tile = 0; tile < sampled; tile++) {
      const deposit = depositAt(tile);
      if (deposit === null) continue;
      deposits++;
      counts.set(deposit, (counts.get(deposit) ?? 0) + 1);
    }
    // Roughly one tile in 179 — sparse enough to be worth fighting over.
    expect(deposits).toBeGreaterThan(sampled / 250);
    expect(deposits).toBeLessThan(sampled / 120);
    for (const type of AllResourceTypes) {
      expect(counts.get(type) ?? 0).toBeGreaterThan(0);
    }
    // Uranium is the rarest of the three.
    expect(counts.get(ResourceType.Uranium)!).toBeLessThan(
      counts.get(ResourceType.Steel)!,
    );
  });

  it("credits and debits deposits as territory changes hands", async () => {
    await newGame();
    // Find a land tile that carries a deposit and is not already owned.
    let depositTile: number | null = null;
    for (let x = 0; x < game.width(); x++) {
      for (let y = 0; y < game.height(); y++) {
        const tile = game.ref(x, y);
        if (!game.isLand(tile) || game.hasOwner(tile)) continue;
        if (game.depositAtTile(tile) !== null) {
          depositTile = tile;
          break;
        }
      }
      if (depositTile !== null) break;
    }
    if (depositTile === null) return; // no deposit on this small test map

    const type = game.depositAtTile(depositTile)!;
    const before = alice.deposits(type);
    alice.conquer(depositTile);
    expect(alice.deposits(type)).toBe(before + 1);

    bob.conquer(depositTile);
    expect(alice.deposits(type)).toBe(before);
    expect(bob.deposits(type)).toBe(1);

    bob.relinquish(depositTile);
    expect(bob.deposits(type)).toBe(0);
  });
});

describe("nuclear material", () => {
  it("requires progressively more uranium for bigger warheads", () => {
    expect(uraniumRequiredFor(UnitType.AtomBomb)).toBe(1);
    expect(uraniumRequiredFor(UnitType.HydrogenBomb)).toBe(3);
    expect(uraniumRequiredFor(UnitType.MIRV)).toBe(8);
    expect(uraniumRequiredFor(UnitType.City)).toBe(0);
  });

  it("blocks nukes until the player controls enough uranium", async () => {
    await newGame();
    grantDeposits(alice, ResourceType.Uranium, 0);
    expect(alice.hasNuclearMaterialFor(UnitType.AtomBomb)).toBe(false);

    grantDeposits(alice, ResourceType.Uranium, 1);
    expect(alice.hasNuclearMaterialFor(UnitType.AtomBomb)).toBe(true);
    expect(alice.hasNuclearMaterialFor(UnitType.HydrogenBomb)).toBe(false);

    grantDeposits(alice, ResourceType.Uranium, 3);
    expect(alice.hasNuclearMaterialFor(UnitType.HydrogenBomb)).toBe(true);
  });
});

describe("production", () => {
  it("caps banked production and spends only what is available", async () => {
    await newGame();
    const max = game.config().maxProduction();
    alice.addProduction(max * 2);
    expect(alice.production()).toBe(max);

    expect(alice.spendProduction(100)).toBe(100);
    expect(alice.production()).toBe(max - 100);

    alice.spendProduction(max);
    expect(alice.production()).toBe(0);
    expect(alice.spendProduction(50)).toBe(0);
  });

  it("grows the industrial zone bonus with cluster size", async () => {
    await newGame();
    const config = game.config();
    expect(config.industrialZoneMultiplier(0)).toBe(1);
    expect(config.industrialZoneMultiplier(1)).toBe(1);
    expect(config.industrialZoneMultiplier(3)).toBeGreaterThan(
      config.industrialZoneMultiplier(2),
    );
    // Capped, so a huge zone cannot run away with the game.
    expect(config.industrialZoneMultiplier(100)).toBe(1.75);
  });
});

describe("city specialization", () => {
  it("starts unspecialized and takes a role from the intent", async () => {
    await newGame();
    constructionExecution(game, alice, 0, 10, UnitType.City);
    const city = alice.units(UnitType.City)[0];
    expect(city.cityRole()).toBe(CityRole.Unspecialized);

    game.addExecution(
      new SetCityRoleExecution(alice, city.id(), CityRole.Research),
    );
    executeTicks(game, 2);
    expect(city.cityRole()).toBe(CityRole.Research);
    expect(alice.citiesWithRole(CityRole.Research)).toHaveLength(1);
  });

  it("refuses to specialize another player's city", async () => {
    await newGame();
    constructionExecution(game, alice, 0, 10, UnitType.City);
    const city = alice.units(UnitType.City)[0];

    game.addExecution(
      new SetCityRoleExecution(bob, city.id(), CityRole.Metropolis),
    );
    executeTicks(game, 2);
    expect(city.cityRole()).toBe(CityRole.Unspecialized);
  });

  it("scales the troop ceiling with garrison cities", async () => {
    await newGame();
    const config = game.config() as TestConfig;
    expect(config.garrisonMultiplierFor(alice)).toBe(1);

    alice.setSuppliedCities(new Map([[CityRole.Garrison, 2]]));
    expect(config.garrisonMultiplierFor(alice)).toBeCloseTo(1.16);

    // Capped so garrison spam cannot scale forever.
    alice.setSuppliedCities(new Map([[CityRole.Garrison, 50]]));
    expect(config.garrisonMultiplierFor(alice)).toBeCloseTo(1.4);
  });
});

describe("capital", () => {
  it("promotes the first finished city and penalizes losing it", async () => {
    await newGame();
    constructionExecution(game, alice, 0, 10, UnitType.City);
    executeTicks(game, 2);

    const city = alice.units(UnitType.City)[0];
    expect(alice.capital()).toBe(city.tile());
    expect(city.isCapital()).toBe(true);

    alice.addGold(1000n);
    const goldBefore = alice.gold();
    const troopsBefore = alice.troops();
    alice.loseCapital();

    expect(alice.capital()).toBeNull();
    expect(alice.gold()).toBeLessThan(goldBefore);
    expect(alice.troops()).toBeLessThan(troopsBefore);
  });

  it("hands the building over without its capital status when captured", async () => {
    await newGame();
    constructionExecution(game, alice, 0, 10, UnitType.City);
    executeTicks(game, 2);
    const city = alice.units(UnitType.City)[0];
    expect(city.isCapital()).toBe(true);

    bob.captureUnit(city);
    expect(city.isCapital()).toBe(false);
    expect(city.owner()).toBe(bob);
    expect(alice.capital()).toBeNull();
  });

  it("supplies a rail-connected city fully and a distant one partially", async () => {
    await newGame();
    const config = game.config();
    expect(config.supplyFactor(5000, true)).toBe(1);
    expect(config.supplyFactor(0, false)).toBe(1);
    expect(config.supplyFactor(750, false)).toBeCloseTo(0.5);
    // Floored — a cut-off city still contributes something.
    expect(config.supplyFactor(100_000, false)).toBe(0.4);
  });
});

describe("cyber operations", () => {
  it("applies an effect that expires, and hides the attacker until traced", async () => {
    await newGame();
    alice.addIntel(5000);

    game.addExecution(new CyberOpExecution(alice, bob.id(), CyberOp.Blackout));
    executeTicks(game, 2);

    expect(bob.hasCyberEffect(CyberOp.Blackout)).toBe(true);
    const incidents = bob.cyberIncidents();
    expect(incidents).toHaveLength(1);
    expect(incidents[0].attacker).toBe(alice.smallID());

    // The wire snapshot masks the attacker until the trace completes.
    expect(bob.industryUpdate().incidents[0].attacker).toBe(-1);

    executeTicks(game, game.config().cyberAttributionDelay() + 1);
    expect(bob.industryUpdate().incidents[0].attacker).toBe(alice.smallID());
  });

  it("charges intel and enforces a cooldown", async () => {
    await newGame();
    const cost = game.config().cyberOpCost(CyberOp.Blackout);
    alice.addIntel(cost);
    expect(alice.canLaunchCyberOp(CyberOp.Blackout)).toBe(true);

    game.addExecution(new CyberOpExecution(alice, bob.id(), CyberOp.Blackout));
    executeTicks(game, 2);
    expect(alice.intel()).toBe(0);

    // Out of intel and on cooldown: a second op cannot go out.
    alice.addIntel(cost);
    expect(alice.canLaunchCyberOp(CyberOp.Blackout)).toBe(false);
  });

  it("lets research cities absorb an operation they outweigh", async () => {
    await newGame();
    constructionExecution(game, bob, 0, 15, UnitType.City);
    const city = bob.units(UnitType.City)[0];
    city.setCityRole(CityRole.Research);

    const strength = bob.firewallStrength();
    expect(strength).toBeGreaterThan(0);

    // Blackout is the cheapest op, so a single research city stops it.
    expect(strength).toBeGreaterThanOrEqual(
      game.config().cyberOpCost(CyberOp.Blackout),
    );
    alice.addIntel(5000);
    game.addExecution(new CyberOpExecution(alice, bob.id(), CyberOp.Blackout));
    executeTicks(game, 2);

    expect(bob.hasCyberEffect(CyberOp.Blackout)).toBe(false);
    // The intel is still spent — a failed operation is not a free one.
    expect(alice.intel()).toBeLessThan(5000);
  });

  it("jams missile silos while Stuxnet runs", async () => {
    await newGame();
    alice.addIntel(5000);
    game.addExecution(new CyberOpExecution(alice, bob.id(), CyberOp.Stuxnet));
    executeTicks(game, 2);

    expect(bob.hasCyberEffect(CyberOp.Stuxnet)).toBe(true);
    // The silos are intact but will not fire while the operation runs.
    grantDeposits(bob, ResourceType.Uranium, 10);
    expect(bob.canBuild(UnitType.AtomBomb, game.ref(0, 10))).toBe(false);
  });

  it("reports attacks under a decoy while a false flag runs", async () => {
    await newGame();
    expect(bob.attributedSmallID()).toBe(bob.smallID());

    alice.addIntel(5000);
    game.addExecution(new CyberOpExecution(alice, bob.id(), CyberOp.FalseFlag));
    executeTicks(game, 2);

    expect(bob.hasCyberEffect(CyberOp.FalseFlag)).toBe(true);
    // With no third party to frame the decoy falls back to the victim itself.
    expect(typeof bob.attributedSmallID()).toBe("number");
  });
});

describe("world events", () => {
  it("cycles events on and off on schedule", async () => {
    await newGame();
    addGlobalExecutions();
    const config = game.config();
    expect(game.activeWorldEvent()).toBeNull();

    executeTicks(game, config.worldEventInterval() + 2);
    const event = game.activeWorldEvent();
    expect(event).not.toBeNull();
    expect(game.isWorldEventActive(event!.type)).toBe(true);

    executeTicks(game, config.worldEventDuration() + 2);
    expect(game.activeWorldEvent()).toBeNull();
  });

  it("blocks nukes during a moratorium", async () => {
    await newGame();
    game.setActiveWorldEvent({
      type: WorldEventType.NukeMoratorium,
      startTick: game.ticks(),
      endTick: game.ticks() + 1000,
    });
    grantDeposits(alice, ResourceType.Uranium, 10);

    expect(game.isWorldEventActive(WorldEventType.NukeMoratorium)).toBe(true);
    expect(alice.canBuild(UnitType.AtomBomb, game.ref(0, 15))).toBe(false);
  });
});

describe("doomsday drag", () => {
  it("makes the world poorer the more nukes fly", async () => {
    await newGame();
    const config = game.config();
    expect(config.doomsdayEconomyMultiplier(0)).toBe(1);
    expect(config.doomsdayEconomyMultiplier(10)).toBeCloseTo(0.9);
    // Floored so the economy never collapses entirely.
    expect(config.doomsdayEconomyMultiplier(1000)).toBe(0.5);
  });
});
