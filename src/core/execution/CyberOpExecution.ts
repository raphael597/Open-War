import { Execution, Game, MessageType, Player, PlayerID } from "../game/Game";
import { CyberOp } from "../game/Industry";

/**
 * Message keys per operation, spelled out rather than assembled from the enum.
 * The simulation cannot translate — message params render verbatim — and
 * literal keys are what the translation-coverage test can see.
 */
export const CYBER_MESSAGE_KEYS: Record<
  CyberOp,
  {
    launched: string;
    received: string;
    blocked: string;
    defended: string;
    attributed: string;
  }
> = {
  [CyberOp.Blackout]: {
    launched: "events_display.cyber_launched_blackout",
    received: "events_display.cyber_received_blackout",
    blocked: "events_display.cyber_blocked_blackout",
    defended: "events_display.cyber_defended_blackout",
    attributed: "events_display.cyber_attributed_blackout",
  },
  [CyberOp.Stuxnet]: {
    launched: "events_display.cyber_launched_stuxnet",
    received: "events_display.cyber_received_stuxnet",
    blocked: "events_display.cyber_blocked_stuxnet",
    defended: "events_display.cyber_defended_stuxnet",
    attributed: "events_display.cyber_attributed_stuxnet",
  },
  [CyberOp.TradeHack]: {
    launched: "events_display.cyber_launched_tradehack",
    received: "events_display.cyber_received_tradehack",
    blocked: "events_display.cyber_blocked_tradehack",
    defended: "events_display.cyber_defended_tradehack",
    attributed: "events_display.cyber_attributed_tradehack",
  },
  [CyberOp.FalseFlag]: {
    launched: "events_display.cyber_launched_falseflag",
    received: "events_display.cyber_received_falseflag",
    blocked: "events_display.cyber_blocked_falseflag",
    defended: "events_display.cyber_defended_falseflag",
    attributed: "events_display.cyber_attributed_falseflag",
  },
};

/**
 * Runs one offensive cyber operation.
 *
 * Cyber differs from every other attack in the game in two ways, and both are
 * deliberate: the target's research cities can absorb it outright, and the
 * victim cannot tell who did it until the trace completes. That delay is what
 * makes a false flag worth running — for half a minute the victim only knows
 * they were hit.
 */
export class CyberOpExecution implements Execution {
  private mg: Game;
  private done = false;

  constructor(
    private attacker: Player,
    private targetID: PlayerID,
    private op: CyberOp,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    this.done = true;
    if (!this.mg.hasPlayer(this.targetID)) return;
    const target = this.mg.player(this.targetID);
    if (target === this.attacker || !target.isAlive()) return;
    if (!this.attacker.canLaunchCyberOp(this.op)) return;

    const cost = this.mg.config().cyberOpCost(this.op);
    if (!this.attacker.spendIntel(cost)) return;
    this.attacker.recordCyberOp();

    // Research cities are the counter: enough firewall strength swallows the
    // operation, and the intel is spent either way.
    if (target.firewallStrength() >= cost) {
      this.mg.displayMessage(
        CYBER_MESSAGE_KEYS[this.op].blocked,
        MessageType.CYBER_ATTACK_BLOCKED,
        this.attacker.id(),
      );
      this.mg.displayMessage(
        CYBER_MESSAGE_KEYS[this.op].defended,
        MessageType.CYBER_ATTACK_BLOCKED,
        target.id(),
      );
      return;
    }

    target.applyCyberEffect(this.op, this.attacker);
    this.mg.displayMessage(
      CYBER_MESSAGE_KEYS[this.op].launched,
      MessageType.CYBER_ATTACK_LAUNCHED,
      this.attacker.id(),
      undefined,
      { name: target.displayName() },
    );
    // The victim is told they were hit, but not by whom.
    this.mg.displayMessage(
      CYBER_MESSAGE_KEYS[this.op].received,
      MessageType.CYBER_ATTACK_RECEIVED,
      target.id(),
    );
  }

  isActive(): boolean {
    return !this.done;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
