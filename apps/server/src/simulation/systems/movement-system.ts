import {
  AIR_CONTROL_MULTIPLIER,
  BOAT_MAX_PASSENGERS,
  BOAT_SPEED,
  DEEP_WATER_SPEED_CAP,
  DIVE_COOLDOWN_MS,
  DIVE_DURATION_MS,
  DIVE_RECOVERY_MS,
  DIVE_SPEED,
  distance,
  EVAC_CENTER,
  GRAB_RADIUS,
  HEROES,
  JUMP_INITIAL_VELOCITY,
  MAX_STAMINA,
  PLAYER_COLLISION_RADIUS,
  STAMINA_DRAIN_RATE,
  type GameEvent,
  type HeroId,
  type PlayerId,
  type Vector2,
} from '@signal-zero/shared';
import { findPath } from '../infrastructure/pathfinding.js';
import {
  isZeroDirection,
  moveCircleAxisSeparated,
  normalizeDirection,
} from '../infrastructure/partyPhysics.js';
import type { RuntimePlayer, SimulationCommandResult } from '../orchestrator/simulation-context.js';

function copyPoint(point: Vector2): Vector2 {
  return { x: point.x, y: point.y };
}

interface BoatRuntime {
  id: string;
  x: number;
  y: number;
  driverId: PlayerId | null;
  passengerIds: PlayerId[];
}

/**
 * All player motion: steering, path following, jumping, diving, boat driving, stamina penalties.
 */
export class MovementSystem {
  readonly #boats: BoatRuntime[] = [];

  get boats(): readonly BoatRuntime[] {
    return this.#boats;
  }

