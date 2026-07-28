# Ideenliste — Spieltiefe, Spielerlebnis, neue Domänen

Sammlung von Verbesserungsideen für Open War. Keine Entscheidungen, sondern ein
Vorrat zum Aussuchen. Wo eine Datei genannt ist, existiert die Grundlage bereits
im Code — das sind die billigen Punkte.

Bewertung: **A** = kleiner Aufwand, **B** = mittel, **C** = groß.
Der Stern (★) markiert Punkte mit dem besten Verhältnis von Wirkung zu Aufwand.

---

## 1. Wirtschaft und Bau

Das Kernproblem ist nicht, dass sich zu viel lohnt, sondern dass sich zu wenig
**anfühlt** wie eine Entscheidung.

Die Erträge sinken bereits von selbst: `trainSpawnRate(n) = (n + 10) * 15` ist
hyperbolisch mit Mittelpunkt bei 10 Fabriken, `trainGold()` zieht ab der
zehnten besuchten Stadt 5.000 pro Stadt ab, und `tradeShipSpawnRate()` flacht
über eine Sigmoid bei 400 Schiffen ab. Die 15. Fabrik ist also nicht zu stark — sie
ist **wertlos**. Nur steht das nirgends im Spiel, sondern in Formeln, die
niemand ablesen kann.

Dazu kommt: Baukosten laufen gegen eine Decke (`Math.min(1_000_000, …)` in
`Config.ts:439ff`), und ein einmal gebautes Gebäude wird nie zur Last. Es gibt
also nie einen Grund, zwischen bestehenden Dingen abzuwägen oder etwas
aufzugeben. Kein Druck, nur stille Vergeudung.

Wichtig für den Entwurf: **Städte erzeugen überhaupt kein Gold.**
`cityTroopIncrease()` wird ausschließlich in `maxTroops()` benutzt — Städte
heben die Truppenobergrenze. Gold kommt aus dem Grundeinkommen, aus
Handelsschiffen (Häfen) und Zügen (Fabriken).

1. **★ Laufender Unterhalt — Baukostendeckel bleibt** (B) — Einmalkosten und
   laufende Kosten haben zwei verschiedene Aufgaben: Baukosten begrenzen das
   **Tempo**, Unterhalt begrenzt die **Größe**. Heute versucht die
   Baukostenformel beides und scheitert am zweiten. Sobald der Unterhalt die
   Größenbegrenzung übernimmt, darf der Deckel bleiben — eine Stadt für 50
   Millionen wäre unlesbar und würde Fehler dauerhaft bestrafen.

   ```
   buildCost(n) = min(CAP, base * 2^n)              // unverändert
   upkeep(n)    = UPKEEP_BASE * (1 + (n - 1) * SLOPE)
   ```

   Mit kleinem `SLOPE` (etwa 0,1) kostet das elfte Gebäude doppelten Unterhalt
   gegenüber dem ersten — sanft und lesbar, aber wirksam, weil man es dauerhaft
   zahlt. Der eigentliche Gewinn: Die Obergrenze **entsteht von selbst und
   wandert mit der Wirtschaft**. Nicht „bei 12 Städten ist Schluss", sondern
   „so viele, wie dein Einkommen trägt". Wachsender Handel trägt mehr;
   verlorene Häfen machen das eigene Militär zur Last.

   Abstufung nach Typ:
   - **Städte** — höchster Unterhalt. Sie erzeugen kein Gold, nur
     Truppenkapazität; daraus wird das klassische Wargame-Geschäft _deine
     Armee kostet Geld_.
   - **Häfen und Fabriken** — niedrig. Sie tragen sich früh selbst; der
     Unterhalt sorgt nur dafür, dass die vorhandene Sättigung endlich wehtut,
     statt bloß neutral zu sein.
   - **Silos, SAMs, Verteidigungsposten** — mittel. Erzeugt „du kannst nicht
     überall SAMs haben", was heute schlicht nicht stimmt.
   - **Kriegsschiffe** — Unterhalt statt nur Baukosten. Der Preis ist ab dem
     vierten Schiff bei 1 Mio gedeckelt, genau deshalb lohnt sich Spam.

   Die Werte für `UPKEEP_BASE` und `SLOPE` nicht raten: Der Kalibrierungspunkt
   ist die Gewinnschwelle ungefähr dort, wo der Ertrag ohnehin abflacht — bei
   Fabriken also um 10 herum. Messbar mit der Balance-Arena (Punkt 79), und
   deshalb erst danach bauen.

   Ausbaustufe: ob der Unterhalt zusätzlich von der **Lage** abhängen soll,
   behandelt `docs/Geowirtschaft.md` — Anbindung an Schiene, Häfen und Städte.
   Erst dieses flache Modell einregeln, dann Geografie ergänzen.

