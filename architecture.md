# Memory Bank: Project Architecture & State

## 1. System Topology & Monorepo Structure
- **Root Workspace:** `/media/deadbush225/LocalDisk/System/Coding/Projects/rstw`
- **Packages/Apps Map:**
  - `@signal-zero/server`: `apps/server`, primary entry `src/index.ts`, 20Hz ticks
  - `@signal-zero/client`: `apps/client`, Svelte 5 Runes + Phaser
  - `@signal-zero/shared`: `packages/shared`, types/schemas/constants

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
  - `WaterGridSystem` class in `apps/server/src/simulation/waterGrid.ts`
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
- `apps/server/src/simulation/waterGrid.ts`: New `WaterGridSystem` class managing phase transitions and cell-level water state
- `apps/server/src/simulation/GameSimulation.ts`: Integrated `WaterGridSystem` stepping, snapshot, and reset

### Client
- `apps/client/index.html`: Added `water-phase` and `water-timer` display elements
- `apps/client/src/ui/HudController.ts`: Added water phase and timer rendering from snapshot
- `apps/client/src/game/ArenaScene.ts`: Added `waterGridMesh` (instanced) for phase-based water visualization, `updateWaterGrid()` method