  initBoats(evacCenter: Vector2): void {
    this.#boats.length = 0;
    this.#boats.push(
      { id: 'boat:0', x: evacCenter.x, y: evacCenter.y, driverId: null, passengerIds: [] },
      { id: 'boat:1', x: evacCenter.x, y: evacCenter.y, driverId: null, passengerIds: [] },
    );
  }

  moveCommand(
    player: RuntimePlayer,
    destination: Vector2,
    mode: 'moving' | 'attack-moving',
    floodTraversalCost: (col: number, row: number) => number,
  ): SimulationCommandResult {
    const route = findPath(player.state, destination, floodTraversalCost);
    if (!route.found) {
      const reason =
        route.reason === 'outside-arena'
          ? 'Destination is outside the arena'
          : 'Destination is blocked';
      return { accepted: false, reason };
    }
    player.path = route.points;
    player.state.destination = copyPoint(destination);
    player.state.attackTargetId = null;
    player.state.commandMode = mode;
    player.attackLeashOrigin = null;
    player.attackMoveDestination = mode === 'attack-moving' ? copyPoint(destination) : null;
    player.steerDirection = { x: 0, y: 0 };
    player.diveEndsAt = 0;
    return { accepted: true };
  }

  steer(player: RuntimePlayer, requestedDirection: Vector2, now: number): SimulationCommandResult {
    const direction = normalizeDirection(requestedDirection);
    player.steerDirection = direction;
    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = null;
    player.attackLeashOrigin = null;
    player.attackMoveDestination = null;
    if (!isZeroDirection(direction)) player.state.facing = copyPoint(direction);
    if (now >= player.diveEndsAt) {
      player.state.commandMode = isZeroDirection(direction) ? 'idle' : 'steering';
    }
    return { accepted: true };
  }

  jump(player: RuntimePlayer, now: number, pushEvent: (event: GameEvent) => void): SimulationCommandResult {
    if (!player.state.grounded) return { accepted: false, reason: 'Player is already airborne' };
    if (now < player.state.stumbleUntil)
      return { accepted: false, reason: 'Player is recovering from a stumble' };
    if (now < player.diveEndsAt) return { accepted: false, reason: 'Cannot jump during a dive' };
    player.state.grounded = false;
    player.verticalVelocity = JUMP_INITIAL_VELOCITY;
    pushEvent({ type: 'JUMPED', at: now, playerId: player.state.id });
    return { accepted: true };
  }

  dive(
    player: RuntimePlayer,
    requestedDirection: Vector2,
    now: number,
    pushEvent: (event: GameEvent) => void,
  ): SimulationCommandResult {
    const direction = normalizeDirection(requestedDirection);
    if (isZeroDirection(direction)) return { accepted: false, reason: 'Dive direction must not be zero' };
    if (!player.state.grounded) return { accepted: false, reason: 'Player must be grounded to dive' };
    if (now < player.state.diveCooldownEndsAt) return { accepted: false, reason: 'Dive is on cooldown' };
    if (now < player.state.stumbleUntil)
      return { accepted: false, reason: 'Player is recovering from a stumble' };

    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = null;
    player.attackLeashOrigin = null;
    player.attackMoveDestination = null;
    player.diveDirection = direction;
    player.diveEndsAt = now + DIVE_DURATION_MS;
    player.state.diveCooldownEndsAt = now + DIVE_COOLDOWN_MS;
    player.state.stumbleUntil = player.diveEndsAt + DIVE_RECOVERY_MS;
    player.state.facing = copyPoint(direction);
    player.state.commandMode = 'diving';
    pushEvent({
      type: 'DIVE_STARTED',
      at: now,
      playerId: player.state.id,
      direction: copyPoint(direction),
    });
    return { accepted: true };
  }

  stopPlayer(player: RuntimePlayer, mode: 'idle' | 'holding'): void {
    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = null;
    player.state.commandMode = mode;
    player.attackMoveDestination = null;
    player.attackLeashOrigin = null;
    player.steerDirection = { x: 0, y: 0 };
    player.diveDirection = { x: 0, y: 0 };
    player.diveEndsAt = 0;
  }

  step(
    player: RuntimePlayer,
    deltaMs: number,
    now: number,
    floodMultiplier: number,
    waterLevel: number,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
    dropCore: (player: RuntimePlayer) => void,
    updatePlayerAction: (player: RuntimePlayer, deltaMs: number) => void,
  ): void {
    // --- Boat driving ---
    if (player.state.boatId) {
      const boat = this.#boats.find((b) => b.id === player.state.boatId);
      if (boat && boat.driverId === player.state.id) {
        if (!isZeroDirection(player.steerDirection)) {
          const passengerCount = boat.passengerIds.length;
          const speedMultiplier = 1 - (passengerCount / BOAT_MAX_PASSENGERS) * 0.5;
          const boatSpeed = BOAT_SPEED * speedMultiplier;
          player.state.commandMode = 'steering';
          this.#moveBoat(boat, player.steerDirection, boatSpeed, deltaMs);
          player.state.x = boat.x;
          player.state.y = boat.y;
          if (!isZeroDirection(player.steerDirection)) player.state.facing = copyPoint(player.steerDirection);
        } else {
          player.state.commandMode = 'idle';
        }
        return;
      }
    }

    // --- Dive motion ---
    if (now < player.diveEndsAt) {
      player.state.commandMode = 'diving';
      this.#moveDirect(player, player.diveDirection, DIVE_SPEED, deltaMs);
      return;
    }
    if (now < player.state.stumbleUntil) {
      return;
    }

    // --- Steering motion with stamina penalty ---
    if (!isZeroDirection(player.steerDirection)) {
      const airMultiplier = player.state.grounded ? 1 : AIR_CONTROL_MULTIPLIER;
      player.state.commandMode = 'steering';
      let speed = HEROES[player.state.heroId as HeroId].movementSpeed * floodMultiplier * airMultiplier;

      // Deep-water stamina penalty
      if (waterLevel >= 2) {
        speed *= DEEP_WATER_SPEED_CAP;
        player.state.stamina = Math.max(0, player.state.stamina - (STAMINA_DRAIN_RATE * deltaMs) / 1_000);
        if (player.state.stamina <= 0) {
          dismountBoat(player);
          releaseProp(player);
          dropCore(player);
          const evacSpawn = copyPoint(EVAC_CENTER);
          player.state.x = evacSpawn.x;
          player.state.y = evacSpawn.y;
          player.state.stamina = MAX_STAMINA;
          player.state.health = Math.max(1, player.state.health - 10);
          this.stopPlayer(player, 'idle');
          return;
        }
      }

      this.#moveDirect(player, player.steerDirection, speed, deltaMs);
      return;
    }

    // --- Path / action-based movement ---
    updatePlayerAction(player, deltaMs);
  }

  updateVerticalMotion(
    player: RuntimePlayer,
    deltaMs: number,
    now: number,
    pushEvent: (event: GameEvent) => void,
  ): void {
    if (player.state.grounded) {
      player.state.elevation = 0;
      return;
    }
    const deltaSeconds = deltaMs / 1_000;
    player.state.elevation += player.verticalVelocity * deltaSeconds;
    player.verticalVelocity -= 9.8 * deltaSeconds; // GRAVITY
    if (player.state.elevation > 0) return;

    player.state.elevation = 0;
    player.state.grounded = true;
    player.verticalVelocity = 0;
    pushEvent({ type: 'LANDED', at: now, playerId: player.state.id });
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

  #moveBoat(boat: BoatRuntime, direction: Vector2, speed: number, deltaMs: number): void {
    const distanceThisStep = (speed * deltaMs) / 1_000;
    const next = moveCircleAxisSeparated(
      boat,
      { x: direction.x * distanceThisStep, y: direction.y * distanceThisStep },
      PLAYER_COLLISION_RADIUS * 2,
    );
    boat.x = next.x;
    boat.y = next.y;
  }

  mountBoat(player: RuntimePlayer): BoatRuntime | undefined {
    const nearest = this.#findNearestBoat(player);
    if (!nearest || distance(player.state, nearest) > GRAB_RADIUS) return undefined;
    if (!nearest.driverId) {
      nearest.driverId = player.state.id;
      player.state.boatId = nearest.id;
    } else if (nearest.passengerIds.length < BOAT_MAX_PASSENGERS - 1) {
      nearest.passengerIds.push(player.state.id);
      player.state.boatId = nearest.id;
    } else {
      return undefined;
    }
    player.state.x = nearest.x;
    player.state.y = nearest.y;
    player.path = [];
    player.steerDirection = { x: 0, y: 0 };
    return nearest;
  }

  dismountBoat(player: RuntimePlayer): void {
    if (!player.state.boatId) return;
    const boat = this.#boats.find((b) => b.id === player.state.boatId);
    if (!boat) return;
    if (boat.driverId === player.state.id) {
      boat.driverId = null;
    } else {
      const index = boat.passengerIds.indexOf(player.state.id);
      if (index !== -1) boat.passengerIds.splice(index, 1);
    }
    player.state.boatId = null;
  }

  #findNearestBoat(player: RuntimePlayer): BoatRuntime | undefined {
    let nearest: BoatRuntime | undefined;
    let nearestDistance = GRAB_RADIUS;
    for (const boat of this.#boats) {
      const dist = distance(player.state, boat);
      if (dist <= nearestDistance) {
        nearest = boat;
        nearestDistance = dist;
      }
    }
    return nearest;
  }

  moveAlongPath(
    player: RuntimePlayer,
    deltaMs: number,
    floodMultiplier: number,
    finishWhenEmpty: boolean,
  ): void {
    let remainingDistance =
      (HEROES[player.state.heroId as HeroId].movementSpeed * floodMultiplier * deltaMs) / 1_000;
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
    if (finishWhenEmpty && player.path.length === 0) {
      player.state.commandMode = 'idle';
    }
  }
}
