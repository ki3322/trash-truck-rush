/**
 * Vibration feedback for phones. Android browsers support navigator.vibrate;
 * iOS Safari ignores it, so every call is a safe no-op there.
 */
export type HapticKind = 'tap' | 'go' | 'stumble' | 'success' | 'fail' | 'wrong' | 'bounce' | 'hit';

export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, number | readonly number[]>> = {
  tap: 10,
  go: 40,
  stumble: [30, 30, 30],
  success: 20,
  fail: 90,
  wrong: [50, 40, 50],
  bounce: 18,
  hit: [40, 60, 120],
};

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function haptic(kind: HapticKind): void {
  if (!enabled || !hapticsSupported()) return;
  try {
    const p = HAPTIC_PATTERNS[kind];
    navigator.vibrate(typeof p === 'number' ? p : [...p]);
  } catch {
    // Some browsers throw if called without a prior user gesture; ignore.
  }
}
