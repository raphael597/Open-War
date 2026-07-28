# Deployment auf Coolify

Anleitung für einen selbst gehosteten Open-War-Server. Ohne die geschlossene
OpenFront-API — anonymes Multiplayer funktioniert, Konten und Ranglisten nicht.
Was genau fehlt, steht unten unter „Was ohne die API fehlt".

## Was der Container mitbringt

Ein einziges Image, kein Compose nötig. Darin laufen über supervisord:

| Prozess    | Port         | Aufgabe                                 |
| ---------- | ------------ | --------------------------------------- |
| nginx      | **80**       | einziger nach außen offener Port        |
| Master     | 3000         | Lobbys, Spielregistrierung              |
| Worker × N | 3001, 3002 … | die eigentlichen Spiele, je ein Prozess |

`generate-nginx-upstream.sh` erzeugt beim Containerstart aus `NUM_WORKERS` die
nginx-Upstreams. Deshalb ist die Variable Pflicht — ohne sie startet der Server
gar nicht.

## Voraussetzung

Das Verzeichnis `proprietary/` muss existieren (es liegt mit einer leeren
`.gitkeep` im Repo). Der `Dockerfile` kopiert es, und Docker bricht ab, wenn ein
`COPY`-Pfad im Build-Kontext fehlt. Nicht löschen.

## Einrichtung in Coolify

1. **Neue Resource → Application → Public/Private Repository**, dieses Repo und
   den gewünschten Branch wählen.
2. **Build Pack: Dockerfile.** Nicht Nixpacks — das Image bringt nginx und
   supervisord selbst mit. Dockerfile-Pfad `./Dockerfile`, Build-Kontext `.`.
3. **Port: 80.** Das ist der einzige Port, den der Container nach außen
   anbietet.
4. **Domain** eintragen. Coolify holt das TLS-Zertifikat automatisch.
5. **WebSockets erlauben.** Das Spiel läuft vollständig über WebSocket-
   Verbindungen. Traefik kann das, es muss für die Anwendung nur aktiviert sein.
6. **Health Check** auf `/api/health` (nginx reicht ihn unzwischengespeichert an
   den Master durch).
7. Umgebungsvariablen setzen (siehe unten), dann **Deploy**.

## Umgebungsvariablen

### Pflicht — ohne diese startet der Server nicht

| Variable             | Beispiel       | Wirkung                                              |
| -------------------- | -------------- | ---------------------------------------------------- |
| `GAME_ENV`           | `prod`         | nur `dev`, `staging` oder `prod`; alles andere wirft |
| `NUM_WORKERS`        | `2`            | Zahl der Spielprozesse, bestimmt die nginx-Upstreams |
| `DOMAIN`             | `meinspiel.de` | daraus leitet sich auch `https://api.<DOMAIN>` ab    |
| `TURNSTILE_SITE_KEY` | siehe unten    | Bot-Schutz beim Beitritt                             |

Für `TURNSTILE_SITE_KEY` funktioniert Cloudflares offizieller Testschlüssel
`1x00000000000000000000AA`, der jede Anfrage durchwinkt. Für einen privaten
Server ist das in Ordnung.

`GIT_COMMIT` ist ebenfalls Pflicht, wird aber vom `Dockerfile` als Build-Argument
gesetzt (Vorgabe `unknown`) — dazu ist nichts zu tun.

### Optional

| Variable            | Wirkung wenn leer                                           |
| ------------------- | ----------------------------------------------------------- |
| `CDN_BASE`          | leer lassen: Assets kommen von derselben Herkunft, kein CDN |
| `API_KEY`           | leer: API-Aufrufe scheitern, der Beitritt läuft trotzdem    |
| `ADMIN_BOT_API_KEY` | leer: die Admin-Bot-Schnittstelle bleibt vollständig aus    |
| `SUBDOMAIN`         | nur für die Mehr-Umgebungs-Aufteilung von upstream relevant |
| `OTEL_*`            | Telemetrie bleibt aus                                       |

### Wovon die Finger lassen

`DOMAIN=openfront.dev` in Verbindung mit einem `SUBDOMAIN` ungleich `main`
startet den Container laut `Dockerfile` unter `timeout 25h` — er beendet sich
dann nach einem Tag von selbst. Das ist upstreams Staging-Automatik und für
einen eigenen Server nicht gewollt.

## Was ohne die API fehlt

Der Server spricht für Konten, Statistiken, Kosmetik und Clans mit
`https://api.<DOMAIN>`. Diese Cloudflare-Worker-API ist Closed Source und nicht
Teil des Repos.

**Funktioniert trotzdem:** Lobbys, öffentliche und private Spiele, alle 114
Karten, sämtliche Spielmechaniken, Bots und Nationen. Der Beitritt scheitert
bewusst nach außen offen — `JoinVerify.ts` nimmt bei jedem API-Fehler den lokal
geprüften Namen und lässt den Spieler zu.

**Funktioniert nicht:** Konten und Login, dauerhafte Statistiken, Ranked,
Kosmetik, Clans, gekaufte Stammesnamen.

**Im Log** laufen dauerhaft API-Fehler durch (`ECONNREFUSED`, fehlgeschlagene
JWKS-Abrufe, `failed to fetch custom tribes`). Das ist bei dieser Aufstellung
normal und kein Zeichen für ein kaputtes Deployment.

## Größe des Servers

`NUM_WORKERS` bestimmt, wie viele Spiele parallel laufen können — jeder Worker
ist ein eigener Node-Prozess. Für den Anfang: ein Worker je CPU-Kern, minus
einer für nginx und den Master. Auf einer kleinen VPS mit zwei Kernen also
`NUM_WORKERS=2`.

Zu beachten: Die Simulation läuft auf den Clients, der Server verteilt nur
Intents. Die Serverlast hängt daher eher an der Zahl der Verbindungen als an
der Spielgröße.
