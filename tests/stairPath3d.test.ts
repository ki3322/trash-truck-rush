import { describe, expect, it } from 'vitest';
import { buildSegments, totalUnits, unitsPerFloor } from '../src/utils/stairPath';
import { FLIGHT_DROP, FLOOR_HEIGHT, floorY3, pose3At } from '../src/utils/stairPath3d';

describe('3D stair path', () => {
  for (const floor of [3, 5, 6]) {
    it(`${floor}F: starts at the top, ends on the ground, and never teleports`, () => {
      const segs = buildSegments(floor);
      const total = totalUnits(floor);
      expect(pose3At(segs, floor, 0).y).toBeCloseTo(floorY3(floor));
      expect(pose3At(segs, floor, total).y).toBeCloseTo(0, 5);
      let prev = pose3At(segs, floor, 0);
      for (let p = 0.1; p <= total; p += 0.1) {
        const cur = pose3At(segs, floor, p);
        expect(Math.hypot(cur.x - prev.x, cur.z - prev.z)).toBeLessThan(0.5);
        expect(prev.y - cur.y).toBeLessThan(0.35); // one step at a time
        expect(cur.y).toBeLessThanOrEqual(prev.y + 0.13); // only the step hop goes up
        prev = cur;
      }
    });
  }
  it('each floor descends one floor height', () => {
    const segs = buildSegments(5);
    expect(pose3At(segs, 5, 0).y - pose3At(segs, 5, unitsPerFloor()).y).toBeCloseTo(FLOOR_HEIGHT);
    expect(FLOOR_HEIGHT).toBeCloseTo(FLIGHT_DROP * 2);
  });
  it('clamps progress', () => {
    const segs = buildSegments(3);
    expect(pose3At(segs, 3, -10)).toEqual(pose3At(segs, 3, 0));
  });
});
