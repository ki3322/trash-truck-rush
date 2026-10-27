import { GAME_CONFIG } from '../config/gameConfig';

export type Foot = 'L' | 'R';

export interface RunnerState {
  readonly progress: number;
  readonly combo: number;
  readonly lastFoot: Foot | null;
  readonly lastTapAt: number;
  readonly stunnedUntil: number;
  readonly slowUntil: number;
  readonly stumbles: number;
}

export type TapOutcome = 'advance' | 'stumble' | 'ignored';

export const INITIAL_RUNNER: RunnerState = {
  progress: 0,
  combo: 0,
  lastFoot: null,
  lastTapAt: -Infinity,
  stunnedUntil: -Infinity,
  slowUntil: -Infinity,
  stumbles: 0,
};

export function strideFor(combo: number, slowed: boolean): number {
  const c = GAME_CONFIG;
  const raw = c.baseStride + combo * c.comboStrideBonus;
  const capped = Math.min(raw, c.maxRunSpeed);
  return slowed ? capped * c.slipperSlowFactor : capped;
}

/**
 * Alternating feet advance the runner and build combo; tapping the same
 * foot twice causes a stumble. Pure: returns a new state.
 */
export function tap(
  state: RunnerState,
  foot: Foot,
  now: number,
  maxProgress: number,
): { state: RunnerState; outcome: TapOutcome } {
  if (now < state.stunnedUntil || state.progress >= maxProgress) {
    return { state, outcome: 'ignored' };
  }
  if (state.lastFoot === foot) {
    return {
      state: {
        ...state,
        combo: 0,
        lastFoot: null,
        lastTapAt: now,
        stunnedUntil: now + GAME_CONFIG.stumbleStunMs,
        stumbles: state.stumbles + 1,
      },
      outcome: 'stumble',
    };
  }
  const idleTooLong = now - state.lastTapAt > GAME_CONFIG.comboResetMs;
  const combo = idleTooLong ? 0 : state.combo + 1;
  const stride = strideFor(combo, now < state.slowUntil);
  return {
    state: {
      ...state,
      progress: Math.min(maxProgress, state.progress + stride),
      combo,
      lastFoot: foot,
      lastTapAt: now,
    },
    outcome: 'advance',
  };
}

export function applySlow(state: RunnerState, now: number, ms: number): RunnerState {
  return { ...state, slowUntil: now + ms, combo: 0 };
}

export function applyStun(state: RunnerState, now: number, ms: number): RunnerState {
  return { ...state, stunnedUntil: Math.max(state.stunnedUntil, now + ms), combo: 0, lastFoot: null };
}

export function speedRatio(state: RunnerState, now: number): number {
  if (now - state.lastTapAt > GAME_CONFIG.comboResetMs) return 0;
  const c = GAME_CONFIG;
  return Math.min(1, (strideFor(state.combo, now < state.slowUntil) - c.baseStride * 0.5) / (c.maxRunSpeed - c.baseStride * 0.5));
}
