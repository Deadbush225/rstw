# Memory Bank: Project Architecture & State

## 1. System Topology & Monorepo Structure
- **Root Workspace:** `/media/deadbush225/LocalDisk/System/Coding/Projects/rstw`
- **Packages/Apps Map:**
  - `@signal-zero/server`: `apps/server`, primary entry `src/index.ts`, 20Hz ticks
  - `@signal-zero/client`: `apps/client`, Phaser 3 rendering + Three.js scene
  - `@signal-zero/shared`: `packages/shared`, types/schemas/constants

### Server Source Layout (`apps/server/src/`)
```
src/
├── index.ts                          # Colyseus server bootstrap
├── network/                          # Connection security
│   ├── commandGuard.ts
│   └── commandGuard.test.ts
├── rooms/                            # Colyseus room definitions
│   ├── SignalZeroRoom.ts
│   └── SignalZeroRoom.test.ts
└── simulation/
    ├── orchestrator/                 # Simulation entry point + command routing
    │   ├── GameSimulation.ts         # Main fixed-step loop (20 Hz)
    │   ├── GameSimulation.test.ts
    │   ├── command-handler.ts        # Routes commands to subsystems
    │   └── simulation-context.ts     # Shared types/interfaces for subsystems
    ├── systems/                      # Gameplay behavior systems
    │   ├── ability-system.ts         # QWER abilities (Rescue Line, etc.)
    │   ├── combat-system.ts          # Attack targeting, chase, damage, respawn
    │   ├── movement-system.ts        # WASD steering, path following, boats
    │   ├── objective-system.ts       # Relay capture, core delivery, victory
    │   ├── prop-system.ts            # Crate grab/release
    │   ├── storm-barrier-system.ts   # Rotating hazard knockback
    │   └── villager-system.ts        # NPC wander/rescue scoring
    └── infrastructure/               # Deterministic utilities (no gameplay logic)
        ├── flood.ts + .test.ts       # Flood propagation system
        ├── pathfinding.ts + .test.ts # A* pathfinding
        ├── partyPhysics.ts           # Circle collision resolution
        └── waterGrid.ts              # Phase-based water level grid
```

### Client Source Layout (`apps/client/src/`)
```
src/
├── main.ts                           # App bootstrap (store → client → game → HUD)
├── config.ts                         # Client constants + server URL resolution
├── styles.css                        # All UI styling
├── audio/                            # Sound management
│   └── AudioDirector.ts
├── game/                             # Phaser/Three.js rendering
│   ├── createGame.ts                 # Factory: creates ArenaScene + runtime wrapper
│   ├── scene/                        # 3D arena rendering
│   │   └── ArenaScene.ts             # Three.js scene, camera, water grid mesh
│   ├── model/                        # Character 3D models
│   │   ├── CharacterModel.ts
│   │   └── CharacterModel.test.ts
│   └── input/                        # Input handling
│       ├── CommandGateway.ts         # Bridges user input → network commands
│       ├── inputMath.ts              # Camera-relative direction math
│       └── inputMath.test.ts
├── network/                          # Colyseus client
│   └── GameClient.ts                 # Socket connection, message routing
├── state/                            # Client-side state store
│   └── GameStore.ts                  # Ingests snapshots, provides estimated state
└── ui/                               # HTML/CSS HUD (no Phaser)
    ├── DashboardController.ts        # Lobby, hero select, preferences
    └── HudController.ts              # In-game HUD, event feed, toasts
```

## 2. Server-Authoritative State Schemas (Colyseus)
- **Room State:**
  - `phase`: 'waiting' | 'countdown' | 'active' | 'ended'
  - `waterPhase`: 'PREP_CALM' | 'SWELL' | 'DELUGE'
  - `timerRemaining`: number (ms, counts down from 480s)
  - `elapsedMs`: number (match duration)
  - `floodStarted`: boolean
  - `winnerTeam`: 'A' | 'B' | null
  - `waterGrid`: WaterCell[] (1D array length ARENA_COLS * ARENA_ROWS)
    - `waterLevel`: 0-3
    - `isBlocked`: boolean
- **Player State:** 
  - `health/maxHealth`: number
  - `x/y`: Vector2 position
  - `energy/maxEnergy`: number
  - `qCooldownEndsAt`: number (timestamp)
  - `commandMode`: 'idle' | 'moving' | 'attacking' etc.
- **Flood State:**
  - `levels`: number[] (grid, 0-2 via FloodSystem)
  - `started`: boolean
  - `stepInterval`: 3200ms
- **Water Grid System:**
  - `WaterGridSystem` class in `apps/server/src/simulation/infrastructure/waterGrid.ts`
  - Phase-based timer independent of match timer
  - `getWaterLevelAtPosition(x, y)`: number (0-3)
  - `getCell(col, row)`: WaterCell | undefined
- **Interactive Objects:** 
  - Relay: `captureProgress`: 0-1, `ownerTeam`: string
  - Core: `carrierId`: string | null
  - Crate: `grabbedBy`: string | null

## 3. Core Technical Mechanics Loops
### Solo Flood Drill Loop
1. **Trigger:** All players ready → 90s timer starts
2. **Crate Logic:** Deliver to pump for +400pts, delays flood by 8s
3. **Relay Phase:** Capture for 3s to spawn team-locked core
4. **Beacon Deposit:** Core delivery → score = 1000 + remaining time/100

### Multiplayer Versus Loop
1. **Matchmaking:** 2 players required, team assignment
2. **Relay Contention:** Multiple players reset capture progress
3. **Core Rules:** Drops on death/disconnect
4. **Win Condition:** Core delivery to team beacon

