import { describe, expect, it } from 'vitest';
import { GAME_CONFIG as C } from '../src/config/gameConfig';
import { canRun, createChase, stepChase } from '../src/systems/ChaseModel';

describe('chase model', () => {
  it('accelerates to chase speed while held, then slows when released', () => {
    let s = createChase(100);
    for (let i = 0; i < 30; i++) s = stepChase(s, true, 16, 600);
    expect(s.vx).toBe(C.chaseSpeed);
    expect(s.x).toBeGreaterThan(100);
    for (let i = 0; i < 30; i++) s = stepChase(s, false, 16, 600);
    expect(s.vx).toBe(0);
  });
  it('never passes maxX nor moves backwards', () => {
    let s = createChase(100);
    for (let i = 0; i < 200; i++) s = stepChase(s, true, 16, 180);
    expect(s.x).toBe(180);
    const back = stepChase(s, true, 16, 150);
    expect(back.x).toBe(180);
  });
  it('drains stamina, exhausts, and must recover before running again', () => {
    let s = createChase(0);
    const runMs = (C.staminaMax / C.staminaDrainPerSec) * 1000 + 100;
    for (let t = 0; t < runMs; t += 16) s = stepChase(s, true, 16, 10_000);
    expect(s.exhausted).toBe(true);
    expect(s.stamina).toBeLessThan(C.staminaMinToRun);
    expect(canRun(s)).toBe(false);
    const xBefore = s.x;
    for (let i = 0; i < 40; i++) s = stepChase(s, true, 16, 10_000); // can't sprint while exhausted
    expect(s.x - xBefore).toBeLessThan(C.chaseSpeed * 0.2);
    for (let t = 0; t < 1000; t += 16) s = stepChase(s, false, 16, 10_000);
    expect(s.stamina).toBeGreaterThan(C.staminaMinToRun);
    expect(canRun(s)).toBe(true);
  });
  it('is immutable', () => {
    const s = createChase(0);
    stepChase(s, true, 100, 500);
    expect(s).toEqual(createChase(0));
  });
});
