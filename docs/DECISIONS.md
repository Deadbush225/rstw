# Architecture and Design Decisions

## How decisions are recorded

This is a lightweight decision log for choices that constrain future work. “Accepted for the vertical slice” does not mean runtime-verified. If evidence overturns a choice, keep the old entry, mark it superseded, and add a new decision with the reason.

Each entry considers alternatives so future contributors understand why the repository looks this way instead of “simplifying” across an important boundary.

## D-001 — Cross-platform TypeScript npm-workspace monorepo

- **Date:** 2026-07-16
- **Status:** Accepted and locally verified for the vertical slice

### Context

The same project must be maintainable by a beginner developer on macOS and a teammate on Windows. Client and server share protocol data, but must remain separate runtime applications.

### Decision

Use strict TypeScript throughout an npm-workspace monorepo:

- `apps/client`
- `apps/server`
- `packages/shared`

Commit `package-lock.json`, pin a Node version in `.nvmrc`, and expose routine commands at the repository root.

### Alternatives considered

- **Separate repositories:** clearer deployment boundary, but shared contracts drift easily and cross-platform setup becomes harder.
- **JavaScript without strict TypeScript:** faster initial typing, but network-contract and refactor errors become runtime failures.
- **A larger monorepo orchestrator:** useful at organization scale, but unnecessary abstraction for three workspaces.

### Consequences

Important cross-runtime types and constants have one home. Workspace build/type-check ordering needs correct configuration. Developers must run installs from the root and respect case-sensitive portable paths.

## D-002 — Phaser 3 and Vite, without React

- **Date:** 2026-07-16
- **Status:** Accepted

### Context

The game needs a top-down canvas, input, camera, scene lifecycle, geometry, and a lightweight HUD. A second UI framework would create another lifecycle and state model.

### Decision

Use Phaser 3 for game rendering/input and normal HTML/CSS only where it materially improves lobby/HUD accessibility. Use Vite for development and production client builds. Do not add React unless a later UI requirement has a documented benefit that outweighs integration cost.

### Alternatives considered

- **React plus a Phaser canvas:** strong application UI ecosystem, but duplicates state/lifecycle complexity for this narrow interface.
- **Custom Canvas/WebGL engine:** maximum control, but spends competition time rebuilding solved engine facilities.
- **DOM-only rendering:** unsuitable for the intended camera, entities, effects, and world interaction.

### Consequences

Phaser scenes remain presentation layers, not authoritative game worlds. HUD code must be kept modular so scene classes do not become god objects.

## D-003 — Node.js, Colyseus 0.17, and WebSockets

- **Date:** 2026-07-16
- **Status:** Accepted for the vertical slice

### Context

The game needs low-latency two-way communication, room membership, LAN development, and a future path to persistent hosted matches.

### Decision

Use a Node.js authoritative process with Colyseus 0.17 rooms over WebSockets. The room name is `signal_zero`; the local server listens on `0.0.0.0:2567`.

### Alternatives considered

- **HTTP polling:** simple infrastructure, but poor fit for frequent bidirectional match updates.
- **Peer-to-peer authority:** avoids a dedicated server, but creates host advantage, trust, NAT, and consistency problems.
- **Firebase/database-driven real-time state:** convenient persistence, but the wrong timing/authority model for deterministic combat and movement.
- **Custom raw WebSocket room layer:** flexible, but duplicates room/session lifecycle work without helping the game rules.

### Consequences

Deployment requires a process that supports persistent WebSockets. Live match state can stay in memory. Colyseus transport convenience does not remove the need to validate every payload and bind control to the sending session.

## D-004 — Server-authoritative intention protocol

- **Date:** 2026-07-16
- **Status:** Accepted; non-negotiable security boundary

### Context

Competitive outcomes cannot depend on a browser that a player controls.

### Decision

Clients may send `MOVE`, `ATTACK_TARGET`, `ATTACK_MOVE`, `CAST_ABILITY`, `INTERACT`, `STOP`, and `HOLD_POSITION` intentions with sequence and target data. The server alone determines paths, positions, damage, cooldowns, objective progress, resources, flood, respawn, and victory.

### Alternatives considered

- **Client-authoritative position/combat:** visually responsive and easy to prototype, but trivial to cheat and prone to disagreement.
- **Lockstep simulation in every browser:** bandwidth-efficient for deterministic RTS games, but browser timing, hidden information, late joins, and cheating make it unsuitable for this student slice.
- **Hybrid client damage with server correction:** creates two outcome sources and hard-to-explain failures.