## 4. Water Grid Phases & Timers
1. **PREP_CALM (480s-450s remaining):** Grid level 0 (dry). Timer counts down from 480s.
2. **SWELL (450s-360s remaining):** Drain tiles at (11,0), (12,0), (11,13), (12,13) increment to level 1.
3. **DELUGE (360s-0s remaining):** Unblocked cells progress through levels 1, 2, 3 based on timer:
   - 0-50% of DELUGE phase: level 1
   - 50-85% of DELUGE phase: level 2
   - 85-100% of DELUGE phase: level 3
- **Constants:** `WATER_PHASE_TOTAL_SECONDS = 480`, `PREP_CALM_END_SECONDS = 450`, `SWELL_END_SECONDS = 360`, `WATER_GRID_MAX_LEVEL = 3`
- **Helper:** `getWaterPhase(timerRemainingSeconds): WaterPhase`

## 5. Network Message Payloads
- **Client→Server:** 
  - `COMMAND`: {type, sequence, direction/target}
  - `READY`: {ready: boolean}
- **Server→Client (10Hz):** 
  - `SNAPSHOT`: Full game state including `waterGrid: WaterCell[]`, `match.waterPhase`, `match.timerRemaining`
  - `EVENT`: Discrete gameplay events

## 6. New/Modified Files (Phase 1)
### Shared
- `packages/shared/src/types.ts`: Added `WaterPhase`, `WaterCell` types; `waterPhase`, `timerRemaining` to `PublicMatchState`; `waterGrid` to `PublicSnapshot`
- `packages/shared/src/constants.ts`: Added `WATER_PHASE_TOTAL_SECONDS`, `PREP_CALM_END_SECONDS`, `SWELL_END_SECONDS`, `WATER_GRID_MAX_LEVEL`, `getWaterPhase()`
- `packages/shared/src/validation.ts`: Updated `matchStateSchema` and `publicSnapshotSchema` with new fields
- `packages/shared/src/validation.test.ts`: Updated `validSnapshot()` with new fields

### Server
- `apps/server/src/simulation/infrastructure/waterGrid.ts`: New `WaterGridSystem` class managing phase transitions and cell-level water state
- `apps/server/src/simulation/orchestrator/GameSimulation.ts`: Integrated `WaterGridSystem` stepping, snapshot, and reset

### Client
- `apps/client/index.html`: Added `water-phase` and `water-timer` display elements
- `apps/client/src/ui/HudController.ts`: Added water phase and timer rendering from snapshot
- `apps/client/src/game/scene/ArenaScene.ts`: Added `waterGridMesh` (instanced) for phase-based water visualization, `updateWaterGrid()` method

## 7. New/Modified Files (Phase 4 — Movement Penalties & Rescue Boats)
### Shared
- `packages/shared/src/types.ts`: Added `stamina`, `maxStamina`, `boatId` to `PublicPlayerState`; added `BoatState` interface; added `boats: BoatState[]` to `PublicSnapshot`
- `packages/shared/src/constants.ts`: Added `MAX_STAMINA`, `STAMINA_DRAIN_RATE`, `DEEP_WATER_SPEED_CAP`, `BOAT_SPEED`, `BOAT_MAX_PASSENGERS`
- `packages/shared/src/map.ts`: Added `EVAC_CENTER` export (same as `RELAY_POSITION`)

### Server
- `apps/server/src/simulation/orchestrator/GameSimulation.ts`:
  - Added `BoatRuntime` interface and `#boats` array
  - Added `boatId` to `RuntimePlayer`
  - `#updateControlledMotion()`: Boat driving replaces steering/steering-mode; deep-water penalty caps speed at 30% and drains stamina; stamina=0 triggers evac respawn at EVAC_CENTER
  - `#interact()`: Boat mount/dismount via INTERACT (no explicit target required)
  - `#prepareRoundState()`: Spawns 2 boats at EVAC_CENTER, resets stamina/maxStamina
  - `#updateRespawn()`: Resets stamina, dismounts from boat
  - `#dealDamage()`: Dismounts defeated player from boat
  - Added `#mountBoat()`, `#dismountBoat()`, `#findNearestBoat()`, `#moveBoat()` methods
  - `getSnapshot()`: Includes `boats: BoatState[]`

### Client
- `apps/client/index.html`: Added `stamina-meter` (bar + label) and `boat-row` (status) UI elements
- `apps/client/src/styles.css`: Added `.stamina-meter`, `.stamina-meter .meter-fill`, `.boat-row` styles
- `apps/client/src/ui/HudController.ts`: Stamina bar visible when stamina < maxStamina; boat status shows role (Driving/Passenger) and capacity
- `apps/client/src/game/scene/ArenaScene.ts`: `updateCamera()` lowers camera height offset when player is driving a boat

## 8. Movement Penalty & Boat Mechanics
### Deep-Water Stamina Penalty
- When `waterLevel >= 2` (deep water) and player is not flood-immune:
  - Movement speed capped at 30% (`DEEP_WATER_SPEED_CAP`)
  - Stamina drains at 10/s (`STAMINA_DRAIN_RATE`)
  - Stamina == 0 → drop held item, drop core, respawn at EVAC_CENTER, lose 10 HP
- Stamina resets to `MAX_STAMINA` (100) on respawn and round start
- Boats ignore water grid speed penalties entirely

### Rescue Boats
- 2 boats spawn at EVAC_CENTER (arena centre) each round
- Mount: press F (INTERACT) near a boat with no explicit target → becomes driver or passenger
- Dismount: press F while already on a boat
- Driver uses WASD steering; boat speed = `BOAT_SPEED * (1 - (passengers / 3) * 0.5)`
  - 0 passengers: 100% speed (220 px/s)
  - 3 passengers: 50% speed (110 px/s)
- Boat collision radius = `PLAYER_COLLISION_RADIUS * 2`
- Death/disconnect/respawn dismounts the player from the boat