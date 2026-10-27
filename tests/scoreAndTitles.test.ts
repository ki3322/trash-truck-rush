import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { computeScore, distanceBasePoints, isFlawlessDescent } from '../src/systems/ScoreSystem';
import { getTitle, ALL_TITLES } from '../src/systems/TitleSystem';
import { failLine, successLine, toChineseFloor } from '../src/config/texts';
import { createRng } from '../src/utils/rng';
import { outcome } from './fixtures';

describe('distance tiers', () => {
  it.each([
    [0.5, 100], [1, 100], [2.9, 100], [3, 300], [4.9, 300], [5, 600], [6.9, 600],
    [7, 1000], [9.9, 1000], [10, 1500], [14, 1500],
  ])('%s m → %s', (m, pts) => expect(distanceBasePoints(m)).toBe(pts));
});

describe('computeScore', () => {
  it('sums every success bonus', () => {
    const s = computeScore(outcome({ throwDistanceM: 8, perfect: true, attemptsUsed: 1, remainingSec: 12.7 }, { succeededEvents: ['momBag'] }));
    const c = GAME_CONFIG;
    expect(s.total).toBe(1000 + c.perfectHitBonus + c.firstTryBonus + 12 * c.timeBonusPerSec + c.perfectSortBonus + c.noMistakeBonus + c.momBagBonus);
  });
  it('drops flawless bonus after a stumble or failed event', () => {
    expect(isFlawlessDescent(outcome({}, { stumbles: 1 }))).toBe(false);
    expect(isFlawlessDescent(outcome({}, { failedEvents: ['grandma'] }))).toBe(false);
    expect(isFlawlessDescent(outcome())).toBe(true);
  });
  it('gives partial credit on failure', () => {
    const f = computeScore(outcome({ success: false, failReason: 'stairs_timeout', throwDistanceM: null }, { reachedGround: false, floorReached: 3, stumbles: 2 }));
    expect(f.total).toBe(2 * GAME_CONFIG.failFloorPoints + GAME_CONFIG.perfectSortBonus);
    const g = computeScore(outcome({ success: false, failReason: 'out_of_bags', throwDistanceM: null }, { stumbles: 1 }));
    expect(g.total).toBe(4 * GAME_CONFIG.failFloorPoints + GAME_CONFIG.failGroundBonus + GAME_CONFIG.perfectSortBonus);
    const sloppy = computeScore(outcome({ success: false, failReason: 'out_of_bags', throwDistanceM: null, sort: { items: 6, mistakes: 2, timeSec: 7 } }, { stumbles: 1 }));
    expect(sloppy.total).toBe(4 * GAME_CONFIG.failFloorPoints + GAME_CONFIG.failGroundBonus);
  });
});

describe('titles (priority order)', () => {
  it('god beats everything when all conditions hold', () => {
    expect(getTitle(outcome({ throwDistanceM: 9, perfect: true, attemptsUsed: 1, remainingSec: 1 }, { stairTimeSec: 10 })).id).toBe('god');
  });
  it('clutch beats legend', () => {
    expect(getTitle(outcome({ attemptsUsed: 1, remainingSec: 2 }, { stairTimeSec: 10 })).id).toBe('clutch');
  });
  it('legend needs fast + first try', () => {
    expect(getTitle(outcome({ attemptsUsed: 1 }, { stairTimeSec: 14 })).id).toBe('legend');
  });
  it('sniper for long shots, sprinter for fast descents, neighbour by default', () => {
    expect(getTitle(outcome({ throwDistanceM: 7.5 }, { stairTimeSec: 30 })).id).toBe('sniper');
    expect(getTitle(outcome({}, { stairTimeSec: 14 })).id).toBe('sprinter');
    expect(getTitle(outcome({}, { stairTimeSec: 30 })).id).toBe('neighbor');
  });
  it('failure titles follow priority', () => {
    const f = (o: object, s: object = {}) => getTitle(outcome({ success: false, throwDistanceM: null, ...o }, s)).id;
    expect(f({ failReason: 'stairs_timeout' }, { reachedGround: false, failedEvents: ['slipper'] })).toBe('slipperless');
    expect(f({ failReason: 'stairs_timeout' }, { reachedGround: false })).toBe('stairwell');
    expect(f({ failReason: 'truck_left' })).toBe('tomorrow');
    expect(f({ failReason: 'throw_timeout' })).toBe('hoarder');
    expect(f({ failReason: 'out_of_bags' })).toBe('pitcher');
  });
  it('title ids are unique', () => {
    expect(new Set(ALL_TITLES.map((t) => t.id)).size).toBe(ALL_TITLES.length);
  });
});

describe('copy', () => {
  it('fills in the floor for stair failures', () => {
    const line = failLine(outcome({ success: false, failReason: 'stairs_timeout' }, { reachedGround: false, floorReached: 4 }), () => 0);
    expect(line).toContain('四樓');
  });
  it('mentions slippers when that event failed', () => {
    const line = failLine(outcome({ success: false, failReason: 'stairs_timeout' }, { reachedGround: false, failedEvents: ['slipper'] }), createRng(3));
    expect(line).toContain('拖鞋');
  });
  it('returns lines for every reason', () => {
    for (const r of ['throw_timeout', 'truck_left', 'out_of_bags'] as const) {
      expect(failLine(outcome({ success: false, failReason: r }), createRng(1)).length).toBeGreaterThan(0);
    }
    expect(successLine(createRng(1)).length).toBeGreaterThan(0);
    expect(toChineseFloor(42)).toBe('42');
  });
});

describe('crowd bonus', () => {
  it('awards points per neighbour beaten to the truck', () => {
    const base = computeScore(outcome()).total;
    expect(computeScore(outcome({ neighborsBeaten: 3 })).total).toBe(base + 3 * GAME_CONFIG.beatNeighborBonus);
  });
});