### Consequences

Input may be previewed immediately, but rejection/correction is normal. Validators and acknowledgement feedback are core gameplay work, not optional backend polish. Client-only effects must never masquerade as accepted outcomes.

## D-005 — 20 Hz simulation and 10 Hz snapshots

- **Date:** 2026-07-16
- **Status:** Accepted for the vertical slice; profiling pending

### Context

The tiny MOBA needs responsive enough authoritative movement without wasting CPU/network traffic or tying rules to render frame rate.

### Decision

Run the server at a fixed **20 Hz** (50 ms steps) and send public snapshots at **10 Hz** (every second simulation tick). Render more frequently and interpolate on clients.

### Alternatives considered

- **60 Hz server/snapshots:** lower temporal granularity but unnecessary load for two heroes and browser/LAN testing.
- **10 Hz simulation:** simpler and cheaper, but coarse for movement, attacks, and a line ability.
- **Variable delta simulation:** follows wall-clock jitter and makes deterministic tests/timing harder.

### Consequences

Server timing uses ticks/fixed steps. Clients need smoothing and visible rejection feedback. The rates must be revisited with measurements at 2v2/content scale, not changed from intuition alone.

## D-006 — Explicit compact public snapshots

- **Date:** 2026-07-16
- **Status:** Accepted for the slice; scalability provisional

### Context

Only two heroes, one objective/core, two beacons, and a 336-cell flood grid are public. A beginner team benefits from an inspectable state projection and straightforward recovery from a missed transient event.

### Decision

Send an explicit `snapshot` message at 10 Hz, supplemented by `event`, `command-result`, `welcome`, and `notice` messages. Build the snapshot from private server state rather than serializing the entire room object.

### Alternatives considered

- **Send the entire world every render frame:** easiest conceptual mirror, but wasteful and leaks private/internal state.
- **Hand-authored deltas immediately:** smaller packets, but more ordering/recovery complexity before profiling shows a need.
- **Rely only on transient events:** low bandwidth, but clients cannot recover reliably from missed/late events.
- **Expose all internal state through automatic schema sync:** convenient, but risks coupling presentation to private simulation shape.

### Consequences

Snapshot types become a deliberate public API. Full compact snapshots are easy to debug but need size profiling before four players, drones, equipment, and richer infrastructure are added.

## D-007 — Shared compile-time contracts plus runtime validation

- **Date:** 2026-07-16
- **Status:** Accepted

### Context

TypeScript types disappear at runtime, while WebSocket payloads are untrusted JavaScript values.

### Decision

Keep discriminated command/snapshot types, constants, and validation-safe schemas/helpers in `packages/shared`. Parse at the server boundary, then pass only validated values into simulation systems. Bind identity from the Colyseus session, not the payload.

### Alternatives considered

- **Type assertions/casts at handlers:** compact, but provide no runtime safety.
- **Duplicate validators in each app:** creates drift and contradictory error behavior.
- **A heavy enterprise schema/service layer:** powerful, but adds more concepts than this protocol needs.

### Consequences

Protocol changes require coordinated shared, server, client, and test updates. Validators need malicious cases, not only happy-path examples.

## D-008 — A 24 × 14, 64-pixel authoritative grid and original A\*

- **Date:** 2026-07-16
- **Status:** Accepted for the slice

### Context

The slice must prove obstacle-aware point-and-click movement and flood-influenced routing in a small original arena.

### Decision

Represent collision and flood gameplay on a **24 × 14** grid with **64-pixel** tiles. Use a project-written, understandable grid A\* with deterministic tie-breaking and flood-aware traversal costs. Keep the grid in game data, separate from Phaser shapes.

### Alternatives considered

- **Straight-line steering:** simpler, but cannot validate buildings or meaningful route choice.
- **Third-party pathfinding/tutorial copy:** quick, but weakens originality, understanding, and control over flood costs.
- **Navigation mesh:** better for organic geometry, but unnecessary for the small tile/zone flood model.
- **Continuous local avoidance:** useful with crowds, but beyond the two-hero risk being tested.

### Consequences

Map resolution constrains obstacle shape and route granularity. Dynamic flood cost and movement slowdown must remain distinct. Any diagonal movement policy must prevent corner cutting and update tests/heuristics.

## D-009 — Deterministic discrete flood with A\* cost and speed effects

- **Date:** 2026-07-16
- **Status:** Accepted for the slice

### Context

Flooding is the game’s defining mechanic, but realistic fluid simulation would be expensive, difficult to synchronize, and hard to reason about competitively.

