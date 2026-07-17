export type EntityId = string;
export type PlayerId = string;
export type TeamId = 'A' | 'B';
export type HeroId = 'maya' | 'tomas' | 'kidlat' | 'amihan';
export type AbilitySlot = 'Q' | 'W' | 'E' | 'R';
export type CastPreference = 'normal' | 'quick' | 'quick-release';
export type MatchPhase = 'waiting' | 'countdown' | 'active' | 'ended';
export type WaterPhase = 'PREP_CALM' | 'SWELL' | 'DELUGE';
export type MatchMode = 'flood-drill' | 'versus';
export type MatchOutcome = 'success' | 'time-expired' | null;
export type ObjectiveState = 'neutral' | 'contested' | 'capturing' | 'captured';
export type PropId = 'rescue-crate';
export type StormBarrierId = 'storm-barrier:north' | 'storm-barrier:south';
export type HeldItem = 'NONE' | 'SANDBAG' | 'GENERATOR';
export type VillagerStatus = 'WANDERING' | 'PANIC' | 'STRANDED';

export interface Vector2 {
  x: number;
  y: number;
}

export interface TeamDefinition {
  id: TeamId;
  name: string;
  color: number;
  cssColor: string;
  marker: 'circle' | 'diamond';
}

export interface AbilityDefinition {
  slot: AbilitySlot;
  name: string;
  description: string;
  castType: 'point' | 'target' | 'self';
  range: number;
  cooldownMs: number;
  energyCost: number;
  implemented: boolean;
}

export interface HeroDefinition {
  id: HeroId;
  name: string;
  role: string;
  description: string;
  maxHealth: number;
  maxEnergy: number;
  energyRegenerationPerSecond: number;
  movementSpeed: number;
  attackDamage: number;
  attackRange: number;
  attackIntervalMs: number;
  acquisitionRange: number;
}

export interface JoinOptions {
  name: string;
  mode: MatchMode;
  heroId: HeroId;
}

export interface MoveCommand {
  type: 'MOVE';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  destination: Vector2;
}

export interface AttackTargetCommand {
  type: 'ATTACK_TARGET';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  targetId: EntityId;
}

export interface AttackMoveCommand {
  type: 'ATTACK_MOVE';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  destination: Vector2;
}

export interface CastAbilityCommand {
  type: 'CAST_ABILITY';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  slot: AbilitySlot;
  targetPoint?: Vector2;
  targetEntityId?: EntityId;
}

export interface InteractCommand {
  type: 'INTERACT';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  targetId?: EntityId;
}

export interface StopCommand {
  type: 'STOP';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
}

export interface HoldPositionCommand {
  type: 'HOLD_POSITION';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
}

export interface SteerCommand {
  type: 'STEER';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  direction: Vector2;
}

export interface JumpCommand {
  type: 'JUMP';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
}

export interface DiveCommand {
  type: 'DIVE';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  direction: Vector2;
}

export interface GrabCommand {
  type: 'GRAB';
  playerId: PlayerId;
  sequence: number;
  clientTimestamp: number;
  targetId?: EntityId;
}

export type PlayerCommand =
  | MoveCommand
  | AttackTargetCommand
  | AttackMoveCommand
  | CastAbilityCommand
  | InteractCommand
  | StopCommand
  | HoldPositionCommand
  | SteerCommand
  | JumpCommand
  | DiveCommand
  | GrabCommand;

export interface PublicPlayerState {
  id: PlayerId;
  name: string;
  heroId: HeroId;
  team: TeamId;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  alive: boolean;
  connected: boolean;
  ready: boolean;
  respawnAt: number | null;
  attackTargetId: EntityId | null;
  destination: Vector2 | null;
  hasCore: boolean;
  qCooldownEndsAt: number;
  wCooldownEndsAt: number;
  floodImmuneUntil: number;
  elevation: number;
  grounded: boolean;
  stumbleUntil: number;
  diveCooldownEndsAt: number;
  grabbedObjectId: EntityId | null;
  heldItem: HeldItem;
  carryingVillagers: number;
  facing: Vector2;
  commandMode:
    | 'idle'
    | 'moving'
    | 'attacking'
    | 'attack-moving'
    | 'holding'
    | 'steering'
    | 'diving';
}

export interface PublicRelayState {
  id: 'weather-relay';
  x: number;
  y: number;
  state: ObjectiveState;
  ownerTeam: TeamId | null;
  captureTeam: TeamId | null;
  captureProgress: number;
}

export interface PublicCoreState {
  id: 'resilience-core';
  status: 'locked' | 'available' | 'carried' | 'deposited';
  x: number;
  y: number;
  carrierId: PlayerId | null;
  earnedByTeam: TeamId | null;
}

