import type { TrashCategory } from '../types';
import { createRng, shuffle } from '../utils/rng';

export interface TrashItem {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
  readonly category: TrashCategory;
}

/**
 * Household items with their correct bin under Taiwan's sorting rules.
 * Only clear-cut items are used so the game never teaches a wrong answer.
 */
export const TRASH_ITEMS: readonly TrashItem[] = [
  { id: 'tissue', emoji: '🧻', name: '用過的衛生紙', category: 'general' },
  { id: 'chopsticks', emoji: '🥢', name: '免洗筷', category: 'general' },
  { id: 'mask', emoji: '😷', name: '用過的口罩', category: 'general' },
  { id: 'toothbrush', emoji: '🪥', name: '舊牙刷', category: 'general' },
  { id: 'pen', emoji: '🖊️', name: '沒水的原子筆', category: 'general' },
  { id: 'cigarette', emoji: '🚬', name: '菸蒂', category: 'general' },
  { id: 'bandage', emoji: '🩹', name: '用過的OK繃', category: 'general' },
  { id: 'can', emoji: '🥫', name: '空罐頭', category: 'recycle' },
  { id: 'box', emoji: '📦', name: '紙箱', category: 'recycle' },
  { id: 'newspaper', emoji: '📰', name: '舊報紙', category: 'recycle' },
  { id: 'glass', emoji: '🍾', name: '玻璃瓶', category: 'recycle' },
  { id: 'juicebox', emoji: '🧃', name: '鋁箔包', category: 'recycle' },
  { id: 'bottle', emoji: '🧴', name: '洗髮精空瓶', category: 'recycle' },
  { id: 'battery', emoji: '🔋', name: '廢乾電池', category: 'recycle' },
];

export const CATEGORY_LABEL: Readonly<Record<TrashCategory, string>> = {
  general: '一般垃圾',
  recycle: '資源回收',
};

/**
 * Seeded pick of `count` items with at least two of each category, so a
 * challenge replays the same pile and nobody can win by always tapping one bin.
 */
export function pickSortItems(seed: number, count: number): TrashItem[] {
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  const general = shuffle(rng, TRASH_ITEMS.filter((i) => i.category === 'general'));
  const recycle = shuffle(rng, TRASH_ITEMS.filter((i) => i.category === 'recycle'));
  const n = Math.max(4, Math.min(count, TRASH_ITEMS.length));
  const minEach = 2;
  const extra = shuffle(rng, [...general.slice(minEach), ...recycle.slice(minEach)]).slice(0, n - minEach * 2);
  return shuffle(rng, [...general.slice(0, minEach), ...recycle.slice(0, minEach), ...extra]);
}

export function isCorrect(item: TrashItem, bin: TrashCategory): boolean {
  return item.category === bin;
}

export function wrongBinMessage(item: TrashItem): string {
  return `✘ ${item.name}是${CATEGORY_LABEL[item.category]}！`;
}
