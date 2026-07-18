# Phase 0: Codebase Refactoring Plan

## Objective

Split `GameSimulation.ts` (1709 lines) and `ArenaScene.ts` (2165 lines) into focused, decoupled modules. This reduces token overhead for future GDD edits, prevents cross-concern editing conflicts, and aligns with the AGENTS.md rule: "Keep the slice understandable. Prefer small pure functions and focused systems over a god room class."

---

## Server Refactoring: `apps/server/src/simulation/`

### Current Structure

```
apps/server/src/simulation/
├── flood.ts            # FloodSystem (already extracted)
├── waterGrid.ts        # WaterGridSystem (already extracted)
├── pathfinding.ts      # A* + line-of-sight (already extracted)
├── partyPhysics.ts     # Circle collision helpers (already extracted)
└── GameSimulation.ts   # 1709-line monolith ← TARGET
```

### Proposed Structure

```
apps/server/src/simulation/
├── flood.ts
├── waterGrid.ts
├── pathfinding.ts
├── partyPhysics.ts
├── GameSimulation.ts        # ~250 lines — orchestration only
├── command-handler.ts       # ~180 lines — validate + route commands
├── movement-system.ts       # ~220 lines — steering, paths, jump, dive, boats
├── combat-system.ts         # ~160 lines — attack, damage, respawn
├── ability-system.ts        # ~120 lines — Q/W casts, cooldowns, energy
├── objective-system.ts      # ~200 lines — relay, core, beacon, pump
├── villager-system.ts       # ~140 lines — spawn, wander, panic, evacuate
├── prop-system.ts           # ~80 lines  — crate grab/release tracking
└── storm-barrier-system.ts  # ~60 lines — rotation + collision knockback
```

### Module Contracts

#### `GameSimulation.ts` (Orchestrator)

**Responsibility:** Match lifecycle, tick loop, player roster, snapshot serialization. Delegates all gameplay behavior to subsystems.

```ts
// Exports: GameSimulation class
// Owns: #players Map, #events, #phase, #tick, #now, snapshot data (#relay, #core, #pump, etc.)
// Imports from: command-handler, movement-system, combat-system, ability-system,
//               objective-system, villager-system, prop-system, storm-barrier-system

// Key methods retained:
// - constructor(), get now/phase/playerCount
// - addPlayer(), removePlayer(), setConnected(), setReady(), voteRematch()
// - applyCommand() → delegates to CommandHandler
// - step(deltaMs) → orchestrates subsystem steps
// - getSnapshot() → serializes all subsystem state
// - drainEvents()
// - Private: #tryStartCountdown, #startMatch, #prepareRoundState, #updateFlood, #updateWaterGrid
```

**Delegation pattern in `step()`:**
```ts
step(deltaMs): void {
  // ... phase/countdown logic retained here ...
  this.#commandBuffer.flush();           // drain queued commands
  this.#objectiveSystem.step(this, deltaMs);
  this.#villagerSystem.step(this, deltaMs);
  for (const player of this.#players.values()) {
    this.#combatSystem.updateRespawn(this, player);
    this.#movementSystem.step(this, player, deltaMs);
  }
  this.#stormBarrierSystem.resolveCollisions(this);
  this.#propSystem.syncGrabbedProps(this);
}
```

#### `command-handler.ts`

**Responsibility:** Route and pre-validate incoming `PlayerCommand` payloads. Each command type maps to one subsystem method.

```ts
// Exports: class CommandHandler
// Methods: handle(command, simulation) → SimulationCommandResult
// Internal routing:
//   MOVE / ATTACK_MOVE → movementSystem.moveCommand()
//   ATTACK_TARGET → combatSystem.attackTarget()
//   CAST_ABILITY → abilitySystem.cast()
//   INTERACT → objectiveSystem.interact() + propSystem.interact()
//   STOP / HOLD_POSITION → movementSystem.stopPlayer()
//   STEER → movementSystem.steer()
//   JUMP → movementSystem.jump()
//   DIVE → movementSystem.dive()
//   GRAB → propSystem.toggleGrab()
```