2. **★ Unterhalt sichtbar machen, Stilllegung statt Zerstörung** (A) — die zwei
   Details, an denen das System zwischen Tiefe und Frust entscheidet, und ohne
   die Punkt 1 wertlos ist.

   **Sichtbar:** im Baumenü neben dem Preis „125.000 — Unterhalt +5.000/min".
   Damit wird aus einer unsichtbaren Ertragskurve eine ablesbare Entscheidung —
   das ist die eigentliche Lösung des Kernproblems oben.

   **Stilllegung:** Wer den Unterhalt nicht zahlen kann, dessen Gebäude
   **werden stillgelegt, nicht zerstört** — sie produzieren nichts mehr, kosten
   aber auch nichts, und laufen wieder an, sobald Gold da ist. Wer sich
   übernimmt, wird ausgebremst, nicht gelöscht. Automatische Zerstörung wäre
   die Todesspirale, an der Unterhaltssysteme üblicherweise scheitern.

3. **Spezialisierung erzwingen** (B) — pro Region entweder Wirtschafts- oder
   Militärgebäude, nicht beides. Erzeugt Reichsprofile statt Einheitsbrei.
4. **Ressourcenknoten auf der Karte** (C) — Öl, Eisen, Häfen mit Bonus. Gibt
   einen Grund, _diese_ Kachel zu wollen statt irgendeine.
5. **Bauzeit nach Entfernung** (A) — Gebäude weit weg vom nächsten Stadtzentrum
   brauchen länger. Belohnt zusammenhängende Reiche.
6. **Plünderung** (B) — erobertes Gebiet gibt einmalig Gold, senkt aber den
   Dauerertrag. Wahl zwischen Ausbeuten und Integrieren.
7. **Kriegswirtschaft-Schalter** (B) — Gold in Truppen umwandeln zum Preis von
   Wirtschaftswachstum. Eine echte strategische Weiche.
8. **Handelsrouten sichtbar und unterbrechbar** (B) — Handelsschiffe fahren
   heute unsichtbar Gold ein. Sichtbare Routen kann man blockieren.
9. **Lagerhaltung** (A) — Goldvorrat gedeckelt, Überschuss verfällt. Zwingt zum
   Ausgeben statt zum Horten für den einen großen MIRV.
10. **Inflation bei Massenbau** (A) — jede zusätzliche gleiche Struktur
    verteuert die nächste global, nicht nur für dich. Nach dem Vorbild der
    MIRV-Preisformel, die als einzige im Spiel einen globalen Zähler nutzt.

## 2. Kampf und Taktik

Heute ist jeder Angriff ein Prozentregler plus Zielklick. `attackLogic()` in
`Config.ts:625` enthält keine einzige Spielerentscheidung.

11. **★ Angriffsdoktrinen** (B) — Blitz (schnell, teuer), Zermürbung (langsam,
    schont eigene Truppen), Belagerung (kein Geländegewinn, blockiert). Drei
    Presets auf `mag` und `speed`. Bestes Verhältnis von Tiefe zu Aufwand im
    ganzen Spiel.
12. **★ Frontbreite strategisch nutzen** (B) — `attackTilesPerTick()` bekommt
    bereits `numAdjacentTilesWithEnemy`. Die Mechanik ist da, sie wird nur nie
    strategisch relevant.
13. **Engstellen und Pässe** (C) — eigener Terraintyp, der die Front verengt.
    Macht aus 114 gleich spielenden Karten 114 verschiedene.
14. **Terrain asymmetrisch statt linear** (B) — Berge sind heute nur „überall
    50 % teurer" (Plains 80/16.5, Mountain 120/25). Besser: teuer anzugreifen,
    aber geringe Truppenkapazität — man kann sich nicht verschanzen.
15. **Flussüberquerung** (B) — Angriff über Wasser mit Malus, es sei denn, eine
    Brücke steht.
16. **Truppenerfahrung** (B) — `Veterancy.ts` existiert bereits für
    Kriegsschiffe. Auf Landtruppen ausweiten.
17. **Moral als zweite Achse** (C) — Truppen haben Stärke _und_ Moral;
    Rückzüge, Niederlagen und Anschläge senken sie.
