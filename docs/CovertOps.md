# Verdeckte Operationen — gemeinsamer Unterbau

Design-Entwurf, noch nicht implementiert. Beschreibt die Schicht, auf der die
geplanten Domänen (Cyber, Luft, Stellvertreterfraktionen) gemeinsam aufsetzen.

## Warum ein gemeinsamer Unterbau

Cyber-Operationen, finanzierte Aufständische und unmarkierte Luftschläge sind
drei Ausprägungen derselben Frage: **Ich schade jemandem, ohne dass es
nachweisbar mein Angriff war — was passiert, wenn es doch herauskommt?**

Baut man das dreimal, entstehen drei halbgare Systeme mit drei UI-Panels und
drei Balancing-Baustellen. Baut man es einmal, ist jede weitere Domäne nur noch
eine Registrierung.

Der Unterbau besteht aus zwei Hälften, die getrennt nutzbar sind:

| Hälfte         | Was sie regelt                                       | Wer sie nutzt                          |
| -------------- | ---------------------------------------------------- | -------------------------------------- |
| **Verdeckung** | Vorbereitung, Abwehrduell, Spur, Zuordnung           | Cyber, Stellvertreterfraktionen        |
| **Ruf**        | Schwere einer Tat, Beziehungsschaden, Verräterstatus | zusätzlich Luft, Nuklear, Allianzbruch |

Offene Gewalt überspringt die erste Hälfte und landet direkt in der zweiten.
Damit vereinheitlicht der Unterbau nebenbei etwas, das heute verstreut und grob
gelöst ist: `markTraitor()` als Ja/Nein-Schalter und
`nukeAllianceBreakThreshold()` als Sonderfall.

## Leitentscheidungen

**1. Der Unterbau braucht keinen Zufall.** Abwehrduell, Spurenaufbau und
Zuordnung sind Vergleiche und Summen — kein `PseudoRandom`-Aufruf. Das ist
absichtlich so entworfen: `src/core` muss deterministisch bleiben, und ein
System ohne PRNG ist replay-sicher und in Tests exakt reproduzierbar. Zufall,
wenn überhaupt, gehört in die Domänenwirkung, nicht in den Unterbau.

**2. Eine Operation ist fast unauffindbar, eine Kampagne nicht.** Der
Spurenwert sammelt sich pro Paar (Auftraggeber → Ziel) und zerfällt mit der
Zeit. Ein einzelner Schlag bleibt praktisch anonym; wer dauerhaft dieselbe
Person bearbeitet, fliegt auf. Damit ist verdecktes Spiel gangbar, aber nicht
dominant — und der Angreifer hat eine echte Risikoabwägung statt eines
Freifahrtscheins.

**3. Geheimdienstpunkte sind nicht Gold.** Wären Operationen goldfinanziert,
wäre der reichste Spieler auch der beste Saboteur — genau das Gegenteil des
Ziels. Die Punkte sind eine eigene Ressource, nicht spendbar, nicht handelbar,
und ihre Erzeugung ist bewusst **gegen** die Reichsgröße gerichtet.

**4. Kein Kriegsnebel als Voraussetzung.** Die Simulation läuft laut
`CLAUDE.md` auf jedem Client; versteckte Information ist in dieser Architektur
nicht manipulationssicher. Der Unterbau ist deshalb so gebaut, dass er unter
vollständiger Information funktioniert — die _Wirkung_ jeder Operation ist
ohnehin öffentlich, verborgen ist nur die Urheberschaft. Siehe „Grenzen".

## Ressource: Geheimdienstpunkte

Erzeugung pro Tick:

```
intelRate(p) = (BASE + commandCapacity(p)) * asymmetry(p)

commandCapacity(p) = Σ Stufen aller Kommandozentralen von p * PER_LEVEL
asymmetry(p)       = 1 + ASYM_MAX * (1 - sigmoid(p.numTilesOwned(), ...))
```

`asymmetry` nutzt dieselbe Sigmoid-Form wie der bestehende
`largeDefenderAttackDebuff` in `Config.ts:693` — kleine Spieler erzeugen bis zu
doppelt so schnell, große den Basiswert.

Der Vorrat ist **gedeckelt** (`maxIntel`). Das verhindert, dass jemand zwanzig
Minuten spart und dann fünf Operationen auf einmal fahren lässt, und zwingt zu
laufenden Entscheidungen statt zu einem einzigen Alles-oder-nichts-Moment.

### Startwerte

Ein Tick ist 100 ms, also 600 Ticks pro Minute. Alle Werte sind
Ausgangspunkte zum Tunen, nicht Ergebnisse.

