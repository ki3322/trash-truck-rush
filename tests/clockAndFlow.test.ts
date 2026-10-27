import { describe, expect, it } from 'vitest';
import { createClock, isExpired, pauseClock, penalize, remainingMs, startClock, tickClock } from '../src/systems/GameClock';
import { GameFlow, canTransition, nextState } from '../src/systems/GameFlow';

describe('game clock', () => {
  it('only counts while running', () => {
    let c = createClock(10_000);
    c = tickClock(c, 1000);
    expect(remainingMs(c)).toBe(10_000);
    c = tickClock(startClock(c), 1500);
    expect(remainingMs(c)).toBe(8500);
    c = tickClock(pauseClock(c), 5000);
    expect(remainingMs(c)).toBe(8500);
  });
  it('applies penalties and expires at zero without going negative', () => {
    let c = penalize(startClock(createClock(3000)), 2000);
    expect(remainingMs(c)).toBe(1000);
    c = tickClock(c, 5000);
    expect(remainingMs(c)).toBe(0);
    expect(isExpired(c)).toBe(true);
    expect(remainingMs(penalize(c, -100))).toBe(0);
  });
  it('is immutable', () => {
    const c = startClock(createClock(1000));
    tickClock(c, 500);
    expect(c.elapsedMs).toBe(0);
  });
});

describe('game flow', () => {
  it('allows the main loop', () => {
    const f = new GameFlow();
    for (const s of ['menu', 'intro', 'sort', 'stairs', 'throw', 'result', 'intro', 'sort', 'stairs', 'result', 'menu'] as const) {
      expect(f.go(s)).toBe(true);
    }
    expect(f.state).toBe('menu');
  });
  it('rejects invalid jumps', () => {
    expect(canTransition('menu', 'result')).toBe(false);
    expect(() => nextState('boot', 'throw')).toThrow();
    const f = new GameFlow();
    expect(f.go('throw')).toBe(false);
    expect(f.state).toBe('boot');
  });
});
