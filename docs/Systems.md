# Resources, industry, cities and cyber warfare

These systems sit on top of the base territorial game. All of the logic lives
in the deterministic simulation (`src/core`), so none of it may use
`Math.random`, `Date`, or anything else that differs between clients.

Shared enums, the deposit function and the wire snapshot live in
`src/core/game/Industry.ts`. All balancing numbers live in
`src/core/configuration/Config.ts` — that is the file to open first when
tuning anything below.

## Resource deposits

Deposits are **derived from the tile index**, not stored in the map files:
`depositAt(tile)` hashes the tile and returns Steel, Oil, Uranium or nothing.
No map regeneration is needed and every client computes the same result.

Roughly one land tile in 179 carries a deposit; steel is the most common,
uranium the rarest. Counts per player are maintained incrementally in
`GameImpl.conquer` / `GameImpl.relinquish` — recounting owned tiles every tick
would be far too slow on a large map.

| Resource | Effect                            |
| -------- | --------------------------------- |
| Steel    | Structures cost less (up to −35%) |
| Oil      | Gold income rises (up to +50%)    |
| Uranium  | Required to build nuclear weapons |

**Nuclear material.** An atom bomb needs 1 controlled uranium deposit, a
hydrogen bomb 3, a MIRV 8. Nations and bots are exempt: they stand in for
established states with their own stockpiles, and gating them would quietly
remove the nuclear deterrent the AI is built around.

## Industry

Factories bank **production**, spent automatically against structure costs
(up to half of any build). Output scales with the factory's level and with the
size of its **industrial zone** — the number of the player's factories sharing
one rail cluster. A lone factory gets no bonus; six connected factories get
+75%. This is what makes it worth laying rail around industry instead of
scattering buildings.

`IndustryExecution` runs the whole economy once a second (not every tick) and
sweeps the rail network exactly once per pass, reusing the result for every
player.

## Cities

A city can be specialized through the radial menu on your own territory:

| Role       | Effect                                        |
| ---------- | --------------------------------------------- |
| Metropolis | Gold income                                   |
| Garrison   | Higher troop ceiling (capped at +40%)         |
| Shipyard   | Cheaper naval units (capped at −50%)          |
| Research   | Produces intel, and defends against cyber ops |

**Capital.** A player's first finished city becomes their capital. Losing it —
destroyed or captured — costs a quarter of the treasury and 15% of the standing
army on top of the building. Another city is promoted on a later tick.

**Supply.** A city on the capital's rail network is fully supplied. Otherwise
its contribution falls off with distance and floors at 40%, so a compact
territory is worth more than a sprawling one. The supply-weighted counts are
computed in the simulation and travel to the HUD on `IndustryUpdate`, so the
economy formulas and the interface always agree.

## Cyber warfare

Cyber operations are the fourth domain: they capture nothing and instead apply
a timed effect to one enemy. They cost **intel** from research cities and share
one cooldown.

| Operation  | Intel | Effect                                              |
| ---------- | ----- | --------------------------------------------------- |
| Blackout   | 100   | Target loses the standings display                  |
| Trade Hack | 200   | Target's trade payouts are diverted to the attacker |
| Stuxnet    | 250   | Target's missile silos will not fire                |
| False Flag | 300   | Target's attacks are reported under a neighbour     |

**Firewalls.** Research cities absorb an operation whose intel cost is at or
below their combined strength (100 per city level). One level-1 research city
stops a Blackout, two stop a Trade Hack, three stop a False Flag. The intel is
spent either way — a failed operation is not a free one.

**Attribution.** The victim is told they were hit but not by whom. The attacker
only becomes visible 30 seconds later, when the trace completes. The wire
snapshot reports an attacker of `-1` until then, so the information never
reaches the client early. This is what makes a false flag worth running.

## World events and escalation

Every two minutes a global event runs for a minute, cycling in a fixed order so
players can position around it rather than being surprised:

- **Resource Boom** — deposits yield double
- **Sea Storm** — trade ships complete their runs but pay nothing
- **Nuclear Moratorium** — nukes cannot be built

Separately, every nuke launched by anyone drags the whole world's economy down
by 1%, floored at half. Escalation becomes a collective cost rather than a
purely individual decision.

## Trains

A train rolling onto tiles an enemy has taken derails: the freight is lost and
the route has to be re-secured before the industrial zone bonus comes back.
Logistics is a target, not scenery.

## Where things are

| Path                                         | Contents                       |
| -------------------------------------------- | ------------------------------ |
| `src/core/game/Industry.ts`                  | Enums, deposits, wire snapshot |
| `src/core/configuration/Config.ts`           | All balancing numbers          |
| `src/core/execution/IndustryExecution.ts`    | Production, intel, supply      |
| `src/core/execution/CyberOpExecution.ts`     | One cyber operation            |
| `src/core/execution/SetCityRoleExecution.ts` | City specialization            |
| `src/core/execution/WorldEventExecution.ts`  | The global event cycle         |
| `tests/Industry.test.ts`                     | Coverage for everything above  |
