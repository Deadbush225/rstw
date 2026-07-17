import { z } from 'zod';

import { FLOOD_MAX_LEVEL, HERO_IDS } from './constants.js';
import { ARENA_COLS, ARENA_ROWS } from './map.js';

const finiteCoordinate = z.number().finite().min(-10_000).max(10_000);
const vectorSchema = z.object({ x: finiteCoordinate, y: finiteCoordinate }).strict();
const normalizedDirectionSchema = vectorSchema.refine(
  (direction) => Math.hypot(direction.x, direction.y) <= 1.001,
  'Direction magnitude must not exceed 1',
);
const nonZeroDirectionSchema = normalizedDirectionSchema.refine(
  (direction) => Math.hypot(direction.x, direction.y) > 0.001,
  'Direction must not be zero',
);
const teamSchema = z.enum(['A', 'B']);
const heroIdSchema = z.enum(HERO_IDS);
const playerIdSchema = z.string().min(1).max(128);
const baseCommand = {
  playerId: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  clientTimestamp: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
};

export const playerCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...baseCommand, type: z.literal('MOVE'), destination: vectorSchema }).strict(),
  z
    .object({
      ...baseCommand,
      type: z.literal('ATTACK_TARGET'),
      targetId: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ ...baseCommand, type: z.literal('ATTACK_MOVE'), destination: vectorSchema }).strict(),
  z
    .object({
      ...baseCommand,
      type: z.literal('CAST_ABILITY'),
      slot: z.enum(['Q', 'W', 'E', 'R']),
      targetPoint: vectorSchema.optional(),
      targetEntityId: z.string().min(1).max(128).optional(),
    })
    .strict(),
  z
    .object({
      ...baseCommand,
      type: z.literal('INTERACT'),
      targetId: z.string().min(1).max(128).optional(),
    })
    .strict(),
  z.object({ ...baseCommand, type: z.literal('STOP') }).strict(),
  z.object({ ...baseCommand, type: z.literal('HOLD_POSITION') }).strict(),
  z
    .object({ ...baseCommand, type: z.literal('STEER'), direction: normalizedDirectionSchema })
    .strict(),
  z.object({ ...baseCommand, type: z.literal('JUMP') }).strict(),
  z.object({ ...baseCommand, type: z.literal('DIVE'), direction: nonZeroDirectionSchema }).strict(),
  z
    .object({
      ...baseCommand,
      type: z.literal('GRAB'),
      targetId: z.string().min(1).max(128).optional(),
    })
    .strict(),
]);

export const joinOptionsSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    mode: z.enum(['flood-drill', 'versus']),
    heroId: heroIdSchema,
  })
  .strict();

export const readyMessageSchema = z.object({ ready: z.boolean() }).strict();
export const rematchMessageSchema = z.object({ vote: z.literal(true) }).strict();

const publicPlayerStateSchema = z
  .object({
    id: playerIdSchema,
    name: z.string().min(1).max(24),
    heroId: heroIdSchema,
    team: teamSchema,
    x: finiteCoordinate,
    y: finiteCoordinate,
    health: z.number().finite().nonnegative(),
    maxHealth: z.number().finite().positive(),
    energy: z.number().finite().nonnegative(),
    maxEnergy: z.number().finite().positive(),
    alive: z.boolean(),
    connected: z.boolean(),
    ready: z.boolean(),
    respawnAt: z.number().finite().nonnegative().nullable(),
    attackTargetId: playerIdSchema.nullable(),
    destination: vectorSchema.nullable(),
    hasCore: z.boolean(),
    qCooldownEndsAt: z.number().finite().nonnegative(),
    wCooldownEndsAt: z.number().finite().nonnegative(),
    floodImmuneUntil: z.number().finite().nonnegative(),
    elevation: z.number().finite().nonnegative(),
    grounded: z.boolean(),
    stumbleUntil: z.number().finite().nonnegative(),
    diveCooldownEndsAt: z.number().finite().nonnegative(),
    grabbedObjectId: z.string().min(1).max(128).nullable(),
    facing: normalizedDirectionSchema,
    commandMode: z.enum([
      'idle',
      'moving',
      'attacking',
      'attack-moving',
      'holding',
      'steering',
      'diving',
    ]),
  })
  .strict();

const relayStateSchema = z
  .object({
    id: z.literal('weather-relay'),
    x: finiteCoordinate,
    y: finiteCoordinate,
    state: z.enum(['neutral', 'contested', 'capturing', 'captured']),
    ownerTeam: teamSchema.nullable(),
    captureTeam: teamSchema.nullable(),
    captureProgress: z.number().finite().min(0).max(1),
  })
  .strict();

const coreStateSchema = z
  .object({
    id: z.literal('resilience-core'),
    status: z.enum(['locked', 'available', 'carried', 'deposited']),
    x: finiteCoordinate,
    y: finiteCoordinate,
    carrierId: playerIdSchema.nullable(),
    earnedByTeam: teamSchema.nullable(),
  })
  .strict();

const beaconStateSchema = z
  .object({
    id: z.enum(['beacon:A', 'beacon:B']),
    team: teamSchema,
    x: finiteCoordinate,
    y: finiteCoordinate,
  })
  .strict();

