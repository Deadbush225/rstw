import {
  ARENA_COLS,
  ARENA_ROWS,
  PREP_CALM_END_SECONDS,
  SWELL_END_SECONDS,
  WATER_GRID_MAX_LEVEL,
  WATER_PHASE_TOTAL_SECONDS,
  getTileKind,
  getWaterPhase,
  isInsideArenaTile,
  worldToTile,
  type Vector2,
  type WaterCell,
  type WaterPhase,
} from '@signal-zero/shared';

const DRAIN_TILES = [
  { col: 11, row: 0 },
  { col: 12, row: 0 },
  { col: 11, row: 13 },
  { col: 12, row: 13 },
];

function tileIndex(col: number, row: number): number {
  return row * ARENA_COLS + col;
}

function coordinateAt(index: number): { col: number; row: number } {
  return { col: index % ARENA_COLS, row: Math.floor(index / ARENA_COLS) };
}

function isDrainTile(col: number, row: number): boolean {
  return DRAIN_TILES.some((tile) => tile.col === col && tile.row === row);
}

/**
 * Manages the water phase timer and per-cell water grid state.
 *
 * Phase progression:
 *   PREP_CALM (480s-450s): Grid level 0 (dry).
 *   SWELL (450s-360s):     Drain tiles increment to level 1.
 *   DELUGE (360s-0s):      Unblocked cells increment to level 2, then 3.
 *
 * The water timer counts down from WATER_PHASE_TOTAL_SECONDS (480s).
 * The water grid is separate from the existing FloodSystem – it provides
 * an additional phase-based water layer for the 3D client visualisation.
 */
export class WaterGridSystem {
  readonly #cells: WaterCell[] = [];
  readonly #sandbagCells = new Set<number>();
  #timerRemainingMs: number;
  #waterPhase: WaterPhase;
  #lastWaterPhase: WaterPhase;

  constructor() {
    this.#timerRemainingMs = WATER_PHASE_TOTAL_SECONDS * 1_000;
    this.#waterPhase = 'PREP_CALM';
    this.#lastWaterPhase = 'PREP_CALM';
    this.#buildCells();
  }

  get waterPhase(): WaterPhase {
    return this.#waterPhase;
  }

  get timerRemainingMs(): number {
    return this.#timerRemainingMs;
  }

  get timerRemainingSeconds(): number {
    return Math.ceil(this.#timerRemainingMs / 1_000);
  }

  get cells(): readonly WaterCell[] {
    return this.#cells;
  }

  /** Returns true when the water phase has just changed during this step. */
  get phaseChanged(): boolean {
    return this.#waterPhase !== this.#lastWaterPhase;
  }

  /**
   * Place a sandbag at the nearest grid cell to the given world position.
   * Returns the tile coordinates if placement succeeded, or null if the cell
   * is already blocked or outside the arena.
   */
  placeSandbag(worldX: number, worldY: number): { col: number; row: number } | null {
    const tile = worldToTile({ x: worldX, y: worldY });
    if (!isInsideArenaTile(tile.col, tile.row)) return null;
    const index = tileIndex(tile.col, tile.row);
    const cell = this.#cells[index];
    if (!cell || cell.isBlocked) return null;
    cell.isBlocked = true;
    cell.waterLevel = 0;
    this.#sandbagCells.add(index);
    return tile;
  }

  /**
   * Drain water from cells within a world-space radius of the given point.
   * Each cell's waterLevel is reduced by 1 (minimum 0).
   */
  drainAtPoint(worldX: number, worldY: number, radius: number): void {
    const centerTile = worldToTile({ x: worldX, y: worldY });
    const tileRadius = Math.ceil(radius / 64);
    for (let row = centerTile.row - tileRadius; row <= centerTile.row + tileRadius; row += 1) {
      for (let col = centerTile.col - tileRadius; col <= centerTile.col + tileRadius; col += 1) {
        if (!isInsideArenaTile(col, row)) continue;
        const cellCenterX = (col + 0.5) * 64;
        const cellCenterY = (row + 0.5) * 64;
        const dx = cellCenterX - worldX;
        const dy = cellCenterY - worldY;
        if (Math.hypot(dx, dy) > radius) continue;
        const index = tileIndex(col, row);
        const cell = this.#cells[index];
        if (cell && !cell.isBlocked && cell.waterLevel > 0) {
          cell.waterLevel = Math.max(0, cell.waterLevel - 1);
        }
      }
    }
  }

  /** Advance the timer by the given delta (ms). */
  step(deltaMs: number): void {
    this.#timerRemainingMs = Math.max(0, this.#timerRemainingMs - deltaMs);
    this.#lastWaterPhase = this.#waterPhase;
    this.#waterPhase = getWaterPhase(this.#timerRemainingMs / 1_000);
    this.#recalculate();
  }

  /** Reset the timer and grid for a new match. */
  reset(): void {
    this.#timerRemainingMs = WATER_PHASE_TOTAL_SECONDS * 1_000;
    this.#waterPhase = 'PREP_CALM';
    this.#lastWaterPhase = 'PREP_CALM';
    this.#sandbagCells.clear();
    this.#buildCells();
  }

  /**
   * Return the water level (0-3) at a given world coordinate.
   * This is a bounded spatial query used by the server simulation.
   */
  getWaterLevelAtPosition(point: Vector2): number {
    const tile = worldToTile(point);
    if (!isInsideArenaTile(tile.col, tile.row)) return WATER_GRID_MAX_LEVEL;
    const index = tileIndex(tile.col, tile.row);
    return this.#cells[index]?.waterLevel ?? 0;
  }

  /**
   * Return the water grid cell at a given tile coordinate.
   */
  getCell(col: number, row: number): WaterCell | undefined {
    if (!isInsideArenaTile(col, row)) return undefined;
    return this.#cells[tileIndex(col, row)];
  }

  #buildCells(): void {
    this.#cells.length = 0;
    for (let row = 0; row < ARENA_ROWS; row += 1) {
      for (let col = 0; col < ARENA_COLS; col += 1) {
        this.#cells.push({
          waterLevel: 0,
          isBlocked: getTileKind(col, row) === 'building',
        });
      }
    }
  }

  #recalculate(): void {
    const secondsRemaining = this.#timerRemainingMs / 1_000;

    for (let index = 0; index < this.#cells.length; index += 1) {
      const tile = coordinateAt(index);
      const cell = this.#cells[index];
      if (!cell) continue;

      if (cell.isBlocked) {
        cell.waterLevel = 0;
        continue;
      }

      if (secondsRemaining > PREP_CALM_END_SECONDS) {
        // PREP_CALM: all dry
        cell.waterLevel = 0;
      } else if (secondsRemaining > SWELL_END_SECONDS) {
        // SWELL: drain tiles only → level 1
        cell.waterLevel = isDrainTile(tile.col, tile.row) ? 1 : 0;
      } else {
        // DELUGE: unblocked cells progress based on timer
        const delugeProgress =
          1 - secondsRemaining / SWELL_END_SECONDS;
        if (delugeProgress < 0.5) {
          cell.waterLevel = 1;
        } else if (delugeProgress < 0.85) {
          cell.waterLevel = 2;
        } else {
          cell.waterLevel = 3;
        }
      }
    }
  }
}