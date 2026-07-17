import { getTileKind, isWalkableTile, tileToWorld, type TileCoordinate } from '@signal-zero/shared';
import { describe, expect, it } from 'vitest';
import { findPath } from './pathfinding.js';

const world = (col: number, row: number) => tileToWorld({ col, row });

describe('authoritative grid A*', () => {
  it('routes around a building instead of crossing the straight blocked line', () => {
    const route = findPath(world(3, 3), world(8, 3));

    expect(route.found).toBe(true);
    expect(route.tiles.every((tile) => isWalkableTile(tile.col, tile.row))).toBe(true);
    expect(route.tiles.some((tile) => tile.row !== 3)).toBe(true);
    expect(route.cost).toBeGreaterThan(5);
  });

  it('crosses the canal only on a walkable causeway', () => {
    const route = findPath(world(10, 2), world(13, 2));
    const centralTiles = route.tiles.filter((tile) => tile.col === 11 || tile.col === 12);

    expect(route.found).toBe(true);
    expect(centralTiles.length).toBeGreaterThan(0);
    expect(centralTiles.every((tile) => getTileKind(tile.col, tile.row) === 'street')).toBe(true);
    expect(centralTiles.some((tile) => tile.row === 3)).toBe(true);
  });

  it('rejects blocked destinations and points outside the arena', () => {
    expect(findPath(world(3, 3), world(5, 3))).toMatchObject({
      found: false,
      reason: 'blocked-destination',
    });
    expect(findPath(world(3, 3), { x: -1, y: 100 })).toMatchObject({
      found: false,
      reason: 'outside-arena',
    });
  });

  it('uses flood costs to choose a longer dry causeway', () => {
    const expensiveTiles = new Set(['11,3', '12,3']);
    const route = findPath(world(10, 3), world(13, 3), (col, row) =>
      expensiveTiles.has(`${col},${row}`) ? 20 : 0,
    );

    expect(route.found).toBe(true);
    expect(route.tiles.some((tile) => expensiveTiles.has(`${tile.col},${tile.row}`))).toBe(false);
    expect(route.tiles.some((tile) => tile.row === 6 || tile.row === 7)).toBe(true);
  });

  it('returns the same route when costs and endpoints are identical', () => {
    const start = world(2, 7);
    const end = world(21, 7);
    const first = findPath(start, end).tiles;
    const second = findPath(start, end).tiles;

    expect(second).toEqual(first);
    expect((first.at(-1) satisfies TileCoordinate | undefined)?.col).toBe(21);
  });
});
