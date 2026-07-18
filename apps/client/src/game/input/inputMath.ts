import type { Vector2 } from '@signal-zero/shared';

/** Converts keyboard axes into a normalized server x/y direction relative to the orbit camera. */
export function cameraRelativeDirection(
  horizontal: number,
  vertical: number,
  cameraYaw: number,
): Vector2 {
  const inputLength = Math.hypot(horizontal, vertical);
  if (inputLength <= Number.EPSILON) return { x: 0, y: 0 };

  const side = horizontal / inputLength;
  const forward = vertical / inputLength;
  return {
    x: -Math.sin(cameraYaw) * forward + Math.cos(cameraYaw) * side,
    y: -Math.cos(cameraYaw) * forward - Math.sin(cameraYaw) * side,
  };
}

export function isZeroDirection(direction: Vector2): boolean {
  return Math.abs(direction.x) < 0.0001 && Math.abs(direction.y) < 0.0001;
}
