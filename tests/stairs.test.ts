import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { buildSegments, floorAt, positionAt, totalUnits, unitsPerFloor, floorLandingY } from '../src/utils/stairPath';
import { INITIAL_RUNNER, applySlow, applyStun, speedRatio, strideFor, tap } from '../src/systems/RunnerModel';

describe('stair path', () => {
  it('has continuous segments that sum to total units', () => {
    for (const floor of [3, 5, 6]) {
      const segs = buildSegments(floor);
      const last = segs[segs.length - 1];
      expect(last.startUnit + last.units).toBe(totalUnits(floor));
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i].startUnit).toBe(segs[i - 1].startUnit + segs[i - 1].units);
      }
    }
  });
  it('never jumps between consecutive progress samples (no getting stuck/teleporting)', () => {
    const segs = buildSegments(5);
    let prev = positionAt(segs, 0);
    for (let p = 0.25; p <= totalUnits(5); p += 0.25) {
      const cur = positionAt(segs, p);
      expect(Math.abs(cur.x - prev.x)).toBeLessThan(60);
      expect(Math.abs(cur.y - prev.y)).toBeLessThan(GAME_CONFIG.stepHeight + 10);
      prev = cur;
    }
  });
  it('reports floors descending to 1F and clamps', () => {
    expect(floorAt(5, 0)).toBe(5);
    expect(floorAt(5, unitsPerFloor())).toBe(4);
    expect(floorAt(5, totalUnits(5))).toBe(1);
    expect(floorAt(5, 9999)).toBe(1);
    expect(floorLandingY(5, 5)).toBe(GAME_CONFIG.stairTopY);
  });
  it('clamps positions outside the path', () => {
    const segs = buildSegments(3);
    expect(positionAt(segs, -5)).toEqual(positionAt(segs, 0));
    expect(positionAt(segs, 999).x).toBe(positionAt(segs, totalUnits(3)).x);
  });
});

describe('runner model', () => {
  it('alternating feet advances and builds combo up to the speed cap', () => {
    let s = INITIAL_RUNNER;
    const feet = ['L', 'R'] as const;
    for (let i = 0; i < 30; i++) s = tap(s, feet[i % 2], i * 150, 1000).state;
    expect(s.stumbles).toBe(0);
    expect(strideFor(s.combo, false)).toBe(GAME_CONFIG.maxRunSpeed);
    expect(s.progress).toBeGreaterThan(30);
    expect(speedRatio(s, 30 * 150)).toBeGreaterThan(0.9);
  });
  it('same foot twice stumbles, resets combo and stuns', () => {
    let s = tap(INITIAL_RUNNER, 'L', 0, 100).state;
    const r = tap(s, 'L', 100, 100);
    expect(r.outcome).toBe('stumble');
    s = r.state;
    expect(s.combo).toBe(0);
    expect(s.stumbles).toBe(1);
    expect(tap(s, 'R', 200, 100).outcome).toBe('ignored');
    expect(tap(s, 'R', 100 + GAME_CONFIG.stumbleStunMs, 100).outcome).toBe('advance');
  });
  it('resets combo after idling', () => {
    let s = tap(INITIAL_RUNNER, 'L', 0, 100).state;
    s = tap(s, 'R', 100, 100).state;
    expect(s.combo).toBe(1);
    s = tap(s, 'L', 100 + GAME_CONFIG.comboResetMs + 1, 100).state;
    expect(s.combo).toBe(0);
    expect(speedRatio(s, 5000)).toBe(0);
  });
  it('does not exceed max progress and ignores taps at the end', () => {
    const s = tap({ ...INITIAL_RUNNER, progress: 9.5 }, 'L', 0, 10).state;
    expect(s.progress).toBe(10);
    expect(tap(s, 'R', 100, 10).outcome).toBe('ignored');
  });
  it('slow and stun effects apply', () => {
    const slowed = applySlow(INITIAL_RUNNER, 0, 3000);
    expect(tap(slowed, 'L', 10, 100).state.progress).toBeCloseTo(GAME_CONFIG.slipperSlowFactor);
    const stunned = applyStun(INITIAL_RUNNER, 0, 500);
    expect(tap(stunned, 'L', 100, 100).outcome).toBe('ignored');
  });
});
