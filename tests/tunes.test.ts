import { describe, expect, it } from 'vitest';
import { TUNES, TUNE_IDS, tuneForSeed, tuneLengthSec } from '../src/config/tunes';

describe('truck tunes', () => {
  it('both requested pieces are present', () => {
    expect(TUNES.furElise.title).toBe('給愛麗絲');
    expect(TUNES.maidensPrayer.title).toBe('少女的祈禱');
  });
  it.each(TUNE_IDS)('%s has valid notes and a loop length that fits a run', (id) => {
    const t = TUNES[id];
    for (const [melody, units, bass] of t.notes) {
      expect(melody === 0 || (melody >= 36 && melody <= 96)).toBe(true);
      expect(units).toBeGreaterThan(0);
      if (bass !== undefined) expect(bass).toBeGreaterThanOrEqual(24);
    }
    const len = tuneLengthSec(t);
    expect(len).toBeGreaterThan(4);
    expect(len).toBeLessThan(20);
  });
  it('Für Elise opens with the E–D♯ trill and bars of six 16ths', () => {
    const n = TUNES.furElise.notes;
    expect(n.slice(0, 4).map(([m]) => m)).toEqual([76, 75, 76, 75]);
    const afterPickup = n.slice(2).reduce((s, [, u]) => s + u, 0);
    expect(afterPickup % 6).toBe(0);
  });
  it('tune choice is seeded and both tunes occur', () => {
    expect(tuneForSeed(123)).toBe(tuneForSeed(123));
    const seen = new Set(Array.from({ length: 10 }, (_, i) => tuneForSeed(i)));
    expect(seen.size).toBe(2);
  });
});
