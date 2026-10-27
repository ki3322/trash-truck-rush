import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAPTIC_PATTERNS, haptic, hapticsSupported, setHapticsEnabled } from '../src/systems/Haptics';

describe('haptics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setHapticsEnabled(true);
  });
  it('is a safe no-op without navigator.vibrate (iOS / node)', () => {
    vi.stubGlobal('navigator', {});
    expect(hapticsSupported()).toBe(false);
    expect(() => haptic('hit')).not.toThrow();
  });
  it('vibrates with the pattern, and respects the toggle', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    haptic('hit');
    expect(vibrate).toHaveBeenCalledWith([...(HAPTIC_PATTERNS.hit as number[])]);
    setHapticsEnabled(false);
    haptic('tap');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
  it('swallows browser errors', () => {
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('no gesture'); } });
    expect(() => haptic('tap')).not.toThrow();
  });
});
