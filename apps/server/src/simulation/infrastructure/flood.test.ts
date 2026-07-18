import {
  ARENA_COLS,
  ARENA_ROWS,
  FLOOD_MAX_LEVEL,
  getCanalTiles,
  getTileKind,
  tileToWorld,
} from '@signal-zero/shared';
import { describe, expect, it } from 'vitest';
import { FloodSystem, deterministicFloodResistance } from './flood.js';

describe('deterministic flood model', () => {
  it('starts with dry streets and deep canal sources', () => {
    const flood = new FloodSystem();
    expect(flood.getLevels().every((level) => level === 0)).toBe(true);

    flood.start();
    for (const source of getCanalTiles()) {
      expect(flood.getLevel(source.col, source.row)).toBe(FLOOD_MAX_LEVEL);
    }
    expect(flood.getLevel(5, 3)).toBe(0); // building tiles remain barriers
  });

  it('produces byte-for-byte identical propagation for separate instances', () => {
    const first = new FloodSystem();
    const second = new FloodSystem();
    first.start();
    second.start();

    for (let step = 0; step < 18; step += 1) {
      first.propagate();
      second.propagate();
      expect(second.getLevels()).toEqual(first.getLevels());
    }
  });

  it('spreads monotonically, respects barriers, and never exceeds the maximum level', () => {
    const flood = new FloodSystem();
    flood.start();
    let previous = flood.getLevels();

    for (let step = 0; step < 20; step += 1) {
      flood.propagate();
      const current = flood.getLevels();
      current.forEach((level, index) => {
        expect(level).toBeGreaterThanOrEqual(previous[index] ?? 0);
        expect(level).toBeLessThanOrEqual(FLOOD_MAX_LEVEL);
        const col = index % ARENA_COLS;
        const row = Math.floor(index / ARENA_COLS);
        if (getTileKind(col, row) === 'building') expect(level).toBe(0);
      });
      previous = current;
    }

    expect(previous.filter((level) => level > 0).length).toBeGreaterThan(getCanalTiles().length);
    expect(previous).toHaveLength(ARENA_COLS * ARENA_ROWS);
  });

  it('turns depth into consistent movement and path penalties', () => {
    const flood = new FloodSystem();
    flood.start();
    for (let step = 0; step < 20; step += 1) flood.propagate();

    const street = { col: 10, row: 7 };
    expect(flood.getLevel(street.col, street.row)).toBeGreaterThan(0);
    expect(flood.getMovementMultiplier(tileToWorld(street))).toBeLessThan(1);
    expect(flood.getTraversalCost(street.col, street.row)).toBeGreaterThan(0);
    expect(deterministicFloodResistance(10, 7)).toBe(deterministicFloodResistance(10, 7));
  });
});
