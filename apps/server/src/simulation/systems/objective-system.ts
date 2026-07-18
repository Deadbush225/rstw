import {
  BEACON_INTERACT_RADIUS,
  BEACON_POSITIONS,
  CORE_INTERACT_RADIUS,
  distance,
  GENERATOR_POSITION,
  GRAB_RADIUS,
  PUMP_DRAIN_INTERVAL_MS,
  PUMP_FLOOD_DELAY_MS,
  PUMP_PRESSURE_RADIUS,
  PUMP_POSITION,
  RELAY_CAPTURE_MS,
  RELAY_CAPTURE_RADIUS,
  RELAY_POSITION,
  SANDBAG_POSITION,
  type GameEvent,
  type InteractiveObject,
  type PublicBeaconState,
  type PublicCoreState,
  type PublicPumpState,
  type PublicRelayState,
  type TeamId,
} from '@signal-zero/shared';
import type { RuntimePlayer, SimulationCommandResult } from '../orchestrator/simulation-context.js';

function copyPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

/**
 * Relay capture, Core pickup/drop/deposit, Beacon interaction, Pump activation.
 */
export class ObjectiveSystem {
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
  readonly #interactiveObjects: InteractiveObject[] = [
    { id: 'sandbag-pile', kind: 'sandbag-pile', ...copyPoint(SANDBAG_POSITION), available: true },
    { id: 'generator', kind: 'generator', ...copyPoint(GENERATOR_POSITION), available: true },
  ];

  #nextPumpDrainAt: number | null = null;
  #nextFloodStepAt: number | null = null;
  #winnerTeam: TeamId | null = null;
  #outcome: 'success' | 'time-expired' | null = null;
  #timeLimitMs: number | null = null;
  #elapsedMs = 0;

  get beacons(): readonly PublicBeaconState[] {
    return this.#beacons;
  }
  get relay(): PublicRelayState {
    return { ...this.#relay };
  }
  get core(): PublicCoreState {
    return { ...this.#core };
  }
  get pump(): PublicPumpState {
    return { ...this.#pump };
  }
  get interactiveObjects(): readonly InteractiveObject[] {
    return this.#interactiveObjects;
  }
  get winnerTeam(): TeamId | null {
    return this.#winnerTeam;
  }
  get outcome(): 'success' | 'time-expired' | null {
    return this.#outcome;
  }

  setMatchState(_phase: 'waiting' | 'countdown' | 'active' | 'ended', elapsedMs: number, timeLimitMs: number | null): void {
    this.#elapsedMs = elapsedMs;
    this.#timeLimitMs = timeLimitMs;
  }

  setFloodTiming(nextFloodStepAt: number | null): void {
    this.#nextFloodStepAt = nextFloodStepAt;
  }

  getFloodTiming(): number | null {
    return this.#nextFloodStepAt;
  }

  getPumpDrainTiming(): number | null {
    return this.#nextPumpDrainAt;
  }

  setPumpDrainTiming(value: number | null): void {
    this.#nextPumpDrainAt = value;
  }

  reset(): void {
    this.#winnerTeam = null;
    this.#outcome = null;
    this.#timeLimitMs = null;
    this.#elapsedMs = 0;
    this.#nextFloodStepAt = null;
    this.#nextPumpDrainAt = null;
    Object.assign(this.#relay, {
      state: 'neutral',
      ownerTeam: null,
      captureTeam: null,
      captureProgress: 0,
    });
    Object.assign(this.#core, {
      status: 'locked',
      ...copyPoint(RELAY_POSITION),
      carrierId: null,
      earnedByTeam: null,
    });
    Object.assign(this.#pump, {
      state: 'offline',
      activatedByTeam: null,
    });
    for (const obj of this.#interactiveObjects) obj.available = true;
  }

  step(
    now: number,
    deltaMs: number,
    players: Iterable<RuntimePlayer>,
    pushEvent: (event: GameEvent) => void,
    addDrillScore: (points: number) => void,
    waterGridDrainAt: (x: number, y: number, radius: number) => void,
  ): void {
    // Pump drainage tick
    if (this.#pump.state === 'active' && this.#nextPumpDrainAt !== null && now >= this.#nextPumpDrainAt) {
      waterGridDrainAt(this.#pump.x, this.#pump.y, PUMP_DRAIN_RADIUS);
      this.#nextPumpDrainAt = now + PUMP_DRAIN_INTERVAL_MS;
    }
    this.#updateRelayCapture(deltaMs, players, pushEvent, addDrillScore);
  }

  interact(
    player: RuntimePlayer,
    requestedTargetId: string | undefined,
    now: number,
    pushEvent: (event: GameEvent) => void,
    addDrillScore: (points: number) => void,
    waterGridPlaceSandbag: (x: number, y: number) => boolean,
  ): SimulationCommandResult {
    // Sandbag placement
    if (player.state.heldItem === 'SANDBAG') {
      const placed = waterGridPlaceSandbag(player.state.x, player.state.y);
      if (!placed) return { accepted: false, reason: 'Cannot place a sandbag at this location' };
      player.state.heldItem = 'NONE';
      addDrillScore(50);
      return { accepted: true };
    }

    // Generator + Pump activation
    if (player.state.heldItem === 'GENERATOR') {
      if (distance(player.state, this.#pump) > PUMP_PRESSURE_RADIUS) {
        return { accepted: false, reason: 'Bring the generator closer to the Barangay Pump' };
      }
      if (this.#pump.state === 'active') return { accepted: false, reason: 'Pump is already active' };
      this.#activatePumpFromGenerator(player, now, pushEvent, addDrillScore);
      return { accepted: true };
    }

    if (requestedTargetId === this.#pump.id) {
      return { accepted: false, reason: 'Bring the rescue crate onto the Barangay Pump pressure zone' };
    }
    if (requestedTargetId === 'weather-relay') {
      return distance(player.state, this.#relay) <= RELAY_CAPTURE_RADIUS
        ? { accepted: true }
        : { accepted: false, reason: 'Weather Relay is out of interaction range' };
    }

    const ownBeaconId = `beacon:${player.state.team}` as const;
    if (player.state.hasCore) {
      if (requestedTargetId && requestedTargetId !== ownBeaconId) {
        return { accepted: false, reason: 'The core must be delivered to your own Bayanihan Beacon' };
      }
      const beacon = BEACON_POSITIONS[player.state.team];
      if (distance(player.state, beacon) > BEACON_INTERACT_RADIUS) {
        return { accepted: false, reason: 'Bayanihan Beacon is out of interaction range' };
      }
      this.#depositCore(player, now, pushEvent, addDrillScore);
      return { accepted: true };
    }

    // Sandbag pile pickup
    if (this.#interactiveObjects[0]?.available) {
      const sandbagPile = this.#interactiveObjects[0];
      if (distance(player.state, sandbagPile) <= GRAB_RADIUS) {
        sandbagPile.available = false;
        player.state.heldItem = 'SANDBAG';
        return { accepted: true };
      }
    }

    // Generator pickup
    if (this.#interactiveObjects[1]?.available) {
      const generator = this.#interactiveObjects[1];
      if (distance(player.state, generator) <= GRAB_RADIUS) {
        generator.available = false;
        player.state.heldItem = 'GENERATOR';
        return { accepted: true };
      }
    }

    if (requestedTargetId?.startsWith('beacon:'))
      return { accepted: false, reason: 'This player is not carrying the core' };
    if (requestedTargetId && requestedTargetId !== this.#core.id) {
      return { accepted: false, reason: 'Unknown interaction target' };
    }
    if (this.#core.status !== 'available') return { accepted: false, reason: 'Resilience Core is not available' };
    if (this.#core.earnedByTeam !== player.state.team) {
      return { accepted: false, reason: 'The opposing team earned this Resilience Core' };
    }
    if (distance(player.state, this.#core) > CORE_INTERACT_RADIUS) {
      return { accepted: false, reason: 'Resilience Core is out of interaction range' };
    }
    this.#core.status = 'carried';
    this.#core.carrierId = player.state.id;
    player.state.hasCore = true;
    addDrillScore(200);
    pushEvent({ type: 'CORE_PICKED_UP', at: now, playerId: player.state.id });
    return { accepted: true };
  }

  /** Check if crate is near pump and activate. */
  checkPumpPressure(crateGrabbedBy: string | null, crateLastHandledBy: string | null, cratePos: { x: number; y: number }, players: Map<string, RuntimePlayer>, now: number, pushEvent: (event: GameEvent) => void, addDrillScore: (points: number) => void): void {
    if (this.#pump.state === 'active') return;
    if (distance(cratePos, this.#pump) > PUMP_PRESSURE_RADIUS) return;
    const playerId = crateGrabbedBy ?? crateLastHandledBy;
    const player = playerId ? players.get(playerId) : undefined;
    if (player) this.#activatePumpFromCrate(player, now, pushEvent, addDrillScore);
  }

  #activatePumpFromCrate(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: GameEvent) => void,
    addDrillScore: (points: number) => void,
  ): void {
    if (this.#pump.state === 'active') return;
    this.#pump.state = 'active';
    this.#pump.activatedByTeam = player.state.team;
    if (this.#nextFloodStepAt !== null) this.#nextFloodStepAt += PUMP_FLOOD_DELAY_MS;
    addDrillScore(400);
    pushEvent({
      type: 'PUMP_ACTIVATED',
      at: now,
      playerId: player.state.id,
      team: player.state.team,
    });
  }

  #activatePumpFromGenerator(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: GameEvent) => void,
    addDrillScore: (points: number) => void,
  ): void {
    if (this.#pump.state === 'active') return;
    this.#pump.state = 'active';
    this.#pump.activatedByTeam = player.state.team;
    player.state.heldItem = 'NONE';
    this.#nextPumpDrainAt = now + PUMP_DRAIN_INTERVAL_MS;
    addDrillScore(400);
    pushEvent({
      type: 'PUMP_ACTIVATED',
      at: now,
      playerId: player.state.id,
      team: player.state.team,
    });
  }

  #depositCore(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: GameEvent) => void,
    addDrillScore: (points: number) => void,
  ): void {
    player.state.hasCore = false;
    this.#core.status = 'deposited';
    this.#core.carrierId = null;
    this.#core.x = BEACON_POSITIONS[player.state.team].x;
    this.#core.y = BEACON_POSITIONS[player.state.team].y;
    this.#winnerTeam = player.state.team;
    this.#outcome = 'success';
    addDrillScore(
      1_000 + Math.max(0, Math.floor(((this.#timeLimitMs ?? 0) - this.#elapsedMs) / 100)),
    );
    pushEvent({
      type: 'CORE_DEPOSITED',
      at: now,
      playerId: player.state.id,
      team: player.state.team,
    });
    pushEvent({ type: 'MATCH_WON', at: now, team: player.state.team });
  }

  #updateRelayCapture(
    deltaMs: number,
    players: Iterable<RuntimePlayer>,
    pushEvent: (event: GameEvent) => void,
    addDrillScore: (points: number) => void,
  ): void {
    if (this.#relay.state === 'captured') return;
    const teamsPresent = new Set<TeamId>();
    for (const player of players) {
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
    addDrillScore(300);
    pushEvent({ type: 'RELAY_CAPTURED', at: 0, team: presentTeam });
  }

  dropCore(player: RuntimePlayer, now: number, pushEvent: (event: GameEvent) => void): void {
    if (!player.state.hasCore) return;
    player.state.hasCore = false;
    this.#core.status = 'available';
    this.#core.carrierId = null;
    this.#core.x = player.state.x;
    this.#core.y = player.state.y;
    pushEvent({
      type: 'CORE_DROPPED',
      at: now,
      playerId: player.state.id,
      position: copyPoint(player.state),
    });
  }
}

// Re-export for use in prop-system pump pressure checks
import { PUMP_DRAIN_RADIUS } from '@signal-zero/shared';