#### `movement-system.ts`

**Responsibility:** All player motion — steering, path following, jumping, diving, boat driving, stamina penalties.

```ts
// Exports: class MovementSystem
// Methods:
// - step(simulation, player, deltaMs)
// - moveCommand(player, destination, mode) → SimulationCommandResult
// - steer(player, direction) → SimulationCommandResult
// - jump(player) → SimulationCommandResult
// - dive(player, direction) → SimulationCommandResult
// - stopPlayer(player, mode)
// Private:
// - #moveDirect(), #moveAlongPath(), #updateControlledMotion()
// - #updateVerticalMotion()
// - #mountBoat(), #dismountBoat(), #findNearestBoat(), #moveBoat()
```

#### `combat-system.ts`

**Responsibility:** Attack targeting, chase AI, damage application, defeat/respawn.

```ts
// Exports: class CombatSystem
// Methods:
// - attackTarget(player, targetId) → SimulationCommandResult
// - updateRespawn(simulation, player)
// Private:
// - #updatePlayerAction(), #updateHoldingAttack(), #updateAttackTarget()
// - #performBasicAttack(), #dealDamage()
// - #isValidCombatTarget(), #nearestEnemy(), #finishCurrentAttack()
// - #dropCore() — core drops when carrier dies
```

#### `ability-system.ts`

**Responsibility:** QWER ability casting, cooldown tracking, energy costs.

```ts
// Exports: class AbilitySystem
// Methods:
// - cast(player, slot, targetPoint) → SimulationCommandResult
// Private:
// - #castRescueLine(), #castBayanihanPulse()
```

#### `objective-system.ts`

**Responsibility:** Relay capture, Core pickup/drop/deposit, Beacon interaction, Pump activation.

```ts
// Exports: class ObjectiveSystem
// Methods:
// - step(simulation, deltaMs) — relay capture tick
// - interact(player, targetId) → SimulationCommandResult
// Private:
// - #updateRelayCapture(), #depositCore(), #activatePumpFromCrate(), #activatePumpFromGenerator()
```

#### `villager-system.ts`

**Responsibility:** Villager lifecycle — spawn, wander, panic pathfinding, deluge stranding, pickup/evacuation.

```ts
// Exports: class VillagerSystem
// Owns: #villagers array (moved from GameSimulation)
// Methods:
// - step(simulation, deltaMs)
// - spawn() — called from #prepareRoundState
// Private:
// - #updateVillagers(), #updateVillagerWander(), #updateVillagerPanic(), #updateVillagerDeluge()
// - #checkVillagerPickup(), #checkVillagerEvacuation()
```

#### `prop-system.ts`

**Responsibility:** Rescue crate grab/release, follow-position tracking.

```ts
// Exports: class PropSystem
// Methods:
// - toggleGrab(player, targetId) → SimulationCommandResult
// - syncGrabbedProps(simulation) — update crate position to follow carrier
// Private:
// - #releaseProp(), #updateGrabbedCrate()
```

#### `storm-barrier-system.ts`

**Responsibility:** Storm barrier rotation computation and player collision knockback.

```ts
// Exports: class StormBarrierSystem
// Methods:
// - computeBarriers(elapsedMs) → PublicStormBarrierState[]
// - resolveCollisions(simulation)
```

### Subsystem Dependency Pattern

Every subsystem receives a `GameSimulation` reference (or a focused interface) to access:
- `now`, `phase`, `#players`, `#flood`, `#waterGrid`
- Event pushing via `#events.push()`
- Shared constants from `@signal-zero/shared`

To avoid circular dependencies, subsystems import types from shared and receive simulation state as method parameters rather than importing the `GameSimulation` class directly. A lightweight `SimulationContext` interface captures the needed members:

