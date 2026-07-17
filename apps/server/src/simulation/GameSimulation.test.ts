import {
  ABILITIES,
  BEACON_POSITIONS,
  DIVE_COOLDOWN_MS,
  HEROES,
  MATCH_COUNTDOWN_MS,
  PUMP_POSITION,
  PROTOTYPE_HERO,
  RELAY_POSITION,
  RESCUE_CRATE_POSITION,
  SIMULATION_STEP_MS,
  STORM_BARRIER_DEFINITIONS,
  type PlayerCommand,
} from '@signal-zero/shared';
import { describe, expect, it } from 'vitest';
import { GameSimulation } from './GameSimulation.js';

function stepUntil(simulation: GameSimulation, predicate: () => boolean, maximumSteps = 500): void {
  for (let step = 0; step < maximumSteps && !predicate(); step += 1) {
    simulation.step(SIMULATION_STEP_MS);
  }
  expect(predicate()).toBe(true);
}

function activeSimulation(): GameSimulation {
  const simulation = new GameSimulation(1_000_000, 'versus');
  expect(simulation.addPlayer('player-a', 'Araw')).toMatchObject({ accepted: true, team: 'A' });
  expect(simulation.addPlayer('player-b', 'Bagwis')).toMatchObject({ accepted: true, team: 'B' });
  expect(simulation.setReady('player-a', true).accepted).toBe(true);
  expect(simulation.setReady('player-b', true).accepted).toBe(true);
  expect(simulation.phase).toBe('countdown');
  for (let elapsed = 0; elapsed < MATCH_COUNTDOWN_MS; elapsed += SIMULATION_STEP_MS) {
    simulation.step(SIMULATION_STEP_MS);
  }
  expect(simulation.phase).toBe('active');
  simulation.drainEvents();
  return simulation;
}

function command<T extends PlayerCommand>(value: T): T {
  return value;
}

