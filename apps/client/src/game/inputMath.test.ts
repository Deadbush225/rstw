import { describe, expect, it } from 'vitest';

import { cameraRelativeDirection, isZeroDirection } from './inputMath';

describe('third-person input math', () => {
  it('maps forward relative to a camera behind the positive simulation-y direction', () => {
    const direction = cameraRelativeDirection(0, 1, Math.PI);
    expect(direction.x).toBeCloseTo(0, 8);
    expect(direction.y).toBeCloseTo(1, 8);
  });

  it('normalizes diagonal input', () => {
    const direction = cameraRelativeDirection(1, 1, 0.42);
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 8);
  });

  it('returns an exact zero vector after movement input is released', () => {
    expect(cameraRelativeDirection(0, 0, 2.2)).toEqual({ x: 0, y: 0 });
    expect(isZeroDirection({ x: 0, y: 0 })).toBe(true);
  });
});