### Decision

The server advances integer/discrete tile water levels from configured sources at fixed intervals. Each update reads the old grid and writes a separate next grid using fixed neighbour order, elevation/resistance, and a maximum level. Relevant levels increase A\* cost and reduce normal movement speed.

### Alternatives considered

- **Continuous fluid physics:** visually rich, but scope-heavy, difficult to balance, and unnecessary for route decisions.
- **Client-only animated water:** cheap presentation, but creates no shared tactical state.
- **Random flood zones:** easy variety, but poor predictability and testability.
- **Path cost only or slowdown only:** each proves only half the intended route-versus-traversal tradeoff.

### Consequences

The model is stylized and must be communicated honestly. It is deterministic enough for unit tests and can later accept pumps, barriers, drains, debris, and powered-infrastructure modifiers.

## D-010 — Two players and one-core victory before 2v2

- **Date:** 2026-07-16
- **Status:** Accepted scope cut

### Context

The competition vision is 2v2 with multiple heroes and three major objectives. Implementing all content before proving networking, flood, and a full victory loop would compound risk.

### Decision

The first slice has two players total, one temporary hero definition, one Weather Relay, one Resilience Core, and one delivered-core victory. W/E/R and equipment are visible foundations only.

### Alternatives considered

- **Build 2v2 and four complete heroes immediately:** demonstrates more content, but multiplies balance, UI, network, and simultaneous-rule failures.
- **Movement sandbox without victory:** narrower, but does not prove the most important cross-system loop.
- **Single-player prototype:** useful for mechanics, but fails to prove authority and state consistency.

### Consequences

The slice is intentionally not representative of final content volume or team cooperation. The next gate hardens two-player play before expanding to four clients.

## D-011 — Rescue Line as the first server-authoritative ability

- **Date:** 2026-07-16
- **Status:** Accepted for the slice; balance provisional

### Context

One ability must prove normal-cast UX and meaningful server validation while expressing the responder/flood identity.

### Decision

Rescue Line is a point cast up to 360 pixels. After validation, Maya surges to the selected legal point along a clear walkable line, deals the configured prototype damage (currently 30) to hostile heroes crossed, and receives two seconds of flood-slow immunity. A trace crossing an obstruction is rejected. It costs 25 energy and has a six-second cooldown.

### Alternatives considered

- **Simple point damage:** validates range/cooldown, but not collision, movement, or the defining flood system.
- **Targeted hook/pull:** risks resembling an established signature ability and introduces forced-enemy displacement complexity.
- **Free blink:** proves displacement but ignores obstacles and offers weaker counter-reading.
- **Pure flood immunity buff:** thematic but does not validate normal point targeting or line queries.

### Consequences

One cast tests targeting, line tracing, safe displacement, segment/enemy queries, damage, resources, cooldowns, feedback, and a flood modifier. All outcomes remain server-owned. Numbers require playtesting and are shared data, not literals scattered through code.

## D-012 — Room-memory match state, no database

- **Date:** 2026-07-16
- **Status:** Accepted for the slice

### Context

The vertical slice needs ephemeral 7–9-minute-style matches and local/LAN development, not accounts or persistent progression.

### Decision

Keep the authoritative live world in the Colyseus room process. Reset or dispose it at rematch/room end. Do not add a database or Firebase for real-time simulation state.

### Alternatives considered

- **Database write-through for positions/state:** persistent, but too slow/complex and does not replace an authoritative simulation.
- **Event sourcing from the first slice:** potentially useful for replays/auditing, but premature infrastructure.
- **Client persistence:** violates authority and cannot coordinate a room.

### Consequences

A process crash loses the current match, which is acceptable for local prototype scope. Future accounts, rankings, match history, or durable recovery are separate systems and must not become the tick-loop source of truth.

## D-013 — Physical-key MOBA controls and scoped context-menu suppression

- **Date:** 2026-07-16
- **Status:** Accepted

### Context

macOS and Windows players need consistent point-and-click controls across keyboard layouts, while normal browser behavior should remain available outside the game.

### Decision

Use right-click contextual orders, QWER, A/S/H/F, Space, Escape, Tab, and future 1–4 slots. Use `KeyboardEvent.code` or Phaser’s physical-key equivalent. Suppress the context menu only over the canvas. Movement does not use WASD.

### Alternatives considered

- **WASD movement:** familiar in action games, but conflicts with the intended order/path control language and ability keys.
- **Character-based key values:** can change with layout and make teammate controls inconsistent.
- **Disable context menu for the whole page:** prevents normal browser use unnecessarily.

