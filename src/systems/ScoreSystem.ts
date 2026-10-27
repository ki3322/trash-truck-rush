import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import type { RunOutcome } from '../types';

export interface ScoreLine {
  readonly label: string;
  readonly points: number;
}

export interface ScoreBreakdown {
  readonly total: number;
  readonly lines: readonly ScoreLine[];
}

export function distanceBasePoints(meters: number): number {
  const tier = GAME_CONFIG.distanceTiers.find((t) => meters >= t.minM);
  return tier ? tier.points : 0;
}

export function isFlawlessDescent(o: RunOutcome): boolean {
  return o.stair.reachedGround && o.stair.stumbles === 0 && o.stair.failedEvents.length === 0;
}

export function computeScore(o: RunOutcome): ScoreBreakdown {
  const c = GAME_CONFIG;
  const lines: ScoreLine[] = [];
  const momCaught = o.stair.succeededEvents.includes('momBag');

  if (o.success && o.throwDistanceM !== null) {
    lines.push({ label: `投擲距離 ${o.throwDistanceM.toFixed(1)} 公尺`, points: distanceBasePoints(o.throwDistanceM) });
    if (o.perfect) lines.push({ label: '完美命中', points: c.perfectHitBonus });
    if (o.attemptsUsed === 1) lines.push({ label: '一次命中', points: c.firstTryBonus });
    if (o.bounces > 0) lines.push({ label: `反彈進車（${o.bounces} 次）`, points: c.bankShotBonus });
    if (o.neighborsBeaten > 0) lines.push({ label: `搶先 ${o.neighborsBeaten} 位鄰居`, points: o.neighborsBeaten * c.beatNeighborBonus });
    const secs = Math.floor(Math.max(0, o.remainingSec));
    if (secs > 0) lines.push({ label: `剩餘 ${secs} 秒`, points: secs * c.timeBonusPerSec });
  } else {
    const start = DIFFICULTY_CONFIG[o.setup.difficulty].startFloor;
    const floors = Math.max(0, start - o.stair.floorReached);
    if (floors > 0) lines.push({ label: `衝下 ${floors} 層樓`, points: floors * c.failFloorPoints });
    if (o.stair.reachedGround) lines.push({ label: '抵達巷口', points: c.failGroundBonus });
  }
  if (o.sort.mistakes === 0) lines.push({ label: '垃圾分類滿分', points: c.perfectSortBonus });
  if (isFlawlessDescent(o)) lines.push({ label: '無失誤下樓', points: c.noMistakeBonus });
  if (momCaught) lines.push({ label: '接住媽媽那袋', points: c.momBagBonus });

  return { total: lines.reduce((sum, l) => sum + l.points, 0), lines };
}
