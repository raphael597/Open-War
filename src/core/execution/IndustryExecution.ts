import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { CityRole, SpecializedCityRoles } from "../game/Industry";
import { Cluster } from "../game/TrainStation";
import { CYBER_MESSAGE_KEYS } from "./CyberOpExecution";

/** Economy runs once a second rather than every tick; output is scaled to match. */
const TICKS_PER_PASS = 10;

/** What one sweep of the rail network tells us, reused for every player. */
interface RailSnapshot {
  /** Largest rail-connected factory group per player. */
  zones: Map<Player, number>;
  /** Cluster of the station standing on each tile that has one. */
  clusterByTile: Map<TileRef, Cluster>;
}

/**
 * Drives the industrial economy: factories bank production, research cities
 * bank intel, and every specialized city is weighted by how well it is
 * supplied from the capital.
 *
 * One global execution rather than one per structure. The rail network is
 * swept exactly once per pass and the result reused for every player — with
 * several hundred players on a large map, re-walking it per player was the
 * single most expensive thing in the tick.
 */
export class IndustryExecution implements Execution {
  private mg: Game;
  private active = true;
  /** Reused across passes to keep the per-tick allocation count down. */
  private readonly roleWeights = new Map<CityRole, number>();

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (ticks % TICKS_PER_PASS !== 0) return;

    const rail = this.sweepRailNetwork();
    for (const player of this.mg.players()) {
      if (!player.isAlive()) continue;
      const zone = rail.zones.get(player) ?? 0;
      player.setIndustrialZone(zone);
      this.updateSupply(player, rail);
      this.produce(player, zone);
      this.announceAttributions(player);
      player.pruneCyberState();
    }
  }

  /**
   * Single pass over every train station: sizes each player's largest
   * rail-connected factory group, and indexes clusters by tile so supply
   * lookups are a map hit rather than another scan.
   */
  private sweepRailNetwork(): RailSnapshot {
    const perCluster = new Map<Player, Map<Cluster, number>>();
    const clusterByTile = new Map<TileRef, Cluster>();

    for (const station of this.mg.railNetwork().stationManager().getAll()) {
      const unit = station.unit;
      if (!unit.isActive()) continue;
      const cluster = station.getCluster();
      if (cluster === null) continue;
      clusterByTile.set(station.tile(), cluster);

      if (unit.type() !== UnitType.Factory || unit.isUnderConstruction()) {
        continue;
      }
      const owner = unit.owner();
      let counts = perCluster.get(owner);
      if (counts === undefined) {
        counts = new Map();
        perCluster.set(owner, counts);
      }
      counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
    }

    const zones = new Map<Player, number>();
    for (const [player, counts] of perCluster) {
      let max = 0;
      for (const count of counts.values()) {
        if (count > max) max = count;
      }
      zones.set(player, max);
    }
    return { zones, clusterByTile };
  }

  /**
   * Recomputes each city's supply weight. Cities on the capital's rail
   * network are fully supplied; otherwise the weight falls off with distance
   * and floors out, so a far-flung conquest is worth less than a compact one.
   */
  private updateSupply(player: Player, rail: RailSnapshot): void {
    const cities = player.units(UnitType.City);
    if (cities.length === 0) {
      player.setSuppliedCities(EMPTY_ROLE_WEIGHTS);
      return;
    }

    const capital = player.capital();
    const capitalCluster =
      capital === null ? null : (rail.clusterByTile.get(capital) ?? null);

    const weights = this.roleWeights;
    weights.clear();
    for (const role of SpecializedCityRoles) weights.set(role, 0);

    let anySpecialized = false;
    for (const city of cities) {
      if (!city.isActive() || city.isUnderConstruction()) continue;
      const role = city.cityRole();
      if (role === CityRole.Unspecialized) continue;
      anySpecialized = true;
      weights.set(
        role,
        weights.get(role)! + this.supplyOf(city, capital, capitalCluster, rail),
      );
    }
    player.setSuppliedCities(
      anySpecialized ? new Map(weights) : EMPTY_ROLE_WEIGHTS,
    );
  }

  private supplyOf(
    city: Unit,
    capital: TileRef | null,
    capitalCluster: Cluster | null,
    rail: RailSnapshot,
  ): number {
    // No capital yet: the player is running on local supply only.
    if (capital === null) return this.mg.config().supplyFactor(0, false);
    if (city.tile() === capital) return 1;

    const railConnected =
      capitalCluster !== null &&
      rail.clusterByTile.get(city.tile()) === capitalCluster;
    const distance = this.mg.manhattanDist(city.tile(), capital);
    return this.mg.config().supplyFactor(distance, railConnected);
  }

  /** Banks a pass worth of factory production and research intel. */
  private produce(player: Player, zone: number): void {
    const config = this.mg.config();

    let production = 0;
    for (const factory of player.units(UnitType.Factory)) {
      if (!factory.isActive() || factory.isUnderConstruction()) continue;
      production += config.factoryProductionPerTick(factory.level());
    }
    if (production > 0) {
      const zoneMultiplier = config.industrialZoneMultiplier(zone);
      player.addProduction(
        Math.floor(production * zoneMultiplier * TICKS_PER_PASS),
      );
    }

    const researchCities = player.citiesWithRole(CityRole.Research);
    if (researchCities.length === 0) return;
    let intel = 0;
    for (const city of researchCities) {
      if (city.isUnderConstruction()) continue;
      intel += config.researchIntelPerTick(city.level());
    }
    if (intel === 0) return;
    // Weight the output by how well those cities are actually supplied.
    const supplyRatio =
      player.suppliedCities(CityRole.Research) / researchCities.length;
    player.addIntel(Math.floor(intel * supplyRatio * TICKS_PER_PASS));
  }

  /**
   * Tells a victim who was behind an operation once the trace finishes. Until
   * this fires they only knew that they had been hit.
   */
  private announceAttributions(player: Player): void {
    for (const incident of player.takeNewlyAttributedIncidents()) {
      const attacker = this.mg.playerBySmallID(incident.attacker);
      if (attacker === undefined || !attacker.isPlayer()) continue;
      this.mg.displayMessage(
        CYBER_MESSAGE_KEYS[incident.op].attributed,
        MessageType.CYBER_ATTACK_ATTRIBUTED,
        player.id(),
        undefined,
        { name: attacker.displayName() },
      );
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}

/**
 * Shared empty result for the overwhelming majority of players, who have no
 * specialized cities at all. Never mutated.
 */
const EMPTY_ROLE_WEIGHTS: ReadonlyMap<CityRole, number> = new Map();
