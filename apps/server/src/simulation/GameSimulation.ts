import {
  ABILITIES,
  AIR_CONTROL_MULTIPLIER,
  BEACON_INTERACT_RADIUS,
  BEACON_POSITIONS,
  CORE_INTERACT_RADIUS,
  DIVE_COOLDOWN_MS,
  DIVE_DURATION_MS,
  DIVE_RECOVERY_MS,
  DIVE_SPEED,
  FLOOD_START_MS,
  FLOOD_STEP_MS,
  DEFAULT_HERO_ID,
  GENERATOR_POSITION,
  GRABBED_PROP_FOLLOW_DISTANCE,
  GRAB_RADIUS,
  GRAVITY,
  JUMP_INITIAL_VELOCITY,
  HEROES,
  MATCH_COUNTDOWN_MS,
  PUMP_DRAIN_INTERVAL_MS,
  PUMP_DRAIN_RADIUS,
  PUMP_FLOOD_DELAY_MS,
  PUMP_POSITION,
  PUMP_PRESSURE_RADIUS,
  PLAYER_COLLISION_RADIUS,
  RELAY_CAPTURE_MS,
  RELAY_CAPTURE_RADIUS,
  RELAY_POSITION,
  REQUIRED_PLAYERS,
  RESCUE_CRATE_POSITION,
  RESCUE_CRATE_RADIUS,
  RESPAWN_MS,
  SANDBAG_POSITION,
  SIMULATION_STEP_MS,
  SOLO_DRILL_DURATION_MS,
  SPAWN_POSITIONS,
  STORM_BARRIER_CLEARANCE,
  STORM_BARRIER_DEFINITIONS,
  STORM_BARRIER_HIT_COOLDOWN_MS,
  STORM_BARRIER_KNOCKBACK,
  STORM_BARRIER_STUMBLE_MS,
  distance,
  pointToSegmentDistance,
  isHeroId,
  type AbilitySlot,
  type GameEvent,
  type HeroId,
  type InteractiveObject,
  type MatchMode,
  type PlayerCommand,
  type PlayerId,
  type PublicBeaconState,
  type PublicCoreState,
  type PublicMatchState,
  type PublicPlayerState,
  type PublicPropState,
  type PublicPumpState,
  type PublicRelayState,
  type PublicSnapshot,
  type PublicStormBarrierState,
  type StormBarrierId,
  type TeamId,
  type Vector2,
} from '@signal-zero/shared';
import { FloodSystem } from './flood.js';
import { WaterGridSystem } from './waterGrid.js';
import {
  isZeroDirection,
  moveCircleAxisSeparated,
  normalizeDirection,
  stormBarrierCollisionNormal,
} from './partyPhysics.js';
import { findPath, hasClearWalkableLine } from './pathfinding.js';

const RESCUE_LINE_DAMAGE = 30;
const RESCUE_LINE_WIDTH = 42;
const RESCUE_LINE_FLOOD_IMMUNITY_MS = 2_000;
const BAYANIHAN_PULSE_FLOOD_IMMUNITY_MS = 4_000;
const MAX_CHASE_DISTANCE = 625;
const CHASE_REPATH_MS = 250;

