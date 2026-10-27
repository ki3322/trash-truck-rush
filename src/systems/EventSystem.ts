import { GAME_CONFIG } from '../config/gameConfig';
import type { EventType, ScheduledEvent } from '../types';
import { createRng, shuffle } from '../utils/rng';

export interface EventDefinition {
  readonly type: EventType;
  readonly prompt: string;
  /** Button label; null for events resolved by *not* tapping. */
  readonly action: string | null;
  readonly successText: string;
  readonly failText: string;
  readonly timePenaltyMs: number;
  readonly stunMs: number;
  readonly slowMs: number;
  readonly bonus: number;
}

export const EVENT_DEFS: Readonly<Record<EventType, EventDefinition>> = {
  shoeCabinet: {
    type: 'shoeCabinet',
    prompt: '誰把鞋櫃放這裡啦！',
    action: '閃避',
    successText: '帥氣跳過！',
    failText: '撞到鞋櫃！-2 秒',
    timePenaltyMs: 2000,
    stunMs: 500,
    slowMs: 0,
    bonus: 0,
  },
  grandma: {
    type: 'grandma',
    prompt: '少年欸，慢慢來啦！',
    action: '讓路',
    successText: '阿嬤：好乖喔～',
    failText: '只好停下來等阿嬤…-3 秒',
    timePenaltyMs: 3000,
    stunMs: 700,
    slowMs: 0,
    bonus: 0,
  },
  slipper: {
    type: 'slipper',
    prompt: '我的拖鞋！！！',
    action: '撿拖鞋',
    successText: '拖鞋回來了！',
    failText: '單腳跑…速度下降！',
    timePenaltyMs: 0,
    stunMs: 0,
    slowMs: GAME_CONFIG.slipperSlowMs,
    bonus: 0,
  },
  momBag: {
    type: 'momBag',
    prompt: '等一下！還有一袋！',
    action: '接住垃圾',
    successText: '接到了！+200',
    failText: '掉到樓下…撿回來 -2 秒',
    timePenaltyMs: 2000,
    stunMs: 400,
    slowMs: 0,
    bonus: GAME_CONFIG.momBagBonus,
  },
  bagTear: {
    type: 'bagTear',
    prompt: '完蛋！垃圾袋快破了！',
    action: null,
    successText: '穩住了…呼～',
    failText: '垃圾掉滿地！收拾中 -2.5 秒',
    timePenaltyMs: 2500,
    stunMs: 900,
    slowMs: 0,
    bonus: 0,
  },
};

export const EVENT_TYPES: readonly EventType[] = Object.keys(EVENT_DEFS) as EventType[];

/**
 * Pick `count` distinct events and spread them evenly along the stairs.
 * Deterministic for a given seed so challenge links replay the same layout.
 */
export function pickEvents(seed: number, count: number, total: number): ScheduledEvent[] {
  const margin = GAME_CONFIG.eventMarginUnits;
  const usable = total - margin * 2;
  const n = Math.max(0, Math.min(count, EVENT_TYPES.length));
  if (n === 0 || usable <= 0) return [];
  const rng = createRng(seed ^ 0x9e3779b9);
  const types = shuffle(rng, EVENT_TYPES).slice(0, n);
  const slot = usable / n;
  return types.map((type, i) => {
    // Keep each event within the middle 60% of its slot so they never overlap.
    const offset = slot * (0.2 + rng() * 0.6);
    return { type, atUnit: Math.round((margin + slot * i + offset) * 10) / 10 };
  });
}
