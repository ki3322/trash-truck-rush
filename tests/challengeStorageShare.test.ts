import { describe, expect, it } from 'vitest';
import {
  buildChallengeUrl, challengeFromLocation, challengeHeadline, decodeChallenge, encodeChallenge, MAX_CHALLENGE_LENGTH,
} from '../src/systems/ChallengeSystem';
import { applyOutcome, createDefaultSave, parseSave, StorageSystem, SAVE_KEY, withSound } from '../src/systems/StorageSystem';
import { buildShareText, threadsIntentUrl, MAX_SHARE_TEXT } from '../src/systems/ShareSystem';
import { getTitle } from '../src/systems/TitleSystem';
import type { Challenge } from '../src/types';
import { outcome } from './fixtures';

const ch: Challenge = { version: 1, difficulty: 'hard', seed: 0xdeadbeef, targetScore: 2850, targetTimeSec: 16.8 };

describe('challenge links', () => {
  it('round-trips', () => {
    expect(decodeChallenge(encodeChallenge(ch))).toEqual(ch);
    const noTime = { ...ch, targetTimeSec: null };
    expect(decodeChallenge(encodeChallenge(noTime))).toEqual(noTime);
  });
  it('builds and parses a URL', () => {
    const url = buildChallengeUrl('https://example.com/game/?foo=1#x', ch);
    expect(url.startsWith('https://example.com/game/?challenge=')).toBe(true);
    expect(challengeFromLocation(new URL(url).search)).toEqual(ch);
  });
  it.each([
    null, '', 'garbage', '1.q.abc.100.100', '2.h.abc.100.100', '1.h.abc.99999.100',
    '1.h.zzzzzzz.100.100', '1.h.abc.100.9999', '1.h.ab$.100.100', 'x'.repeat(MAX_CHALLENGE_LENGTH + 1),
  ])('rejects %s', (raw) => expect(decodeChallenge(raw)).toBeNull());
  it('headline mentions floor and time', () => {
    expect(challengeHeadline(ch)).toContain('5 樓');
    expect(challengeHeadline(ch)).toContain('16.8');
    expect(challengeHeadline({ ...ch, targetTimeSec: null })).toContain('2,850');
  });
});

describe('save data', () => {
  it('falls back to defaults on bad data', () => {
    expect(parseSave(null)).toEqual(createDefaultSave());
    expect(parseSave('{not json')).toEqual(createDefaultSave());
    expect(parseSave(JSON.stringify({ version: 99 }))).toEqual(createDefaultSave());
  });
  it('records best per difficulty immutably', () => {
    const s0 = createDefaultSave();
    const s1 = applyOutcome(s0, outcome({ throwDistanceM: 6 }, { stairTimeSec: 15 }), 1200);
    const s2 = applyOutcome(s1, outcome({ success: false, failReason: 'out_of_bags', throwDistanceM: 9 }, { stairTimeSec: 12 }), 300);
    expect(s0.stats.plays).toBe(0);
    expect(s2.stats).toEqual({ plays: 2, wins: 1, fails: 1 });
    expect(s2.best.hard).toEqual({ bestTimeSec: 12, bestScore: 1200, bestDistanceM: 6 });
    expect(s2.best.normal.bestScore).toBe(0);
    expect(parseSave(JSON.stringify(s2))).toEqual(s2);
    expect(withSound(s2, false).sound).toBe(false);
  });
  it('StorageSystem survives broken storage and keeps an in-memory copy', () => {
    const broken = new StorageSystem({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } });
    const data = withSound(createDefaultSave(), false);
    expect(broken.save(data)).toBe(false);
    expect(broken.load().sound).toBe(false);
    const none = new StorageSystem(null);
    none.save(data);
    expect(none.load()).toEqual(data);
  });
  it('StorageSystem persists to working storage', () => {
    const map = new Map<string, string>();
    const sys = new StorageSystem({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) });
    expect(sys.save(createDefaultSave())).toBe(true);
    expect(map.has(SAVE_KEY)).toBe(true);
  });
});

describe('share text', () => {
  it('includes the key stats and link, within limits', () => {
    const o = outcome({ throwDistanceM: 8.5 }, { stairTimeSec: 16.8 });
    const text = buildShareText({ outcome: o, score: 2850, title: getTitle(o), line: '垃圾車司機都認識我了！', challengeUrl: 'https://x.dev/?challenge=1' });
    expect(text).toContain('16.8 秒');
    expect(text).toContain('8.5 公尺');
    expect(text).toContain('2,850');
    expect(text).toContain('https://x.dev/?challenge=1');
    expect(text.length).toBeLessThanOrEqual(MAX_SHARE_TEXT);
    expect(threadsIntentUrl(text)).toMatch(/^https:\/\/www\.threads\.net\/intent\/post\?text=/);
  });
});

describe('save migration (mobile settings added later)', () => {
  it('fills vibration/tutorial defaults into an older save without wiping progress', () => {
    const old = { ...createDefaultSave(), stats: { plays: 7, wins: 3, fails: 4 } } as Record<string, unknown>;
    delete old.vibration;
    delete old.tutorialSeen;
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed.stats.plays).toBe(7);
    expect(parsed.vibration).toBe(true);
    expect(parsed.tutorialSeen).toBe(false);
  });
});