export interface PublicBeaconState {
  id: `beacon:${TeamId}`;
  team: TeamId;
  x: number;
  y: number;
}

export interface PublicPumpState {
  id: 'barangay-pump';
  x: number;
  y: number;
  state: 'offline' | 'active';
  activatedByTeam: TeamId | null;
}

export interface VillagerState {
  id: string;
  x: number;
  y: number;
  status: VillagerStatus;
  homeX: number;
  homeY: number;
  elevation: number;
}

export interface InteractiveObject {
  id: string;
  kind: 'sandbag-pile' | 'generator';
  x: number;
  y: number;
  available: boolean;
}

export interface PublicPropState {
  id: PropId;
  kind: 'rescue-crate';
  x: number;
  y: number;
  grabbedBy: PlayerId | null;
}

export interface PublicStormBarrierState {
  id: StormBarrierId;
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
}

export interface StormBarrierDefinition {
  id: StormBarrierId;
  x: number;
  y: number;
  initialAngle: number;
  angularSpeedRadiansPerSecond: number;
  length: number;
  width: number;
}

export interface WaterCell {
  waterLevel: number;
  isBlocked: boolean;
}

export interface PublicMatchState {
  phase: MatchPhase;
  waterPhase: WaterPhase;
  timerRemaining: number;
  mode: MatchMode;
  elapsedMs: number;
  timeLimitMs: number | null;
  score: number;
  resilienceScore: number;
  outcome: MatchOutcome;
  countdownEndsAt: number | null;
  winnerTeam: TeamId | null;
  floodStarted: boolean;
  rematchVotes: number;
  requiredRematchVotes: number;
}

export interface PublicSnapshot {
  tick: number;
  serverTime: number;
  match: PublicMatchState;
  players: PublicPlayerState[];
  relay: PublicRelayState;
  core: PublicCoreState;
  pump: PublicPumpState;
  props: PublicPropState[];
  stormBarriers: PublicStormBarrierState[];
  beacons: PublicBeaconState[];
  interactiveObjects: InteractiveObject[];
  villagers: VillagerState[];
  floodLevels: number[];
  waterGrid: WaterCell[];
}

export type GameEvent =
  | {
      type: 'HIT';
      at: number;
      sourceId: PlayerId;
      targetId: PlayerId;
      damage: number;
      attackKind: 'basic' | 'rescue-line';
    }
  | { type: 'DEFEATED'; at: number; playerId: PlayerId; byPlayerId: PlayerId }
  | { type: 'RESPAWNED'; at: number; playerId: PlayerId }
  | { type: 'JUMPED'; at: number; playerId: PlayerId }
  | { type: 'LANDED'; at: number; playerId: PlayerId }
  | { type: 'DIVE_STARTED'; at: number; playerId: PlayerId; direction: Vector2 }
  | { type: 'PROP_GRABBED'; at: number; playerId: PlayerId; propId: PropId }
  | { type: 'PROP_RELEASED'; at: number; playerId: PlayerId; propId: PropId }
  | {
      type: 'HAZARD_HIT';
      at: number;
      playerId: PlayerId;
      hazardId: StormBarrierId;
      knockback: Vector2;
    }
  | {
      type: 'ABILITY_CAST';
      at: number;
      playerId: PlayerId;
      slot: 'Q' | 'W';
      from: Vector2;
      to: Vector2;
    }
  | { type: 'RELAY_CAPTURED'; at: number; team: TeamId }
  | { type: 'PUMP_ACTIVATED'; at: number; playerId: PlayerId; team: TeamId }
  | { type: 'CORE_PICKED_UP'; at: number; playerId: PlayerId }
  | { type: 'CORE_DROPPED'; at: number; playerId: PlayerId; position: Vector2 }
  | { type: 'CORE_DEPOSITED'; at: number; playerId: PlayerId; team: TeamId }
  | { type: 'FLOOD_STARTED'; at: number }
  | { type: 'MATCH_STARTED'; at: number }
  | { type: 'MATCH_WON'; at: number; team: TeamId }
  | { type: 'MATCH_EXPIRED'; at: number }
  | { type: 'PLAYER_DISCONNECTED'; at: number; playerId: PlayerId }
  | { type: 'PLAYER_RECONNECTED'; at: number; playerId: PlayerId };

export interface WelcomeMessage {
  playerId: PlayerId;
  team: TeamId;
  tickRate: number;
  snapshotRate: number;
}

export interface CommandResultMessage {
  sequence: number;
  accepted: boolean;
  reason?: string;
}

export const ClientMessage = {
  COMMAND: 'command',
  READY: 'ready',
  REMATCH: 'rematch',
} as const;

export const ServerMessage = {
  WELCOME: 'welcome',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  COMMAND_RESULT: 'command-result',
  NOTICE: 'notice',
} as const;
