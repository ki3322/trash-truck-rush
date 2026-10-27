import type Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';

/**
 * Mobile-first viewport. The game is designed in a 720×1280 space, but tall
 * phones (19.5:9 etc.) get extra logical height instead of black bars.
 * Scenes keep their content centred and anchor HUDs/controls to the edges.
 */
export const DESIGN_HEIGHT = GAME_CONFIG.height;
export const MAX_VIEW_HEIGHT = 1600;

export function computeViewHeight(innerWidth: number, innerHeight: number): number {
  if (!(innerWidth > 0 && innerHeight > 0)) return DESIGN_HEIGHT;
  const fitted = Math.round((GAME_CONFIG.width * innerHeight) / innerWidth);
  // Even numbers keep the half-offset on whole pixels.
  const clamped = Math.min(MAX_VIEW_HEIGHT, Math.max(DESIGN_HEIGHT, fitted));
  return clamped - (clamped % 2);
}

/** Measure the game container (it excludes the notch / home-indicator safe areas). */
function measure(): number {
  if (typeof window === 'undefined') return DESIGN_HEIGHT;
  const el = document.getElementById('game');
  const w = el?.clientWidth || window.innerWidth;
  const h = el?.clientHeight || window.innerHeight;
  return computeViewHeight(w, h);
}

const initialHeight = measure();

export const VIEW = {
  width: GAME_CONFIG.width,
  height: initialHeight,
  /** Extra logical pixels above and below the 1280 design area. */
  half: (initialHeight - DESIGN_HEIGHT) / 2,
} as const;

/** World y for something anchored `y` px from the top edge (design coords). */
export function topY(y: number): number {
  return y - VIEW.half;
}

/** World y for something anchored to the bottom edge (design coords, e.g. 1198 = 82px above the bottom). */
export function bottomY(y: number): number {
  return y + VIEW.half;
}

/** For non-scrolling scenes: centre the 1280 design area in the taller view. */
export function centerView(scene: Phaser.Scene): void {
  scene.cameras.main.setScroll(0, -VIEW.half);
}

/** Paint the extra strips above/below the design area so no background gap shows. */
export function fillViewExtents(scene: Phaser.Scene, topColor: number, bottomColor: number): void {
  if (VIEW.half <= 0) return;
  const g = scene.add.graphics().setDepth(-100);
  g.fillStyle(topColor, 1);
  g.fillRect(0, -VIEW.half, VIEW.width, VIEW.half + 1);
  g.fillStyle(bottomColor, 1);
  g.fillRect(0, DESIGN_HEIGHT - 1, VIEW.width, VIEW.half + 1);
}
