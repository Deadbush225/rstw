# Reorganization Plan: Server & Client Source Structure

## Goals
- Group simulation files by responsibility (orchestrator, gameplay systems, infrastructure)
- Group client game files by concern (scene, model, input)
- Keep test files co-located with their sources
- Minimize import path changes where possible
- Maintain all existing relative import relationships

---

## Server: `apps/server/src/`

### Current Structure
```
apps/server/src/
├── index.ts
├── network/
│   ├── commandGuard.ts
│   └── commandGuard.test.ts
├── rooms/
│   ├── SignalZeroRoom.ts
│   └── SignalZeroRoom.test.ts
└── simulation/
    ├── GameSimulation.ts + .test.ts        # Orchestrator
    ├── command-handler.ts                   # Command routing
    ├── simulation-context.ts                # Shared types/interfaces
    ├── ability-system.ts                    # Gameplay system
    ├── combat-system.ts                     # Gameplay system
    ├── movement-system.ts                   # Gameplay system
    ├── objective-system.ts                  # Gameplay system
    ├── prop-system.ts                       # Gameplay system
    ├── storm-barrier-system.ts              # Gameplay system
    ├── villager-system.ts                   # Gameplay system
    ├── flood.ts + .test.ts                  # Infrastructure
    ├── pathfinding.ts + .test.ts            # Infrastructure
    ├── partyPhysics.ts                      # Infrastructure
    └── waterGrid.ts                         # Infrastructure
```

### Proposed Structure
```
apps/server/src/
├── index.ts                                    # Entry point - NO MOVE
├── network/                                    # NO CHANGE
│   ├── commandGuard.ts
│   └── commandGuard.test.ts
├── rooms/                                      # NO CHANGE
│   ├── SignalZeroRoom.ts
│   └── SignalZeroRoom.test.ts
└── simulation/
    ├── orchestrator/                           # NEW - Simulation entry points
    │   ├── GameSimulation.ts + .test.ts
    │   ├── command-handler.ts
    │   └── simulation-context.ts
    ├── systems/                                # NEW - Gameplay behavior systems
    │   ├── ability-system.ts
    │   ├── combat-system.ts
    │   ├── movement-system.ts
    │   ├── objective-system.ts
    │   ├── prop-system.ts
    │   ├── storm-barrier-system.ts
    │   └── villager-system.ts
    └── infrastructure/                         # NEW - Deterministic utilities
        ├── flood.ts + .test.ts
        ├── pathfinding.ts + .test.ts
        ├── partyPhysics.ts
        └── waterGrid.ts
```

### Server File Moves (20 files)

| Current Path | New Path | Category |
|---|---|---|
| `simulation/GameSimulation.ts` | `simulation/orchestrator/GameSimulation.ts` | Move |
| `simulation/GameSimulation.test.ts` | `simulation/orchestrator/GameSimulation.test.ts` | Move |
| `simulation/command-handler.ts` | `simulation/orchestrator/command-handler.ts` | Move |
| `simulation/simulation-context.ts` | `simulation/orchestrator/simulation-context.ts` | Move |
| `simulation/ability-system.ts` | `simulation/systems/ability-system.ts` | Move |
| `simulation/combat-system.ts` | `simulation/systems/combat-system.ts` | Move |
| `simulation/movement-system.ts` | `simulation/systems/movement-system.ts` | Move |
| `simulation/objective-system.ts` | `simulation/systems/objective-system.ts` | Move |
| `simulation/prop-system.ts` | `simulation/systems/prop-system.ts` | Move |
| `simulation/storm-barrier-system.ts` | `simulation/systems/storm-barrier-system.ts` | Move |
| `simulation/villager-system.ts` | `simulation/systems/villager-system.ts` | Move |
| `simulation/flood.ts` | `simulation/infrastructure/flood.ts` | Move |
| `simulation/flood.test.ts` | `simulation/infrastructure/flood.test.ts` | Move |
| `simulation/pathfinding.ts` | `simulation/infrastructure/pathfinding.ts` | Move |
| `simulation/pathfinding.test.ts` | `simulation/infrastructure/pathfinding.test.ts` | Move |
| `simulation/partyPhysics.ts` | `simulation/infrastructure/partyPhysics.ts` | Move |
| `simulation/waterGrid.ts` | `simulation/infrastructure/waterGrid.ts` | Move |

### Server Import Path Updates Required

Files that import within `simulation/` need updated relative paths:

**`index.ts`** - imports from `./rooms/SignalZeroRoom.js` — no change needed.

**`rooms/SignalZeroRoom.ts`** — 2 imports to update:
- `../simulation/GameSimulation.js` → `../simulation/orchestrator/GameSimulation.js`

**`orchestrator/GameSimulation.ts`** — many internal imports to update:
- `./flood.js` → `./infrastructure/flood.js`
- `./waterGrid.js` → `./infrastructure/waterGrid.js`
- `./partyPhysics.js` → `./infrastructure/partyPhysics.js`
- `./pathfinding.js` → `./infrastructure/pathfinding.js`
- `./simulation-context.js` → already in same folder, no change
- Systems imports: `./ability-system.js` → `./systems/ability-system.js` (etc.)

