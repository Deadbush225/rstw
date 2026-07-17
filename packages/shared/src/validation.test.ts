import { ROOM_NAME } from './constants.js';
import { ARENA_COLS, ARENA_ROWS, RESCUE_CRATE_POSITION, STORM_BARRIER_DEFINITIONS } from './map.js';
import { describe, expect, it } from 'vitest';
import {
  gameEventSchema,
  joinOptionsSchema,
  playerCommandSchema,
  publicSnapshotSchema,
} from './validation.js';

function validSnapshot(): unknown {
  return {
    tick: 1,
    serverTime: 1_000,
    match: {
      phase: 'active',
      waterPhase: 'PREP_CALM',
      timerRemaining: 480_000,
      mode: 'flood-drill',
      elapsedMs: 100,
      timeLimitMs: 90_000,
      score: 0,
      outcome: null,
      countdownEndsAt: null,
      winnerTeam: null,
      floodStarted: false,
      rematchVotes: 0,
      requiredRematchVotes: 2,
    },
    players: [
      {
        id: 'a',
        name: 'Araw',
        heroId: 'maya',
        team: 'A',
        x: 224,
        y: 448,
        health: 130,
        maxHealth: 130,
        energy: 100,
        maxEnergy: 100,
        alive: true,
        connected: true,
        ready: true,
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
        facing: { x: 1, y: 0 },
        commandMode: 'idle',
      },
    ],
    relay: {
      id: 'weather-relay',
      x: 768,
      y: 448,
      state: 'neutral',
      ownerTeam: null,
      captureTeam: null,
      captureProgress: 0,
    },
    pump: {
      id: 'barangay-pump',
      x: 608,
      y: 96,
      state: 'offline',
      activatedByTeam: null,
    },
    props: [
      {
        id: 'rescue-crate',
        kind: 'rescue-crate',
        ...RESCUE_CRATE_POSITION,
        grabbedBy: null,
      },
    ],
    stormBarriers: STORM_BARRIER_DEFINITIONS.map((barrier) => ({
      id: barrier.id,
      x: barrier.x,
      y: barrier.y,
      angle: barrier.initialAngle,
      length: barrier.length,
      width: barrier.width,
    })),
    core: {
      id: 'resilience-core',
      status: 'locked',
      x: 768,
      y: 448,
      carrierId: null,
      earnedByTeam: null,
    },
    beacons: [
      { id: 'beacon:A', team: 'A', x: 96, y: 448 },
      { id: 'beacon:B', team: 'B', x: 1_440, y: 448 },
    ],
    floodLevels: Array.from({ length: ARENA_COLS * ARENA_ROWS }, () => 0),
    waterGrid: Array.from({ length: ARENA_COLS * ARENA_ROWS }, () => ({
      waterLevel: 0,
      isBlocked: false,
    })),
  };
}

describe('server payload schemas', () => {
  it('keeps both match modes on the fixed signal_zero room contract', () => {
    expect(ROOM_NAME).toBe('signal_zero');
  });

  it('accepts explicit mode and responder choices while rejecting invented heroes', () => {
    expect(
      joinOptionsSchema.safeParse({ name: ' Maya ', mode: 'flood-drill', heroId: 'maya' }).data,
    ).toEqual({ name: 'Maya', mode: 'flood-drill', heroId: 'maya' });
    expect(
      joinOptionsSchema.safeParse({ name: 'Tomas', mode: 'versus', heroId: 'tomas' }).success,
    ).toBe(true);
    expect(
      joinOptionsSchema.safeParse({ name: 'Unknown', mode: 'versus', heroId: 'invented' }).success,
    ).toBe(false);
    expect(joinOptionsSchema.safeParse({ name: 'Legacy' }).success).toBe(false);
  });

  it('accepts a complete public snapshot and rejects malformed nested state', () => {
    expect(publicSnapshotSchema.safeParse(validSnapshot()).success).toBe(true);

    const malformed = validSnapshot() as { match: { phase: string }; floodLevels: number[] };
    malformed.match.phase = 'invented-phase';
    malformed.floodLevels[0] = 99;
    expect(publicSnapshotSchema.safeParse(malformed).success).toBe(false);
  });

  it('rejects unknown event variants and illegal event payloads', () => {
    expect(
      gameEventSchema.safeParse({
        type: 'HIT',
        at: 100,
        sourceId: 'a',
        targetId: 'b',
        damage: 20,
        attackKind: 'basic',
      }).success,
    ).toBe(true);
    expect(gameEventSchema.safeParse({ type: 'HIT', at: 100, damage: -1 }).success).toBe(false);
    expect(gameEventSchema.safeParse({ type: 'ADMIN_OVERRIDE', at: 100 }).success).toBe(false);
  });

  it('validates normalized party-physics commands at the trust boundary', () => {
    const base = { playerId: 'a', sequence: 1, clientTimestamp: 1_000 };
    expect(
      playerCommandSchema.safeParse({
        ...base,
        type: 'STEER',
        direction: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      }).success,
    ).toBe(true);
    expect(
      playerCommandSchema.safeParse({
        ...base,
        type: 'STEER',
        direction: { x: 1, y: 1 },
      }).success,
    ).toBe(false);
    expect(playerCommandSchema.safeParse({ ...base, type: 'JUMP' }).success).toBe(true);
    expect(
      playerCommandSchema.safeParse({ ...base, type: 'DIVE', direction: { x: 0, y: 0 } }).success,
    ).toBe(false);
    expect(
      playerCommandSchema.safeParse({ ...base, type: 'GRAB', targetId: 'rescue-crate' }).success,
    ).toBe(true);
  });

  it('accepts party-physics events and rejects illegal hazard ids', () => {
    expect(
      gameEventSchema.safeParse({
        type: 'HAZARD_HIT',
        at: 1_000,
        playerId: 'a',
        hazardId: 'storm-barrier:north',
        knockback: { x: 32, y: 0 },
      }).success,
    ).toBe(true);
    expect(
      gameEventSchema.safeParse({
        type: 'HAZARD_HIT',
        at: 1_000,
        playerId: 'a',
        hazardId: 'storm-barrier:invented',
        knockback: { x: 32, y: 0 },
      }).success,
    ).toBe(false);
  });
});