18. **Geordneter Rückzug** (A) — `RetreatExecution.ts` existiert; ein Rückzug
    unter Beschuss sollte teurer sein als ein rechtzeitiger.
19. **Einkesselung** (C) — abgeschnittene Gebiete verlieren über Zeit Truppen.
20. **Nachschublinien über die Eisenbahn** (C) — `RailNetwork.ts`,
    `TrainExecution.ts` und `TrainStation.ts` sind ein vollständiges
    Logistiknetz, das ausschließlich Gold erzeugt. Größte ungenutzte Fläche im
    Repo.
21. **Tag-und-Nacht-Modifikator** (A) — der `day-night`-Shader existiert
    bereits als reine Optik. Nachtangriffe langsamer, aber schwerer zu
    entdecken.
22. **Grenzbefestigungen** (B) — Verteidigungsposten zu einer zusammenhängenden
    Linie ausbaubar, mit Bonus für Lückenlosigkeit.
23. **Artillerie** (B) — die Landversion des bestehenden Shell-Systems
    (`ShellExecution.ts`). Füllt die Lücke zwischen Truppenschieben und
    Atombombe.
24. **U-Boot** (B) — Konter gegen Kriegsschiff-Spam, unsichtbar bis zum Schuss.
25. **Amphibische Vorbereitung** (A) — Landungen an vorbereiteten Brückenköpfen
    billiger als aus dem Nichts.

## 3. Cyber-Domäne

Setzt auf dem gemeinsamen Unterbau auf, siehe `docs/CovertOps.md`.

26. **★ Geheimdienstpunkte als eigene Ressource** (B) — nicht handelbar, nicht
    spendbar, und die Erzeugung ist bewusst gegen die Reichsgröße gerichtet.
    Damit ist Cyber der Hebel des Schwachen — die eleganteste Snowball-Bremse.
27. **★ Blackout** (A) — Silos und SAMs des Ziels gehen auf Abklingzeit. Die
    Hooks existieren: `SAMCooldown()` und `SiloCooldown()`, `Config.ts:191`.
28. **Sabotage** (A) — Baustelle zurückgesetzt, Fabrik steht still.
29. **Handelsstörung** (A) — Handelsschiffe bringen N Ticks lang nichts ein.
30. **Datendiebstahl** (A) — klaut Gold, statt es zu vernichten. Fühlt sich
    anders an als Zerstörung und trifft den Reichen härter.
31. **★ Spuren und Zuordnung** (B) — eine Operation ist fast anonym, eine
    Kampagne nicht. Kern des ganzen Systems.
32. **Gegenspionage-Haltung** (A) — Punkte binden, um die eigene
    Zuordnungsschwelle zu senken.
33. **Firewall-Ausbau** (A) — Kommandozentrale ausbaubar als Abwehrschild.
34. **Wurm** (B) — Wirkung springt auf verbundene Strukturen über (Bahnnetz,
    benachbarte Fabriken).
35. **Falsche Flagge** (C) — Operation einem Dritten zuschieben. Sehr teuer,
    sehr riskant, und der beste Grund, überhaupt Gegenspionage zu betreiben.
36. **Aufklärung** (B) — enthüllt genaue Werte eines Ziels. Achtung: begrenzt
    wirksam, weil die Simulation auf jedem Client läuft (siehe Grenzen in
    `CovertOps.md`).

## 4. Luft-Domäne

Rund 70 % davon existiert bereits — nur auf Nuklearwaffen ausgerichtet.

37. **★ SAM auf Luftziele öffnen** (A) — `SAMLauncherExecution.ts:109` listet
    als Ziele `[AtomBomb, HydrogenBomb, MIRVWarhead]`. Eine Flugabwehr, die nur
    Atomraketen abfängt. Bomber in die Liste aufzunehmen macht jeden
    bestehenden SAM-Bau schlagartig wertvoller.
38. **Luftwaffenbasis** (B) — Struktur mit begrenzter Einsatzkapazität. Ihre
    Zerstörung legt den gesamten Luftarm lahm.
39. **★ Bomberstaffel** (C) — trifft Strukturen und Truppen, **nimmt kein
    Territorium**. Wiederholbare Zermürbung statt Alles-oder-nichts.
40. **Jäger** (C) — der Konter innerhalb der Domäne. Strukturell ein
    Kriegsschiff, das über Land fliegt — `WarshipExecution.ts` liefert
    Patrouille, Zielerfassung, Rückkehr, Reparatur und Veteranenstufen fertig.
