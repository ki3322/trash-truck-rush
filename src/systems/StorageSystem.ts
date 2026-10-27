import { z } from 'zod';
import type { Difficulty, RunOutcome } from '../types';

export const SAVE_KEY = 'trash-truck-rush.save';
export const SAVE_VERSION = 1;

const bestSchema = z.object({
  bestTimeSec: z.number().nonnegative().nullable(),
  bestScore: z.number().int().nonnegative(),
  bestDistanceM: z.number().nonnegative().nullable(),
});

const saveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  sound: z.boolean(),
  // Added after v1 shipped: defaults keep older saves valid.
  vibration: z.boolean().default(true),
  tutorialSeen: z.boolean().default(false),
  view3d: z.boolean().default(true),
  stats: z.object({
    plays: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    fails: z.number().int().nonnegative(),
  }),
  best: z.object({ normal: bestSchema, hard: bestSchema, hell: bestSchema }),
});

export type BestRecord = z.infer<typeof bestSchema>;
export type SaveData = z.infer<typeof saveSchema>;

const EMPTY_BEST: BestRecord = { bestTimeSec: null, bestScore: 0, bestDistanceM: null };

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    sound: true,
    vibration: true,
    tutorialSeen: false,
    view3d: true,
    stats: { plays: 0, wins: 0, fails: 0 },
    best: { normal: { ...EMPTY_BEST }, hard: { ...EMPTY_BEST }, hell: { ...EMPTY_BEST } },
  };
}

/** Parse untrusted JSON from storage; anything invalid falls back to defaults. */
export function parseSave(raw: string | null): SaveData {
  if (!raw) return createDefaultSave();
  try {
    const result = saveSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : createDefaultSave();
  } catch {
    return createDefaultSave();
  }
}

const minOrNull = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.min(a, b);
const maxOrNull = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.max(a, b);

export function applyOutcome(save: SaveData, outcome: RunOutcome, score: number): SaveData {
  const d: Difficulty = outcome.setup.difficulty;
  const prev = save.best[d];
  const reached = outcome.stair.reachedGround ? outcome.stair.stairTimeSec : null;
  const hitDistance = outcome.success ? outcome.throwDistanceM : null;
  return {
    ...save,
    stats: {
      plays: save.stats.plays + 1,
      wins: save.stats.wins + (outcome.success ? 1 : 0),
      fails: save.stats.fails + (outcome.success ? 0 : 1),
    },
    best: {
      ...save.best,
      [d]: {
        bestTimeSec: minOrNull(prev.bestTimeSec, reached),
        bestScore: Math.max(prev.bestScore, Math.round(score)),
        bestDistanceM: maxOrNull(prev.bestDistanceM, hitDistance),
      },
    },
  };
}

export function withSound(save: SaveData, sound: boolean): SaveData {
  return { ...save, sound };
}

export function withVibration(save: SaveData, vibration: boolean): SaveData {
  return { ...save, vibration };
}

export function withView3d(save: SaveData, view3d: boolean): SaveData {
  return { ...save, view3d };
}

export function withTutorialSeen(save: SaveData): SaveData {
  return { ...save, tutorialSeen: true };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Wraps localStorage; if unavailable (private mode, blocked), keeps data in memory. */
export class StorageSystem {
  private memory: string | null = null;

  constructor(private readonly storage: StorageLike | null) {}

  static fromWindow(): StorageSystem {
    try {
      const s = window.localStorage;
      const probe = '__ttr_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return new StorageSystem(s);
    } catch {
      return new StorageSystem(null);
    }
  }

  load(): SaveData {
    try {
      return parseSave(this.storage ? this.storage.getItem(SAVE_KEY) : this.memory);
    } catch {
      return parseSave(this.memory);
    }
  }

  save(data: SaveData): boolean {
    const json = JSON.stringify(data);
    this.memory = json;
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, json);
      return true;
    } catch {
      return false;
    }
  }
}