```ts
export interface SimulationContext {
  readonly now: number;
  readonly phase: PublicMatchState['phase'];
  getPlayer(playerId: PlayerId): RuntimePlayer | undefined;
  hasPlayer(playerId: PlayerId): boolean;
  players(): Iterable<RuntimePlayer>;
  pushEvent(event: GameEvent): void;
  readonly flood: FloodSystem;
  readonly waterGrid: WaterGridSystem;
  addDrillScore(points: number): void;
}
```

`GameSimulation` implements `SimulationContext`. Subsystems depend only on the interface.

---

## Client Refactoring: `apps/client/src/game/`

### Current Structure

```
apps/client/src/game/
├── ArenaScene.ts        # 2165-line monolith ← TARGET
├── CharacterModel.ts    # Character rig (already extracted)
├── CommandGateway.ts    # Network commands (already extracted)
├── createGame.ts        # Scene factory
└── inputMath.ts         # Camera-relative direction math
```

### Proposed Structure

```
apps/client/src/game/
├── ArenaScene.ts            # ~200 lines — Three.js orchestration only
├── CharacterModel.ts
├── CommandGateway.ts
├── createGame.ts
├── inputMath.ts
├── world-builder.ts         # ~350 lines — scene geometry, lighting, objects
├── player-visuals.ts        # ~200 lines — sync player models to snapshot
├── objective-visuals.ts     # ~180 lines — relay, core, pump, beacons
├── environment-visuals.ts   # ~150 lines — flood, water grid, villagers, rain
├── input-handler.ts         # ~250 lines — keyboard, pointer, wheel → commands
├── camera-controller.ts     # ~120 lines — orbit, follow, collision, shake
├── targeting-ui.ts          # ~100 lines — ability target marker/line
├── effect-player.ts         # ~80 lines  — pulse effects, rescue line draw
└── prompt-ui.ts             # ~60 lines  — interaction/grab/release prompts
```

### Module Contracts

#### `ArenaScene.ts` (Orchestrator)

**Responsibility:** Three.js scene lifecycle, render loop, delegating to subsystems.

```ts
// Exports: class ArenaScene
// Owns: THREE.Scene, Camera, Renderer, Timer
// Subsystem instances: WorldBuilder, PlayerVisuals, ObjectiveVisuals,
//                      EnvironmentVisuals, InputHandler, CameraController,
//                      TargetingUI, EffectPlayer, PromptUI
// Key methods retained:
// - constructor(container, store, commands, ui)
// - setCameraSensitivity(), beginAbilityTargeting(), resumeFromMenu(), resetForSession()
// - playEvent(event) → delegates to effectPlayer.playEvent()
// - destroy()
// Private:
// - animate() — render loop calling subsystem updates
// - updateSnapshot(deltaSeconds) — delegate sync calls
```

#### `world-builder.ts`

**Responsibility:** Create all static scene geometry — district tiles, buildings, relay, core, pump, beacons, interactive objects, border, banderitas.

```ts
// Exports: function buildWorld(scene: THREE.Scene) → WorldBuilderResult
// Returns: { cameraObstacles: THREE.Mesh[], relayRoot, coreRoot, pumpRoot,
//            pumpMaterial, beaconRoots, beaconMaterials, beaconBeams,
//            interactiveObjectViews }
// Pure creation — no per-frame updates
```

#### `player-visuals.ts`

**Responsibility:** Create/update/dispose player character models based on snapshot state.

```ts
// Exports: class PlayerVisualManager
// Owns: Map<string, PlayerVisual>
// Methods:
// - sync(players, deltaSeconds, serverTime, playerId)
// - disposeAll()
// Private:
// - #createPlayerView(), #replacePlayerModel(), #removePlayerView()
```

#### `objective-visuals.ts`

**Responsibility:** Update relay, core, pump, beacon visuals from snapshot.

