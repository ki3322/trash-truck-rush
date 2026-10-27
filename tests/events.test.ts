import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { EVENT_DEFS, EVENT_TYPES, pickEvents } from '../src/systems/EventSystem';
import { totalUnits } from '../src/utils/stairPath';

describe('event selection', () => {
  it('is deterministic per seed', () => {
    expect(pickEvents(42, 3, 100)).toEqual(pickEvents(42, 3, 100));
  });
  it('varies across seeds', () => {
    const layouts = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(pickEvents(i, 2, 100))));
    expect(layouts.size).toBeGreaterThan(5);
  });
  it('picks distinct types, ordered, spaced and inside the margins', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const floor of [3, 5, 6]) {
        const total = totalUnits(floor);
        const evs = pickEvents(seed, 3, total);
        expect(new Set(evs.map((e) => e.type)).size).toBe(evs.length);
        evs.forEach((e, i) => {
          expect(e.atUnit).toBeGreaterThanOrEqual(GAME_CONFIG.eventMarginUnits);
          expect(e.atUnit).toBeLessThanOrEqual(total - GAME_CONFIG.eventMarginUnits);
          if (i > 0) expect(e.atUnit - evs[i - 1].atUnit).toBeGreaterThan(4);
        });
      }
    }
  });
  it('handles zero, excessive counts and tiny paths', () => {
    expect(pickEvents(1, 0, 100)).toEqual([]);
    expect(pickEvents(1, 99, 200)).toHaveLength(EVENT_TYPES.length);
    expect(pickEvents(1, 2, 10)).toEqual([]);
  });
  it('every event has a resolvable definition', () => {
    for (const t of EVENT_TYPES) {
      const d = EVENT_DEFS[t];
      expect(d.prompt.length).toBeGreaterThan(0);
      expect(d.action === null ? t === 'bagTear' : d.action.length > 0).toBe(true);
    }
  });
});
