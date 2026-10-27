import { describe, expect, it } from 'vitest';
import { GAME_CONFIG as C } from '../src/config/gameConfig';
import { CATEGORY_LABEL, TRASH_ITEMS, isCorrect, pickSortItems, wrongBinMessage } from '../src/systems/SortSystem';
import { canRun, createChase, stepChase } from '../src/systems/ChaseModel';

describe('trash sorting', () => {
  it('has unique items in both categories', () => {
    expect(new Set(TRASH_ITEMS.map((i) => i.id)).size).toBe(TRASH_ITEMS.length);
    expect(TRASH_ITEMS.filter((i) => i.category === 'general').length).toBeGreaterThanOrEqual(4);
    expect(TRASH_ITEMS.filter((i) => i.category === 'recycle').length).toBeGreaterThanOrEqual(4);
  });
  it('is seeded, distinct and mixes both categories', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const n of [5, 6, 8]) {
        const items = pickSortItems(seed, n);
        expect(items).toHaveLength(n);
        expect(new Set(items.map((i) => i.id)).size).toBe(n);
        expect(items.filter((i) => i.category === 'general').length).toBeGreaterThanOrEqual(2);
        expect(items.filter((i) => i.category === 'recycle').length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(pickSortItems(9, 6)).toEqual(pickSortItems(9, 6));
  });
  it('clamps counts', () => {
    expect(pickSortItems(1, 1)).toHaveLength(4);
    expect(pickSortItems(1, 99)).toHaveLength(TRASH_ITEMS.length);
  });
  it('judges bins and explains mistakes', () => {
    const tissue = TRASH_ITEMS.find((i) => i.id === 'tissue')!;
    const box = TRASH_ITEMS.find((i) => i.id === 'box')!;
    expect(isCorrect(tissue, 'general')).toBe(true);
    expect(isCorrect(box, 'general')).toBe(false);
    expect(wrongBinMessage(box)).toContain(CATEGORY_LABEL.recycle);
  });
});

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
