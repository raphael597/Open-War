import { Execution, Game, MessageType, Unit, UnitType } from "../game/Game";
import { TrainStationExecution } from "./TrainStationExecution";

export class CityExecution implements Execution {
  private mg: Game;
  private active: boolean = true;
  private stationCreated = false;

  constructor(private city: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.stationCreated) {
      this.createStation();
      this.stationCreated = true;
    }
    if (!this.city.isActive()) {
      this.onCityLost();
      this.active = false;
      return;
    }
    this.claimCapitalIfNeeded();
  }

  /**
   * A player's first finished city becomes their capital, and a player who
   * lost theirs promotes the next one. Supply lines and the decapitation
   * penalty both hang off this, so it must never stay unset while the player
   * still has a city standing.
   */
  private claimCapitalIfNeeded(): void {
    if (this.city.isUnderConstruction()) return;
    const owner = this.city.owner();
    if (owner.capital() !== null) return;
    owner.setCapital(this.city.tile());
    this.city.setCapital(true);
    this.mg.displayMessage(
      "events_display.capital_established",
      MessageType.CAPITAL_ESTABLISHED,
      owner.id(),
    );
  }

  /**
   * The capital falling costs the owner treasury and troops on top of the
   * building itself. Another city takes over on a later tick.
   */
  private onCityLost(): void {
    if (!this.city.isCapital()) return;
    const owner = this.city.owner();
    this.city.setCapital(false);
    if (owner.capital() !== this.city.tile()) return;
    owner.loseCapital();
    this.mg.displayMessage(
      "events_display.capital_lost",
      MessageType.CAPITAL_LOST,
      owner.id(),
    );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  private createStation(): void {
    const nearbyFactory = this.mg.hasUnitNearby(
      this.city.tile()!,
      this.mg.config().trainStationMaxRange(),
      UnitType.Factory,
    );
    if (nearbyFactory) {
      this.mg.addExecution(new TrainStationExecution(this.city));
    }
  }
}