| Größe                          | Wert                         | Bedeutung                          |
| ------------------------------ | ---------------------------- | ---------------------------------- |
| `covertBaseIntelRate()`        | 1 / Tick                     | 600 pro Minute ohne Gebäude        |
| `covertCommandIntelPerLevel()` | 2 / Tick                     | Kommando Stufe 1 → 1800 pro Minute |
| `covertAsymmetryMax()`         | 1.0                          | kleiner Spieler bis 2×             |
| `covertMaxIntel()`             | 3000 + 3000 je Kommandostufe | Vorratsdecke                       |

## Ablauf einer verdeckten Operation

```
Auftrag ──► Vorbereitung ──► Abwehrduell ──► Wirkung ──► Spur ──► Zuordnung ──► Ruf
            (prepTicks)      (deterministisch)                    (Schwelle)
```

### 1. Auftrag

Der Auftraggeber wählt Operationsart, Ziel, optional eine Zielkachel, und setzt
Punkte ein: einen Pflichtanteil (`baseCost`) und zwei freiwillige Aufschläge —
**Durchschlagskraft** (gegen den Abwehrschild) und **Tarnung** (gegen die Spur).
Die Punkte werden sofort abgebucht.

### 2. Vorbereitung

Zwischen Auftrag und Wirkung liegen `prepTicks`. Das ist der wichtigste
Zeitparameter des Systems: Er erzwingt Antizipation statt Reaktion und gibt der
Gegenseite ein Fenster, ihren Schild aufzubauen. Ein Abbruch vor Ablauf gibt die
Hälfte der Punkte zurück.

### 3. Abwehrduell

Rein deterministisch, kein Würfel:

```
gelingt, wenn:  intelSpent - shield(target) >= baseCost
```

