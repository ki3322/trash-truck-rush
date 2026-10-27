import type { RunOutcome, StairResult } from '../src/types';

export const baseStair: StairResult = {
  reachedGround: true,
  stairTimeSec: 14,
  floorReached: 1,
  stumbles: 0,
  failedEvents: [],
  succeededEvents: [],
  remainingMs: 20000,
};

export function outcome(overrides: Partial<RunOutcome> = {}, stair: Partial<StairResult> = {}): RunOutcome {
  return {
    setup: { difficulty: 'hard', seed: 1, challenge: null },
    success: true,
    failReason: null,
    lastMiss: null,
    throwDistanceM: 6,
    perfect: false,
    attemptsUsed: 2,
    remainingSec: 10,
    bounces: 0,
    sort: { items: 6, mistakes: 0, timeSec: 5 },
    ...overrides,
    stair: { ...baseStair, ...stair },
  };
}
