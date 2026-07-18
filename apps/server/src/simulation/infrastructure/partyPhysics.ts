import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  TILE_SIZE,
  isWalkableTile,
  worldToTile,
  type PublicStormBarrierState,
  type Vector2,
} from '@signal-zero/shared';

const DIRECTION_EPSILON = 0.000_1;
const COLLISION_STEP = TILE_SIZE / 4;

export function normalizeDirection(direction: Vector2): Vector2 {
  const magnitude = Math.hypot(direction.x, direction.y);
  if (!Number.isFinite(magnitude) || magnitude <= DIRECTION_EPSILON) return { x: 0, y: 0 };
  return { x: direction.x / magnitude, y: direction.y / magnitude };
}

export function isZeroDirection(direction: Vector2): boolean {
  return Math.abs(direction.x) <= DIRECTION_EPSILON && Math.abs(direction.y) <= DIRECTION_EPSILON;
}

export function isWalkableCircle(position: Vector2, radius: number): boolean {
  if (
    position.x - radius < 0 ||
    position.y - radius < 0 ||
    position.x + radius >= ARENA_WIDTH ||
    position.y + radius >= ARENA_HEIGHT
  ) {
    return false;
  }

  const diagonal = radius * Math.SQRT1_2;
  for (const offset of [
    { x: 0, y: 0 },
    { x: radius, y: 0 },
    { x: -radius, y: 0 },
    { x: 0, y: radius },
    { x: 0, y: -radius },
    { x: diagonal, y: diagonal },
    { x: diagonal, y: -diagonal },
    { x: -diagonal, y: diagonal },
    { x: -diagonal, y: -diagonal },
  ]) {
    const tile = worldToTile({ x: position.x + offset.x, y: position.y + offset.y });
    if (!isWalkableTile(tile.col, tile.row)) return false;
  }
  return true;
}

/** Sweeping short substeps prevents a dive or knockback from tunneling through a one-tile wall. */
export function moveCircleAxisSeparated(
  position: Vector2,
  delta: Vector2,
  radius: number,
): Vector2 {
  const result = { x: position.x, y: position.y };
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / COLLISION_STEP),
  );
  const stepX = delta.x / steps;
  const stepY = delta.y / steps;

  for (let step = 0; step < steps; step += 1) {
    const xCandidate = { x: result.x + stepX, y: result.y };
    if (isWalkableCircle(xCandidate, radius)) result.x = xCandidate.x;

    const yCandidate = { x: result.x, y: result.y + stepY };
    if (isWalkableCircle(yCandidate, radius)) result.y = yCandidate.y;
  }
  return result;
}

export function stormBarrierEndpoints(barrier: PublicStormBarrierState): {
  start: Vector2;
  end: Vector2;
} {
  const halfLength = barrier.length / 2;
  const offsetX = Math.cos(barrier.angle) * halfLength;
  const offsetY = Math.sin(barrier.angle) * halfLength;
  return {
    start: { x: barrier.x - offsetX, y: barrier.y - offsetY },
    end: { x: barrier.x + offsetX, y: barrier.y + offsetY },
  };
}

export function stormBarrierCollisionNormal(
  position: Vector2,
  barrier: PublicStormBarrierState,
  collisionRadius = 0,
): Vector2 | null {
  const { start, end } = stormBarrierEndpoints(barrier);
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((position.x - start.x) * segmentX + (position.y - start.y) * segmentY) /
              segmentLengthSquared,
          ),
        );
  const closest = {
    x: start.x + segmentX * projection,
    y: start.y + segmentY * projection,
  };
  const separation = { x: position.x - closest.x, y: position.y - closest.y };
  const distance = Math.hypot(separation.x, separation.y);
  if (distance > barrier.width / 2 + collisionRadius) return null;
  if (distance <= DIRECTION_EPSILON) {
    return { x: -Math.sin(barrier.angle), y: Math.cos(barrier.angle) };
  }
  return { x: separation.x / distance, y: separation.y / distance };
}
