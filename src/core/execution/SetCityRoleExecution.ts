import { Execution, Game, Player, UnitType } from "../game/Game";
import { CityRole } from "../game/Industry";

/**
 * Specializes one of the player's cities. A city can be re-specialized at any
 * time — the cost is the downtime, not gold, since the bonuses are all
 * continuous rather than banked.
 */
export class SetCityRoleExecution implements Execution {
  private mg: Game;
  private done = false;

  constructor(
    private player: Player,
    private unitId: number,
    private role: CityRole,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    this.done = true;
    const unit = this.mg.unit(this.unitId);
    if (
      unit === undefined ||
      unit.owner() !== this.player ||
      unit.type() !== UnitType.City ||
      !unit.isActive() ||
      unit.isUnderConstruction()
    ) {
      return;
    }
    unit.setCityRole(this.role);
  }

  isActive(): boolean {
    // One-shot: applies on its first tick and then retires.
    return !this.done;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
