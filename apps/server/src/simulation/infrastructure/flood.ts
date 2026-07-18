import {
  ARENA_COLS,
  ARENA_ROWS,
  FLOOD_MAX_LEVEL,
  getCanalTiles,
  getTileKind,
  isInsideArenaTile,
  worldToTile,
  type Vector2,
} from '@signal-zero/shared';

const UNREACHABLE = Number.POSITIVE_INFINITY;
const DEEP_WATER_MATURATION_STEPS = 2;

function tileIndex(col: number, row: number): number {
  return row * ARENA_COLS + col;
}

function coordinateAt(index: number): { col: number; row: number } {
  return { col: index % ARENA_COLS, row: Math.floor(index / ARENA_COLS) };
}

/** Stable pseudo-elevation: 0 floods first, 2 resists for two extra propagation steps. */
export function deterministicFloodResistance(col: number, row: number): 0 | 1 | 2 {
  return ((col * 11 + row * 7 + col * row) % 3) as 0 | 1 | 2;
}

function buildArrivalSteps(): Float64Array {
  const count = ARENA_COLS * ARENA_ROWS;
  const arrival = new Float64Array(count);
  arrival.fill(UNREACHABLE);
  const visited = new Uint8Array(count);

  for (const source of getCanalTiles()) arrival[tileIndex(source.col, source.row)] = 0;

  // The arena is intentionally small, so this direct Dijkstra scan is easier to audit than a second heap.
  for (let iteration = 0; iteration < count; iteration += 1) {
    let currentIndex = -1;
    let currentArrival = UNREACHABLE;
    for (let index = 0; index < count; index += 1) {
      const candidate = arrival[index] ?? UNREACHABLE;
      if (visited[index] === 0 && candidate < currentArrival) {
        currentIndex = index;
        currentArrival = candidate;
      }
    }
    if (currentIndex < 0 || !Number.isFinite(currentArrival)) break;
    visited[currentIndex] = 1;
    const current = coordinateAt(currentIndex);

    for (const [columnOffset, rowOffset] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const col = current.col + columnOffset;
      const row = current.row + rowOffset;
      if (!isInsideArenaTile(col, row) || getTileKind(col, row) === 'building') continue;
      const neighborIndex = tileIndex(col, row);
      const resistance =
        getTileKind(col, row) === 'canal' ? 0 : deterministicFloodResistance(col, row);
      const nextArrival = currentArrival + 1 + resistance;
      if (nextArrival < (arrival[neighborIndex] ?? UNREACHABLE)) {
        arrival[neighborIndex] = nextArrival;
      }
    }
  }
  return arrival;
}

export class FloodSystem {
  readonly #arrivalSteps = buildArrivalSteps();
  readonly #levels = new Uint8Array(ARENA_COLS * ARENA_ROWS);
  #started = false;
  #propagationStep = 0;

  get started(): boolean {
    return this.#started;
  }

  get propagationStep(): number {
    return this.#propagationStep;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#recalculateLevels();
  }

  propagate(): void {
    if (!this.#started) return;
    this.#propagationStep += 1;
    this.#recalculateLevels();
  }

  reset(): void {
    this.#started = false;
    this.#propagationStep = 0;
    this.#levels.fill(0);
  }

  getLevels(): number[] {
    return Array.from(this.#levels);
  }

  getLevel(col: number, row: number): number {
    if (!isInsideArenaTile(col, row)) return FLOOD_MAX_LEVEL;
    return this.#levels[tileIndex(col, row)] ?? 0;
  }

  getLevelAtWorld(point: Vector2): number {
    const tile = worldToTile(point);
    return this.getLevel(tile.col, tile.row);
  }

  getTraversalCost(col: number, row: number): number {
    const level = this.getLevel(col, row);
    return level === 1 ? 2 : level >= 2 ? 5 : 0;
  }

  getMovementMultiplier(point: Vector2): number {
    const level = this.getLevelAtWorld(point);
    return level === 1 ? 0.72 : level >= 2 ? 0.48 : 1;
  }

  #recalculateLevels(): void {
    for (let index = 0; index < this.#levels.length; index += 1) {
      const tile = coordinateAt(index);
      const kind = getTileKind(tile.col, tile.row);
      const arrivalStep = this.#arrivalSteps[index] ?? UNREACHABLE;
      if (kind === 'building' || !Number.isFinite(arrivalStep)) {
        this.#levels[index] = 0;
      } else if (kind === 'canal') {
        this.#levels[index] = FLOOD_MAX_LEVEL;
      } else if (arrivalStep <= this.#propagationStep) {
        this.#levels[index] =
          this.#propagationStep - arrivalStep >= DEEP_WATER_MATURATION_STEPS ? FLOOD_MAX_LEVEL : 1;
      } else {
        this.#levels[index] = 0;
      }
    }
  }
}
