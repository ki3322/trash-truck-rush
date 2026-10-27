import type { Challenge, Difficulty } from './types';
import { StorageSystem, type SaveData } from './systems/StorageSystem';
import { audio } from './systems/AudioSystem';
import { setHapticsEnabled } from './systems/Haptics';

/** App-wide session state shared between scenes. */
const storage = StorageSystem.fromWindow();
let save: SaveData = storage.load();
let difficulty: Difficulty = 'hard';
let pendingChallenge: Challenge | null = null;

export type RenderMode = '3d' | '2d';
/** `?view=2d` forces the classic side view (also used as a fallback when WebGL is missing). */
const forced2d = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === '2d';
let renderMode: RenderMode = forced2d || !save.view3d ? '2d' : '3d';

export function getRenderMode(): RenderMode {
  return renderMode;
}

export function setRenderMode(mode: RenderMode): void {
  renderMode = mode;
}

audio.setEnabled(save.sound);
setHapticsEnabled(save.vibration);

export function getSave(): SaveData {
  return save;
}

export function updateSave(fn: (s: SaveData) => SaveData): SaveData {
  save = fn(save);
  storage.save(save);
  return save;
}

export function getDifficulty(): Difficulty {
  return difficulty;
}

export function setDifficulty(d: Difficulty): void {
  difficulty = d;
}

export function getPendingChallenge(): Challenge | null {
  return pendingChallenge;
}

export function setPendingChallenge(c: Challenge | null): void {
  pendingChallenge = c;
}

/** Base URL (without query) used for challenge links. */
export function gameBaseUrl(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}
