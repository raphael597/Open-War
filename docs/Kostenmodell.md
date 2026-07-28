# Kostenmodell — Preisdeckel als durchgehendes Prinzip

Eine Entwurfsregel für Open War, die für **alle** Kosten gilt: Baukosten,
laufenden Unterhalt, Cyber-Operationen und alles, was noch dazukommt.

## Die Regel

> Jede Kostengröße im Spiel hat eine benannte Obergrenze. Kein Preis wächst
> unbegrenzt.

```
cost(n) = min(CAP, growth(n))
```

`growth(n)` regelt das **Tempo** — wie schnell etwas teurer wird. `CAP` regelt
die **Lesbarkeit** — ab wo der Preis eine Zahl bleibt, die ein Spieler noch im
Kopf hat.

## Warum

**Ein unbegrenzter Preis ist keine Entscheidung mehr, sondern eine Wand.** Bei
`2^n * 125_000` kostet das zwanzigste Gebäude 65 Milliarden. Das ist keine
Abwägung — der Spieler rechnet nicht, er stellt fest, dass es nicht geht. Eine
Zahl, die niemand mehr einordnen kann, trägt keine Information.

**Fehler dürfen bremsen, nicht dauerhaft bestrafen.** Wer sich verbaut, soll
das merken und sich erholen können. Ein Preis ohne Decke macht eine frühe
Fehlentscheidung zu einem Schaden, der über das ganze Spiel mitläuft.

**Der Deckel ist die einzige Zahl, die man anzeigen kann.** Eine
Wachstumsformel lässt sich nicht ins UI schreiben, ein Höchstpreis schon. Das
ist der direkte Weg zu Punkt 2 der Ideenliste — Kosten sichtbar machen.

## Was der Deckel ausdrücklich **nicht** tut

Er hebt die Mengenbegrenzung nicht auf. Beim Unterhalt zahlt man den Deckel
**pro Gebäude und dauerhaft**, die Gesamtlast wächst also weiter linear mit der
Gebäudezahl:

```
Gesamtunterhalt(n) = Σ min(CAP_UPKEEP, UPKEEP_BASE * (1 + (i-1) * SLOPE))
                   ≈ n * CAP_UPKEEP   für großes n
```

Die Eigenschaft aus Punkt 1 der Ideenliste — „so viele, wie dein Einkommen
trägt" — bleibt damit vollständig erhalten. Sie hört nur auf zu beschleunigen.
Das ist sogar der bessere Verlauf: Ohne Deckel zahlt man beim 40. Gebäude das
Fünffache pro Stück, und die Grenze verschiebt sich nicht mehr mit der
Wirtschaft, sondern kippt schlagartig.

## Stand heute

Alle Baukosten im Spiel sind bereits gedeckelt — mit **einer** Ausnahme.

| Kostenstelle            | Formel                                          | Deckel     |
| ----------------------- | ----------------------------------------------- | ---------- |
| Stadt, Fabrik, Hafen    | `min(1_000_000, 2^n * 125_000)`                 | 1 Mio      |
| Kriegsschiff            | `min(1_000_000, (n+1) * 250_000)`               | 1 Mio      |
| Verteidigungsposten     | `min(250_000, (n+1) * 50_000)`                  | 250 T      |
| SAM-Werfer              | `min(3_000_000, (n+1) * 1_500_000)`             | 3 Mio      |
| Raketensilo             | `1_000_000` (konstant)                          | konstant   |
| Atombombe / Wasserstoff | `750_000` / `5_000_000` (konstant)              | konstant   |
| **MIRV**                | **`25_000_000 + gestarteteMIRVs * 15_000_000`** | **keiner** |

`Config.ts:388` — MIRV ist die einzige Formel ohne Obergrenze, und die einzige,
die einen **globalen** Zähler nutzt: Der Preis steigt durch MIRVs, die _andere_
gestartet haben, unbegrenzt.

### Konflikt mit Ideenliste Punkt 10

