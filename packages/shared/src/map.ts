import type { StormBarrierDefinition, TeamId, Vector2 } from './types.js';

export const ARENA_COLS = 24;
export const ARENA_ROWS = 14;
export const TILE_SIZE = 64;
export const ARENA_WIDTH = ARENA_COLS * TILE_SIZE;
export const ARENA_HEIGHT = ARENA_ROWS * TILE_SIZE;

export type TileKind = 'street' | 'building' | 'canal';
export interface TileCoordinate {
  col: number;
  row: number;
}

export const BUILDING_RECTS = [
  { col: 4, row: 2, width: 4, height: 3 },
  { col: 16, row: 2, width: 4, height: 3 },
  { col: 4, row: 9, width: 4, height: 3 },
  { col: 16, row: 9, width: 4, height: 3 },
] as const;

const CAUSEWAY_ROWS = new Set([3, 6, 7, 10]);

export const RELAY_POSITION: Vector2 = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
export const PUMP_POSITION: Vector2 = { x: 9.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
export const RESCUE_CRATE_POSITION: Vector2 = { x: 7.5 * TILE_SIZE, y: ARENA_HEIGHT / 2 };
export const STORM_BARRIER_DEFINITIONS = [
  {
    id: 'storm-barrier:north',
    x: 10.5 * TILE_SIZE,
    y: 5.5 * TILE_SIZE,
    initialAngle: 0,
    angularSpeedRadiansPerSecond: 0.9,
    length: 180,
    width: 18,
  },
  {
    id: 'storm-barrier:south',
    x: 13.5 * TILE_SIZE,
    y: 8.5 * TILE_SIZE,
    initialAngle: Math.PI / 2,
    angularSpeedRadiansPerSecond: -0.75,
    length: 180,
    width: 18,
  },
] as const satisfies readonly StormBarrierDefinition[];
export const SPAWN_POSITIONS: Readonly<Record<TeamId, Vector2>> = {
  A: { x: 3.5 * TILE_SIZE, y: ARENA_HEIGHT / 2 },
  B: { x: 20.5 * TILE_SIZE, y: ARENA_HEIGHT / 2 },
};
export const BEACON_POSITIONS: Readonly<Record<TeamId, Vector2>> = {
  A: { x: 1.5 * TILE_SIZE, y: ARENA_HEIGHT / 2 },
  B: { x: 22.5 * TILE_SIZE, y: ARENA_HEIGHT / 2 },
};

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function isInsideArenaTile(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < ARENA_COLS && row < ARENA_ROWS;
}

export function getTileKind(col: number, row: number): TileKind {
  if (!isInsideArenaTile(col, row)) return 'building';
  if ((col === 11 || col === 12) && !CAUSEWAY_ROWS.has(row)) return 'canal';
  const inBuilding = BUILDING_RECTS.some(
    (rect) =>
      col >= rect.col &&
      col < rect.col + rect.width &&
      row >= rect.row &&
      row < rect.row + rect.height,
  );
  return inBuilding ? 'building' : 'street';
}

export function isWalkableTile(col: number, row: number): boolean {
  return getTileKind(col, row) === 'street';
}

export function worldToTile(point: Vector2): TileCoordinate {
  return {
    col: Math.floor(point.x / TILE_SIZE),
    row: Math.floor(point.y / TILE_SIZE),
  };
}

export function tileToWorld(tile: TileCoordinate): Vector2 {
  return {
    x: (tile.col + 0.5) * TILE_SIZE,
    y: (tile.row + 0.5) * TILE_SIZE,
  };
}

export function clampToArena(point: Vector2): Vector2 {
  return {
    x: Math.min(ARENA_WIDTH - 1, Math.max(0, point.x)),
    y: Math.min(ARENA_HEIGHT - 1, Math.max(0, point.y)),
  };
}

export function getCanalTiles(): TileCoordinate[] {
  const tiles: TileCoordinate[] = [];
  for (let row = 0; row < ARENA_ROWS; row += 1) {
    for (const col of [11, 12]) {
      if (getTileKind(col, row) === 'canal') tiles.push({ col, row });
    }
  }
  return tiles;
}
