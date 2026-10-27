import { describe, expect, it } from 'vitest';
import { computeViewHeight, DESIGN_HEIGHT, MAX_VIEW_HEIGHT, topY, bottomY } from '../src/ui/view';

describe('mobile viewport height', () => {
  it.each([
    [390, 844, 1558], // iPhone 13/14: 19.5:9
    [360, 800, 1600], // tall Android: clamped
    [375, 667, DESIGN_HEIGHT], // iPhone SE: 16:9 → design height
    [768, 1024, DESIGN_HEIGHT], // tablet: wider than 9:16
    [1280, 800, DESIGN_HEIGHT], // desktop landscape
  ])('%sx%s → %s', (w, h, expected) => {
    const v = computeViewHeight(w, h);
    expect(v).toBe(expected);
    expect(v % 2).toBe(0);
    expect(v).toBeLessThanOrEqual(MAX_VIEW_HEIGHT);
  });
  it('handles bad input', () => {
    expect(computeViewHeight(0, 0)).toBe(DESIGN_HEIGHT);
    expect(computeViewHeight(NaN, 800)).toBe(DESIGN_HEIGHT);
  });
  it('anchors are identity in node (no extra height)', () => {
    expect(topY(12)).toBe(12);
    expect(bottomY(1198)).toBe(1198);
  });
});
