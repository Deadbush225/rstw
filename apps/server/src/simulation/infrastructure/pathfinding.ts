import {
  ARENA_COLS,
  ARENA_HEIGHT,
  ARENA_ROWS,
  ARENA_WIDTH,
  TILE_SIZE,
  distance,
  isWalkableTile,
  tileToWorld,
  worldToTile,
  type TileCoordinate,
  type Vector2,
} from '@signal-zero/shared';

export type TraversalCost = (col: number, row: number) => number;

export interface PathResult {
  found: boolean;
  points: Vector2[];
  tiles: TileCoordinate[];
  cost: number;
  reason?: 'outside-arena' | 'blocked-start' | 'blocked-destination' | 'unreachable';
}

interface OpenNode {
  index: number;
  f: number;
  h: number;
}

const CARDINAL_NEIGHBORS = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
] as const;

function indexOf(col: number, row: number): number {
  return row * ARENA_COLS + col;
}

function tileAt(index: number): TileCoordinate {
  return { col: index % ARENA_COLS, row: Math.floor(index / ARENA_COLS) };
}

function isWorldPointInsideArena(point: Vector2): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < ARENA_WIDTH &&
    point.y < ARENA_HEIGHT
  );
}

/** A tiny deterministic binary heap keeps A* fast without hiding the algorithm in a dependency. */
class OpenHeap {
  readonly #values: OpenNode[] = [];

  get size(): number {
    return this.#values.length;
  }

  push(value: OpenNode): void {
    this.#values.push(value);
    let child = this.#values.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      const parentValue = this.#values[parent];
      const childValue = this.#values[child];
      if (!parentValue || !childValue || compareOpenNodes(parentValue, childValue) <= 0) break;
      this.#values[parent] = childValue;
      this.#values[child] = parentValue;
      child = parent;
    }
  }

  pop(): OpenNode | undefined {
    const first = this.#values[0];
    const last = this.#values.pop();
    if (!first || !last || this.#values.length === 0) return first;

    this.#values[0] = last;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      const smallestValue = this.#values[smallest];
      const leftValue = this.#values[left];
      const rightValue = this.#values[right];
      if (leftValue && smallestValue && compareOpenNodes(leftValue, smallestValue) < 0) {
        smallest = left;
      }
      const candidate = this.#values[smallest];
      if (rightValue && candidate && compareOpenNodes(rightValue, candidate) < 0) {
        smallest = right;
      }
      if (smallest === parent) break;
      const parentValue = this.#values[parent];
      const childValue = this.#values[smallest];
      if (!parentValue || !childValue) break;
      this.#values[parent] = childValue;
      this.#values[smallest] = parentValue;
      parent = smallest;
    }
    return first;
  }
}

function compareOpenNodes(a: OpenNode, b: OpenNode): number {
  return a.f - b.f || a.h - b.h || a.index - b.index;
}

function manhattan(a: TileCoordinate, b: TileCoordinate): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function failure(reason: NonNullable<PathResult['reason']>): PathResult {
  return { found: false, points: [], tiles: [], cost: Number.POSITIVE_INFINITY, reason };
}

/**
 * Finds an obstacle-aware route on the authoritative arena grid.
 * Extra costs affect route choice but never make an otherwise walkable tile authoritative by themselves.
 */
export function findPath(
  startPoint: Vector2,
  destination: Vector2,
  traversalCost: TraversalCost = () => 0,
): PathResult {
  if (!isWorldPointInsideArena(startPoint) || !isWorldPointInsideArena(destination)) {
    return failure('outside-arena');
  }

  const start = worldToTile(startPoint);
  const goal = worldToTile(destination);
  if (!isWalkableTile(start.col, start.row)) return failure('blocked-start');
  if (!isWalkableTile(goal.col, goal.row)) return failure('blocked-destination');

  if (start.col === goal.col && start.row === goal.row) {
    return {
      found: true,
      points: [{ ...destination }],
      tiles: [{ ...start }],
      cost: distance(startPoint, destination) / TILE_SIZE,
    };
  }

  const tileCount = ARENA_COLS * ARENA_ROWS;
  const startIndex = indexOf(start.col, start.row);
  const goalIndex = indexOf(goal.col, goal.row);
  const scores = new Float64Array(tileCount);
  scores.fill(Number.POSITIVE_INFINITY);
  scores[startIndex] = 0;
  const parents = new Int32Array(tileCount);
  parents.fill(-1);
  const closed = new Uint8Array(tileCount);
  const open = new OpenHeap();
  open.push({ index: startIndex, h: manhattan(start, goal), f: manhattan(start, goal) });

  while (open.size > 0) {
    const current = open.pop();
    if (!current || closed[current.index] === 1) continue;
    if (current.index === goalIndex) break;
    closed[current.index] = 1;
    const currentTile = tileAt(current.index);
    const currentScore = scores[current.index] ?? Number.POSITIVE_INFINITY;

    for (const offset of CARDINAL_NEIGHBORS) {
      const col = currentTile.col + offset.col;
      const row = currentTile.row + offset.row;
      if (!isWalkableTile(col, row)) continue;
      const neighborIndex = indexOf(col, row);
      if (closed[neighborIndex] === 1) continue;
      const extraCost = traversalCost(col, row);
      const safeExtraCost = Number.isFinite(extraCost) ? Math.max(0, extraCost) : 0;
      const candidateScore = currentScore + 1 + safeExtraCost;
      const knownScore = scores[neighborIndex] ?? Number.POSITIVE_INFINITY;
      if (candidateScore >= knownScore) continue;

      scores[neighborIndex] = candidateScore;
      parents[neighborIndex] = current.index;
      const neighbor = { col, row };
      const h = manhattan(neighbor, goal);
      open.push({ index: neighborIndex, h, f: candidateScore + h });
    }
  }

  const finalCost = scores[goalIndex] ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(finalCost)) return failure('unreachable');

  const reverseIndices: number[] = [];
  let cursor = goalIndex;
  while (cursor !== -1) {
    reverseIndices.push(cursor);
    if (cursor === startIndex) break;
    cursor = parents[cursor] ?? -1;
  }
  if (reverseIndices.at(-1) !== startIndex) return failure('unreachable');

  const tiles = reverseIndices.reverse().map(tileAt);
  const points = tiles.slice(1).map(tileToWorld);
  if (points.length === 0) {
    points.push({ ...destination });
  } else {
    points[points.length - 1] = { ...destination };
  }
  return { found: true, points, tiles, cost: finalCost };
}

/** Samples more finely than a tile so Rescue Line cannot cut through a barrier corner. */
export function hasClearWalkableLine(start: Vector2, end: Vector2): boolean {
  if (!isWorldPointInsideArena(start) || !isWorldPointInsideArena(end)) return false;
  const sampleCount = Math.max(1, Math.ceil(distance(start, end) / (TILE_SIZE / 4)));
  for (let index = 0; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const tile = worldToTile({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    });
    if (!isWalkableTile(tile.col, tile.row)) return false;
  }
  return true;
}
