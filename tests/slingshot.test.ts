import { describe, expect, it } from 'vitest';
import { GAME_CONFIG as C } from '../src/config/gameConfig';
import { aimFromPull } from '../src/systems/Slingshot';

describe('slingshot aim', () => {
  it('a tiny drag is not armed, so lifting the finger cancels', () => {
    const a = aimFromPull(300, 600, 295, 606);
    expect(a.armed).toBe(false);
    expect(a.ratio).toBe(0);
  });

  it('pulling back and down at 45° aims 45° up and forward', () => {
    const a = aimFromPull(300, 600, 200, 700);
    expect(a.armed).toBe(true);
    expect(a.angleDeg).toBeCloseTo(45, 5);
  });

  it('power grows with pull length and saturates at maxPull', () => {
    const short = aimFromPull(400, 400, 340, 460);
    const long = aimFromPull(400, 400, 280, 520);
    const huge = aimFromPull(400, 400, -400, 1200);
    expect(long.ratio).toBeGreaterThan(short.ratio);
    expect(huge.ratio).toBe(1);
  });

  it('clamps the angle to the allowed range', () => {
    expect(aimFromPull(400, 400, 200, 401).angleDeg).toBe(C.minAngleDeg);
    expect(aimFromPull(400, 400, 399, 700).angleDeg).toBe(C.maxAngleDeg);
  });

  it('pulling the wrong way (forward / up) never arms a backwards throw', () => {
    const a = aimFromPull(300, 600, 500, 400);
    expect(a.armed).toBe(false);
  });
});