41. **Aufklärungsflug** (B) — billiger Sichtbereich über fremdem Gebiet.
42. **Luftbrücke** (B) — Truppen über eigenes Gebiet verlegen, teuer und
    abfangbar. Der erste echte Logistikbaustein.
43. **Luftüberlegenheit als Zonenzustand** (C) — wer die Luft hält, bekommt
    Bonus auf Bodenangriffe in der Zone.

## 5. Stellvertreter und Aufständische

44. **★ Zerschlagene Kleinstaaten werden Untergrundfraktionen** (C) — heute
    sind Bots und Tribes reines Futter. Wenn sie als Zellen weiterleben,
    erinnert sich die Karte daran, wen du erobert hast.
45. **Finanzierung** (A) — `DonateGoldExecution.ts` ist das Muster, inklusive
    Beziehungspunkten.
46. **★ Rückschlag** (B) — eine finanzierte Fraktion ist keine Marionette und
    wendet sich ab einer gewissen Stärke gegen ihre Geldgeber. Ohne das ist
    Finanzieren eine Entscheidung ohne Nachteil.
47. **Besatzungsunruhe** (B) — frisch erobertes Gebiet bleibt unruhig. Erzeugt
    die Wahl zwischen schnell erobern und dauerhaft bluten oder langsam
    erobern und verdauen.
48. **Integration** (A) — Städte im eroberten Gebiet senken die Unruhe über
    Zeit.
49. **Aufstandsunterdrückung** (A) — Verteidigungsposten unterdrücken Zellen im
    Radius. Gibt der Struktur eine zweite Aufgabe.
50. **Ausgeschiedene Spieler führen den Aufstand** (B) — größter
    Retention-Gewinn überhaupt: Wer rausfliegt, verlässt heute die Lobby.
    Vorbehalt: schafft Königsmacher, deshalb als Lobby-Option und in Ranked aus.

## 6. Diplomatie

Heute binär: Allianz an oder aus, Embargo, Emoji. Dazwischen nichts.

51. **★ Abgestufte Verträge** (B) — Durchmarschrecht, befristeter
    Waffenstillstand, Tributzahlung, Handelsabkommen. Die Bausteine liegen
    fertig da (`DonateGoldExecution`, `DonateTroopExecution`,
    `AllianceExtensionExecution`).
52. **Allianz-Obergrenze** (A) — maximal zwei oder drei. Verhindert das späte
    FFA-Patt verbündeter Blobs.
53. **Öffentlicher Rufwert** (B) — statt des groben Ja/Nein-Verräterstatus.
    Das Beziehungssystem (−100…100, `PlayerImpl.ts:823`) existiert bereits.
54. **Kriegserklärung mit Vorlauf** (A) — Angriff auf Nichtangegriffene kostet
    Ruf, außer nach angekündigter Frist.
55. **Vasallenschaft** (C) — kleiner Spieler zahlt Tribut und bekommt Schutz.
    Gibt Verlierern eine Rolle statt eines Endes.
56. **Koalitionen mit gemeinsamem Kriegsziel** (C) — Bündnisse mit Bedingung
    statt unbefristeter Nichtangriffspakte.
57. **Verhandlungsfenster statt Emoji** (B) — konkretes Angebot mit Annehmen
    oder Ablehnen. `QuickChatExecution.ts` ist der Ansatzpunkt.

## 7. KI und Einzelspieler

Die Nation-KI ist mit rund 5.600 Zeilen erstaunlich ausgebaut — aber
Schwierigkeitsgrade sind nur Multiplikatoren (0.9 / 0.95 / 1.0 / 1.05).
„Unmöglich" ist nicht klüger, nur 5 % schneller.

58. **★ KI-Koalition gegen den Führenden** (B) — löst gleichzeitig das
    Snowball-Problem und die Einzelspieler-Langeweile.
59. **Schwierigkeit über Verhalten statt Zahlen** (B) — höhere Stufen spielen
    anders, nicht schneller.
60. **KI-Persönlichkeiten** (B) — aggressiv, händlerisch, isolationistisch,
    rachsüchtig. Macht jedes Spiel anders.
61. **KI mit Gedächtnis** (A) — merkt sich Verrat und Anschläge dauerhaft.
    Greift kostenlos, sobald Beziehungswerte verschoben werden.
62. **KI nutzt die neuen Domänen** (B) — sonst sind Cyber und Luft im
    Einzelspieler nur Deko.

## 8. Spielerlebnis und Bedienung

