# Development Roadmap

## How to use this roadmap

Milestones are gated by evidence, not optimism. A feature is complete only when its code, automated checks, and relevant manual flow have been run and recorded. Milestones 0 and 1 passed the local macOS command suite and complete two-browser flow on 2026-07-16; the cross-device Mac/Windows LAN pass remains part of stabilization.

Status labels:

- **In implementation:** source exists or is actively being assembled, but exit evidence is incomplete.
- **Implemented and locally verified:** command suite and relevant local runtime flow passed; broader platform/playtest evidence may remain.
- **Planned:** scope is agreed at a high level but should not be treated as implemented.
- **Exploration:** design or feasibility still needs a deliberate decision.

Do not begin a broad content pass while an earlier networking or match-loop gate is failing.

## Milestone 0 — Foundation

**Status:** Implemented and locally verified; cross-platform checkout confirmation remains.

**Goal:** Establish one maintainable, cross-platform repository and one authoritative protocol before producing gameplay content.

### Deliverables

- npm-workspace TypeScript monorepo with `apps/client`, `apps/server`, and `packages/shared`;
- pinned dependency graph in `package-lock.json` and a shared Node version in `.nvmrc`;
- Three.js/Vite third-person client and Node.js/Colyseus 0.17 server;
- strict TypeScript, ESLint, Prettier, and Vitest configuration;
- root `dev`, `test`, `lint`, `typecheck`, and `build` commands;
- localhost and LAN-safe development configuration with no paid dependency;
- shared commands, IDs, teams, match phases, constants, definitions, public snapshot types, and runtime-safe validators;
- documentation, environment example, ignore rules, and no committed secrets.

### Exit gate

- `npm install`, tests, lint, type-check, and build all pass on a clean checkout;
- `npm run dev` starts both processes on macOS and Windows-compatible commands;
- a client can join `signal_zero`, receive a welcome/team, and show connection state;
- malformed bootstrap/join/message data fails safely;
- setup instructions are followed once by someone other than the original implementer.

## Milestone 1 — First playable vertical slice

**Status:** Implemented and locally verified; enter stabilization before adding content.

**Goal:** Prove one complete, server-authoritative match from lobby through rematch with two players.

### Deliverables

#### Lobby and room

- two clients join with player names and are assigned opposing teams;
- both ready before match start;
- connection, rejection, and disconnect feedback is visible;
- ended match can reset cleanly through rematch readiness.

#### Arena and movement

- original 24 × 14 arena at 64 pixels per tile;
- spawns, beacons, streets, barriers, canal/flood source, and Weather Relay;
- WASD/arrow third-person movement expressed as server-authoritative bounded destinations;
- grid A\* obstacle avoidance and flood-weighted costs;
- smooth snapshot interpolation, character facing/animation, objective markers, and orbit camera;

#### Combat and ability

- one temporary Maya-oriented hero definition with health, energy, movement, attack, defeat, and respawn;
- enemy-model click targeting and `X` attack-move with server-owned chase/range/interval/damage;
- Rescue Line Q normal cast: safe 360-pixel surge, crossed-enemy damage, flood-slow immunity, 25 energy, six-second cooldown;
- Bayanihan Pulse on `E`; additional ability architecture remains visibly reserved.

#### Objective and flood

- authoritative Weather Relay capture/contest/progress;
- one team-restricted Resilience Core spawned at the captured Relay, picked up by interaction, and dropped at the carrier’s position on defeat/disconnect;
- legal own-team beacon deposit creates victory;
- deterministic flood propagation visible to both clients;
- flood changes path cost and ordinary movement speed.

#### Interface and quality

- health/energy, ability cooldown, team, match state, objective, core, flood warning, connection, and controls in a readable 16:9 HUD;
- team/state communication does not rely only on red and green;
- security-sensitive and deterministic automated tests;
- manual two-window capture → carry → deposit → victory → rematch test.

### Exit gate

