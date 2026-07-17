# Game Design Document

## Document purpose

This document describes the intended player experience for **BAYANIHAN PROTOCOL: SIGNAL ZERO** and the deliberately smaller first vertical slice. It is a design contract, not evidence that every listed feature is implemented. Labels are used throughout:

- **Vertical slice:** implemented or required for the current one-player Solo and two-player Versus prototype.
- **Competition target:** planned for the eventual 2v2, 7–9-minute game.
- **Exploration:** a direction that still needs prototyping and human approval.

The vertical slice’s command suite and complete two-browser victory/rematch loop were verified on macOS on 2026-07-16. See the root `README.md` for exact evidence and known limitations.

## High concept

**One-sentence pitch:** Wobbly emergency responders jump, dive, haul relief equipment, and race through a flooding Philippine smart city to restore its Relay and bring the Resilience Core home.

Signal Zero is an original competitive desktop-browser party-rescue game set during a super typhoon in a near-future Philippine smart city. It combines direct third-person steering, jumping, diving, physical rescue tasks, and recoverable obstacle-course chaos with a dynamic server-authoritative flood. Water is not decorative: it changes movement, route value, infrastructure timing, and the pressure on every player.

The competition target is a short 2v2 match. The vertical slice offers a 90-second one-player PvE Flood Drill with a local top-three leaderboard and a one-player-per-team PvP duel that proves the full capture, carry, deposit, victory, and rematch loop.

## Design pillars

### 1. The city changes the fight

Routes that are efficient early can become slow or risky as water spreads. Teams should read the map, anticipate the flood, and decide whether a direct route is still worth taking. Future infrastructure tools will let players redirect or mitigate hazards rather than merely endure them.

### 2. Cooperation creates advantage

“Bayanihan” is a mechanical goal, not only a label. The competition version should reward role combinations, shared rescue infrastructure, protection of a core carrier, and coordinated timing. A single player may make a skillful play, but the strongest plans emerge from two responders supporting each other.

### 3. A short match still tells a story

A match should move through readable beats: establish a route, react to the first flood, contest public infrastructure, secure a core, and make a tense return to the beacon. The target length is 7–9 minutes, with little downtime and an obvious next objective.

### 4. Competitive clarity before spectacle

Team, health, target legality, capture state, core ownership, flood depth, and victory must remain legible at a glance. Shape, label, position, and motion reinforce color so no critical state relies only on red versus green.

### 5. Original Philippine speculative design

The smart-city setting, heroes, ability kits, map, rules, UI language, audiovisual identity, and source code must be original. The project can use genre-standard controls without copying another game’s protected expression. Disaster imagery should be handled with care: responders and communities demonstrate preparation and cooperation, while affected residents are not used as disposable scenery.

## Intended player experience

The player should feel like a capable emergency responder operating under pressure rather than a soldier on a generic battlefield. Good play includes mechanical execution, but also route planning and public-infrastructure decisions:

- “That street will flood soon; I should take the elevated route.”
- “The relay is almost secured, but chasing now leaves the carrier exposed.”
- “Rescue Line can cross this shallow-water approach before it becomes expensive.”
- “We won because we coordinated the objective return, not because one stat grew without counterplay.”

The app opens through a brief loading presentation into an original response dashboard. From Play setup, the player explicitly chooses Solo Flood Drill or Multiplayer Versus, enters a display name, and selects a responder before connecting. The camera then follows behind and above the responder. Players steer with WASD/arrow keys, orbit with mouse drag, jump with `Space`, dive with `Shift`, grab the rescue crate with a click, interact with `F`, deploy Rescue Line with `Q`, and trigger Bayanihan Pulse with `E`. Movement is expressive and physical, while the client still sends intentions and never owns authoritative outcomes.

## Match structure

### Vertical-slice match loop

