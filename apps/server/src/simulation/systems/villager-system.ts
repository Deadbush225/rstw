import {
  BEACON_POSITIONS,
  distance,
  EVAC_CENTER_RADIUS,
  isWalkableTile,
  RESILIENCE_SCORE_PER_VILLAGER,
  VILLAGER_AT_HOME_DISTANCE,
  VILLAGER_COUNT,
  VILLAGER_PICKUP_RADIUS,
  VILLAGER_ROOF_ELEVATION,
  VILLAGER_SPEED,
  VILLAGER_WANDER_RADIUS,
  worldToTile,
  type VillagerStatus,
  type Vector2,
} from '@signal-zero/shared';
import { findPath } from '../infrastructure/pathfinding.js';
import type { RuntimePlayer } from '../orchestrator/simulation-context.js';

const VILLAGER_HOME_POSITIONS: Vector2[] = [
  { x: 6.5 * 64, y: 4 * 64 },
  { x: 18.5 * 64, y: 4 * 64 },
  { x: 6.5 * 64, y: 11 * 64 },
  { x: 18.5 * 64, y: 11 * 64 },
];

interface VillagerEntity {
  id: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  status: VillagerStatus;
  wanderTarget: Vector2 | null;
  wanderTimer: number;
  elevation: number;
  path: Vector2[];
}

/**
 * Villager lifecycle: spawn, wander, panic pathfinding, deluge stranding, pickup/evacuation.
 */
export class VillagerSystem {
  readonly #villagers: VillagerEntity[] = [];

  get villagers(): readonly VillagerEntity[] {
    return this.#villagers;
  }