Every vertical-slice acceptance criterion in `README.md` is checked with dated evidence. In particular, each browser controls only its own hero; invalid commands are rejected; obstacles/flood affect authoritative movement; both clients agree on important state; the complete loop works twice without restarting the dev processes; all root checks pass; and known limitations are updated honestly.

## Milestone 2 — Two-player alpha stabilization

**Status:** Planned.

**This is the exact recommended next milestone after the vertical slice passes.** Do not add four heroes yet. First make the two-player foundation reliable enough to survive repeated external playtests.

### Goals

- eliminate high-severity defects discovered by the vertical-slice test matrix;
- measure behavior under realistic LAN latency, jitter, brief packet loss, and lower frame rates;
- improve interpolation/correction without weakening server authority;
- soak-test and tune the implemented 20-second reconnect grace policy under packet loss and process restarts;
- harden payload size/rate/sequence limits and sanitize player-facing text;
- profile simulation time, snapshot size, browser frame time, and memory over repeated rematches;
- add an onboarding pass for movement, Q targeting/cancel, Relay capture, core return, flood warnings, and rematch;
- validate Chrome and Edge on both macOS and Windows;
- conduct at least one beginner-observed playtest and one adversarial command test.

### Exit gate

- ten consecutive two-client matches complete without stale state or process restart;
- disconnect/reconnect or disconnect/fail-safe behavior matches the documented policy;
- latency tests have recorded thresholds and no client outcome authority;
- critical UI is understandable without a developer explaining the objective;
- no open severity-1 blocker and all checks/builds pass on both development computers.

## Milestone 3 — 2v2 systems alpha

**Status:** Planned.

**Goal:** Expand the proven systems to four human players without expanding content beyond what the architecture can support.

### Deliverables

- four-player room with two players per team and deterministic balanced assignment;
- team spawn spacing, allied selection/indicators, friendly/hostile target rules, and scoreboard;
- 2v2-safe objective occupancy, contest, core carrier, defeat, and disconnect rules;
- bandwidth/snapshot profiling at the new entity count;
- camera/minimap foundation appropriate to the larger target map;
- clear ally communication/ping exploration;
- repeated four-device or four-browser LAN tests.

### Exit gate

- four clients complete ten matches with consistent authority and no cross-player control;
- simultaneous combat/objective cases have tests and explicit ordering;
- snapshot and server tick budgets remain comfortably below measured limits;
- team identity remains accessible without color alone.

## Milestone 4 — Content and systems pass

**Status:** Planned, with individual features still subject to design approval.

**Goal:** Turn the stable 2v2 rules into the distinctive competition game.

### Deliverables

- original production-scale symmetrical smart-city map with two lanes and central district;
- finalized original Maya, Tomas, Kidlat, and Amihan designs with QWER kits;
- three meaningfully different major objectives and three-core victory pacing;
- relief convoys or utility drones;
- small equipment system focused on adaptation rather than inventory complexity;
- pumps, drainage, barriers, debris, and/or electricity interactions chosen through prototypes;
- final core-on-defeat and comeback rules;
- minimap commands, scoreboard, complete tutorial, and stronger match feedback;
- original/licensed art, animation, audio, and UI asset pipeline with provenance records.

### Exit gate

- every hero has counterplay, automated rule tests, and a readable silhouette/effect language;
- median match time in representative playtests is 7–9 minutes;
- flood and infrastructure decisions materially change routes without randomly deciding winners;
- no objective/hero is mandatory across the playtest sample;
- all external assets and libraries have reviewed license/disclosure records.

## Milestone 5 — Competition polish

**Status:** Planned.

**Goal:** Improve reliability, clarity, accessibility, balance, and presentation without destabilizing the game.

### Deliverables