1. **Choose:** From the dashboard, a player selects Solo Flood Drill or Multiplayer Versus, enters a name, and chooses Maya, Tomas, Kidlat, or Amihan.
2. **Connect:** Both modes use the fixed `signal_zero` room, with matchmaking isolated by the validated mode. Solo requires its one connected player to ready; Versus requires both connected players to ready and assigns them opposing teams.
3. **Deploy:** Each selected responder begins alive at its server-assigned team spawn near its Bayanihan Beacon.
4. **Scramble:** Players steer, jump, and dive through rotating storm barriers while the deterministic flood begins spreading from the canal.
5. **Bayanihan task:** A responder may grab the relief crate and drag it onto the Barangay Pump pressure zone, delaying flood propagation and earning solo drill score.
6. **Contest:** Responders stand in the central Weather Relay capture area. An uncontested legal presence advances server-owned capture progress; Versus adds hostile combat and contest pressure.
7. **Secure:** A completed capture spawns one prototype Resilience Core at the Relay. Only the team that earned it may interact to pick it up.
8. **Return:** The carrier chooses a route back through changing streets and hazards while, in Versus, the opponent tries to intercept. Defeat or disconnection drops the Core at the carrier’s current position, still reserved for the earning team.
9. **Activate:** Interacting with the correct team Beacon deposits the Core. In Solo, pump, Relay, Core, delivery, and remaining time contribute to the authoritative score recorded by the local leaderboard; in Versus, the first legal deposit wins.
10. **Resolve:** Connected players may request a clean rematch. Returning to the dashboard is also explicit, and a terminal reconnection failure returns there automatically.

Death creates a timed respawn at the team spawn. If the defeated/disconnected hero carried the core, the server drops it at that hero’s current position; only the earning team may recover it. Client visuals may only report the authoritative result.

### Competition-target loop

The eventual 2v2 version expands the same spine rather than replacing it:

- two players per team choose complementary responders;
- two principal lanes and a central district create multiple contest routes;
- relief convoys or utility drones create moving pressure;
- three major objectives generate Resilience Cores;
- infrastructure, equipment, and flood management change route value;
- securing and delivering the required cores activates the team’s Bayanihan Beacon and ends the 7–9-minute match.

The exact three-core cadence and comeback rules need playtesting before they become final.

## Arena

### Vertical-slice arena

The test arena is an original, compact **24 × 14 tile** grid. A tile is **64 × 64 simulation units**, producing a 1536 × 896 simulation plane. The collision/flood grid remains gameplay data; Three.js maps it onto the 3D X/Z ground plane.

It contains:

- Team A and Team B spawns on opposing sides;
- one distinct Bayanihan Beacon per team;
- walkable smart-city streets;
- impassable building/barrier footprints;
- a canal or water-source edge;
- a central Weather Relay capture area;
- at least two meaningful approaches so path cost can influence choice.

The map should be broadly symmetrical for the prototype, but 3D landmarks, silhouettes, floating objective markers, and accessible labels should keep orientation clear. Exact tile layouts belong in shared map data and tests, not only in the renderer.

### Competition-target map

The planned map grows into a symmetrical Filipino smart-city district with two principal lanes and a central civic/infrastructure zone. It must be designed from original sketches and playtest evidence. Flood behavior should create temporary asymmetry without giving one spawn a systematic advantage.

## Teams and visual language

The slice’s shared definitions call Team A **Bughaw Response** and Team B **Gintong Response**. Bughaw uses a circular marker/cool-blue palette, while Gintong uses a diamond marker/gold palette. These names and motifs are prototype identities and still require the same cultural/originality review as production content.

Team state must use at least two channels in addition to color, such as:

- distinct beacon silhouettes or emblems;
- labels and player-name plates;
- cool/warm palettes with checked contrast;
- different selection-ring patterns;
- directional spawn layout.

## Responders

The vertical slice has four selectable original prototype responders. Each selection maps to one shared, server-authoritative stat profile and one distinct procedural 3D model. Health, energy, regeneration, movement speed, and basic-attack values differ; client geometry never changes those outcomes. All four currently share Rescue Line and Bayanihan Pulse. Their final role-specific QWER kits and biographies remain competition-target design work and must not be advertised as implemented.

### Maya — Rescue Scout

Maya is the approachable balanced profile: steady durability, movement, energy, and basic combat. Rescue Line originated with Maya's mobility concept but is shared across the prototype roster.