**`orchestrator/simulation-context.ts`**:
- `./flood.js` → `./infrastructure/flood.js`
- `./waterGrid.js` → `./infrastructure/waterGrid.js`

**`orchestrator/command-handler.ts`**:
- `./simulation-context.js` — same folder, no change
- `./ability-system.js` → `../systems/ability-system.js`
- `./combat-system.js` → `../systems/combat-system.js`
- `./movement-system.js` → `../systems/movement-system.js`
- `./objective-system.js` → `../systems/objective-system.js`
- `./prop-system.js` → `../systems/prop-system.js`

**Each file in `systems/`**:
- `./pathfinding.js` → `../infrastructure/pathfinding.js`
- `./partyPhysics.js` → `../infrastructure/partyPhysics.js`
- `./simulation-context.js` → `../orchestrator/simulation-context.js`

**`infrastructure/flood.test.ts`**:
- `./flood.js` — same folder, no change

**`infrastructure/pathfinding.test.ts`**:
- `./pathfinding.js` — same folder, no change

---

## Client: `apps/client/src/`

### Current Structure
```
apps/client/src/
├── main.ts
├── config.ts
├── styles.css
├── audio/
│   └── AudioDirector.ts
├── game/
│   ├── ArenaScene.ts              # Phaser scene
│   ├── CharacterModel.ts + .test.ts  # 3D model
│   ├── CommandGateway.ts          # Input bridge
│   ├── createGame.ts              # Bootstrap factory
│   └── inputMath.ts + .test.ts    # Input utilities
├── network/
│   └── GameClient.ts
├── state/
│   └── GameStore.ts
└── ui/
    ├── DashboardController.ts
    └── HudController.ts
```

### Proposed Structure
```
apps/client/src/
├── main.ts                                    # Entry point - NO MOVE
├── config.ts                                  # Config - NO MOVE
├── styles.css                                 # Styles - NO MOVE
├── audio/                                      # NO CHANGE
│   └── AudioDirector.ts
├── game/
│   ├── scene/                                # NEW - Phaser rendering
│   │   └── ArenaScene.ts
│   ├── model/                                # NEW - 3D character models
│   │   ├── CharacterModel.ts
│   │   └── CharacterModel.test.ts
│   ├── input/                                # NEW - Input handling
│   │   ├── CommandGateway.ts
│   │   ├── inputMath.ts
│   │   └── inputMath.test.ts
│   └── createGame.ts                         # Bootstrap - stays at game/ level
├── network/                                    # NO CHANGE
│   └── GameClient.ts
├── state/                                      # NO CHANGE
│   └── GameStore.ts
└── ui/                                         # NO CHANGE
    ├── DashboardController.ts
    └── HudController.ts
```

### Client File Moves (5 files)

| Current Path | New Path | Category |
|---|---|---|
| `game/ArenaScene.ts` | `game/scene/ArenaScene.ts` | Move |
| `game/CharacterModel.ts` | `game/model/CharacterModel.ts` | Move |
| `game/CharacterModel.test.ts` | `game/model/CharacterModel.test.ts` | Move |
| `game/CommandGateway.ts` | `game/input/CommandGateway.ts` | Move |
| `game/inputMath.ts` | `game/input/inputMath.ts` | Move |
| `game/inputMath.test.ts` | `game/input/inputMath.test.ts` | Move |

### Client Import Path Updates Required

**`main.ts`**:
- `./game/createGame` — no change (stays at same level)
- All other imports from top-level folders — no change

**`game/createGame.ts`**:
- `./ArenaScene` → `./scene/ArenaScene`
- `./CommandGateway` → `./input/CommandGateway`

**`game/scene/ArenaScene.ts`**:
- `../state/GameStore` — no change
- `./CharacterModel` → `../model/CharacterModel`
- `./CommandGateway` → `../input/CommandGateway`
- `./inputMath` → `../input/inputMath`

**`game/model/CharacterModel.test.ts`**:
- `./CharacterModel` — same folder, no change

**`game/input/inputMath.test.ts`**:
- `./inputMath` — same folder, no change

**`ui/HudController.ts`**:
- `../game/CommandGateway` → `../game/input/CommandGateway`

**`network/GameClient.ts`**:
- `../game/CommandGateway` → `../game/input/CommandGateway`

---

## Execution Order

1. **Create new subdirectories** (no file content changes yet)
2. **Move server simulation files** to new subdirectories
3. **Update server import paths** in all affected files
4. **Move client game files** to new subdirectories
5. **Update client import paths** in all affected files
6. **Run validation**: `npm run typecheck && npm run lint && npm run test`
7. **Update architecture.md** with new structure

## Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Broken relative imports | Medium | All import paths mapped above before moving |
| Test file co-location broken | Low | Tests move with their sources |
| Vite/TS config breaks | Low | No root-level path changes |
| Git history lost | Low | Use `git mv` for renames |