### Consequences

Input handling needs a clear targeting-state machine and UI focus rules. Quick cast and release cast can be added later without changing the server command boundary.

## D-014 — Original geometric placeholders before production assets

- **Date:** 2026-07-16
- **Status:** Accepted

### Context

The risky systems are multiplayer, objectives, and flooding. Unverified “temporary” third-party art creates license/originality risk and makes iteration expensive.

### Decision

Draw the first arena, heroes, structures, water, markers, and HUD with original code-driven geometric presentation and system fonts. Keep rendering separate so licensed/original production assets can replace it later.

### Alternatives considered

- **Use commercial-game screenshots/icons as placeholders:** fast, but unacceptable copyright and presentation risk.
- **Download free asset packs immediately:** possibly legal, but licenses/provenance need review and styles may constrain the original identity.
- **Commission final art before the loop:** high rework risk while collision and readability are changing.

### Consequences

The slice will look intentionally provisional. Every later asset needs provenance, license, modification, and human-review records before inclusion.

## D-015 — Page-host-derived LAN Colyseus endpoint

- **Date:** 2026-07-16
- **Status:** Accepted for development

### Context

One developer uses macOS and one uses Windows. A LAN client loading the host’s Vite page must not attempt `localhost`, which would mean the teammate’s own machine.

### Decision

Serve the client on port 5174 and server on port 2567, both accessible on the host’s network interfaces. Unless `VITE_SERVER_URL` overrides it, derive an HTTP(S) Colyseus endpoint from the page hostname and security; the SDK upgrades that endpoint to WS(S). Vite reads the repository-root `.env` via `envDir`, while the server entrypoint automatically loads it with Node’s built-in `loadEnvFile` when present. The server prefers `SERVER_HOST`/`SERVER_PORT` and supports `HOST`/`PORT` fallbacks.

### Alternatives considered

- **Hard-code `http://localhost:2567`:** works only on the host computer.
- **Require a different `.env` for every teammate:** functional but error-prone for the default LAN case.
- **Use a paid relay/service for development:** unnecessary and introduces credentials/external availability.

### Consequences

LAN setup normally needs only the host IP and private-network firewall permission for ports 5174/2567. The example leaves its client override commented so page-host derivation works by default; any explicit override must use `http://HOST_IP:2567`. Public deployment still requires HTTPS/WSS, correct origins, and a persistent host. `VITE_*` values are public.

## D-016 — Focused systems and tests instead of a general ECS

- **Date:** 2026-07-16
- **Status:** Accepted for the slice

### Context

The project needs composable game logic but has very few entity kinds. A beginner team must be able to trace an input to an outcome.

### Decision

Use focused simulation modules/pure helpers for movement, A\*, combat, abilities, objectives, flood, and snapshot projection, coordinated by the room/world. Keep data definitions separate from behavior. Do not adopt a general ECS until measured content complexity justifies it.

### Alternatives considered

- **All logic in one room class:** initially direct, but becomes untestable and tightly coupled.
- **Full ECS framework now:** scalable entity composition, but adds indirection and lifecycle concepts before the entity count warrants them.
- **Microservices per system:** operationally inappropriate for a single real-time match.

### Consequences

Module boundaries need discipline and narrow interfaces. If later hero/content composition becomes painful, ECS can be reconsidered with concrete migration criteria rather than fashion.

## D-017 — Capture spawns a team-restricted, droppable core

- **Date:** 2026-07-16
- **Status:** Accepted for the vertical slice

### Context

Relay capture needs to lead into a visible, contestable return journey. Placing the core directly in a capturer’s inventory would skip contextual interaction, while letting the opposing team immediately steal the only slice objective could create confusing reversals before broader comeback rules are designed.

### Decision

Completing the Weather Relay spawns an available Resilience Core at the Relay. Only the team that earned it may pick it up through a valid server-authoritative interaction. A carrier’s defeat or disconnection drops the core at that authoritative position, and it remains restricted to the earning team. An earning-team carrier wins only by interacting with that team’s own Beacon.

### Alternatives considered

- **Award directly to the capturing player:** fewer steps, but does not prove core-world interaction and hides the transition from objective to carry phase.
- **Make the core neutral/stealable immediately:** creates stronger contest, but needs recovery, reset, and snowball rules beyond the first slice.
- **Reset to the Relay on carrier defeat:** simple, but removes positional consequence from an interception.
- **Transfer to the defeating player:** dramatic, but can violate team/earning logic and needs additional ownership rules.