### Tomas — Flood Engineer

Tomas has the highest durability and strongest individual basic hit, trading away movement speed and energy flexibility. A future infrastructure-focused kit remains planned rather than implied by these stats.

### Kidlat — Rapid Courier

Kidlat has the fastest movement and a large energy reserve, offset by the lowest health and lighter basic attacks. Future high-tempo utility must preserve counterplay.

### Amihan — Field Medic

Amihan combines moderate durability and movement with the deepest energy regeneration. Healing or support actions are not implemented merely because of the role label.

No prototype profile or planned role is permission to copy an existing commercial hero’s silhouette, ability sequence, names, effects, or tuning.

## Combat

The slice proves only the minimum combat vocabulary:

- server-owned health and energy;
- a data-defined movement speed, attack damage, range, and attack interval;
- forward attack-move on `X`, with server-side hostile acquisition;
- server-owned chase and path selection within sensible limits;
- invalid-target cancellation;
- authoritative damage, defeat, and timed respawn;
- event feedback for hits, damage, defeat, and respawn.

The client never decides whether an attack is in range or ready. It may show an estimated range or play an accepted hit effect after receiving authoritative state/event data.

Long-term combat should remain low enough in complexity to read during a short match. Equipment should offer a few meaningful adaptations, not an encyclopedic shop that dominates the flood-and-objective identity.

## Rescue Line

### Player-facing behavior

Rescue Line originated as Maya’s original Q ability and is currently shared by all four prototype responders:

1. Press `Q` to enter normal-cast targeting.
2. A 3D ground marker and targeting line show the intended direction, up to 360 simulation units.
3. Aim with the orbit camera/pointer and click a point to send a cast intention; `Escape` cancels.
4. If the full trace is walkable and the server accepts the cast, the selected responder surges to the selected point; blocked traces are rejected.
5. Hostile heroes crossed take the configured prototype damage (currently 30).
6. The responder ignores shallow-water movement slowdown for two seconds.
7. The cast costs 25 energy and starts a six-second cooldown.

### Why this effect

The ability validates several high-risk systems with one coherent action: normal-cast targeting, range and resource checks, line/obstacle queries, server-owned displacement, collision against enemies along a segment, damage, cooldowns, and a direct interaction with the flood. Its “reach the safe point and keep moving through water” identity suits the prototype's shared rescue-mobility vocabulary; later unique kits need their own validated rules.

It is intentionally not a copy of a famous hook, blink, or charge. It targets a point rather than importing another game’s signature target rules, and its defining payoff is safe-route traversal plus temporary flood resilience. Visuals, timing, sound, and future upgrades must reinforce Signal Zero’s rescue-infrastructure identity.

Bayanihan Pulse is bound to player-facing `E` while retaining its shared W-slot protocol identity so keyboard `W` remains forward movement. Additional abilities are clearly labelled unimplemented, but their command architecture must not change the authoritative boundary.

## Weather Relay, Resilience Cores, and Beacons

### Weather Relay

The central Weather Relay is a civic sensing/control objective. Eligible heroes inside its area advance capture only when server rules allow it. Contesting pauses or changes progress according to the configured state machine. The HUD communicates neutral, capturing, contested, captured, and awarded states with text and shape as well as color.

### Resilience Core

A Resilience Core represents recovered, reusable capacity from city infrastructure. This supports the circular-economy theme: teams recover and redeploy a system resource instead of treating the city as disposable terrain. In the slice, Relay completion creates an available core at the Relay. Only an earning-team interaction can pick it up; the server then associates it with one carrier. Defeat or disconnection drops it at the carrier’s position, and the earning-team restriction remains.

### Bayanihan Beacon

Each team protects a Bayanihan Beacon at its side of the arena. Delivering the slice’s single core to the correct beacon activates it and wins. The production game is expected to require three cores and more team coordination, but that count remains subject to playtest pacing.

## Flood system

### Design purpose

The flood creates a shared evolving problem that changes the value of routes and abilities. It should be predictable enough to make plans, dynamic enough to force adaptation, and consistent for all clients.

