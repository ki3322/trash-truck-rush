import { z } from 'zod';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG, difficultyFromCode } from '../config/difficultyConfig';
import type { Challenge } from '../types';

/**
 * Challenge links encode only what is needed to replay a friend's layout:
 * `v.difficulty.seed36.score.timeDeciseconds` (e.g. `1.h.1z141z3.2850.168`).
 * This is a fun feature, not anti-cheat: values are range-checked but trusted
 * only for display.
 */

export const MAX_CHALLENGE_LENGTH = 40;
export const MAX_SCORE = 20000;
export const MAX_TIME_DS = 6000;

const PATTERN = /^(\d{1,2})\.([a-z])\.([0-9a-z]{1,7})\.(\d{1,5})\.(\d{1,4})$/;

const challengeSchema = z.object({
  version: z.literal(GAME_CONFIG.version),
  difficulty: z.enum(['normal', 'hard', 'hell']),
  seed: z.number().int().min(0).max(0xffffffff),
  targetScore: z.number().int().min(0).max(MAX_SCORE),
  targetTimeSec: z.number().min(0).max(MAX_TIME_DS / 10).nullable(),
});

export function encodeChallenge(c: Challenge): string {
  const code = DIFFICULTY_CONFIG[c.difficulty].code;
  const time = c.targetTimeSec === null ? 0 : Math.round(c.targetTimeSec * 10);
  const score = Math.min(MAX_SCORE, Math.max(0, Math.round(c.targetScore)));
  return [c.version, code, (c.seed >>> 0).toString(36), score, Math.min(MAX_TIME_DS, time)].join('.');
}

export function decodeChallenge(raw: string | null | undefined): Challenge | null {
  if (!raw || raw.length > MAX_CHALLENGE_LENGTH) return null;
  const m = PATTERN.exec(raw.trim().toLowerCase());
  if (!m) return null;
  const difficulty = difficultyFromCode(m[2]);
  const timeDs = Number(m[5]);
  const parsed = challengeSchema.safeParse({
    version: Number(m[1]),
    difficulty,
    seed: parseInt(m[3], 36),
    targetScore: Number(m[4]),
    targetTimeSec: timeDs === 0 ? null : timeDs / 10,
  });
  return parsed.success ? parsed.data : null;
}

export function challengeFromLocation(search: string): Challenge | null {
  try {
    return decodeChallenge(new URLSearchParams(search).get('challenge'));
  } catch {
    return null;
  }
}

export function buildChallengeUrl(baseUrl: string, c: Challenge): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('challenge', encodeChallenge(c));
  return url.toString();
}

export function challengeHeadline(c: Challenge): string {
  const floor = DIFFICULTY_CONFIG[c.difficulty].startFloor;
  return c.targetTimeSec !== null
    ? `你的朋友從 ${floor} 樓衝下來，只花了 ${c.targetTimeSec.toFixed(1)} 秒！`
    : `你的朋友從 ${floor} 樓出發，拿到 ${c.targetScore.toLocaleString('zh-TW')} 分！`;
}