describe('pure authoritative match simulation', () => {
  it('runs a scored Flood Drill with a pump, Bayanihan Pulse, and a timeout', () => {
    const simulation = new GameSimulation(0, 'flood-drill');
    simulation.addPlayer('player-a', 'Araw');
    simulation.setReady('player-a', true);
    stepUntil(simulation, () => simulation.phase === 'active');
    expect(simulation.getSnapshot().match).toMatchObject({
      mode: 'flood-drill',
      timeLimitMs: 90_000,
      score: 0,
    });
    expect(
      simulation.applyCommand(
        command({
          type: 'INTERACT',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
          targetId: 'barangay-pump',
        }),
      ),
    ).toMatchObject({
      accepted: false,
      reason: 'Bring the rescue crate onto the Barangay Pump pressure zone',
    });

    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          destination: RESCUE_CRATE_POSITION,
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(
      simulation,
      () =>
        simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.destination ===
        null,
    );
    expect(
      simulation.applyCommand(
        command({
          type: 'GRAB',
          playerId: 'player-a',
          sequence: 3,
          clientTimestamp: simulation.now,
          targetId: 'rescue-crate',
        }),
      ).accepted,
    ).toBe(true);
    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-a',
          sequence: 4,
          clientTimestamp: simulation.now,
          destination: PUMP_POSITION,
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(simulation, () => simulation.getSnapshot().pump.state === 'active', 1_000);
    expect(simulation.getSnapshot()).toMatchObject({
      pump: { state: 'active', activatedByTeam: 'A' },
      match: { score: 400 },
    });

    expect(
      simulation.applyCommand(
        command({
          type: 'CAST_ABILITY',
          playerId: 'player-a',
          sequence: 5,
          clientTimestamp: simulation.now,
          slot: 'W',
        }),
      ).accepted,
    ).toBe(true);
    const playerAfterPulse = simulation
      .getSnapshot()
      .players.find((player) => player.id === 'player-a');
    expect(playerAfterPulse?.floodImmuneUntil).toBeGreaterThan(simulation.now);
    expect(playerAfterPulse?.energy).toBe(PROTOTYPE_HERO.maxEnergy - ABILITIES.W.energyCost);

    for (let elapsed = 0; elapsed <= 90_000; elapsed += SIMULATION_STEP_MS) {
      simulation.step(SIMULATION_STEP_MS);
    }
    expect(simulation.getSnapshot().match).toMatchObject({
      phase: 'ended',
      outcome: 'time-expired',
      elapsedMs: 90_000,
    });
  });

  it('starts a solo practice round when one responder is ready', () => {
    const simulation = new GameSimulation(0, 'flood-drill');
    simulation.addPlayer('player-a', 'Araw');
    expect(simulation.setReady('player-a', true).accepted).toBe(true);
    expect(simulation.phase).toBe('countdown');

    for (let elapsed = 0; elapsed < MATCH_COUNTDOWN_MS; elapsed += SIMULATION_STEP_MS) {
      simulation.step(SIMULATION_STEP_MS);
    }

    expect(simulation.getSnapshot().match).toMatchObject({
      phase: 'active',
      mode: 'flood-drill',
      timeLimitMs: 90_000,
      requiredRematchVotes: 1,
    });
  });

  it('requires two ready responders for explicit multiplayer and never downgrades it to solo', () => {
    const simulation = new GameSimulation(0, 'versus');
    expect(simulation.addPlayer('player-a', 'Araw', 'maya').accepted).toBe(true);
    expect(simulation.setReady('player-a', true).accepted).toBe(true);
    expect(simulation.phase).toBe('waiting');
    expect(simulation.getSnapshot().match).toMatchObject({ mode: 'versus', timeLimitMs: null });

    expect(simulation.addPlayer('player-b', 'Bagwis', 'tomas').accepted).toBe(true);
    expect(simulation.phase).toBe('waiting');
    expect(simulation.setReady('player-b', true).accepted).toBe(true);
    expect(simulation.phase).toBe('countdown');
    stepUntil(simulation, () => simulation.phase === 'active');
    expect(simulation.getSnapshot().match).toMatchObject({ mode: 'versus', timeLimitMs: null });
  });

  it('enforces the explicit solo capacity and applies authoritative responder stats', () => {
    const solo = new GameSimulation(0, 'flood-drill');
    expect(solo.addPlayer('player-a', 'Kidlat', 'kidlat').accepted).toBe(true);
    expect(solo.addPlayer('player-b', 'Tomas', 'tomas')).toMatchObject({
      accepted: false,
      reason: 'Room is full',
    });
    expect(solo.getSnapshot().players[0]).toMatchObject({
      heroId: 'kidlat',
      health: HEROES.kidlat.maxHealth,
      maxHealth: HEROES.kidlat.maxHealth,
      energy: HEROES.kidlat.maxEnergy,
      maxEnergy: HEROES.kidlat.maxEnergy,
    });

    const roster = new GameSimulation();
    expect(roster.addPlayer('unknown', 'Unknown', 'invented')).toMatchObject({
      accepted: false,
      reason: 'Unknown responder',
    });
    expect(roster.addPlayer('amihan', 'Amihan', 'amihan').accepted).toBe(true);
    expect(roster.getSnapshot().players[0]).toMatchObject({
      heroId: 'amihan',
      maxHealth: HEROES.amihan.maxHealth,
      maxEnergy: HEROES.amihan.maxEnergy,
    });

    const positionsAfterSteering = (heroId: 'tomas' | 'kidlat'): number => {
      const simulation = new GameSimulation(0, 'flood-drill');
      simulation.addPlayer(heroId, heroId, heroId);
      simulation.setReady(heroId, true);
      stepUntil(simulation, () => simulation.phase === 'active');
      simulation.applyCommand(
        command({
          type: 'STEER',
          playerId: heroId,
          sequence: 1,
          clientTimestamp: simulation.now,
          direction: { x: 1, y: 0 },
        }),
      );
      for (let step = 0; step < 10; step += 1) simulation.step(SIMULATION_STEP_MS);
      return simulation.getSnapshot().players[0]?.x ?? 0;
    };
    expect(positionsAfterSteering('kidlat')).toBeGreaterThan(positionsAfterSteering('tomas'));
  });

  it('runs capture, core delivery, victory, and rematch as one complete loop', () => {
    const simulation = activeSimulation();
    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
          destination: RELAY_POSITION,
        }),
      ).accepted,
    ).toBe(true);

    stepUntil(simulation, () => simulation.getSnapshot().relay.state === 'captured');
    expect(simulation.getSnapshot().relay.ownerTeam).toBe('A');
    expect(simulation.getSnapshot().core.status).toBe('available');
    stepUntil(simulation, () => simulation.getSnapshot().match.floodStarted);
    expect(simulation.getSnapshot().match.floodStarted).toBe(true);

    expect(
      simulation.applyCommand(
        command({
          type: 'INTERACT',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          targetId: 'resilience-core',
        }),
      ).accepted,
    ).toBe(true);
    expect(
      simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.hasCore,
    ).toBe(true);

    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-a',
          sequence: 3,
          clientTimestamp: simulation.now,
          destination: BEACON_POSITIONS.A,
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(simulation, () => {
      const player = simulation
        .getSnapshot()
        .players.find((candidate) => candidate.id === 'player-a');
      return player?.destination === null;
    });

    expect(
      simulation.applyCommand(
        command({
          type: 'INTERACT',
          playerId: 'player-a',
          sequence: 4,
          clientTimestamp: simulation.now,
          targetId: 'beacon:A',
        }),
      ).accepted,
    ).toBe(true);
    expect(simulation.getSnapshot().match).toMatchObject({ phase: 'ended', winnerTeam: 'A' });
    expect(simulation.drainEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining(['RELAY_CAPTURED', 'CORE_PICKED_UP', 'CORE_DEPOSITED', 'MATCH_WON']),
    );

    expect(simulation.voteRematch('player-a').accepted).toBe(true);
    expect(simulation.voteRematch('player-b').accepted).toBe(true);
    expect(simulation.phase).toBe('countdown');
    for (let elapsed = 0; elapsed < MATCH_COUNTDOWN_MS; elapsed += SIMULATION_STEP_MS) {
      simulation.step(SIMULATION_STEP_MS);
    }
    expect(simulation.getSnapshot().match).toMatchObject({ phase: 'active', winnerTeam: null });
    expect(simulation.getSnapshot().relay.state).toBe('neutral');
    expect(simulation.getSnapshot().core.status).toBe('locked');
  });

  it('executes Rescue Line damage and enforces cost, cooldown, range, and obstruction', () => {
    const simulation = activeSimulation();
    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-b',
          sequence: 1,
          clientTimestamp: simulation.now,
          destination: { x: 500, y: 448 },
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(simulation, () => {
      const player = simulation
        .getSnapshot()
        .players.find((candidate) => candidate.id === 'player-b');
      return player?.destination === null;
    });

    const cast = simulation.applyCommand(
      command({
        type: 'CAST_ABILITY',
        playerId: 'player-a',
        sequence: 2,
        clientTimestamp: simulation.now,
        slot: 'Q',
        targetPoint: { x: 550, y: 448 },
      }),
    );
    expect(cast.accepted).toBe(true);
    const snapshot = simulation.getSnapshot();
    const caster = snapshot.players.find((player) => player.id === 'player-a');
    const target = snapshot.players.find((player) => player.id === 'player-b');
    expect(caster?.energy).toBe(PROTOTYPE_HERO.maxEnergy - ABILITIES.Q.energyCost);
    expect(caster?.floodImmuneUntil).toBe(simulation.now + 2_000);
    expect(target?.health).toBe(PROTOTYPE_HERO.maxHealth - 30);

    expect(
      simulation.applyCommand(
        command({
          type: 'CAST_ABILITY',
          playerId: 'player-a',
          sequence: 3,
          clientTimestamp: simulation.now,
          slot: 'Q',
          targetPoint: { x: 560, y: 448 },
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'Rescue Line is on cooldown' });

    const freshSimulation = activeSimulation();
    expect(
      freshSimulation.applyCommand(
        command({
          type: 'CAST_ABILITY',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: freshSimulation.now,
          slot: 'Q',
          targetPoint: { x: 700, y: 448 },
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'Target point is out of range' });
    expect(
      freshSimulation.applyCommand(
        command({
          type: 'CAST_ABILITY',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: freshSimulation.now,
          slot: 'Q',
          targetPoint: { x: 350, y: 200 },
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'Rescue Line route is blocked' });
  });

  it('applies authoritative basic damage, defeat, and timed respawn', () => {
    const simulation = activeSimulation();
    expect(
      simulation.applyCommand(
        command({
          type: 'ATTACK_TARGET',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
          targetId: 'player-b',
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'Target is too far away' });
    for (const [playerId, destination] of [
      ['player-a', { x: 980, y: 448 }],
      ['player-b', { x: 1_100, y: 448 }],
    ] as const) {
      expect(
        simulation.applyCommand(
          command({
            type: 'MOVE',
            playerId,
            sequence: 1,
            clientTimestamp: simulation.now,
            destination,
          }),
        ).accepted,
      ).toBe(true);
    }
    stepUntil(simulation, () =>
      simulation.getSnapshot().players.every((player) => player.destination === null),
    );

    expect(
      simulation.applyCommand(
        command({
          type: 'ATTACK_TARGET',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          targetId: 'player-b',
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(
      simulation,
      () =>
        simulation.getSnapshot().players.find((player) => player.id === 'player-b')?.alive ===
        false,
    );
    const defeated = simulation.getSnapshot().players.find((player) => player.id === 'player-b');
    expect(defeated).toMatchObject({ alive: false, health: 0 });
    expect(defeated?.respawnAt).not.toBeNull();

    stepUntil(
      simulation,
      () =>
        simulation.getSnapshot().players.find((player) => player.id === 'player-b')?.alive === true,
      100,
    );
    expect(
      simulation.getSnapshot().players.find((player) => player.id === 'player-b'),
    ).toMatchObject({
      alive: true,
      health: PROTOTYPE_HERO.maxHealth,
      respawnAt: null,
    });
  });

  it('cancels a countdown when a required player disconnects', () => {
    const simulation = new GameSimulation();
    simulation.addPlayer('player-a', 'Araw');
    simulation.addPlayer('player-b', 'Bagwis');
    simulation.setReady('player-a', true);
    simulation.setReady('player-b', true);
    expect(simulation.phase).toBe('countdown');

    simulation.setConnected('player-b', false);
    expect(simulation.phase).toBe('waiting');
    expect(
      simulation.getSnapshot().players.find((player) => player.id === 'player-b'),
    ).toMatchObject({
      connected: false,
    });
  });

  it('steers at the authoritative tick and collides with buildings axis by axis', () => {
    const simulation = activeSimulation();
    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
          destination: { x: 352, y: 544 },
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(
      simulation,
      () =>
        simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.destination ===
        null,
    );
    expect(
      simulation.applyCommand(
        command({
          type: 'STEER',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          direction: { x: 0, y: 1 },
        }),
      ).accepted,
    ).toBe(true);
    for (let step = 0; step < 30; step += 1) simulation.step(SIMULATION_STEP_MS);
    const blocked = simulation.getSnapshot().players.find((player) => player.id === 'player-a');
    expect(blocked?.y).toBeLessThan(576 - 21);
    expect(blocked).toMatchObject({ commandMode: 'steering', facing: { x: 0, y: 1 } });

    simulation.applyCommand(
      command({
        type: 'STEER',
        playerId: 'player-a',
        sequence: 3,
        clientTimestamp: simulation.now,
        direction: { x: 0, y: 0 },
      }),
    );
    const stoppedAt = simulation.getSnapshot().players.find((player) => player.id === 'player-a');
    simulation.step(SIMULATION_STEP_MS);
    expect(
      simulation.getSnapshot().players.find((player) => player.id === 'player-a'),
    ).toMatchObject({ x: stoppedAt?.x, y: stoppedAt?.y, commandMode: 'idle' });
  });

  it('jumps under gravity and emits deterministic jump and landing events', () => {
    const simulation = activeSimulation();
    expect(
      simulation.applyCommand(
        command({
          type: 'JUMP',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
        }),
      ).accepted,
    ).toBe(true);
    simulation.step(SIMULATION_STEP_MS);
    expect(
      simulation.getSnapshot().players.find((player) => player.id === 'player-a'),
    ).toMatchObject({ grounded: false });
    expect(
      simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.elevation,
    ).toBeGreaterThan(0);
    stepUntil(
      simulation,
      () =>
        simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.grounded ===
        true,
      40,
    );
    expect(simulation.drainEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining(['JUMPED', 'LANDED']),
    );
  });

  it('executes a server-owned dive burst and enforces its cooldown and recovery', () => {
    const simulation = activeSimulation();
    const startX = simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.x;
    expect(
      simulation.applyCommand(
        command({
          type: 'DIVE',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
          direction: { x: 1, y: 0 },
        }),
      ).accepted,
    ).toBe(true);
    simulation.step(SIMULATION_STEP_MS);
    const diving = simulation.getSnapshot().players.find((player) => player.id === 'player-a');
    expect(diving?.x).toBeGreaterThan(startX ?? 0);
    expect(diving).toMatchObject({ commandMode: 'diving' });
    expect(
      simulation.applyCommand(
        command({
          type: 'DIVE',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          direction: { x: 1, y: 0 },
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'Dive is on cooldown' });

    while (simulation.now < (diving?.diveCooldownEndsAt ?? simulation.now + DIVE_COOLDOWN_MS)) {
      simulation.step(SIMULATION_STEP_MS);
    }
    expect(
      simulation.applyCommand(
        command({
          type: 'DIVE',
          playerId: 'player-a',
          sequence: 3,
          clientTimestamp: simulation.now,
          direction: { x: 1, y: 0 },
        }),
      ).accepted,
    ).toBe(true);
  });

  it('grabs and releases the rescue crate authoritatively', () => {
    const simulation = activeSimulation();
    simulation.applyCommand(
      command({
        type: 'MOVE',
        playerId: 'player-a',
        sequence: 1,
        clientTimestamp: simulation.now,
        destination: RESCUE_CRATE_POSITION,
      }),
    );
    stepUntil(
      simulation,
      () =>
        simulation.getSnapshot().players.find((player) => player.id === 'player-a')?.destination ===
        null,
    );
    expect(
      simulation.applyCommand(
        command({
          type: 'GRAB',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          targetId: 'rescue-crate',
        }),
      ).accepted,
    ).toBe(true);
    expect(simulation.getSnapshot()).toMatchObject({
      props: [{ id: 'rescue-crate', grabbedBy: 'player-a' }],
      players: expect.arrayContaining([
        expect.objectContaining({ id: 'player-a', grabbedObjectId: 'rescue-crate' }),
      ]),
    });
    expect(
      simulation.applyCommand(
        command({
          type: 'GRAB',
          playerId: 'player-a',
          sequence: 3,
          clientTimestamp: simulation.now,
        }),
      ).accepted,
    ).toBe(true);
    expect(simulation.getSnapshot().props[0]).toMatchObject({ grabbedBy: null });
    expect(simulation.drainEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining(['PROP_GRABBED', 'PROP_RELEASED']),
    );
  });

  it('rotates storm barriers deterministically and applies knockback plus stumble', () => {
    const simulation = activeSimulation();
    const twin = activeSimulation();
    for (let step = 0; step < 20; step += 1) {
      simulation.step(SIMULATION_STEP_MS);
      twin.step(SIMULATION_STEP_MS);
    }
    expect(twin.getSnapshot().stormBarriers).toEqual(simulation.getSnapshot().stormBarriers);
    const initialAngle = simulation.getSnapshot().stormBarriers[0]?.angle;
    const barrier = STORM_BARRIER_DEFINITIONS[0];
    simulation.applyCommand(
      command({
        type: 'MOVE',
        playerId: 'player-a',
        sequence: 1,
        clientTimestamp: simulation.now,
        destination: { x: barrier.x, y: barrier.y },
      }),
    );
    stepUntil(
      simulation,
      () => {
        const player = simulation
          .getSnapshot()
          .players.find((candidate) => candidate.id === 'player-a');
        return (player?.stumbleUntil ?? 0) > simulation.now;
      },
      500,
    );
    expect(simulation.getSnapshot().stormBarriers[0]?.angle).not.toBe(initialAngle);
    expect(simulation.drainEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'HAZARD_HIT',
          playerId: 'player-a',
          hazardId: barrier.id,
        }),
      ]),
    );
  });

  it('enforces core and beacon ownership, repeated interaction, and exact disconnect drops', () => {
    const simulation = activeSimulation();
    expect(
      simulation.applyCommand(
        command({
          type: 'MOVE',
          playerId: 'player-a',
          sequence: 1,
          clientTimestamp: simulation.now,
          destination: RELAY_POSITION,
        }),
      ).accepted,
    ).toBe(true);
    stepUntil(simulation, () => simulation.getSnapshot().core.status === 'available');

    expect(
      simulation.applyCommand(
        command({
          type: 'INTERACT',
          playerId: 'player-b',
          sequence: 1,
          clientTimestamp: simulation.now,
          targetId: 'resilience-core',
        }),
      ),
    ).toMatchObject({ accepted: false, reason: 'The opposing team earned this Resilience Core' });

    expect(
      simulation.applyCommand(
        command({
          type: 'INTERACT',
          playerId: 'player-a',
          sequence: 2,
          clientTimestamp: simulation.now,
          targetId: 'resilience-core',
        }),
      ).accepted,
    ).toBe(true);
    for (const targetId of ['resilience-core', 'beacon:B']) {
      expect(
        simulation.applyCommand(
          command({
            type: 'INTERACT',
            playerId: 'player-a',
            sequence: targetId === 'resilience-core' ? 3 : 4,
            clientTimestamp: simulation.now,
            targetId,
          }),
        ),
      ).toMatchObject({
        accepted: false,
        reason: 'The core must be delivered to your own Bayanihan Beacon',
      });
    }

    const carrier = simulation.getSnapshot().players.find((player) => player.id === 'player-a');
    expect(carrier).toBeDefined();
    expect(simulation.setConnected('player-a', false)).toBe(true);
    expect(simulation.getSnapshot().core).toMatchObject({
      status: 'available',
      carrierId: null,
      x: carrier?.x,
      y: carrier?.y,
    });
    expect(simulation.drainEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CORE_DROPPED',
          playerId: 'player-a',
          position: { x: carrier?.x, y: carrier?.y },
        }),
      ]),
    );
  });
});
