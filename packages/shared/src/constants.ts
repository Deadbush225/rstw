import type { AbilityDefinition, HeroDefinition, HeroId, TeamDefinition, WaterPhase } from './types.js';

export const ROOM_NAME = 'signal_zero';
export const REQUIRED_PLAYERS = 2;
export const SIMULATION_TICK_RATE = 20;
export const SIMULATION_STEP_MS = 1_000 / SIMULATION_TICK_RATE;
export const SNAPSHOT_RATE = 10;
export const SNAPSHOT_INTERVAL_TICKS = SIMULATION_TICK_RATE / SNAPSHOT_RATE;
export const MATCH_COUNTDOWN_MS = 2_000;
export const RESPAWN_MS = 4_000;
export const RELAY_CAPTURE_MS = 3_000;
export const RELAY_CAPTURE_RADIUS = 92;
export const PUMP_INTERACT_RADIUS = 84;
export const PUMP_FLOOD_DELAY_MS = 8_000;
export const BEACON_INTERACT_RADIUS = 88;
export const CORE_INTERACT_RADIUS = 72;
export const FLOOD_START_MS = 8_000;
export const FLOOD_STEP_MS = 3_200;
export const SOLO_DRILL_DURATION_MS = 90_000;
export const FLOOD_MAX_LEVEL = 2;
export const MAX_COMMANDS_PER_SECOND = 40;
export const MAX_CLIENT_CLOCK_SKEW_MS = 60_000;
export const RECONNECTION_WINDOW_SECONDS = 20;
export const RECONNECTION_MAX_RETRIES = 8;
export const RECONNECTION_INITIAL_DELAY_MS = 150;
export const RECONNECTION_MAX_DELAY_MS = 2_500;
export const PLAYER_COLLISION_RADIUS = 22;
export const JUMP_INITIAL_VELOCITY = 460;
export const GRAVITY = 1_100;
export const AIR_CONTROL_MULTIPLIER = 0.75;
export const DIVE_SPEED = 480;
export const DIVE_DURATION_MS = 250;
export const DIVE_COOLDOWN_MS = 1_800;
export const DIVE_RECOVERY_MS = 300;
export const GRAB_RADIUS = 72;
export const GRABBED_PROP_FOLLOW_DISTANCE = 48;
export const RESCUE_CRATE_RADIUS = 24;
export const PUMP_PRESSURE_RADIUS = 72;
export const STORM_BARRIER_KNOCKBACK = 96;
export const STORM_BARRIER_STUMBLE_MS = 650;
export const STORM_BARRIER_HIT_COOLDOWN_MS = 900;
export const STORM_BARRIER_CLEARANCE = 30;
export const SANDBAG_PLACEMENT_RADIUS = 64;
export const PUMP_DRAIN_RADIUS = 192;
export const PUMP_DRAIN_INTERVAL_MS = 4_000;

/** Water phase timer: total duration in seconds. */
export const WATER_PHASE_TOTAL_SECONDS = 480;
/** PREP_CALM ends at this many seconds remaining on the timer. */
export const PREP_CALM_END_SECONDS = 450;
/** SWELL ends at this many seconds remaining on the timer. */
export const SWELL_END_SECONDS = 360;
/** Water grid maximum level (0-3). */
export const WATER_GRID_MAX_LEVEL = 3;

export function getWaterPhase(timerRemainingSeconds: number): WaterPhase {
  if (timerRemainingSeconds > PREP_CALM_END_SECONDS) return 'PREP_CALM';
  if (timerRemainingSeconds > SWELL_END_SECONDS) return 'SWELL';
  return 'DELUGE';
}

export const TEAMS = {
  A: {
    id: 'A',
    name: 'Bughaw Response',
    color: 0x48a9e6,
    cssColor: '#48a9e6',
    marker: 'circle',
  },
  B: {
    id: 'B',
    name: 'Gintong Response',
    color: 0xf4b942,
    cssColor: '#f4b942',
    marker: 'diamond',
  },
} as const satisfies Record<'A' | 'B', TeamDefinition>;

export const ABILITIES = {
  Q: {
    slot: 'Q',
    name: 'Rescue Line',
    description:
      'Anchor a rescue line and surge along its clear route. Enemies crossed take damage; the responder briefly ignores flood slowdown.',
    castType: 'point',
    range: 360,
    cooldownMs: 6_000,
    energyCost: 25,
    implemented: true,
  },
  W: {
    slot: 'W',
    name: 'Bayanihan Pulse',
    description:
      'Call a neighborhood response pulse. The responder gains temporary flood-slow immunity to cross a flooded route safely.',
    castType: 'self',
    range: 0,
    cooldownMs: 9_000,
    energyCost: 20,
    implemented: true,
  },
  E: {
    slot: 'E',
    name: 'Utility Slot E',
    description: 'Reserved for the next content milestone.',
    castType: 'point',
    range: 0,
    cooldownMs: 0,
    energyCost: 0,
    implemented: false,
  },
  R: {
    slot: 'R',
    name: 'Response Ultimate',
    description: 'Reserved for the next content milestone.',
    castType: 'point',
    range: 0,
    cooldownMs: 0,
    energyCost: 0,
    implemented: false,
  },
} as const satisfies Record<'Q' | 'W' | 'E' | 'R', AbilityDefinition>;

export const HERO_IDS = ['maya', 'tomas', 'kidlat', 'amihan'] as const satisfies readonly HeroId[];
export const DEFAULT_HERO_ID: HeroId = 'maya';

export const HEROES = {
  maya: {
    id: 'maya',
    name: 'Maya',
    role: 'Rescue Scout',
    description: 'A balanced field leader who reaches stranded neighbors through risky routes.',
    maxHealth: 130,
    maxEnergy: 100,
    energyRegenerationPerSecond: 7,
    movementSpeed: 190,
    attackDamage: 24,
    attackRange: 145,
    attackIntervalMs: 760,
    acquisitionRange: 250,
  },
  tomas: {
    id: 'tomas',
    name: 'Tomas',
    role: 'Flood Engineer',
    description: 'A durable pump technician who trades speed and energy for staying power.',
    maxHealth: 170,
    maxEnergy: 85,
    energyRegenerationPerSecond: 6,
    movementSpeed: 165,
    attackDamage: 28,
    attackRange: 135,
    attackIntervalMs: 880,
    acquisitionRange: 235,
  },
  kidlat: {
    id: 'kidlat',
    name: 'Kidlat',
    role: 'Rapid Courier',
    description: 'A swift messenger built for relay rotations, daring dives, and quick deposits.',
    maxHealth: 105,
    maxEnergy: 120,
    energyRegenerationPerSecond: 8,
    movementSpeed: 225,
    attackDamage: 19,
    attackRange: 140,
    attackIntervalMs: 620,
    acquisitionRange: 270,
  },
  amihan: {
    id: 'amihan',
    name: 'Amihan',
    role: 'Field Medic',
    description: 'A steady support responder with deep reserves for prolonged flood operations.',
    maxHealth: 145,
    maxEnergy: 115,
    energyRegenerationPerSecond: 9,
    movementSpeed: 178,
    attackDamage: 21,
    attackRange: 160,
    attackIntervalMs: 800,
    acquisitionRange: 260,
  },
} as const satisfies Record<HeroId, HeroDefinition>;

/** @deprecated Use `HEROES` and a player's authoritative `heroId`. */
export const PROTOTYPE_HERO = HEROES.maya;

export function isHeroId(value: string): value is HeroId {
  return (HERO_IDS as readonly string[]).includes(value);
}