Der Verteidiger bindet Punkte als Schild (siehe „Haltung"). Der Schild wird bei
jedem Abwehrversuch um `min(shield, intelSpent)` verbraucht — er hält also nicht
beliebig viele Angriffe aus, sondern ist selbst eine Ressource. Bei Scheitern
verliert der Angreifer den vollen Einsatz.

### 4. Wirkung

Ruft `apply()` der jeweiligen Operationsdefinition auf. Der Unterbau kennt den
Inhalt nicht — er weiß nur, dass etwas passiert ist.

### 5. Spur

```
evidenceGain = evidenceBase * (1 - concealment) * (gelungen ? 1 : FAILED_MULT)
concealment  = min(CONCEAL_MAX, tarnungsPunkte / baseCost)
```

Zwei Feinheiten mit Absicht:

- **Ein gescheiterter Einbruch hinterlässt mehr Spuren als ein gelungener**
  (`FAILED_MULT` = 1.5). Wer gegen einen starken Schild anrennt, verrät sich.
- Die Spur zerfällt (`evidenceDecayPerTick`). Ein langsamer Tropf ist sicherer
  als ein Feuerstoß — was sowohl plausibel als auch spielerisch interessant ist.

Gespeichert wird pro Paar: `evidence[auftraggeber][ziel]`.

### 6. Zuordnung

Sobald `evidence >= attributionThreshold()`, wird die Urheberschaft
**automatisch** offengelegt. Kein Rate-Spiel, keine Verdächtigen-Auswahl im UI.

Wer schneller enttarnen will, schaltet **Gegenspionage** ein: bindet laufend
Punkte und senkt dadurch die eigene Schwelle. Damit bleibt die Zuordnung eine
Entscheidung, ohne ein Suchspiel mit 20 Kandidaten zu erzeugen.

> Verworfene Alternative: Untersuchung gegen einen benannten Verdächtigen. Liest
> sich thematisch besser, führt aber dazu, dass man die Spielerliste
> durchprobiert, und braucht deutlich mehr UI. Die Schwellen-Variante ist
> lesbarer und billiger.

### 7. Ruf

Bei Offenlegung greift die zweite Hälfte des Unterbaus — siehe unten.

## Haltung (Verteidigerseite)

Jeder Spieler verteilt seine laufende Erzeugung auf drei Töpfe:

| Topf              | Wirkung                             |
| ----------------- | ----------------------------------- |
| **Vorrat**        | für eigene Operationen              |
| **Schild**        | absorbiert eingehende Operationen   |
| **Gegenspionage** | senkt die eigene Zuordnungsschwelle |

Das ist die Dauerentscheidung des Systems und braucht nur einen Regler mit drei
Anteilen — vergleichbar mit dem bestehenden Truppen-Regler.

## Rufsystem

Bei einer Offenlegung — und bei offener Gewalt sofort — wird eine **Schwere**
(`severity`) verrechnet. Alles darunter liegende existiert bereits:

```
Opfer:                updateRelation(täter, -2 * severity)
Verbündete des Opfers: updateRelation(täter, -1 * severity)
alle übrigen:          updateRelation(täter, -severity / 3)
```

`updateRelation()` liegt in `PlayerImpl.ts:823`, der Wertebereich ist −100…100
mit Schwellen bei −50 / 0 / 50 (`Relation.Hostile` … `Relation.Friendly`),
inklusive Zerfall über `decayRelations()`. Es muss dafür nichts Neues gebaut
werden.

Zusätzlich:

- War der Täter mit dem Opfer verbündet → `markTraitor()` und Allianzbruch. Die
  bestehenden Debuffs (`traitorDefenseDebuff`, `traitorSpeedDebuff`,
  `traitorDuration`) greifen unverändert.
- Öffentliche Meldung über `displayMessage()` mit einem neuen
  `MessageType.COVERT_OP_ATTRIBUTED` in Kategorie `ALLIANCE`.
- Erfassung in den Statistiken analog zu `Stats.betray()`.

### Warum das den Nationen kostenlos beibringt, darauf zu reagieren

`NationAllianceBehavior.ts` wertet bereits Beziehungen aus, um über Bündnisse zu
entscheiden. Weil Offenlegungen nur die vorhandenen Beziehungswerte verschieben,
reagiert die KI ohne eine Zeile zusätzlicher KI-Arbeit — enttarnte Saboteure
bekommen im Einzelspieler schlechter Bündnisse. Das ist der billigste
Integrationspunkt im ganzen Entwurf.

### Schweregrade

| Stufe  | `severity` | Beispiele                                            |
| ------ | ---------- | ---------------------------------------------------- |
| gering | 5          | Handelsstörung, Aufklärung                           |
| mittel | 12         | Sabotage einer Struktur, Waffenlieferung an Fraktion |
| schwer | 25         | Blackout der Luftabwehr, Anschlag mit Truppenverlust |
| extrem | 50         | Nuklearschlag (offen, überspringt die Verdeckung)    |

## Datenmodell

```ts
export enum CovertOpState {
  Prepared, // läuft, Wirkung steht aus
  Succeeded,
  Blocked, // am Schild gescheitert
  Aborted,
}

export interface CovertOp {
  id: number;
  type: CovertOpType;
  sponsor: PlayerID;
  target: PlayerID;
  tile: TileRef | null;
  orderedTick: Tick;
  executeTick: Tick;
  intelSpent: number;
  concealmentSpent: number;
  state: CovertOpState;
}
```

Die Registratur (laufende Operationen + Spurenmatrix + Rufwerte) hängt an
`GameImpl`, analog zur Allianzverwaltung.

## Erweiterungspunkt

Der eigentliche Zweck des Unterbaus: eine neue Domäne registriert nur eine
Definition.

```ts
export interface CovertOpDefinition {
  type: CovertOpType;
  baseCost(): number;
  prepTicks(): Tick;
  evidenceBase(): number;
  severity(): number;
  /** Zielprüfung: Reichweite, Nachbarschaft, gültige Kachel. */
  canTarget(
    mg: Game,
    sponsor: Player,
    target: Player,
    tile: TileRef | null,
  ): boolean;
  /** Die eigentliche Domänenwirkung. */
  apply(mg: Game, sponsor: Player, target: Player, tile: TileRef | null): void;
}
```

Damit wird aus jeder der drei Domänen eine Liste von Definitionen:

| Domäne     | Operationen                                            |
| ---------- | ------------------------------------------------------ |
| Cyber      | Blackout, Sabotage, Handelsstörung                     |
| Fraktionen | Finanzierung, Waffenlieferung, Anschlagsauftrag        |
| Luft       | nur Rufhälfte — Luftschläge sind offen, nicht verdeckt |

## Neue Intents

Nach dem Muster von `DonateGoldIntentSchema` (`Schemas.ts:500`), aufgenommen in
die `IntentSchema`-Union bei Zeile 582:

```ts
export const CovertOpIntentSchema = z.object({
  type: z.literal("covert_op"),
  op: z.enum(CovertOpType),
  target: ID,
  tile: z.number().nullable(),
  intel: z.number().nonnegative(),
  concealment: z.number().nonnegative(),
});

export const CovertOpAbortIntentSchema = z.object({
  type: z.literal("covert_op_abort"),
  opId: z.number(),
});

export const CovertStanceIntentSchema = z.object({
  type: z.literal("covert_stance"),
  shield: z.number().nonnegative(),
  counterIntel: z.number().nonnegative(),
});
```

## Neue Executions

| Execution               | Aufgabe                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `CovertOpExecution`     | eine pro Auftrag; zählt bis `executeTick`, führt Abwehrduell und Wirkung aus, schreibt die Spur          |
| `CovertLedgerExecution` | eine pro Spiel; Punkteerzeugung, Spurenzerfall, Schwellenprüfung, Offenlegung — analog `PlayerExecution` |

Beide werden in `ExecutionManager.ts` neben `donate_gold` (Zeile 94) verdrahtet.

## Neue Config-Werte

Alles nach `src/core/configuration/Config.ts`, damit die Balance-Arena es
variieren kann:

```
covertBaseIntelRate()            covertCommandIntelPerLevel()
covertAsymmetryMax()             covertMaxIntel(player)
covertOpCost(type)               covertOpPrepTicks(type)
covertEvidenceBase(type)         covertOpSeverity(type)
covertConcealmentMax()           covertFailedEvidenceMultiplier()
covertEvidenceDecayPerTick()     covertAttributionThreshold()
covertCounterIntelFactor()       covertAbortRefundRatio()
```

Ausgangswerte: `CONCEAL_MAX` 0.6, `FAILED_MULT` 1.5,
`attributionThreshold` 100, `evidenceDecayPerTick` 0.05 (eine volle Schwelle
zerfällt in gut drei Minuten), Kosten 800 / 2000 / 5000 und Vorbereitungszeiten
100 / 300 / 600 Ticks für gering / mittel / schwer.

Bei `evidenceBase` 20 / 40 / 70 heißt das: **zwei schwere oder fünf geringe
Operationen gegen dasselbe Ziel führen zur Enttarnung** — wenn nicht getarnt und
nicht über die Zeit gestreckt wird.

## Tests

`src/core`-Änderungen brauchen laut `CLAUDE.md` Tests. Der Unterbau ist dafür
gut geschnitten, weil er ohne PRNG auskommt:

- Punkteerzeugung: kleiner Spieler erzeugt mehr als großer; Decke greift
- Vorbereitung: Wirkung tritt exakt bei `executeTick` ein, keinen Tick früher
- Abbruch: Rückerstattung stimmt, Operation feuert nicht mehr
- Abwehrduell: Grenzfall `intel - shield == baseCost` gelingt, eins darunter nicht
- Schildverbrauch: zweiter Angriff trifft auf reduzierten Schild
- Spur: gescheiterte Operation hinterlässt mehr als gelungene
- Tarnung: gedeckelt bei `CONCEAL_MAX`, auch bei absurdem Einsatz
- Zerfall: Spur unter Schwelle nach Ablauf, keine Offenlegung
- Offenlegung: Beziehungen bei Opfer, Verbündeten und Dritten korrekt verschoben
- Verbündeter Täter: `isTraitor()` gesetzt, Allianz gebrochen
- Determinismus: identische Intent-Folge → identischer Zustand über zwei Läufe

## Grenzen

**Urheberschaft ist weich versteckt.** Die Simulation läuft auf jedem Client,
also steht der Auftraggeber im Speicher jedes Mitspielers. Ein manipulierter
Client kann ihn auslesen. Das ist hinnehmbar, weil es sich sanft verschlechtert:
Wer weiß, wer es war, kann die Operation trotzdem nicht verhindern, und die
diplomatische Folge greift erst mit der _offiziellen_ Offenlegung — behaupten
kann man ohne sie nichts. Manipulationssicher wäre nur eine serverseitige
Simulation, und das ist ein anderes Projekt.

**Balancerisiko.** Die Asymmetrie zugunsten kleiner Spieler ist beabsichtigt,
kann aber kippen: Wenn mehrere Kleine gleichzeitig den Führenden bearbeiten,
wird Führen unspielbar. Deshalb liegen alle Werte in `Config.ts` — das ist genau
der Fall, für den sich die headless-Balance-Arena über `tests/perf/fullgame/`
lohnt, bevor Menschen es spielen.

**UI.** Drei-Wege-Regler, Liste laufender Operationen, Offenlegungsmeldung. Der
Unterbau selbst braucht keine neue Karten-Darstellung — das ist der Grund, ihn
vor den Lufteinheiten zu bauen.

## Reihenfolge

1. Unterbau: Ressource, Haltung, Auftrag/Vorbereitung/Duell, Spur, Zuordnung, Ruf
2. Cyber als erste Domäne — drei Definitionen, keine neue Einheit, kein Rendering
3. Fraktionen als zweite Domäne — nutzt denselben Auftragsweg
4. Luft zuletzt, nutzt nur die Rufhälfte, braucht als einzige neue Sprites