  spawn(): void {
    this.#villagers.length = 0;
    const streetTiles: Vector2[] = [];
    for (let row = 0; row < 14; row += 1) {
      for (let col = 0; col < 24; col += 1) {
        if (isWalkableTile(col, row)) {
          streetTiles.push({ x: (col + 0.5) * 64, y: (row + 0.5) * 64 });
        }
      }
    }
    if (streetTiles.length === 0) return;
    for (let index = 0; index < VILLAGER_COUNT; index += 1) {
      const tile = streetTiles[(index * 17) % streetTiles.length] ?? streetTiles[0]!;
      const homePos = VILLAGER_HOME_POSITIONS[index % VILLAGER_HOME_POSITIONS.length]!;
      this.#villagers.push({
        id: `villager:${index}`,
        x: tile.x,
        y: tile.y,
        homeX: homePos.x,
        homeY: homePos.y,
        status: 'WANDERING',
        wanderTarget: null,
        wanderTimer: 0,
        elevation: 0,
        path: [],
      });
    }
  }

  step(
    deltaMs: number,
    waterPhase: 'PREP_CALM' | 'SWELL' | 'DELUGE',
    floodTraversalCost: (col: number, row: number) => number,
    waterLevelAt: (index: number) => number,
    players: Iterable<RuntimePlayer>,
    resilienceScoreRef: { value: number },
  ): void {
    for (const villager of this.#villagers) {
      if (villager.status === 'STRANDED') continue;
      if (waterPhase === 'PREP_CALM') {
        this.#updateVillagerWander(villager, deltaMs);
      } else if (waterPhase === 'SWELL') {
        this.#updateVillagerPanic(villager, deltaMs, floodTraversalCost, waterLevelAt);
      } else {
        this.#updateVillagerDeluge(villager);
      }
    }
    this.#checkVillagerPickup(players);
    this.#checkVillagerEvacuation(players, resilienceScoreRef);
  }

  #updateVillagerWander(villager: VillagerEntity, deltaMs: number): void {
    const speed = VILLAGER_SPEED;
    const distanceThisStep = (speed * deltaMs) / 1_000;
    villager.wanderTimer -= deltaMs;
    if (!villager.wanderTarget || villager.wanderTimer <= 0) {
      const offsetX = (Math.random() - 0.5) * VILLAGER_WANDER_RADIUS;
      const offsetY = (Math.random() - 0.5) * VILLAGER_WANDER_RADIUS;
      let targetX = villager.x + offsetX;
      let targetY = villager.y + offsetY;
      targetX = Math.min(24 * 64 - 1, Math.max(0, targetX));
      targetY = Math.min(14 * 64 - 1, Math.max(0, targetY));
      villager.wanderTarget = { x: targetX, y: targetY };
      villager.wanderTimer = 2_000 + Math.random() * 3_000;
    }
    const target = villager.wanderTarget;
    if (!target) return;
    const dist = distance(villager, target);
    if (dist <= distanceThisStep) {
      villager.x = target.x;
      villager.y = target.y;
      villager.wanderTarget = null;
    } else {
      const ratio = distanceThisStep / dist;
      villager.x += (target.x - villager.x) * ratio;
      villager.y += (target.y - villager.y) * ratio;
    }
  }

  #updateVillagerPanic(
    villager: VillagerEntity,
    deltaMs: number,
    floodTraversalCost: (col: number, row: number) => number,
    waterLevelAt: (index: number) => number,
  ): void {
    if (villager.status === 'STRANDED') return;
    villager.status = 'PANIC';
    const tile = worldToTile(villager);
    const cellIndex = tile.row * 24 + tile.col;
    const waterLevel = waterLevelAt(cellIndex) ?? 0;
    const speedMultiplier = waterLevel >= 1 ? 0.8 : 1;
    const speed = VILLAGER_SPEED * speedMultiplier;
    const dist = distance(villager, { x: villager.homeX, y: villager.homeY });
    if (dist <= VILLAGER_AT_HOME_DISTANCE) {
      villager.x = villager.homeX;
      villager.y = villager.homeY;
      villager.path = [];
      return;
    }
    if (villager.path.length === 0) {
      const route = findPath(villager, { x: villager.homeX, y: villager.homeY }, floodTraversalCost);
      if (route.found) {
        villager.path = route.points;
      } else {
        return;
      }
    }
    const distanceThisStep = (speed * deltaMs) / 1_000;
    let remaining = distanceThisStep;
    while (remaining > 0 && villager.path.length > 0) {
      const waypoint = villager.path[0];
      if (!waypoint) break;
      const waypointDist = distance(villager, waypoint);
      if (waypointDist <= remaining || waypointDist < 0.001) {
        villager.x = waypoint.x;
        villager.y = waypoint.y;
        remaining -= waypointDist;
        villager.path.shift();
      } else {
        const ratio = remaining / waypointDist;
        villager.x += (waypoint.x - villager.x) * ratio;
        villager.y += (waypoint.y - villager.y) * ratio;
        remaining = 0;
      }
    }
  }

  #updateVillagerDeluge(villager: VillagerEntity): void {
    const dist = distance(villager, { x: villager.homeX, y: villager.homeY });
    if (dist <= VILLAGER_AT_HOME_DISTANCE) {
      villager.x = villager.homeX;
      villager.y = villager.homeY;
      villager.elevation = VILLAGER_ROOF_ELEVATION;
    } else {
      villager.status = 'STRANDED';
    }
    villager.path = [];
  }

  #checkVillagerPickup(players: Iterable<RuntimePlayer>): void {
    for (const player of players) {
      if (!player.state.alive || !player.state.connected) continue;
      for (let index = this.#villagers.length - 1; index >= 0; index -= 1) {
        const villager = this.#villagers[index];
        if (!villager || villager.status !== 'STRANDED') continue;
        if (distance(player.state, villager) <= VILLAGER_PICKUP_RADIUS) {
          player.state.carryingVillagers += 1;
          this.#villagers.splice(index, 1);
          break;
        }
      }
    }
  }

  #checkVillagerEvacuation(
    players: Iterable<RuntimePlayer>,
    resilienceScoreRef: { value: number },
  ): void {
    for (const player of players) {
      if (!player.state.alive || !player.state.connected) continue;
      if (player.state.carryingVillagers <= 0) continue;
      const beacon = BEACON_POSITIONS[player.state.team];
      if (distance(player.state, beacon) <= EVAC_CENTER_RADIUS) {
        resilienceScoreRef.value += player.state.carryingVillagers * RESILIENCE_SCORE_PER_VILLAGER;
        player.state.carryingVillagers = 0;
      }
    }
  }
}