- structured balance/playtest process and frozen competition rules;
- finalized onboarding, settings, key help, audio mix, VFX, animation, camera, and screen transitions;
- color-vision/contrast checks, scalable text, reduced-flash consideration, and clear non-color state cues;
- production hosting over HTTPS/WSS with health checks, origin/rate controls, logs, and a rollback plan;
- Chrome/Edge compatibility matrix and a Safari best-effort pass;
- load, soak, reconnect, failure-recovery, and deployment rehearsals;
- legal/originality review, dependency notices, AI/asset disclosure, and competition-rule checklist;
- playtest-driven bug triage with a release blocker policy.

### Exit gate

- a tagged release candidate passes automated, four-client, browser, network, and deployment checks;
- no known crash, authority violation, progress blocker, or unlicensed asset;
- competition materials accurately describe what the build does;
- a clean fallback build and deployment procedure are available.

## Milestone 6 — Trailer and live-demo preparation

**Status:** Planned.

**Goal:** Present the real game clearly and rehearse failure-safe demonstration conditions.

### Deliverables

- concise trailer storyboard: setting → flood changes route → Relay contest → teamwork/core return → Beacon activation;
- captured footage from the actual release candidate, with no mocked gameplay represented as live;
- original/licensed music, sound, fonts, logos, footage, and credits;
- stable demo script for local two-machine LAN and hosted fallback;
- clean test accounts/names if applicable and a reset procedure;
- offline/local fallback plan that still uses the authoritative local server;
- presenter checklist, hardware/network rehearsal, and backup recording;
- final README, architecture summary, known limitations, disclosure log, and source archive.

### Exit gate

- the demo is rehearsed end-to-end on the actual Mac/Windows hardware;
- the team can recover from a disconnected client, occupied port, or unavailable internet using documented steps;
- every trailer claim can be demonstrated in the submitted build;
- all credits and disclosures have human sign-off.

## Cross-milestone quality gates

These requirements never become optional:

- the client sends intentions and the server decides outcomes;
- shared contracts remain the only cross-app source of important types/constants;
- `strict` TypeScript stays enabled and untrusted payloads receive runtime validation;
- deterministic/security-sensitive logic has automated tests;
- game-specific rules and content remain original;
- external code/assets have recorded purpose and license;
- macOS and Windows use the same repository and root commands;
- no completion claim is made without the corresponding command/manual evidence;
- known limitations and AI/asset disclosure stay current.

## Scope guardrails

Until Milestone 2 exits, avoid spending core engineering time on:

- accounts, rankings, monetization, databases, or large backend services;
- a large item shop or progression meta;
- dozens of heroes, skins, maps, or modes;
- realistic fluid dynamics;
- mobile/touch controls;
- elaborate production art that hides an unproven loop.

These are not necessarily bad future ideas; they do not retire the current technical risks.

## Risk register

| Risk                                          | Earliest proof     | Mitigation                                                                                |
| --------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| Client/server disagreement feels unresponsive | Vertical slice     | 20 Hz authority, 10 Hz snapshots, interpolation, clear rejection/correction feedback      |
| Flood produces unfair or inconsistent routes  | Vertical slice     | deterministic double-buffer rules, symmetric tests, flood-weighted A\*, playtest warnings |
| Four players exceed assumptions               | 2v2 alpha          | audit team loops and objective ordering, profile snapshots/ticks before content growth    |
| Beginner team cannot maintain systems         | Every milestone    | small modules, shared definitions, decision log, beginner guide, focused tests            |
| Scope prevents competition polish             | Every gate         | prove one loop first; gate content; retain 7–9-minute target                              |
| Originality/license problem appears late      | Every asset change | code-drawn placeholders, provenance log, human legal/competition review                   |
| LAN works only on one machine                 | Foundation/slice   | bind to all interfaces, derive page-host WebSocket URL, Mac/Windows test matrix           |

## Evidence log template

When a milestone exits, add a dated entry here or link a QA report:

```text
Date:
Commit/tag:
Node/npm versions:
macOS/Windows/browser versions:
Automated commands and results:
Manual client topology:
Completed match loops:
Network conditions tested:
Open limitations:
Human reviewer:
```