Punkt 10 („Inflation bei Massenbau") schlägt die MIRV-Formel ausdrücklich als
Vorbild für andere Strukturen vor. Nach dieser Regel ist sie das Gegenteil
davon — sie ist der eine Ort, an dem der Preis unlesbar entgleisen kann.

Beides ist vereinbar, aber nur mit Deckel: Der globale Zähler ist als
Mechanik brauchbar, das unbegrenzte Wachstum ist es nicht.

```
mirvCost = min(MIRV_CAP, 25_000_000 + gestarteteMIRVs * 15_000_000)
```

Punkt 10 wird damit umgesetzt als „global steigend **bis zu einem
Höchstpreis**", nicht als „global steigend ohne Ende".

## Anwendung auf Cyber-Operationen (Punkte 26–36)

`docs/CovertOps.md` deckelt bereits den Vorrat (`covertMaxIntel`) und die
Tarnwirkung (`CONCEAL_MAX`). Eine Stelle ist offen:

Der freiwillige Aufschlag **Durchschlagskraft** geht in das Abwehrduell ein

```
gelingt, wenn:  intelSpent - shield(target) >= baseCost
```

und ist nach oben unbegrenzt. Wer genug Punkte hat, überwindet **jeden** Schild
— Verteidigung wird damit zu einer reinen Rechenaufgabe, die der Punktreichere
immer gewinnt. Das ist derselbe Fehler wie ein ungedeckelter Baupreis, nur
andersherum.

Nach dieser Regel:

```
intelSpent <= baseCost * COVERT_SPEND_CAP        // z.B. 3
```

Damit gibt es einen **maximal kaufbaren Angriff** pro Operationsart. Ein
Verteidiger, der seinen Schild über `baseCost * (COVERT_SPEND_CAP - 1)` hebt,
ist gegen diese Operationsart sicher — und weiß das auch. Verteidigung wird zu
einem erreichbaren Ziel statt zu einem Wettrüsten ohne Oberkante.

Das ist zugleich die Antwort auf die Frage, warum Geheimdienstpunkte überhaupt
eine eigene Ressource sind: Ein Deckel auf den Einsatz wirkt nur, wenn er nicht
mit Gold umgangen werden kann.

## Anwendung auf den Unterhalt (Punkte 1 und 2)

```
buildCost(n) = min(CAP_BUILD,  BASE * 2^n)                       // unverändert
upkeep(n)    = min(CAP_UPKEEP, UPKEEP_BASE * (1 + (n-1) * SLOPE))
```

Abstufung nach Typ wie in der Ideenliste: Städte hoch, Häfen und Fabriken
niedrig, Silos/SAMs/Verteidigungsposten mittel, Kriegsschiffe neu.

Wer den Unterhalt nicht zahlen kann, dessen Gebäude werden **stillgelegt, nicht
zerstört** (Punkt 2). Der Preisdeckel und die Stilllegung lösen dasselbe
Problem an zwei Enden: Beide sorgen dafür, dass eine Fehlentscheidung bremst,
statt dauerhaft zu bestrafen.

## Kalibrierung

Keiner der Werte oben wird geraten. Alle `CAP_*`, `UPKEEP_BASE`, `SLOPE` und
`COVERT_SPEND_CAP` werden mit der Balance-Arena gemessen
(`docs/BalanceArena.md`, `npm run balance`):

| Größe              | Messgröße in der Arena                                       |
| ------------------ | ------------------------------------------------------------ |
| `UPKEEP_BASE`      | `cities` / `factories` / `ports` am Laufende — flacht ab?    |
| `SLOPE`            | Gewinnschwelle dort, wo der Ertrag ohnehin abflacht (~10)    |
| `CAP_UPKEEP`       | `gold held` — kippt die Wirtschaft oder trägt sie?           |
| `CAP_BUILD`        | unverändert, dient als Kontrollgröße                         |
| `COVERT_SPEND_CAP` | `leader share %` / `territory gini` — bremst Cyber wirklich? |

Eine Änderung gilt erst als Effekt, wenn die Arena sie mit `*` ausweist — alles
mit `(ns)` ist Seed-Rauschen.

## Grenze der Regel

Die Regel gilt für **Preise**, nicht für **Wirkungen**. Schaden, Reichweiten
und Erzeugungsraten dürfen weiter frei skalieren; ein Deckel dort hätte einen
anderen Zweck und wäre gesondert zu begründen.
