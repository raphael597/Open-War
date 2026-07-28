# Geografische Wirtschaft

Design-Entwurf, noch nicht implementiert. Baut auf dem Unterhaltsmodell aus
`docs/Ideenliste.md` (Punkte 1 und 2) auf und beantwortet die Frage, die dort
offen bleibt: **kostet jedes Gebäude gleich viel, egal wo es steht?**

## Das Problem

Heute ist es der Wirtschaft vollkommen egal, wo etwas steht. Eine Stadt am
äußersten Zipfel einer eroberten Insel verhält sich identisch zu einer im
Kernland. Damit hat die Karte — 114 Stück, mit Bergen, Meerengen und Inseln —
keinerlei wirtschaftliche Bedeutung. Sie ist nur Fläche.

Gleichzeitig liegt ein vollständiges Logistiknetz ungenutzt herum:
`RailNetwork.ts`, `RailNetworkImpl.ts`, `TrainStation.ts`,
`RailroadSpatialGrid.ts` und `TrainExecution.ts` bilden Bahnhöfe, Strecken und
fahrende Züge ab — und erzeugen ausschließlich Gold.

## Die Idee

Der Unterhalt eines Gebäudes hängt von seiner **Erschließung** ab: Wie gut ist
es an das eigene Reich angebunden?

```
upkeep(b) = UPKEEP_BASE[typ]
          * (1 + SLOPE * (n - 1))        // Anzahl gleicher Gebäude
          * remoteness(b)                 // NEU: Lage

remoteness(b) = 1 + REMOTE_MAX * (1 - connectivity(b))
```

Mit `REMOTE_MAX` = 1,0 kostet ein völlig unerschlossenes Gebäude doppelten
Unterhalt, ein gut angebundenes den Grundbetrag.

## Erschließung

`connectivity(b)` ∈ [0, 1] speist sich aus drei Quellen — die jeweils beste
zählt:

| Quelle      | Bedingung                                                         |
| ----------- | ----------------------------------------------------------------- |
| **Schiene** | Entfernung zum nächsten eigenen Bahnhof im verbundenen Netz       |
| **See**     | eigener Hafen in Reichweite, der eine aktive Handelsroute bedient |
| **Stadt**   | eigene Stadt im Nahbereich (lokale Verwaltung)                    |

Für die Schiene gibt es die Reichweiten schon: `trainStationMinRange()` = 15,
`trainStationMaxRange()` = 110 Kacheln. Innerhalb der Mindestreichweite volle
Erschließung, danach linear abfallend bis zur Maximalreichweite, darüber null.

Die Seeanbindung ist wichtig, damit Inselreiche und Marinemächte spielbar
bleiben — sonst wäre das Modell eine reine Landstrafe.

## Was daraus folgt

Das ist der eigentliche Grund für den Aufwand — sechs Dinge auf einmal:

1. **Zersiedelung kostet, Verdichtung lohnt.** Eine abgelegene Enklave zu
   halten ist nicht mehr nur militärisch schwer, sondern dauerhaft teuer.
2. **Die Eisenbahn bekommt eine zweite Aufgabe.** Streckenbau wird zur
   Infrastrukturinvestition statt zu einem Goldrinnsal. Damit ist Punkt 20 der
   Ideenliste zur Hälfte eingelöst, ohne das Truppenmodell anzufassen.
3. **Frisch Erobertes ist zunächst teuer.** Eine gerade genommene Stadt hängt
   an keinem eigenen Netz und kostet entsprechend — bis man sie anschließt. Das
   ist die Integrationsmechanik aus Punkt 48, nur mit echtem Unterbau statt als
   Zeitzähler.
4. **Bahnhöfe werden zu Zielen.** Wer eine Station zerstört, verteuert alles
   dahinter. Das ist eine völlig neue Art von Angriffsziel neben „Armee töten"
   und „Stadt nehmen" — und ein natürliches Ziel für Bomber, Artillerie und
   Sabotage.
5. **Terrain bekommt wirtschaftliche Bedeutung.** Wo Schienen schlecht
   durchkommen, ist Erschließung teuer. Gebirge sind dann nicht mehr nur ein
   Angriffsmalus, sondern eine strukturelle Eigenschaft der Region.
6. **Es gibt endlich einen Grund, Gebiet _nicht_ zu nehmen.** Heute ist jede
   Kachel ein Gewinn. Mit Erschließungskosten kann eine Eroberung sich schlicht
   nicht lohnen — und das ist die interessanteste Entscheidung, die das Spiel
   heute nicht kennt.

## Die Falle: Richtung des Snowballs

Naiv umgesetzt hilft dieses Modell dem **Führenden**. Ein großes,
zusammenhängendes Reich hat gute Anbindung und damit billigen Unterhalt,
während ein kleiner, zersplitterter Spieler teuer fährt. Genau die falsche
Richtung.

**Der Ausgleich: Die Schiene selbst kostet Unterhalt**, proportional zur
Streckenlänge.

Damit steht jeder vor derselben Wahl, und beide Wege werden mit der Fläche
teurer:

- Netz ausbauen → billiger Gebäudeunterhalt, aber teures Netz
- Netz weglassen → billiges Netz, aber teurer Gebäudeunterhalt

Die Gesamtkosten wachsen so mit der Reichsfläche statt konstant zu bleiben, und
die Anti-Snowball-Wirkung bleibt erhalten. Ohne diesen Gegenzug sollte das
Modell nicht gebaut werden.

## Bedienung

Ohne Sichtbarkeit ist das System unbenutzbar — niemand versteht, warum der
Unterhalt gestiegen ist.

- **Erschließungs-Overlay** auf der Karte, eingefärbt nach `connectivity`. Das
  Muster existiert bereits: `DefenseCoveragePass.ts` und `SamRadiusPass.ts`
  zeichnen genau solche Flächen.
- **Im Baumenü** nicht nur „Unterhalt +5.000/min", sondern „+8.000/min
  (schlecht erschlossen)" — die Lage muss vor dem Bauen sichtbar sein.
- **Beim Erobern** eine Meldung, wenn frisch genommene Gebäude teuer zu halten
  sind.

## Offene Fragen

1. **Zählt der Unterhalt pro Gebäude oder pro Ausbaustufe?** Städte, Häfen,
   Fabriken, Silos und SAMs sind `upgradable`. Pro Stufe wäre konsistenter
   (Stufe 3 kostet dreifach), pro Gebäude einfacher zu lesen.
2. **Wie schnell reagiert `connectivity` auf Veränderung?** Sofort ist
   rechnerisch billig, fühlt sich aber sprunghaft an — ein zerstörter Bahnhof
   verteuert schlagartig eine halbe Provinz. Eine Glättung über einige hundert
   Ticks wäre angenehmer, kostet aber Zustand.
3. **Rechenaufwand.** `connectivity` für jedes Gebäude jeden Tick neu zu
   bestimmen ist zu teuer. Vorschlag: nur bei Änderungen am Bahnnetz, an
   Häfen oder am Gebäudebestand neu berechnen —
   `RecomputeRailClusterExecution.ts` macht bereits genau so etwas für das
   Schienennetz und ist die Vorlage.
4. **Reihenfolge.** Erst das flache Unterhaltsmodell (Ideenliste 1 und 2)
   bauen und mit der Balance-Arena einregeln, dann Geografie ergänzen. Beides
   gleichzeitig einzuführen macht die Ursache jeder Balance-Auffälligkeit
   unauffindbar.
