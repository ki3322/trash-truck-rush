import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { Button } from './Button';
import { VIEW } from './view';
import { COLORS, FONT_FAMILY } from './theme';

/** Modal panel with a title, body lines and a close button. */
export function showOverlay(
  scene: Phaser.Scene,
  title: string,
  lines: readonly string[],
  onClose?: () => void,
): Phaser.GameObjects.Container {
  const { width: W, height: H } = VIEW;
  const c = scene.add.container(0, 0).setDepth(1000).setScrollFactor(0);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive();
  const panelH = Math.min(H - 160, 220 + lines.length * 46);
  const top = (H - panelH) / 2;
  const g = scene.add.graphics();
  g.fillStyle(COLORS.ink, 1);
  g.fillRoundedRect(40, top + 8, W - 80, panelH, 28);
  g.fillStyle(COLORS.cream, 1);
  g.fillRoundedRect(40, top, W - 80, panelH, 28);
  g.lineStyle(6, COLORS.ink, 1);
  g.strokeRoundedRect(40, top, W - 80, panelH, 28);
  const t = scene.add
    .text(W / 2, top + 60, title, { fontFamily: FONT_FAMILY, fontSize: '46px', fontStyle: '900', color: '#2d1b00' })
    .setOrigin(0.5);
  const body = scene.add.text(80, top + 120, lines.join('\n'), {
    fontFamily: FONT_FAMILY,
    fontSize: '27px',
    fontStyle: '700',
    color: '#2d1b00',
    lineSpacing: 16,
    wordWrap: { width: W - 160, useAdvancedWrap: true },
  });
  const close = new Button(scene, W / 2, top + panelH - 70, {
    width: 260,
    height: 84,
    label: '知道了',
    onClick: () => {
      c.destroy();
      onClose?.();
    },
  });
  c.add([shade, g, t, body, close]);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 150 });
  return c;
}

/** Short floating message near the bottom of the screen. */
export function toast(scene: Phaser.Scene, message: string, y = VIEW.height - 120): void {
  const { width: W } = GAME_CONFIG;
  const text = scene.add
    .text(W / 2, y, message, {
      fontFamily: FONT_FAMILY,
      fontSize: '28px',
      fontStyle: '800',
      color: '#ffffff',
      backgroundColor: '#2d1b00',
      padding: { x: 24, y: 14 },
      align: 'center',
      wordWrap: { width: W - 80, useAdvancedWrap: true },
    })
    .setOrigin(0.5)
    .setDepth(2000)
    .setScrollFactor(0);
  scene.tweens.add({ targets: text, y: y - 30, alpha: { from: 1, to: 0 }, delay: 1500, duration: 400, onComplete: () => text.destroy() });
}

/** Floating "+200" / "-2 秒" style text that rises and fades. */
export function popText(scene: Phaser.Scene, x: number, y: number, message: string, color = '#ffffff', size = 34): void {
  const t = scene.add
    .text(x, y, message, {
      fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: '900', color, stroke: '#2d1b00', strokeThickness: 7,
    })
    .setOrigin(0.5)
    .setDepth(900);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}
