import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import type { RunOutcome } from '../types';

export interface Title {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
}

interface TitleRule {
  readonly title: Title;
  readonly test: (o: RunOutcome) => boolean;
}

const fast = (o: RunOutcome) =>
  o.stair.stairTimeSec <= DIFFICULTY_CONFIG[o.setup.difficulty].fastStairSec;
const godFast = (o: RunOutcome) =>
  o.stair.stairTimeSec <= DIFFICULTY_CONFIG[o.setup.difficulty].godStairSec;
const longShot = (o: RunOutcome) => (o.throwDistanceM ?? 0) >= GAME_CONFIG.longShotM;

/** Ordered: the first matching rule wins, so overlapping conditions are unambiguous. */
const SUCCESS_RULES: readonly TitleRule[] = [
  {
    title: { id: 'god', name: '垃圾車之神', emoji: '🏆', description: '極速下樓＋遠距離完美命中' },
    test: (o) => godFast(o) && longShot(o) && o.perfect,
  },
  {
    title: { id: 'clutch', name: '極限壓線戰士', emoji: '⏱️', description: '剩不到 3 秒還能成功' },
    test: (o) => o.remainingSec < GAME_CONFIG.clutchRemainingSec,
  },
  {
    title: { id: 'legend', name: '巷口傳說', emoji: '🌟', description: '快速下樓＋一次命中' },
    test: (o) => fast(o) && o.attemptsUsed === 1,
  },
  {
    title: { id: 'sniper', name: '遠距離神射手', emoji: '🎯', description: '遠距離成功命中' },
    test: longShot,
  },
  {
    title: { id: 'sprinter', name: '拖鞋衝刺王', emoji: '🩴', description: '下樓速度優秀' },
    test: fast,
  },
  {
    title: { id: 'neighbor', name: '準時倒垃圾的好鄰居', emoji: '🙂', description: '平安把垃圾送上車' },
    test: () => true,
  },
];

const FAIL_RULES: readonly TitleRule[] = [
  {
    title: { id: 'slipperless', name: '拖鞋失蹤人口', emoji: '🩴', description: '因為拖鞋事件而失敗' },
    test: (o) => o.stair.failedEvents.includes('slipper'),
  },
  {
    title: { id: 'stairwell', name: '樓梯間住戶', emoji: '🏚️', description: '沒能抵達一樓' },
    test: (o) => !o.stair.reachedGround,
  },
  {
    title: { id: 'tomorrow', name: '明天再說大師', emoji: '😴', description: '垃圾車開走了' },
    test: (o) => o.failReason === 'truck_left',
  },
  {
    title: { id: 'hoarder', name: '垃圾囤積大師', emoji: '🗑️', description: '倒數結束仍未完成' },
    test: (o) => o.failReason === 'throw_timeout',
  },
  {
    title: { id: 'pitcher', name: '垃圾袋投手', emoji: '⚾', description: '投出去了，但沒進' },
    test: () => true,
  },
];

export function getTitle(o: RunOutcome): Title {
  const rules = o.success ? SUCCESS_RULES : FAIL_RULES;
  // The last rule in each list always matches, so find() never returns undefined.
  return (rules.find((r) => r.test(o)) ?? rules[rules.length - 1]).title;
}

export const ALL_TITLES: readonly Title[] = [...SUCCESS_RULES, ...FAIL_RULES].map((r) => r.title);