```ts
// Exports: class ObjectiveVisualManager
// Methods:
// - sync(snapshot, cameraObstacles, relayRoot, coreRoot, pumpRoot, pumpMaterial,
//        beaconRoots, beaconMaterials, beaconBeams, team)
// - syncInteractiveObjects(objects, interactiveObjectViews)
```

#### `environment-visuals.ts`

**Responsibility:** Flood instanced mesh, water grid instanced mesh, villager instanced mesh, rain particles.

```ts
// Exports: class EnvironmentVisualManager
// Owns: floodMesh, waterGridMesh, villagerMesh, rain
// Methods:
// - updateFlood(levels)
// - updateWaterGrid(cells)
// - updateVillagers(villagers)
// - setRainVisible(visible)
// - updateAtmosphere(deltaSeconds) — core rotation, relay ring, beacon rotation, etc.
```

#### `input-handler.ts`

**Responsibility:** Keyboard and pointer events → CommandGateway calls. Ability targeting state machine.

```ts
// Exports: class InputHandler
// Owns: keysHeld Set, bound event handlers
// Methods:
// - bind(canvas, window)
// - unbind()
// - updateMovement(now, commands, cameraYaw, localMenuOpen, targetMode)
// - currentMovementDirection(cameraYaw)
// - handleKeyDown(event, commands, ui, onAbilityTarget, onInteract, onAttackMove, onDive)
// - handlePointerDown(event, commands, onAbilityCast)
// - handlePointerUp(event, onWorldClick)
// - reset()
```

#### `camera-controller.ts`

**Responsibility:** Third-person orbit camera, target following, building collision, screen shake.

```ts
// Exports: class CameraController
// Owns: cameraTarget, yaw, pitch, distance, sensitivity, shakeUntil
// Methods:
// - update(camera, cameraTarget, obstacles, deltaSeconds, now, localView)
// - setSensitivity(value)
// - onPointerDrag(deltaX, deltaY)
// - onWheel(deltaY)
// - resetPosition()
```

#### `targeting-ui.ts`

**Responsibility:** Ability target marker ring and line visualization.

```ts
// Exports: class TargetingUI
// Owns: targetMarker, targetLine, targetMode state
// Methods:
// - begin(slot)
// - cancel(message?)
// - update(scene, raycaster, groundPlane, pointerNdc, camera, localPlayer)
// - dispose()
```

#### `effect-player.ts`

**Responsibility:** Timed pulse effects and rescue line visualization from GameEvents.

```ts
// Exports: class EffectPlayer
// Owns: effects array
// Methods:
// - play(scene, event)
// - update(now) — advance + dispose expired effects
// Private:
// - #pulseAt(position, color, maximumScale)
// - #drawRescueLine(from, to)
```

#### `prompt-ui.ts`

**Responsibility:** F-to-interact, grab crate, release crate HUD prompts attached to camera.

```ts
// Exports: class PromptUI
// Owns: interactionPrompt, grabPrompt, releasePrompt sprites
// Methods:
// - update(snapshot, localPlayer, camera)
// - attachToCamera(camera)
```

---

## Network Contract Preservation

**Critical:** No refactoring changes the `PublicSnapshot`, `PlayerCommand`, `GameEvent`, or any shared type. The serialization shape in `getSnapshot()` remains identical. Subsystems that contribute to the snapshot each export a `toPublic()` method returning their slice:

```ts
// Example:
interface VillagerSnapshotSlice {
  villagers: { id: string; x: number; y: number; status: VillagerStatus; homeX: number; homeY: number; elevation: number }[];
}
```

`GameSimulation.getSnapshot()` assembles the final `PublicSnapshot` by combining slices from each subsystem.

---

## GDD Phase Mapping

This table shows which extracted sub-modules will be modified during subsequent GDD implementation phases:

