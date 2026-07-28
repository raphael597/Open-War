import { Execution, Game, MessageType } from "../game/Game";
import { AllWorldEventTypes, WorldEventType } from "../game/Industry";

/**
 * Message keys per event, spelled out rather than built from the enum: the
 * simulation cannot translate (message params render verbatim), and literal
 * keys are what the translation-coverage test can actually see.
 */
const MESSAGE_KEYS: Record<WorldEventType, { started: string; ended: string }> =
  {
    [WorldEventType.ResourceBoom]: {
      started: "world_event.started_resourceboom",
      ended: "world_event.ended_resourceboom",
    },
    [WorldEventType.Storm]: {
      started: "world_event.started_storm",
      ended: "world_event.ended_storm",
    },
    [WorldEventType.NukeMoratorium]: {
      started: "world_event.started_nukemoratorium",
      ended: "world_event.ended_nukemoratorium",
    },
  };

/**
 * Runs the global event cycle: every `worldEventInterval` ticks a new event
 * starts, lasts `worldEventDuration`, then the world goes quiet again.
 *
 * The order is fixed rather than random. Players can see the next event
 * coming and plan for it, which turns events into something to position
 * around instead of a coin flip that decides a game.
 */
export class WorldEventExecution implements Execution {
  private mg: Game;
  private active = true;
  private eventsStarted = 0;

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    const config = this.mg.config();
    const current = this.mg.activeWorldEvent();

    if (current !== null && current.endTick <= ticks) {
      this.mg.setActiveWorldEvent(null);
      this.announce("ended", current.type);
      return;
    }
    if (current !== null) return;

    const interval = config.worldEventInterval();
    if (ticks === 0 || ticks % interval !== 0) return;

    const type =
      AllWorldEventTypes[this.eventsStarted % AllWorldEventTypes.length];
    this.eventsStarted++;
    this.mg.setActiveWorldEvent({
      type,
      startTick: ticks,
      endTick: ticks + config.worldEventDuration(),
    });
    this.announce("started", type);
  }

  private announce(phase: "started" | "ended", type: WorldEventType): void {
    this.mg.displayMessage(
      MESSAGE_KEYS[type][phase],
      MessageType.WORLD_EVENT,
      null,
    );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
