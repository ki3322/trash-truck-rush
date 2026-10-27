import type { Difficulty } from '../types';

export interface DifficultySettings {
  readonly label: string;
  readonly code: string;
  readonly description: string;
  readonly startFloor: number;
  readonly durationSec: number;
  readonly eventCount: number;
  readonly eventWindowMs: number;
  readonly truckSpeed: number;
  readonly openingWidth: number;
  readonly bags: number;
  readonly truckStartM: number;
  /** Extra metres the truck has driven per second of stair time beyond fastStairSec. */
  readonly latenessMPerSec: number;
  readonly fastStairSec: number;
  readonly godStairSec: number;
}

export const DIFFICULTY_CONFIG: Readonly<Record<Difficulty, DifficultySettings>> = {
  normal: {
    label: '普通',
    code: 'n',
    description: '從 3 樓出發・垃圾車慢・投入口大',
    startFloor: 3,
    durationSec: 45,
    eventCount: 1,
    eventWindowMs: 2000,
    truckSpeed: 45,
    openingWidth: 120,
    bags: 3,
    truckStartM: 3,
    latenessMPerSec: 0.15,
    fastStairSec: 8,
    godStairSec: 6.5,
  },
  hard: {
    label: '困難',
    code: 'h',
    description: '從 5 樓出發・垃圾車快・投入口中',
    startFloor: 5,
    durationSec: 42,
    eventCount: 2,
    eventWindowMs: 1600,
    truckSpeed: 65,
    openingWidth: 92,
    bags: 3,
    truckStartM: 3.5,
    latenessMPerSec: 0.2,
    fastStairSec: 15,
    godStairSec: 12.5,
  },
  hell: {
    label: '地獄',
    code: 'x',
    description: '從 6 樓出發・垃圾車飆・投入口小',
    startFloor: 6,
    durationSec: 40,
    eventCount: 3,
    eventWindowMs: 1300,
    truckSpeed: 85,
    openingWidth: 70,
    bags: 3,
    truckStartM: 4,
    latenessMPerSec: 0.25,
    fastStairSec: 19,
    godStairSec: 16,
  },
};

export function difficultyFromCode(code: string): Difficulty | null {
  const entry = (Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).find(
    (d) => DIFFICULTY_CONFIG[d].code === code,
  );
  return entry ?? null;
}