63. **★ Tutorial** (B) — existiert nicht, nur ein `HelpModal.ts`. Bei einem
    Browser-Strategiespiel entscheidet die erste Minute über alles.
64. **Angriffsvorschau** (A) — vor dem Klick zeigen, was der Angriff kostet und
    einbringt. Nimmt das Raten aus der Kernhandlung.
65. **Bedrohungsanzeige** (B) — sichtbar machen, wo eine feindliche
    Truppenmasse an der Grenze steht.
66. **Replay teilen** (B) — `ReplayPanel.ts` und die Schemas existieren, es
    fehlt nur „Link teilen". Geteilte gute Spiele sind kostenloses Marketing.
67. **Zuschauermodus** (B) — auch für ausgeschiedene Spieler.
68. **Tastenkürzel** (A) — Bauen, Angriffsstärke, Kartensprung.
69. **Ping und Kartenmarkierungen** (A) — für Verbündete. Kommunikation ist
    heute auf Emojis beschränkt.
70. **Ereignisprotokoll filterbar** (A) — `MessageCategory` existiert schon,
    die Filterung ist nur nicht durchgezogen.
71. **Nachspiel-Analyse** (B) — Kurven für Territorium, Gold und Truppen. Aus
    Niederlagen lernt man nur, wenn man sie sieht.
72. **Kurzspielmodus** (A) — 10-Minuten-Variante über die vorhandenen
    Doomsday-Clock-Presets.
73. **Warnung vor Fehlklicks** (A) — versehentlicher Angriff auf Verbündete
    kostet heute sofort die Allianz.
74. **Farbenblind-Modus** (A) — bei einem Spiel, das ausschließlich über
    Territoriumsfarben liest, keine Kür.

## 9. Fortschritt und Bindung

75. **Doktrin-Baum** (C) — Gold in dauerhafte Reichsmodifikatoren investieren.
    Zweite Goldsenke und Spielerprofil in einem.
76. **Szenarien und Kampagne** (C) — vorgegebene Startlagen mit Zielen.
    Einzelspieler-Inhalt, den kein anderer Fork hat.
77. **Tägliche Herausforderung** (B) — feste Karte, feste Startlage, Rangliste.
    Billigster Wiederkehr-Anreiz überhaupt.
78. **Freischaltbare Kartenmodifikatoren** (B) — als Belohnung statt als
    Bezahlinhalt.

## 10. Technik und Projekt

79. **★ Balance-Arena** (B) — `src/core` ist deterministisch und ohne externe
    Abhängigkeiten, `npm run perf:game` fährt bereits 1800 Ticks headless.
    Daraus eine Serie mit variierten Config-Werten und Auswertung von
    Siegquote, Spieldauer und Entscheidungszeitpunkt zu bauen, ist überschaubar
    — und macht jede weitere Balance-Änderung auf dieser Liste billiger und
    sicherer. Deshalb zuerst.
80. **Eigenes Backend** (C) — die API für Konten, Statistiken und Ranked ist
    laut `CLAUDE.md` Closed Source und nicht im Repo. Ohne Ersatz gibt es keine
    dauerhaften Statistiken und kein Ranked.
81. **Community-Karten** (B) — der Go-Kartengenerator liegt im Repo. Einreichen
    und Abstimmen wäre billige Differenzierung.
82. **Musik ergänzen** (A) — `BACKGROUND_MUSIC_TRACKS` ist leer, Lautstärke und
    Rotation funktionieren bereits. Ein paar CC-BY-Titel genügen.
83. **Lesbarkeit beim Herauszoomen** (B) — Vorarbeit für alles Fliegende. Wenn
    Luft, Cyber-Meldungen und Fraktionen dazukommen, ist die Karte das
    Nadelöhr, nicht die Simulation.

---

## Wenn nur fünf davon umgesetzt werden

1. **Balance-Arena** (79) — macht alles andere billiger und sicherer
2. **Angriffsdoktrinen** (11) — gibt der häufigsten Handlung im Spiel eine
   Entscheidung
3. **Unterhaltskosten** (1 und 2) — gibt jedem Goldstück eine Entscheidung;
   Punkt 2 ist Pflicht, nicht Kür
4. **Cyber-Unterbau mit Zuordnung** (26, 27, 31) — das
   Alleinstellungsmerkmal, ohne neues Rendering
5. **Tutorial** (63) — entscheidet darüber, ob überhaupt jemand bleibt

Die ersten drei kosten fast keine Rendering-Arbeit und berühren weder Netzcode
noch Determinismus.