| GDD Feature | Server Module(s) to Modify | Client Module(s) to Modify |
|---|---|---|
| 2v2 team expansion | `command-handler.ts`, `objective-system.ts` | `player-visuals.ts`, `prompt-ui.ts` |
| New hero ability kits | `ability-system.ts` | `targeting-ui.ts`, `effect-player.ts` |
| Equipment system | `prop-system.ts` (new item types) | `world-builder.ts`, `objective-visuals.ts` |
| Relief convoys / drones | New `convoy-system.ts` | New `convoy-visuals.ts` |
| Minimap | No server change | New `minimap.ts` |
| Audio feedback | No server change | `effect-player.ts` (audio hooks) |
| Tutorial overlays | No server change | New `tutorial-ui.ts` |
| Scoreboard expansion | `objective-system.ts` (score tracking) | `prompt-ui.ts`, HUD controllers |
| Flood intervention tools | `objective-system.ts`, `waterGrid.ts` | `environment-visuals.ts`, `world-builder.ts` |
| Three-core victory | `objective-system.ts` (multi-core tracking) | `objective-visuals.ts` |

---

## Execution Order

### Step 1: Create `SimulationContext` interface in shared or server simulation folder

Define the interface that decouples subsystems from the `GameSimulation` class. This is a pure type addition with zero behavioral change.

### Step 2: Extract server subsystems (bottom-up)

Extract in dependency order — leaf modules first:
1. `storm-barrier-system.ts` — simplest, no internal dependencies
2. `prop-system.ts` — depends only on context + shared types
3. `ability-system.ts` — depends on context + shared ability data
4. `combat-system.ts` — depends on context + pathfinding
5. `villager-system.ts` — depends on context + pathfinding
6. `movement-system.ts` — depends on context + flood + waterGrid + pathfinding
7. `objective-system.ts` — depends on context + flood + waterGrid
8. `command-handler.ts` — depends on all above subsystems

### Step 3: Refactor `GameSimulation.ts`

Replace inline methods with subsystem delegations. Add `SimulationContext` implementation. Verify `getSnapshot()` assembles from subsystem slices.

### Step 4: Extract client modules

1. `effect-player.ts` — simplest visual effects
2. `prompt-ui.ts` — HUD prompt sprites
3. `targeting-ui.ts` — ability targeting visuals
4. `camera-controller.ts` — camera orbit/follow
5. `input-handler.ts` — keyboard/pointer → commands
6. `environment-visuals.ts` — flood/water/villager/rain meshes
7. `objective-visuals.ts` — relay/core/pump/beacon updates
8. `player-visuals.ts` — player model sync
9. `world-builder.ts` — static geometry creation

### Step 5: Refactor `ArenaScene.ts`

Replace inline methods with subsystem delegations. Verify render loop delegates correctly.

### Step 6: Verification

Run full check suite:
```sh
npm run test
npm run lint
npm run typecheck
npm run build
npm run dev  # manual two-client test
```

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Circular imports between subsystems | `SimulationContext` interface breaks the cycle; subsystems receive context, not the class |
| Snapshot shape drift | Every subsystem exports a typed slice; `getSnapshot()` assembles via spread — TypeScript enforces alignment |
| Performance regression from delegation | Method calls are inlined by TS compiler; no virtual dispatch overhead. Profile after refactoring |
| Test breakage | Existing `GameSimulation.test.ts` tests the public API which remains unchanged. Add unit tests per subsystem |
| Token overhead during transition | Extract one subsystem per commit; verify build between each extraction |

---

## File Size Targets

| File | Before | After (target) |
|---|---|---|
| `GameSimulation.ts` | ~1709 lines | ~250 lines |
| `ArenaScene.ts` | ~2165 lines | ~200 lines |
| New server files (8) | — | ~1,160 lines total |
| New client files (8) | — | ~1,490 lines total |

Total lines remain approximately the same; the difference is distribution across focused modules that can be edited independently.
