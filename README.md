<p align="center">
  <img src="resources/images/OpenWarLogo.svg" alt="Open War" width="360">
</p>

**Open War** ist ein Echtzeit-Strategiespiel im Browser: Territorium erobern,
Truppen und Gold verwalten, Städte, Häfen, Raketensilos und Verteidigungsposten
bauen, Allianzen schmieden — und wieder brechen.

Das Projekt ist ein Fork von [OpenFront.io](https://github.com/openfrontio/OpenFrontIO)
(AGPL-3.0), das seinerseits aus [WarFront.io](https://github.com/WarFrontIO)
hervorgegangen ist. Der komplette Spielcode ist übernommen, damit hier eigene
Ideen darauf aufgebaut werden können.

## Was gegenüber dem Original anders ist

- **Proprietäre Assets entfernt.** Upstream liefert Logo, Favicon, Titel-Font
  und die Hintergrundmusik in `proprietary/` unter „All Rights Reserved" aus —
  die dürfen laut Lizenz nicht in ein anderes Projekt übernommen werden. Sie
  sind hier durch eigene Grafiken ersetzt (`resources/images/OpenWarLogo.svg`,
  `OpenWarMark.svg`, `Favicon.svg`), der Titel-Font ist das freie
  [Overpass](https://overpassfont.org/) (SIL OFL) aus `resources/fonts/`.
  Hintergrundmusik gibt es keine — siehe unten.
- **Repo-Automatik von OpenFront entfernt.** Deploy-Workflow, PR-/Issue-Bots,
  CODEOWNERS und das `gatekeeper`-Submodul sind raus; die CI (Build, Tests,
  ESLint, Prettier, Karten-Check) ist geblieben.
- Alle 114 Karten, alle Spielmechaniken, Client, Server und Tests sind
  unverändert übernommen.

## Loslegen

Voraussetzungen: Node.js ≥ 22 und npm.

```bash
npm run inst # = npm ci --ignore-scripts, nicht `npm install` benutzen
npm run dev  # Client + Server, danach http://localhost:9000 öffnen
```

Weitere Befehle:

| Befehl                     | Zweck                                                    |
| -------------------------- | -------------------------------------------------------- |
| `npm run start:client`     | nur der Client (Vite, Port 9000)                         |
| `npm run start:server-dev` | nur der Spielserver                                      |
| `npm test`                 | Testsuite (Vitest, ~2350 Tests)                          |
| `npm run lint:fix`         | ESLint mit Autofix                                       |
| `npm run format`           | Prettier über das ganze Repo                             |
| `npm run build-prod`       | Produktions-Build nach `static/`                         |
| `npm run gen-maps`         | Karten aus `map-generator/assets` neu bauen (braucht Go) |
| `npm run perf:game`        | 1800 Ticks Vollsimulation ohne Browser                   |

Beim Entwickeln ohne die (nicht öffentliche) OpenFront-API laufen Fehler wie
`ECONNREFUSED … Error polling lobby` oder `failed to fetch custom tribes`
dauernd durch das Log — das ist normal, Singleplayer funktioniert trotzdem.

## Wo was liegt

| Pfad                      | Inhalt                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `src/core/`               | Spiellogik: Simulation, Executions, Konfiguration, Pathfinding    |
| `src/core/configuration/` | Balancing — Truppenwachstum, Angriffsformeln, Preise, Goldertrag  |
| `src/core/execution/`     | Alles, was pro Tick passiert: Angriffe, Bau, Nukes, Boote, Bot-KI |
| `src/client/`             | UI (Lit-Komponenten), HUD, Eingabe                                |
| `src/client/render/gl/`   | WebGL2-Renderer der Karte                                         |
| `src/server/`             | Node-Spielserver, Lobbys, WebSockets                              |
| `resources/maps/`         | 114 fertig generierte Karten (`map.bin` + Manifest)               |
| `map-generator/`          | Go-Tool, das aus PNG-Vorlagen neue Karten baut                    |
| `tests/`                  | Vitest-Suite                                                      |
| `docs/`                   | `Architecture.md`, `API.md`, `Auth.md`                            |

Für eigene Änderungen sind meistens `src/core/configuration/` (Balancing) und
`src/core/execution/` (Spielmechaniken) die richtigen Einstiegspunkte.

## Eigene Assets ergänzen

- **Musik:** MP3s nach `resources/sounds/music/` legen und in
  `BACKGROUND_MUSIC_TRACKS` (`src/client/sound/SoundManager.ts`) eintragen.
  Lautstärkeregler und Track-Rotation funktionieren bereits.
- **Logo/Favicon:** Dateien in `resources/images/` ersetzen.
- **Nicht-freie eigene Assets:** ein optionales Verzeichnis `proprietary/`
  wird beim Build über `resources/` gelegt (gleiche Pfade, `resources/` hat
  Vorrang). Es ist nicht im Repo und wird nur benutzt, wenn es existiert.

## Spiel lokal testen

Im Repo liegt die Claude-Skill `.claude/skills/run-openfront/`, die den
Dev-Server startet und ein echtes Singleplayer-Spiel headless durchspielt
(spawnen, expandieren, Radialmenü) und dabei Screenshots und echten Sim-State
ausliest — nützlich, um Änderungen zu verifizieren, ohne selbst zu klicken.

## Lizenz

Der Code steht unter der **GNU Affero General Public License v3.0** — siehe
[LICENSE](LICENSE). Die Assets in `resources/` stehen unter
**Creative Commons BY-SA 4.0** — siehe [LICENSE-ASSETS](LICENSE-ASSETS).
Zur Lizenzhistorie des Originals siehe [LICENSING.md](LICENSING.md).

Was das praktisch heißt:

- Dieses Projekt muss unter AGPL-3.0 bleiben, inklusive aller Änderungen.
- Wer es öffentlich hostet, muss den Quellcode der laufenden Version anbieten
  (das ist die Netzwerk-Klausel der AGPL).
- Der Copyright-Hinweis **„© OpenFront and Contributors"** muss an sichtbarer
  Stelle erhalten bleiben — er steht im Footer und auf dem Ladebildschirm.
- Dieses Projekt ist **nicht** mit OpenFront Inc. verbunden und wird nicht von
  dort betrieben oder unterstützt.

Siehe [NOTICE.md](NOTICE.md) für die vollständige Herkunftsangabe.

## Credits

Der gesamte Spielcode stammt von OpenFront Inc. und den OpenFront-Contributors,
davor vom WarFront.io-Team. [CREDITS.md](CREDITS.md) listet die
Original-Credits.