const pumpStateSchema = z
  .object({
    id: z.literal('barangay-pump'),
    x: finiteCoordinate,
    y: finiteCoordinate,
    state: z.enum(['offline', 'active']),
    activatedByTeam: teamSchema.nullable(),
  })
  .strict();

const propStateSchema = z
  .object({
    id: z.literal('rescue-crate'),
    kind: z.literal('rescue-crate'),
    x: finiteCoordinate,
    y: finiteCoordinate,
    grabbedBy: playerIdSchema.nullable(),
  })
  .strict();

const stormBarrierStateSchema = z
  .object({
    id: z.enum(['storm-barrier:north', 'storm-barrier:south']),
    x: finiteCoordinate,
    y: finiteCoordinate,
    angle: z.number().finite(),
    length: z.number().finite().positive(),
    width: z.number().finite().positive(),
  })
  .strict();

const matchStateSchema = z
  .object({
    phase: z.enum(['waiting', 'countdown', 'active', 'ended']),
    mode: z.enum(['flood-drill', 'versus']),
    elapsedMs: z.number().finite().nonnegative(),
    timeLimitMs: z.number().finite().positive().nullable(),
    score: z.number().int().nonnegative(),
    outcome: z.enum(['success', 'time-expired']).nullable(),
    countdownEndsAt: z.number().finite().nonnegative().nullable(),
    winnerTeam: teamSchema.nullable(),
    floodStarted: z.boolean(),
    rematchVotes: z.number().int().nonnegative(),
    requiredRematchVotes: z.number().int().positive(),
  })
  .strict();

export const publicSnapshotSchema = z
  .object({
    tick: z.number().int().nonnegative(),
    serverTime: z.number().finite().nonnegative(),
    match: matchStateSchema,
    players: z.array(publicPlayerStateSchema).max(4),
    relay: relayStateSchema,
    core: coreStateSchema,
    pump: pumpStateSchema,
    props: z.array(propStateSchema).length(1),
    stormBarriers: z.array(stormBarrierStateSchema).length(2),
    beacons: z.array(beaconStateSchema).length(2),
    floodLevels: z
      .array(z.number().int().min(0).max(FLOOD_MAX_LEVEL))
      .length(ARENA_COLS * ARENA_ROWS),
  })
  .strict();

const eventBase = { at: z.number().finite().nonnegative() };
export const gameEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...eventBase,
      type: z.literal('HIT'),
      sourceId: playerIdSchema,
      targetId: playerIdSchema,
      damage: z.number().finite().positive(),
      attackKind: z.enum(['basic', 'rescue-line']),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('DEFEATED'),
      playerId: playerIdSchema,
      byPlayerId: playerIdSchema,
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('RESPAWNED'), playerId: playerIdSchema }).strict(),
  z.object({ ...eventBase, type: z.literal('JUMPED'), playerId: playerIdSchema }).strict(),
  z.object({ ...eventBase, type: z.literal('LANDED'), playerId: playerIdSchema }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('DIVE_STARTED'),
      playerId: playerIdSchema,
      direction: nonZeroDirectionSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('PROP_GRABBED'),
      playerId: playerIdSchema,
      propId: z.literal('rescue-crate'),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('PROP_RELEASED'),
      playerId: playerIdSchema,
      propId: z.literal('rescue-crate'),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('HAZARD_HIT'),
      playerId: playerIdSchema,
      hazardId: z.enum(['storm-barrier:north', 'storm-barrier:south']),
      knockback: vectorSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('ABILITY_CAST'),
      playerId: playerIdSchema,
      slot: z.enum(['Q', 'W']),
      from: vectorSchema,
      to: vectorSchema,
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('RELAY_CAPTURED'), team: teamSchema }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('PUMP_ACTIVATED'),
      playerId: playerIdSchema,
      team: teamSchema,
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('CORE_PICKED_UP'), playerId: playerIdSchema }).strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('CORE_DROPPED'),
      playerId: playerIdSchema,
      position: vectorSchema,
    })
    .strict(),
  z
    .object({
      ...eventBase,
      type: z.literal('CORE_DEPOSITED'),
      playerId: playerIdSchema,
      team: teamSchema,
    })
    .strict(),
  z.object({ ...eventBase, type: z.literal('FLOOD_STARTED') }).strict(),
  z.object({ ...eventBase, type: z.literal('MATCH_STARTED') }).strict(),
  z.object({ ...eventBase, type: z.literal('MATCH_WON'), team: teamSchema }).strict(),
  z.object({ ...eventBase, type: z.literal('MATCH_EXPIRED') }).strict(),
  z
    .object({ ...eventBase, type: z.literal('PLAYER_DISCONNECTED'), playerId: playerIdSchema })
    .strict(),
  z
    .object({ ...eventBase, type: z.literal('PLAYER_RECONNECTED'), playerId: playerIdSchema })
    .strict(),
]);

export const welcomeMessageSchema = z
  .object({
    playerId: playerIdSchema,
    team: teamSchema,
    tickRate: z.number().finite().positive(),
    snapshotRate: z.number().finite().positive(),
  })
  .strict();

export const commandResultMessageSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    accepted: z.boolean(),
    reason: z.string().min(1).max(256).optional(),
  })
  .strict();

export function friendlyValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'payload'}: ${issue.message}` : 'Malformed payload';
}
