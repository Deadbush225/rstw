import type { GameEvent, PublicMatchState, PlayerId, StormBarrierId, Vector2 } from '@signal-zero/shared';
import type { FloodSystem } from './flood.js';
import type { WaterGridSystem } from './waterGrid.js';

/**
 * Focused interface that subsystems depend on instead of the full GameSimulation class.
 * This breaks circular dependencies while giving each system only what it needs.
 */
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

/** Must be re-exported so subsystems can reference the runtime player shape. */
export interface RuntimePlayerState {
  id: PlayerId;
  alive: boolean;
  connected: boolean;
  team: 'A' | 'B';
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  heroId: string;
  commandMode: string;
  destination: Vector2 | null;
  attackTargetId: PlayerId | null;
  elevation: number;
  grounded: boolean;
  stumbleUntil: number;
  floodImmuneUntil: number;
  diveCooldownEndsAt: number;
  qCooldownEndsAt: number;
  wCooldownEndsAt: number;
  facing: Vector2;
  boatId: string | null;
  grabbedObjectId: string | null;
  hasCore: boolean;
  heldItem: 'NONE' | 'SANDBAG' | 'GENERATOR';
  carryingVillagers: number;
  respawnAt: number | null;
  stamina: number;
  maxStamina: number;
}

export interface RuntimePlayer {
  state: RuntimePlayerState;
  path: Vector2[];
  nextAttackAt: number;
  nextChasePathAt: number;
  attackLeashOrigin: Vector2 | null;
  attackMoveDestination: Vector2 | null;
  steerDirection: Vector2;
  verticalVelocity: number;
  diveDirection: Vector2;
  diveEndsAt: number;
  hazardHitCooldowns: Map<StormBarrierId, number>;
}

export interface SimulationCommandResult {
  accepted: boolean;
  reason?: string;
}