interface RuntimePlayer {
  state: PublicPlayerState;
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

export interface AddPlayerResult {
  accepted: boolean;
  team?: TeamId;
  reason?: string;
}

function copyPoint(point: Vector2): Vector2 {
  return { x: point.x, y: point.y };
}

function rejected(reason: string): SimulationCommandResult {
  return { accepted: false, reason };
}

export class GameSimulation {
  readonly #players = new Map<PlayerId, RuntimePlayer>();
  readonly #events: GameEvent[] = [];
  readonly #rematchVotes = new Set<PlayerId>();
  readonly #flood = new FloodSystem();
  readonly #waterGrid = new WaterGridSystem();
  readonly #beacons: PublicBeaconState[] = [
    { id: 'beacon:A', team: 'A', ...copyPoint(BEACON_POSITIONS.A) },
    { id: 'beacon:B', team: 'B', ...copyPoint(BEACON_POSITIONS.B) },
  ];
  readonly #relay: PublicRelayState = {
    id: 'weather-relay',
    ...copyPoint(RELAY_POSITION),
    state: 'neutral',
    ownerTeam: null,
    captureTeam: null,
    captureProgress: 0,
  };
  readonly #core: PublicCoreState = {
    id: 'resilience-core',
    status: 'locked',
    ...copyPoint(RELAY_POSITION),
    carrierId: null,
    earnedByTeam: null,
  };
  readonly #pump: PublicPumpState = {
    id: 'barangay-pump',
    ...copyPoint(PUMP_POSITION),
    state: 'offline',
    activatedByTeam: null,
  };
  readonly #rescueCrate: PublicPropState = {
    id: 'rescue-crate',
    kind: 'rescue-crate',
    ...copyPoint(RESCUE_CRATE_POSITION),
    grabbedBy: null,
  };
  readonly #interactiveObjects: InteractiveObject[] = [
    { id: 'sandbag-pile', kind: 'sandbag-pile', ...copyPoint(SANDBAG_POSITION), available: true },
    { id: 'generator', kind: 'generator', ...copyPoint(GENERATOR_POSITION), available: true },
  ];

  #phase: PublicMatchState['phase'] = 'waiting';
  #now: number;
  #tick = 0;
  #countdownEndsAt: number | null = null;
  #matchStartedAt: number | null = null;
  #elapsedMs = 0;
  #winnerTeam: TeamId | null = null;
  #outcome: PublicMatchState['outcome'] = null;
  #score = 0;
  #timeLimitMs: number | null = null;
  #nextFloodStepAt: number | null = null;
  #nextPumpDrainAt: number | null = null;
  #crateLastHandledBy: PlayerId | null = null;
  readonly #configuredMode: MatchMode | null;

  constructor(initialServerTime = 0, configuredMode: MatchMode | null = null) {
    this.#now = initialServerTime;
    this.#configuredMode = configuredMode;
  }

  get now(): number {
    return this.#now;
  }

  get phase(): PublicMatchState['phase'] {
    return this.#phase;
  }

  get playerCount(): number {
    return this.#players.size;
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.#players.has(playerId);
  }

  isPlayerConnected(playerId: PlayerId): boolean {
    return this.#players.get(playerId)?.state.connected ?? false;
  }

  getPlayerTeam(playerId: PlayerId): TeamId | undefined {
    return this.#players.get(playerId)?.state.team;
  }

  addPlayer(
    playerId: PlayerId,
    name: string,
    heroId: HeroId | string = DEFAULT_HERO_ID,
  ): AddPlayerResult {
    if (this.#phase === 'active' || this.#phase === 'ended') {
      return { accepted: false, reason: 'Match already started' };
    }
    if (this.#players.has(playerId)) return { accepted: false, reason: 'Player already joined' };
    const maximumPlayers = this.#configuredMode === 'flood-drill' ? 1 : REQUIRED_PLAYERS;
    if (this.#players.size >= maximumPlayers) return { accepted: false, reason: 'Room is full' };
    if (!isHeroId(heroId)) return { accepted: false, reason: 'Unknown responder' };

    const hero = HEROES[heroId];
    const occupiedTeams = new Set(
      Array.from(this.#players.values(), (player) => player.state.team),
    );
    const team: TeamId = occupiedTeams.has('A') ? 'B' : 'A';
    const spawn = SPAWN_POSITIONS[team];
    this.#players.set(playerId, {
      state: {
        id: playerId,
        name: name.trim(),
        heroId,
        team,
        ...copyPoint(spawn),
        health: hero.maxHealth,
        maxHealth: hero.maxHealth,
        energy: hero.maxEnergy,
        maxEnergy: hero.maxEnergy,
        alive: true,
        connected: true,
        ready: false,
        respawnAt: null,
        attackTargetId: null,
        destination: null,
        hasCore: false,
        qCooldownEndsAt: 0,
        wCooldownEndsAt: 0,
        floodImmuneUntil: 0,
        elevation: 0,
        grounded: true,
        stumbleUntil: 0,
        diveCooldownEndsAt: 0,
        grabbedObjectId: null,
        heldItem: 'NONE',
        facing: team === 'A' ? { x: 1, y: 0 } : { x: -1, y: 0 },
        commandMode: 'idle',
      },
      path: [],
      nextAttackAt: 0,
      nextChasePathAt: 0,
      attackLeashOrigin: null,
      attackMoveDestination: null,
      steerDirection: { x: 0, y: 0 },
      verticalVelocity: 0,
      diveDirection: { x: 0, y: 0 },
      diveEndsAt: 0,
      hazardHitCooldowns: new Map(),
    });
    return { accepted: true, team };
  }

  removePlayer(playerId: PlayerId): boolean {
    if (this.#phase === 'active' || this.#phase === 'ended') return false;
    const removed = this.#players.delete(playerId);
    if (removed) {
      this.#rematchVotes.delete(playerId);
      this.#cancelCountdownIfRosterNotReady();
    }
    return removed;
  }

  setConnected(playerId: PlayerId, connected: boolean): boolean {
    const player = this.#players.get(playerId);
    if (!player || player.state.connected === connected) return false;
    player.state.connected = connected;
    if (connected) {
      this.#events.push({ type: 'PLAYER_RECONNECTED', at: this.#now, playerId });
      this.#tryStartCountdown();
    } else {
      this.#releaseProp(player, true);
      this.#stopPlayer(player, 'idle');
      this.#dropCore(player);
      this.#events.push({ type: 'PLAYER_DISCONNECTED', at: this.#now, playerId });
      this.#cancelCountdownIfRosterNotReady();
    }
    return true;
  }

  setReady(playerId: PlayerId, ready: boolean): SimulationCommandResult {
    const player = this.#players.get(playerId);
    if (!player) return rejected('Player is not in this room');
    if (!player.state.connected) return rejected('Player is disconnected');
    if (this.#phase !== 'waiting' && this.#phase !== 'countdown') {
      return rejected('Ready status can only change before a match');
    }
    player.state.ready = ready;
    if (ready) this.#tryStartCountdown();
    else this.#cancelCountdownIfRosterNotReady();
    return { accepted: true };
  }

  voteRematch(playerId: PlayerId): SimulationCommandResult {
    const player = this.#players.get(playerId);
    if (!player || !player.state.connected) return rejected('Only connected room players can vote');
    if (this.#phase !== 'ended') return rejected('Rematch voting opens after the match');
    this.#rematchVotes.add(playerId);
    if (this.#rematchVotes.size >= this.#requiredRematchVotes()) this.#beginRematchCountdown();
    return { accepted: true };
  }

  applyCommand(command: PlayerCommand): SimulationCommandResult {
    const player = this.#players.get(command.playerId);
    if (!player) return rejected('Player is not in this room');
    if (!player.state.connected) return rejected('Player is disconnected');
    if (this.#phase !== 'active') return rejected('Match is not active');
    if (!player.state.alive) return rejected('Defeated players cannot issue commands');

    switch (command.type) {
      case 'MOVE':
        return this.#moveCommand(player, command.destination, 'moving');
      case 'ATTACK_MOVE':
        return this.#moveCommand(player, command.destination, 'attack-moving');
      case 'ATTACK_TARGET':
        return this.#attackTargetCommand(player, command.targetId);
      case 'CAST_ABILITY':
        return this.#castAbility(player, command.slot, command.targetPoint);
      case 'INTERACT':
        return this.#interact(player, command.targetId);
      case 'STOP':
        this.#stopPlayer(player, 'idle');
        return { accepted: true };
      case 'HOLD_POSITION':
        this.#stopPlayer(player, 'holding');
        return { accepted: true };
      case 'STEER':
        return this.#steer(player, command.direction);
      case 'JUMP':
        return this.#jump(player);
      case 'DIVE':
        return this.#dive(player, command.direction);
      case 'GRAB':
        return this.#toggleGrab(player, command.targetId);
    }
  }

  step(deltaMs = SIMULATION_STEP_MS): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.#now += deltaMs;
    this.#tick += 1;

    if (
      this.#phase === 'countdown' &&
      this.#countdownEndsAt !== null &&
      this.#now >= this.#countdownEndsAt
    ) {
      if (this.#isRosterReady()) this.#startMatch();
      else this.#returnToWaiting();
    }
    if (this.#phase !== 'active') return;

    const startedAt = this.#matchStartedAt ?? this.#now;
    this.#elapsedMs = Math.max(0, this.#now - startedAt);
    if (this.#timeLimitMs !== null && this.#elapsedMs >= this.#timeLimitMs) {
      this.#phase = 'ended';
      this.#outcome = 'time-expired';
      this.#events.push({ type: 'MATCH_EXPIRED', at: this.#now });
      return;
    }
    this.#waterGrid.step(deltaMs);
    this.#updateFlood();

    // Pump drainage tick
    if (
      this.#pump.state === 'active' &&
      this.#nextPumpDrainAt !== null &&
      this.#now >= this.#nextPumpDrainAt
    ) {
      this.#waterGrid.drainAtPoint(this.#pump.x, this.#pump.y, PUMP_DRAIN_RADIUS);
      this.#nextPumpDrainAt = this.#now + PUMP_DRAIN_INTERVAL_MS;
    }

    for (const player of this.#players.values()) {
      this.#updateRespawn(player);
      if (!player.state.alive || !player.state.connected) continue;
      const hero = HEROES[player.state.heroId];
      player.state.energy = Math.min(
        player.state.maxEnergy,
        player.state.energy + (hero.energyRegenerationPerSecond * deltaMs) / 1_000,
      );
      this.#updateVerticalMotion(player, deltaMs);
      this.#updateControlledMotion(player, deltaMs);
      if (player.state.hasCore) {
        this.#core.x = player.state.x;
        this.#core.y = player.state.y;
      }
      if (player.state.grabbedObjectId === this.#rescueCrate.id) {
        this.#updateGrabbedCrate(player);
      }
    }
    this.#updateStormBarrierCollisions();
    this.#updatePumpPressure();
    this.#updateRelayCapture(deltaMs);
  }

  getSnapshot(): PublicSnapshot {
    return {
      tick: this.#tick,
      serverTime: this.#now,
      match: {
        phase: this.#phase,
        waterPhase: this.#waterGrid.waterPhase,
        timerRemaining: this.#waterGrid.timerRemainingMs,
        mode: this.#matchMode(),
        elapsedMs: this.#elapsedMs,
        timeLimitMs: this.#timeLimitMs,
        score: this.#score,
        outcome: this.#outcome,
        countdownEndsAt: this.#countdownEndsAt,
        winnerTeam: this.#winnerTeam,
        floodStarted: this.#flood.started,
        rematchVotes: this.#rematchVotes.size,
        requiredRematchVotes: this.#requiredRematchVotes(),
      },
      players: Array.from(this.#players.values(), ({ state }) => ({
        ...state,
        destination: state.destination ? copyPoint(state.destination) : null,
        facing: copyPoint(state.facing),
      })),
      relay: { ...this.#relay },
      core: { ...this.#core },
      pump: { ...this.#pump },
      props: [{ ...this.#rescueCrate }],
      stormBarriers: this.#stormBarriers(),
      beacons: this.#beacons.map((beacon) => ({ ...beacon })),
      interactiveObjects: this.#interactiveObjects.map((obj) => ({ ...obj })),
      floodLevels: this.#flood.getLevels(),
      waterGrid: Array.from(this.#waterGrid.cells, (cell) => ({
        waterLevel: cell.waterLevel,
        isBlocked: cell.isBlocked,
      })),
    };
  }

  drainEvents(): GameEvent[] {
    return this.#events.splice(0);
  }

  #tryStartCountdown(): void {
    if (this.#phase !== 'waiting' || !this.#isRosterReady()) return;
    this.#phase = 'countdown';
    this.#countdownEndsAt = this.#now + MATCH_COUNTDOWN_MS;
  }

  #cancelCountdownIfRosterNotReady(): void {
    if (this.#phase === 'countdown' && !this.#isRosterReady()) this.#returnToWaiting();
  }

  #returnToWaiting(): void {
    this.#phase = 'waiting';
    this.#countdownEndsAt = null;
  }

  #isRosterReady(): boolean {
    const requiredPlayers = this.#configuredMode === 'versus' ? REQUIRED_PLAYERS : 1;
    const rosterSizeIsValid =
      this.#configuredMode === null
        ? this.#players.size >= 1
        : this.#players.size === requiredPlayers;
    return (
      rosterSizeIsValid &&
      Array.from(this.#players.values()).every(
        (player) => player.state.connected && player.state.ready,
      )
    );
  }

  #requiredRematchVotes(): number {
    return Math.max(
      1,
      Array.from(this.#players.values()).filter((player) => player.state.connected).length,
    );
  }

  #matchMode(): PublicMatchState['mode'] {
    return this.#configuredMode ?? (this.#players.size === 1 ? 'flood-drill' : 'versus');
  }

  #addDrillScore(points: number): void {
    if (this.#matchMode() === 'flood-drill') this.#score += points;
  }

  #startMatch(): void {
    this.#prepareRoundState();
    this.#phase = 'active';
    this.#countdownEndsAt = null;
    this.#matchStartedAt = this.#now;
    this.#elapsedMs = 0;
    this.#timeLimitMs = this.#matchMode() === 'flood-drill' ? SOLO_DRILL_DURATION_MS : null;
    this.#nextFloodStepAt = this.#now + FLOOD_START_MS + FLOOD_STEP_MS;
    this.#events.push({ type: 'MATCH_STARTED', at: this.#now });
  }

  #beginRematchCountdown(): void {
    this.#prepareRoundState();
    for (const player of this.#players.values()) player.state.ready = player.state.connected;
    this.#rematchVotes.clear();
    this.#phase = 'countdown';
    this.#countdownEndsAt = this.#now + MATCH_COUNTDOWN_MS;
  }

  #prepareRoundState(): void {
    this.#winnerTeam = null;
    this.#outcome = null;
    this.#score = 0;
    this.#timeLimitMs = null;
    this.#matchStartedAt = null;
    this.#elapsedMs = 0;
    this.#nextFloodStepAt = null;
    this.#flood.reset();
    this.#waterGrid.reset();
    Object.assign(this.#relay, {
      state: 'neutral',
      ownerTeam: null,
      captureTeam: null,
      captureProgress: 0,
    } satisfies Partial<PublicRelayState>);
    Object.assign(this.#core, {
      status: 'locked',
      ...copyPoint(RELAY_POSITION),
      carrierId: null,
      earnedByTeam: null,
    } satisfies Partial<PublicCoreState>);
    Object.assign(this.#pump, {
      state: 'offline',
      activatedByTeam: null,
    } satisfies Partial<PublicPumpState>);
    Object.assign(this.#rescueCrate, {
      ...copyPoint(RESCUE_CRATE_POSITION),
      grabbedBy: null,
    } satisfies Partial<PublicPropState>);
    this.#crateLastHandledBy = null;
    this.#nextPumpDrainAt = null;
    for (const obj of this.#interactiveObjects) obj.available = true;
    for (const player of this.#players.values()) {
      const spawn = SPAWN_POSITIONS[player.state.team];
      Object.assign(player.state, {
        ...copyPoint(spawn),
        health: player.state.maxHealth,
        energy: player.state.maxEnergy,
        alive: true,
        respawnAt: null,
        attackTargetId: null,
        destination: null,
        hasCore: false,
        qCooldownEndsAt: 0,
        wCooldownEndsAt: 0,
        floodImmuneUntil: 0,
        elevation: 0,
        grounded: true,
        stumbleUntil: 0,
        diveCooldownEndsAt: 0,
        grabbedObjectId: null,
        heldItem: 'NONE',
        facing: player.state.team === 'A' ? { x: 1, y: 0 } : { x: -1, y: 0 },
        commandMode: 'idle',
      } satisfies Partial<PublicPlayerState>);
      player.path = [];
      player.nextAttackAt = 0;
      player.nextChasePathAt = 0;
      player.attackLeashOrigin = null;
      player.attackMoveDestination = null;
      player.steerDirection = { x: 0, y: 0 };
      player.verticalVelocity = 0;
      player.diveDirection = { x: 0, y: 0 };
      player.diveEndsAt = 0;
      player.hazardHitCooldowns.clear();
    }
  }

  #updateFlood(): void {
    if (!this.#flood.started && this.#elapsedMs >= FLOOD_START_MS) {
      this.#flood.start();
      this.#events.push({ type: 'FLOOD_STARTED', at: this.#now });
    }
    while (
      this.#flood.started &&
      this.#nextFloodStepAt !== null &&
      this.#now >= this.#nextFloodStepAt
    ) {
      this.#flood.propagate();
      this.#nextFloodStepAt += FLOOD_STEP_MS;
    }
  }

  #steer(player: RuntimePlayer, requestedDirection: Vector2): SimulationCommandResult {
    const direction = normalizeDirection(requestedDirection);
    player.steerDirection = direction;
    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = null;
    player.attackLeashOrigin = null;
    player.attackMoveDestination = null;
    if (!isZeroDirection(direction)) player.state.facing = copyPoint(direction);
    if (this.#now >= player.diveEndsAt) {
      player.state.commandMode = isZeroDirection(direction) ? 'idle' : 'steering';
    }
    return { accepted: true };
  }

  #jump(player: RuntimePlayer): SimulationCommandResult {
    if (!player.state.grounded) return rejected('Player is already airborne');
    if (this.#now < player.state.stumbleUntil)
      return rejected('Player is recovering from a stumble');
    if (this.#now < player.diveEndsAt) return rejected('Cannot jump during a dive');
    player.state.grounded = false;
    player.verticalVelocity = JUMP_INITIAL_VELOCITY;
    this.#events.push({ type: 'JUMPED', at: this.#now, playerId: player.state.id });
    return { accepted: true };
  }

  #dive(player: RuntimePlayer, requestedDirection: Vector2): SimulationCommandResult {
    const direction = normalizeDirection(requestedDirection);
    if (isZeroDirection(direction)) return rejected('Dive direction must not be zero');
    if (!player.state.grounded) return rejected('Player must be grounded to dive');
    if (this.#now < player.state.diveCooldownEndsAt) return rejected('Dive is on cooldown');
    if (this.#now < player.state.stumbleUntil)
      return rejected('Player is recovering from a stumble');

    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = null;
    player.attackLeashOrigin = null;
    player.attackMoveDestination = null;
    player.diveDirection = direction;
    player.diveEndsAt = this.#now + DIVE_DURATION_MS;
    player.state.diveCooldownEndsAt = this.#now + DIVE_COOLDOWN_MS;
    player.state.stumbleUntil = player.diveEndsAt + DIVE_RECOVERY_MS;
    player.state.facing = copyPoint(direction);
    player.state.commandMode = 'diving';
    this.#events.push({
      type: 'DIVE_STARTED',
      at: this.#now,
      playerId: player.state.id,
      direction: copyPoint(direction),
    });
    return { accepted: true };
  }

  #toggleGrab(player: RuntimePlayer, targetId: string | undefined): SimulationCommandResult {
    if (player.state.grabbedObjectId) {
      this.#releaseProp(player, true);
      return { accepted: true };
    }
    if (targetId && targetId !== this.#rescueCrate.id) return rejected('Unknown grabbable object');
    if (!player.state.grounded) return rejected('Player must be grounded to grab the rescue crate');
    if (this.#now < player.state.stumbleUntil)
      return rejected('Player is recovering from a stumble');
    if (this.#rescueCrate.grabbedBy) return rejected('Rescue crate is already grabbed');
    if (distance(player.state, this.#rescueCrate) > GRAB_RADIUS) {
      return rejected('Rescue crate is out of grab range');
    }

    player.state.grabbedObjectId = this.#rescueCrate.id;
    this.#rescueCrate.grabbedBy = player.state.id;
    this.#crateLastHandledBy = player.state.id;
    this.#events.push({
      type: 'PROP_GRABBED',
      at: this.#now,
      playerId: player.state.id,
      propId: this.#rescueCrate.id,
    });
    return { accepted: true };
  }

  #releaseProp(player: RuntimePlayer, emitEvent: boolean): void {
    if (player.state.grabbedObjectId !== this.#rescueCrate.id) return;
    player.state.grabbedObjectId = null;
    if (this.#rescueCrate.grabbedBy === player.state.id) this.#rescueCrate.grabbedBy = null;
    if (emitEvent) {
      this.#events.push({
        type: 'PROP_RELEASED',
        at: this.#now,
        playerId: player.state.id,
        propId: this.#rescueCrate.id,
      });
    }
  }

  #updateVerticalMotion(player: RuntimePlayer, deltaMs: number): void {
    if (player.state.grounded) {
      player.state.elevation = 0;
      return;
    }
    const deltaSeconds = deltaMs / 1_000;
    player.state.elevation += player.verticalVelocity * deltaSeconds;
    player.verticalVelocity -= GRAVITY * deltaSeconds;
    if (player.state.elevation > 0) return;

    player.state.elevation = 0;
    player.state.grounded = true;
    player.verticalVelocity = 0;
    this.#events.push({ type: 'LANDED', at: this.#now, playerId: player.state.id });
  }

  #updateControlledMotion(player: RuntimePlayer, deltaMs: number): void {
    if (this.#now < player.diveEndsAt) {
      player.state.commandMode = 'diving';
      this.#moveDirect(player, player.diveDirection, DIVE_SPEED, deltaMs);
      return;
    }
    if (this.#now < player.state.stumbleUntil) {
      return;
    }
    if (!isZeroDirection(player.steerDirection)) {
      const floodMultiplier =
        this.#now < player.state.floodImmuneUntil
          ? 1
          : this.#flood.getMovementMultiplier(player.state);
      const airMultiplier = player.state.grounded ? 1 : AIR_CONTROL_MULTIPLIER;
      player.state.commandMode = 'steering';
      this.#moveDirect(
        player,
        player.steerDirection,
        HEROES[player.state.heroId].movementSpeed * floodMultiplier * airMultiplier,
        deltaMs,
      );
      return;
    }
    this.#updatePlayerAction(player, deltaMs);
  }

  #moveDirect(player: RuntimePlayer, direction: Vector2, speed: number, deltaMs: number): void {
    const distanceThisStep = (speed * deltaMs) / 1_000;
    const next = moveCircleAxisSeparated(
      player.state,
      { x: direction.x * distanceThisStep, y: direction.y * distanceThisStep },
      PLAYER_COLLISION_RADIUS,
    );
    player.state.x = next.x;
    player.state.y = next.y;
    if (!isZeroDirection(direction)) player.state.facing = copyPoint(direction);
  }

  #updateGrabbedCrate(player: RuntimePlayer): void {
    const target = {
      x: player.state.x + player.state.facing.x * GRABBED_PROP_FOLLOW_DISTANCE,
      y: player.state.y + player.state.facing.y * GRABBED_PROP_FOLLOW_DISTANCE,
    };
    const next = moveCircleAxisSeparated(
      this.#rescueCrate,
      { x: target.x - this.#rescueCrate.x, y: target.y - this.#rescueCrate.y },
      RESCUE_CRATE_RADIUS,
    );
    this.#rescueCrate.x = next.x;
    this.#rescueCrate.y = next.y;
    this.#crateLastHandledBy = player.state.id;
    if (distance(player.state, this.#rescueCrate) > GRAB_RADIUS * 2)
      this.#releaseProp(player, true);
  }

  #stormBarriers(): PublicStormBarrierState[] {
    const elapsedSeconds = this.#elapsedMs / 1_000;
    return STORM_BARRIER_DEFINITIONS.map((definition) => {
      const rawAngle =
        definition.initialAngle + definition.angularSpeedRadiansPerSecond * elapsedSeconds;
      const angle = ((rawAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return {
        id: definition.id,
        x: definition.x,
        y: definition.y,
        angle,
        length: definition.length,
        width: definition.width,
      };
    });
  }

  #updateStormBarrierCollisions(): void {
    const barriers = this.#stormBarriers();
    for (const player of this.#players.values()) {
      if (
        !player.state.alive ||
        !player.state.connected ||
        player.state.elevation > STORM_BARRIER_CLEARANCE
      ) {
        continue;
      }
      for (const barrier of barriers) {
        if ((player.hazardHitCooldowns.get(barrier.id) ?? 0) > this.#now) continue;
        const normal = stormBarrierCollisionNormal(player.state, barrier, PLAYER_COLLISION_RADIUS);
        if (!normal) continue;

        const knockback = {
          x: normal.x * STORM_BARRIER_KNOCKBACK,
          y: normal.y * STORM_BARRIER_KNOCKBACK,
        };
        const next = moveCircleAxisSeparated(player.state, knockback, PLAYER_COLLISION_RADIUS);
        player.state.x = next.x;
        player.state.y = next.y;
        player.state.stumbleUntil = Math.max(
          player.state.stumbleUntil,
          this.#now + STORM_BARRIER_STUMBLE_MS,
        );
        player.diveEndsAt = this.#now;
        player.hazardHitCooldowns.set(barrier.id, this.#now + STORM_BARRIER_HIT_COOLDOWN_MS);
        this.#events.push({
          type: 'HAZARD_HIT',
          at: this.#now,
          playerId: player.state.id,
          hazardId: barrier.id,
          knockback,
        });
        break;
      }
    }
  }

  #updatePumpPressure(): void {
    if (this.#pump.state === 'active') return;
    if (distance(this.#rescueCrate, this.#pump) > PUMP_PRESSURE_RADIUS) return;
    const playerId = this.#rescueCrate.grabbedBy ?? this.#crateLastHandledBy;
    const player = playerId ? this.#players.get(playerId) : undefined;
    if (player) this.#activatePumpFromCrate(player);
  }

  #moveCommand(
    player: RuntimePlayer,
    destination: Vector2,
    mode: 'moving' | 'attack-moving',
  ): SimulationCommandResult {
    const route = findPath(player.state, destination, (col, row) =>
      this.#flood.getTraversalCost(col, row),
    );
    if (!route.found) {
      const reason =
        route.reason === 'outside-arena'
          ? 'Destination is outside the arena'
          : 'Destination is blocked';
      return rejected(reason);
    }
    player.path = route.points;
    player.state.destination = copyPoint(destination);
    player.state.attackTargetId = null;
    player.state.commandMode = mode;
    player.attackLeashOrigin = null;
    player.attackMoveDestination = mode === 'attack-moving' ? copyPoint(destination) : null;
    player.steerDirection = { x: 0, y: 0 };
    player.diveEndsAt = this.#now;
    return { accepted: true };
  }

  #attackTargetCommand(player: RuntimePlayer, targetId: PlayerId): SimulationCommandResult {
    const target = this.#players.get(targetId);
    if (!target || target.state.team === player.state.team)
      return rejected('Target is not a hostile player');
    if (!target.state.alive || !target.state.connected) return rejected('Target is not attackable');
    if (distance(player.state, target.state) > MAX_CHASE_DISTANCE)
      return rejected('Target is too far away');
    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = targetId;
    player.state.commandMode = 'attacking';
    player.attackMoveDestination = null;
    player.attackLeashOrigin = copyPoint(player.state);
    player.nextChasePathAt = 0;
    player.steerDirection = { x: 0, y: 0 };
    player.diveEndsAt = this.#now;
    return { accepted: true };
  }

  #castAbility(
    player: RuntimePlayer,
    slot: AbilitySlot,
    targetPoint: Vector2 | undefined,
  ): SimulationCommandResult {
    if (slot === 'W') return this.#castBayanihanPulse(player);
    if (slot !== 'Q') return rejected(`${slot} is not implemented in this milestone`);
    if (!targetPoint) return rejected('Rescue Line requires a target point');
    if (this.#now < player.state.qCooldownEndsAt) return rejected('Rescue Line is on cooldown');
    if (player.state.energy < ABILITIES.Q.energyCost) return rejected('Not enough energy');
    if (distance(player.state, targetPoint) > ABILITIES.Q.range)
      return rejected('Target point is out of range');
    if (!hasClearWalkableLine(player.state, targetPoint)) {
      return rejected('Rescue Line route is blocked');
    }

    const from = copyPoint(player.state);
    player.state.energy -= ABILITIES.Q.energyCost;
    player.state.qCooldownEndsAt = this.#now + ABILITIES.Q.cooldownMs;
    player.state.floodImmuneUntil = this.#now + RESCUE_LINE_FLOOD_IMMUNITY_MS;
    player.state.x = targetPoint.x;
    player.state.y = targetPoint.y;
    this.#stopPlayer(player, 'idle');
    this.#events.push({
      type: 'ABILITY_CAST',
      at: this.#now,
      playerId: player.state.id,
      slot: 'Q',
      from,
      to: copyPoint(targetPoint),
    });

    for (const target of this.#players.values()) {
      if (
        target.state.team !== player.state.team &&
        target.state.alive &&
        target.state.connected &&
        pointToSegmentDistance(target.state, from, targetPoint) <= RESCUE_LINE_WIDTH
      ) {
        this.#dealDamage(player, target, RESCUE_LINE_DAMAGE, 'rescue-line');
      }
    }
    return { accepted: true };
  }

  #castBayanihanPulse(player: RuntimePlayer): SimulationCommandResult {
    if (this.#now < player.state.wCooldownEndsAt) return rejected('Bayanihan Pulse is on cooldown');
    if (player.state.energy < ABILITIES.W.energyCost) return rejected('Not enough energy');
    player.state.energy -= ABILITIES.W.energyCost;
    player.state.wCooldownEndsAt = this.#now + ABILITIES.W.cooldownMs;
    player.state.floodImmuneUntil = Math.max(
      player.state.floodImmuneUntil,
      this.#now + BAYANIHAN_PULSE_FLOOD_IMMUNITY_MS,
    );
    this.#events.push({
      type: 'ABILITY_CAST',
      at: this.#now,
      playerId: player.state.id,
      slot: 'W',
      from: copyPoint(player.state),
      to: copyPoint(player.state),
    });
    return { accepted: true };
  }

  #interact(player: RuntimePlayer, requestedTargetId: string | undefined): SimulationCommandResult {
    // --- Sandbag placement: player holding a sandbag and interacting with the ground ---
    if (player.state.heldItem === 'SANDBAG') {
      const placed = this.#waterGrid.placeSandbag(player.state.x, player.state.y);
      if (!placed) return rejected('Cannot place a sandbag at this location');
      player.state.heldItem = 'NONE';
      this.#addDrillScore(50);
      return { accepted: true };
    }

    // --- Generator + Pump activation: player holding a generator near the pump ---
    if (player.state.heldItem === 'GENERATOR') {
      if (distance(player.state, this.#pump) > PUMP_PRESSURE_RADIUS) {
        return rejected('Bring the generator closer to the Barangay Pump');
      }
      if (this.#pump.state === 'active') return rejected('Pump is already active');
      this.#activatePumpFromGenerator(player);
      return { accepted: true };
    }

    if (requestedTargetId === this.#pump.id) {
      return rejected('Bring the rescue crate onto the Barangay Pump pressure zone');
    }
    if (requestedTargetId === 'weather-relay') {
      return distance(player.state, this.#relay) <= RELAY_CAPTURE_RADIUS
        ? { accepted: true }
        : rejected('Weather Relay is out of interaction range');
    }

    const ownBeaconId = `beacon:${player.state.team}` as const;
    if (player.state.hasCore) {
      if (requestedTargetId && requestedTargetId !== ownBeaconId) {
        return rejected('The core must be delivered to your own Bayanihan Beacon');
      }
      const beacon = BEACON_POSITIONS[player.state.team];
      if (distance(player.state, beacon) > BEACON_INTERACT_RADIUS) {
        return rejected('Bayanihan Beacon is out of interaction range');
      }
      this.#depositCore(player);
      return { accepted: true };
    }

    // --- Sandbag pile pickup ---
    if (this.#interactiveObjects[0]?.available) {
      const sandbagPile = this.#interactiveObjects[0];
      if (distance(player.state, sandbagPile) <= GRAB_RADIUS) {
        sandbagPile.available = false;
        player.state.heldItem = 'SANDBAG';
        return { accepted: true };
      }
    }

    // --- Generator pickup ---
    if (this.#interactiveObjects[1]?.available) {
      const generator = this.#interactiveObjects[1];
      if (distance(player.state, generator) <= GRAB_RADIUS) {
        generator.available = false;
        player.state.heldItem = 'GENERATOR';
        return { accepted: true };
      }
    }

    if (requestedTargetId?.startsWith('beacon:'))
      return rejected('This player is not carrying the core');
    if (requestedTargetId && requestedTargetId !== this.#core.id) {
      return rejected('Unknown interaction target');
    }
    if (this.#core.status !== 'available') return rejected('Resilience Core is not available');
    if (this.#core.earnedByTeam !== player.state.team) {
      return rejected('The opposing team earned this Resilience Core');
    }
    if (distance(player.state, this.#core) > CORE_INTERACT_RADIUS) {
      return rejected('Resilience Core is out of interaction range');
    }
    this.#core.status = 'carried';
    this.#core.carrierId = player.state.id;
    player.state.hasCore = true;
    this.#addDrillScore(200);
    this.#events.push({ type: 'CORE_PICKED_UP', at: this.#now, playerId: player.state.id });
    return { accepted: true };
  }

  #activatePumpFromCrate(player: RuntimePlayer): void {
    if (this.#pump.state === 'active') return;
    this.#pump.state = 'active';
    this.#pump.activatedByTeam = player.state.team;
    if (this.#nextFloodStepAt !== null) this.#nextFloodStepAt += PUMP_FLOOD_DELAY_MS;
    this.#addDrillScore(400);
    this.#events.push({
      type: 'PUMP_ACTIVATED',
      at: this.#now,
      playerId: player.state.id,
      team: player.state.team,
    });
  }

  #activatePumpFromGenerator(player: RuntimePlayer): void {
    if (this.#pump.state === 'active') return;
    this.#pump.state = 'active';
    this.#pump.activatedByTeam = player.state.team;
    player.state.heldItem = 'NONE';
    this.#nextPumpDrainAt = this.#now + PUMP_DRAIN_INTERVAL_MS;
    this.#addDrillScore(400);
    this.#events.push({
      type: 'PUMP_ACTIVATED',
      at: this.#now,
      playerId: player.state.id,
      team: player.state.team,
    });
  }

  #depositCore(player: RuntimePlayer): void {
    player.state.hasCore = false;
    this.#core.status = 'deposited';
    this.#core.carrierId = null;
    this.#core.x = BEACON_POSITIONS[player.state.team].x;
    this.#core.y = BEACON_POSITIONS[player.state.team].y;
    this.#phase = 'ended';
    this.#winnerTeam = player.state.team;
    this.#outcome = 'success';
    this.#addDrillScore(
      1_000 + Math.max(0, Math.floor(((this.#timeLimitMs ?? 0) - this.#elapsedMs) / 100)),
    );
    this.#events.push({
      type: 'CORE_DEPOSITED',
      at: this.#now,
      playerId: player.state.id,
      team: player.state.team,
    });
    this.#events.push({ type: 'MATCH_WON', at: this.#now, team: player.state.team });
  }

  #updateRespawn(player: RuntimePlayer): void {
    if (player.state.alive || player.state.respawnAt === null || this.#now < player.state.respawnAt)
      return;
    const spawn = SPAWN_POSITIONS[player.state.team];
    this.#releaseProp(player, true);
    Object.assign(player.state, {
      ...copyPoint(spawn),
      health: player.state.maxHealth,
      energy: player.state.maxEnergy,
      alive: true,
      respawnAt: null,
      attackTargetId: null,
      destination: null,
      elevation: 0,
      grounded: true,
      stumbleUntil: 0,
      grabbedObjectId: null,
      commandMode: 'idle',
    } satisfies Partial<PublicPlayerState>);
    player.path = [];
    player.steerDirection = { x: 0, y: 0 };
    player.verticalVelocity = 0;
    player.diveEndsAt = 0;
    this.#events.push({ type: 'RESPAWNED', at: this.#now, playerId: player.state.id });
  }

  #updatePlayerAction(player: RuntimePlayer, deltaMs: number): void {
    if (player.state.commandMode === 'holding') {
      this.#updateHoldingAttack(player);
      return;
    }
    if (player.state.commandMode === 'attacking' || player.state.attackTargetId) {
      const target = player.state.attackTargetId
        ? this.#players.get(player.state.attackTargetId)
        : undefined;
      if (!target || !this.#isValidCombatTarget(player, target)) {
        this.#finishCurrentAttack(player);
      } else {
        this.#updateAttackTarget(player, target, deltaMs);
        return;
      }
    }
    if (player.state.commandMode === 'attack-moving') {
      const acquired = this.#nearestEnemy(player, HEROES[player.state.heroId].acquisitionRange);
      if (acquired) {
        player.state.attackTargetId = acquired.state.id;
        player.attackLeashOrigin = copyPoint(player.state);
        this.#updateAttackTarget(player, acquired, deltaMs);
        return;
      }
    }
    this.#moveAlongPath(player, deltaMs);
  }

  #updateHoldingAttack(player: RuntimePlayer): void {
    const hero = HEROES[player.state.heroId];
    const currentTarget = player.state.attackTargetId
      ? this.#players.get(player.state.attackTargetId)
      : undefined;
    const target =
      currentTarget &&
      this.#isValidCombatTarget(player, currentTarget) &&
      distance(player.state, currentTarget.state) <= hero.attackRange
        ? currentTarget
        : this.#nearestEnemy(player, hero.attackRange);
    player.state.attackTargetId = target?.state.id ?? null;
    if (target) this.#performBasicAttack(player, target);
  }

  #updateAttackTarget(player: RuntimePlayer, target: RuntimePlayer, deltaMs: number): void {
    const hero = HEROES[player.state.heroId];
    const targetDistance = distance(player.state, target.state);
    const leashOrigin = player.attackLeashOrigin ?? player.state;
    const exceededLeash =
      distance(player.state, leashOrigin) > MAX_CHASE_DISTANCE ||
      distance(target.state, leashOrigin) > MAX_CHASE_DISTANCE;
    if (exceededLeash) {
      this.#finishCurrentAttack(player);
      return;
    }
    if (targetDistance <= hero.attackRange) {
      player.path = [];
      this.#performBasicAttack(player, target);
      return;
    }
    if (this.#now >= player.nextChasePathAt) {
      const chaseRoute = findPath(player.state, target.state, (col, row) =>
        this.#flood.getTraversalCost(col, row),
      );
      if (!chaseRoute.found) {
        this.#finishCurrentAttack(player);
        return;
      }
      player.path = chaseRoute.points;
      player.nextChasePathAt = this.#now + CHASE_REPATH_MS;
    }
    this.#moveAlongPath(player, deltaMs, false);
  }

  #performBasicAttack(source: RuntimePlayer, target: RuntimePlayer): void {
    if (this.#now < source.nextAttackAt) return;
    const hero = HEROES[source.state.heroId];
    source.nextAttackAt = this.#now + hero.attackIntervalMs;
    this.#dealDamage(source, target, hero.attackDamage, 'basic');
  }

  #dealDamage(
    source: RuntimePlayer,
    target: RuntimePlayer,
    damage: number,
    kind: 'basic' | 'rescue-line',
  ): void {
    if (!target.state.alive || this.#phase !== 'active') return;
    target.state.health = Math.max(0, target.state.health - damage);
    this.#events.push({
      type: 'HIT',
      at: this.#now,
      sourceId: source.state.id,
      targetId: target.state.id,
      damage,
      attackKind: kind,
    });
    if (target.state.health > 0) return;

    target.state.alive = false;
    target.state.respawnAt = this.#now + RESPAWN_MS;
    target.state.elevation = 0;
    target.state.grounded = true;
    target.verticalVelocity = 0;
    this.#stopPlayer(target, 'idle');
    this.#releaseProp(target, true);
    this.#dropCore(target);
    this.#events.push({
      type: 'DEFEATED',
      at: this.#now,
      playerId: target.state.id,
      byPlayerId: source.state.id,
    });
    for (const player of this.#players.values()) {
      if (player.state.attackTargetId === target.state.id) this.#finishCurrentAttack(player);
    }
  }

  #dropCore(player: RuntimePlayer): void {
    if (!player.state.hasCore) return;
    player.state.hasCore = false;
    this.#core.status = 'available';
    this.#core.carrierId = null;
    this.#core.x = player.state.x;
    this.#core.y = player.state.y;
    this.#events.push({
      type: 'CORE_DROPPED',
      at: this.#now,
      playerId: player.state.id,
      position: copyPoint(player.state),
    });
  }

  #isValidCombatTarget(source: RuntimePlayer, target: RuntimePlayer): boolean {
    return source.state.team !== target.state.team && target.state.alive && target.state.connected;
  }

  #nearestEnemy(player: RuntimePlayer, range: number): RuntimePlayer | undefined {
    let nearest: RuntimePlayer | undefined;
    let nearestDistance = range;
    for (const candidate of this.#players.values()) {
      if (!this.#isValidCombatTarget(player, candidate)) continue;
      const candidateDistance = distance(player.state, candidate.state);
      if (candidateDistance <= nearestDistance) {
        nearest = candidate;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }

  #finishCurrentAttack(player: RuntimePlayer): void {
    player.state.attackTargetId = null;
    player.attackLeashOrigin = null;
    if (player.attackMoveDestination) {
      const route = findPath(player.state, player.attackMoveDestination, (col, row) =>
        this.#flood.getTraversalCost(col, row),
      );
      if (route.found) {
        player.path = route.points;
        player.state.destination = copyPoint(player.attackMoveDestination);
        player.state.commandMode = 'attack-moving';
        return;
      }
    }
    this.#stopPlayer(player, 'idle');
  }

  #moveAlongPath(player: RuntimePlayer, deltaMs: number, finishWhenEmpty = true): void {
    const floodMultiplier =
      this.#now < player.state.floodImmuneUntil
        ? 1
        : this.#flood.getMovementMultiplier(player.state);
    let remainingDistance =
      (HEROES[player.state.heroId].movementSpeed * floodMultiplier * deltaMs) / 1_000;
    while (remainingDistance > 0 && player.path.length > 0) {
      const waypoint = player.path[0];
      if (!waypoint) break;
      const waypointDistance = distance(player.state, waypoint);
      const direction = normalizeDirection({
        x: waypoint.x - player.state.x,
        y: waypoint.y - player.state.y,
      });
      if (!isZeroDirection(direction)) player.state.facing = direction;
      if (waypointDistance <= remainingDistance || waypointDistance < 0.001) {
        player.state.x = waypoint.x;
        player.state.y = waypoint.y;
        remainingDistance -= waypointDistance;
        player.path.shift();
      } else {
        const ratio = remainingDistance / waypointDistance;
        player.state.x += (waypoint.x - player.state.x) * ratio;
        player.state.y += (waypoint.y - player.state.y) * ratio;
        remainingDistance = 0;
      }
    }
    if (finishWhenEmpty && player.path.length === 0) this.#stopPlayer(player, 'idle');
  }

  #stopPlayer(player: RuntimePlayer, mode: 'idle' | 'holding'): void {
    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = null;
    player.state.commandMode = mode;
    player.attackMoveDestination = null;
    player.attackLeashOrigin = null;
    player.steerDirection = { x: 0, y: 0 };
    player.diveDirection = { x: 0, y: 0 };
    player.diveEndsAt = this.#now;
  }

  #updateRelayCapture(deltaMs: number): void {
    if (this.#relay.state === 'captured') return;
    const teamsPresent = new Set<TeamId>();
    for (const player of this.#players.values()) {
      if (
        player.state.alive &&
        player.state.connected &&
        distance(player.state, this.#relay) <= RELAY_CAPTURE_RADIUS
      ) {
        teamsPresent.add(player.state.team);
      }
    }
    if (teamsPresent.size > 1) {
      this.#relay.state = 'contested';
      return;
    }
    const presentTeam = teamsPresent.values().next().value as TeamId | undefined;
    if (!presentTeam) {
      this.#relay.captureProgress = Math.max(
        0,
        this.#relay.captureProgress - deltaMs / RELAY_CAPTURE_MS,
      );
      if (this.#relay.captureProgress === 0) {
        this.#relay.state = 'neutral';
        this.#relay.captureTeam = null;
      } else {
        this.#relay.state = 'capturing';
      }
      return;
    }
    if (this.#relay.captureTeam !== presentTeam) {
      this.#relay.captureTeam = presentTeam;
      this.#relay.captureProgress = 0;
    }
    this.#relay.state = 'capturing';
    this.#relay.captureProgress = Math.min(
      1,
      this.#relay.captureProgress + deltaMs / RELAY_CAPTURE_MS,
    );
    if (this.#relay.captureProgress < 1) return;

    this.#relay.state = 'captured';
    this.#relay.ownerTeam = presentTeam;
    this.#relay.captureTeam = presentTeam;
    this.#core.status = 'available';
    this.#core.x = RELAY_POSITION.x;
    this.#core.y = RELAY_POSITION.y;
    this.#core.earnedByTeam = presentTeam;
    this.#addDrillScore(300);
    this.#events.push({ type: 'RELAY_CAPTURED', at: this.#now, team: presentTeam });
  }
}