### Consequences

The server owns core world position, earning team, availability, carrier, drop, and deposit. Snapshots/HUD must distinguish locked, available, carried, and deposited states. Tests cover ineligible pickup, eligible pickup, exact drop position, disconnect, repeated interaction, wrong Beacon, victory, and rematch reset. The competition version may later reconsider steal/neutralization only through a new documented decision.

## D-018 — Three.js third-person presentation over the existing authoritative simulation

- **Date:** 2026-07-16
- **Status:** Accepted; supersedes D-002 and D-013 for client presentation/input

### Context

Playtesting showed that the fixed top-down prototype felt distant and its right-click control language was not immediately understandable to a new player. The competition accepts browser games and scores intuitive gameplay, spectator clarity, creativity, theme, and polish. The flood, objective, scoring, PvP, and authority rules remain valuable and should not be rewritten merely because the camera changes.

### Decision

Render the district and responders in Three.js as an original low-poly 3D world. Use a behind-the-character orbit camera, WASD/arrow movement, mouse-drag camera control, `F` interaction, directional Rescue Line on `Q`, and Bayanihan Pulse on `E`. Map the existing authoritative X/Y simulation plane onto Three.js X/Z coordinates; snapshots, paths, flood propagation, capture, score, cooldowns, Core ownership, and victory stay server-owned.

Use _Flotsam_ only as a broad reference for a colorful improvised flooded-world mood and Roblox only as a broad reference for familiar third-person readability. Do not reproduce either title's characters, assets, proportions, interface, map, or protected visual expression. Characters and world props remain original procedural geometry until approved team-made assets replace them.

### Alternatives considered

- **Rebuild the project in Roblox Studio:** offers built-in avatars and third-person controls, but would discard the verified TypeScript/Colyseus authority layer and introduce a materially different platform workflow.
- **Keep the top-down Phaser client:** lower implementation risk, but preserves the onboarding and emotional-distance issues observed in the first playtest.
- **Move authority into the 3D client:** visually direct, but violates competitive fairness and makes PvP outcomes forgeable.

### Consequences

Continuous-feeling input is represented as rate-limited, short server movement intentions. The client derives facing and animation cosmetically from snapshot motion. Camera collision and production character rigs remain follow-up polish; neither may change authoritative collision. UI copy, controls, architecture diagrams, disclosure, tests, and trailer material must reflect the 3D build.

## D-019 — Electron desktop shell with an embedded local authoritative server

- **Date:** 2026-07-16
- **Status:** Accepted for the competition prototype

### Context

The project needs a native app experience on macOS and Windows without duplicating the implemented Three.js renderer or moving authoritative gameplay into a client-only build.

### Decision

Package the existing renderer in Electron. A packaged app starts the existing Node/Colyseus server as a child process bound to `127.0.0.1:2567`, then loads the built renderer from disk. The preload bridge exposes only that fixed local endpoint; renderer Node integration remains disabled and context isolation remains enabled. The same server contracts, tick cadence, validation, objective rules, and tests apply to browser and desktop play.

Use ZIP builds while the prototype is under active competition development. Produce and validate the Windows archive on Windows and the macOS archive on macOS. Signing, notarization, installers, update delivery, and account/persistence features are separate release gates.

### Alternatives considered

- **Rebuild in Unreal Engine:** a valid future production option, but would replace rather than package the verified game/client/server stack and is disproportionate for this competition slice.
- **Tauri with a rewritten Rust server:** smaller runtime but requires a second authoritative server implementation or a sidecar strategy before it can be trusted.
- **A browser-only delivery:** quickest to distribute, but does not meet the team’s native-app presentation goal.

### Consequences

The desktop app can run the solo Flood Drill without a separate server terminal. Its embedded server is loopback-only, so cross-device multiplayer still needs the existing LAN/browser host flow or a future hosted-service configuration. All native artifacts are generated and must not be committed. Desktop packaging introduces platform-specific QA and signing work that the team must complete before public release.

## Decisions still required

These questions are intentionally open and should receive new entries when evidence is available:

- What simultaneous-event ordering applies to lethal damage versus a beacon deposit?
- What reconnect grace and abandoned-match policy is fair?
- Which three competition objectives create different decisions?
- Which flood/infrastructure interventions enter the first 2v2 content pass?
- When do snapshot deltas or interest management become justified by measured size?
- Which production host and operational controls satisfy competition/demo needs?
- Which final assets, fonts, sounds, and AI-assisted outputs pass human licensing/originality review?
