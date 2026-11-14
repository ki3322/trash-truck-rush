import Phaser from 'phaser';
import { FONT_FAMILY } from '../ui/theme';

const CONFETTI_COLORS = [0xffe066, 0xff6b6b, 0x7ed957, 0x6ec6ff, 0xffffff, 0xff9ec7];

/** Celebration burst when the bag lands in the truck. */
export function confetti(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 40; i++) {
    const r = scene.add.rectangle(x, y, 10, 16, Phaser.Math.RND.pick(CONFETTI_COLORS)).setDepth(60);
    scene.tweens.add({
      targets: r,
      x: x + Phaser.Math.Between(-260, 260),
      y: y + Phaser.Math.Between(-320, 120),
      angle: Phaser.Math.Between(-360, 360),
      alpha: 0,
      duration: Phaser.Math.Between(900, 1500),
      ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    });
  }
  const flash = scene.add.text(x, y - 140, '🎉', { fontFamily: FONT_FAMILY, fontSize: '90px' }).setOrigin(0.5).setDepth(61);
  scene.tweens.add({ targets: flash, y: y - 220, alpha: 0, duration: 1400, onComplete: () => flash.destroy() });
}

/** Dotted trajectory preview plus a short arrow showing the launch angle. */
export function drawTrajectory(
  g: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
  totalSteps: number,
  origin: { x: number; y: number },
  angleDeg: number,
  ink: number,
): void {
  points.forEach((p, i) => {
    if (i % 4 !== 0) return;
    const a = 1 - i / totalSteps;
    g.fillStyle(ink, a * 0.7);
    g.fillCircle(p.x, p.y, 7);
    g.fillStyle(0xffffff, a);
    g.fillCircle(p.x, p.y, 4.5);
  });
  const rad = (angleDeg * Math.PI) / 180;
  g.lineStyle(6, 0xffe066, 1);
  g.lineBetween(origin.x, origin.y, origin.x + Math.cos(rad) * 70, origin.y - Math.sin(rad) * 70);
}