### Vertical-slice model

- The server owns a discrete water level for each arena tile.
- Propagation starts after the match begins and advances at fixed simulation-controlled intervals.
- Water expands from configured source tiles to legal neighbours using deterministic rules.
- Elevation/flood resistance and a maximum water level limit propagation.
- Shallow-water thresholds raise A\* traversal cost and reduce ordinary movement speed.
- Rescue Line’s accepted two-second protection ignores the slowdown, but not collision or map bounds.
- Snapshots expose only the public flood information needed to render the same important state on both clients.

This is intentionally not continuous fluid physics. The model is small, testable, and extensible: future systems can modify resistance, add pumps or barriers, clear debris, affect drainage, and connect water to powered infrastructure.

### Fairness requirements

- The same initial state and simulation inputs must yield the same flood progression.
- Team spawn routes need comparable exposure under symmetrical play.
- Flood warnings should arrive early enough to support a decision.
- A player must be able to distinguish impassable terrain, expensive water, and ordinary streets without relying on color alone.
- Water may create pressure, but should not randomly decide victory.

## Interface

The vertical-slice HUD must show:

- health and energy;
- Q icon/label, cost, readiness, and cooldown;
- player team and controlled-hero identity;
- lobby/match/victory phase;
- Weather Relay state and progress;
- Resilience Core possession;
- flood warning/state;
- connection indicator;
- concise control reminders;
- accepted/rejected command feedback where useful.

The interface targets readable 16:9 desktop layouts. Production work should add scalable text, remappable controls, independent volume controls, reduced-flash options, contrast checks, and a tutorial that teaches one concept at a time.

## Art and audio direction

The slice uses original code-drawn geometric placeholders. This is a production strategy, not a final style. Art replacement must preserve gameplay anchors such as collision footprints, selection readability, attack ranges, water depth, objective bounds, and team distinction.

The future visual direction should be developed from original Philippine smart-city and climate-resilience research with source records. Avoid tracing commercial game assets or combining unlicensed “temporary” assets that later become difficult to remove. Audio should distinguish warning, capture, ability acceptance, damage, defeat, core acquisition, deposit, and victory without overwhelming voice communication.

## Eventual scope

The competition-target feature set is:

- 2v2 online or LAN multiplayer;
- one original symmetrical map with two lanes and a central district;
- four original heroes with basic attacks and QWER abilities;
- respawning, relief convoys or utility drones, and three major objectives;
- three-core Bayanihan Beacon victory structure;
- dynamic flooding with infrastructure interaction;
- a small equipment system;
- tutorial/onboarding, minimap, scoreboard, audio, and production feedback;
- reliable 7–9-minute matches.

This is not the current milestone. Scope moves into implementation only through the roadmap and a documented decision.

## Success criteria for the slice

The slice proves its design only when manual evidence shows that two independent clients can complete a full match and both understand why state changed. Technical acceptance also requires passing install, test, lint, type-check, and build commands. The root `README.md` owns the live checklist.

Useful playtest questions include:

- Could both players tell which hero they controlled and which orders were accepted?
- Did obstacles and floodwater cause at least one meaningful route decision?
- Was Relay capture/contest state clear without explanation?
- Could the core carrier and opponent identify the win route?
- Did Rescue Line feel tied to rescue mobility and water, not like a borrowed ability?
- Did a loss feel attributable to decisions rather than hidden network state?
- Could new players describe the next objective after one match?

## Open design questions

- Should the competition version retain the slice’s earning-team-only recovery rule, or can later objectives create a fair steal/neutralization mechanic?
- How do three objectives differ enough to encourage route choices without increasing tutorial burden?
- Which flood interventions create teamwork and counterplay without making one hero mandatory?
- What equipment count supports adaptation within 7–9 minutes?
- How should reconnect grace periods affect an active objective or core carrier?
- Which final team names, visual motifs, and Filipino-language terms are appropriate and understandable after cultural review?

Record settled answers in `docs/DECISIONS.md` and update this document rather than allowing design to live only in code.
