import Phaser from 'phaser';
import { COLORS } from '../ui/theme';

/** Small scenery/event props, drawn with Graphics so no image assets are needed. */

export function drawShoeCabinet(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(-32, -62, 64, 62);
  g.fillStyle(0xb5835a, 1);
  g.fillRect(-28, -58, 56, 56);
  g.fillStyle(0x8c5e3c, 1);
  g.fillRect(-28, -40, 56, 3);
  g.fillRect(-28, -20, 56, 3);
  const shoeColors = [0xe63946, 0x3d7ae0, 0xffffff, 0x2a9d8f];
  shoeColors.forEach((c, i) => {
    g.fillStyle(c, 1);
    g.fillRoundedRect(-24 + (i % 2) * 26, -54 + Math.floor(i / 2) * 20, 20, 10, 4);
  });
  // A pair of slippers on top + umbrella leaning
  g.fillStyle(0x1f9e89, 1);
  g.fillRoundedRect(-26, -68, 22, 6, 3);
  g.fillStyle(0x6c5ce7, 1);
  g.fillRect(24, -88, 4, 86);
  g.fillTriangle(18, -88, 34, -88, 26, -100);
  return g;
}

export function drawGrandma(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(COLORS.ink, 1);
  g.fillRoundedRect(-22, -92, 44, 74, 10);
  g.fillStyle(0xc0392b, 1);
  g.fillRoundedRect(-19, -89, 38, 50, 8);
  g.fillStyle(0xf1c40f, 1);
  for (let i = 0; i < 5; i++) g.fillCircle(-12 + (i % 3) * 12, -78 + Math.floor(i / 3) * 18, 3);
  g.fillStyle(0x34495e, 1);
  g.fillRect(-16, -40, 32, 22);
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(-12, -18, 9, 18);
  g.fillRect(4, -18, 9, 18);
  // Head with grey bun
  g.fillStyle(COLORS.ink, 1);
  g.fillCircle(0, -108, 22);
  g.fillStyle(0xf6c9a0, 1);
  g.fillCircle(0, -108, 19);
  g.fillStyle(0xcfcfcf, 1);
  g.fillRoundedRect(-20, -128, 40, 14, 7);
  g.fillCircle(0, -132, 9);
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(-9, -108, 6, 2);
  g.fillRect(4, -108, 6, 2);
  g.lineStyle(2, COLORS.ink, 1);
  g.beginPath();
  g.arc(0, -100, 5, 0.2, Math.PI - 0.2);
  g.strokePath();
  // Cane and vegetable bag
  g.fillStyle(0x8c5e3c, 1);
  g.fillRect(-32, -60, 5, 60);
  g.fillStyle(0x27ae60, 1);
  g.fillRoundedRect(18, -60, 24, 26, 6);
  g.fillStyle(0x2ecc71, 1);
  g.fillTriangle(22, -60, 30, -76, 34, -60);
  c.add(g);
  return c;
}

export function drawSlipper(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(COLORS.ink, 1);
  g.fillRoundedRect(-16, -6, 32, 12, 5);
  g.fillStyle(0x1f9e89, 1);
  g.fillRoundedRect(-14, -4, 28, 8, 4);
  g.fillStyle(0xffffff, 1);
  g.fillRect(-4, -7, 10, 4);
  return g;
}

export function drawPottedPlant(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(x - 16, y - 28, 32, 28);
  g.fillStyle(0xc0603a, 1);
  g.fillRect(x - 13, y - 25, 26, 22);
  g.fillStyle(0x2e8b57, 1);
  g.fillCircle(x, y - 40, 16);
  g.fillCircle(x - 12, y - 32, 10);
  g.fillCircle(x + 12, y - 33, 10);
  g.fillStyle(0x3cb371, 1);
  g.fillCircle(x - 4, y - 46, 8);
}

export function drawBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w = 44, h = 32): void {
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(x - w / 2 - 2, y - h - 2, w + 4, h + 2);
  g.fillStyle(0xc89b62, 1);
  g.fillRect(x - w / 2, y - h, w, h);
  g.fillStyle(0xa47a45, 1);
  g.fillRect(x - 2, y - h, 4, h);
}

export function drawScooter(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
  g.fillStyle(COLORS.ink, 1);
  g.fillCircle(x - 34, y - 14, 15);
  g.fillCircle(x + 34, y - 14, 15);
  g.fillStyle(0x777777, 1);
  g.fillCircle(x - 34, y - 14, 7);
  g.fillCircle(x + 34, y - 14, 7);
  g.fillStyle(COLORS.ink, 1);
  g.fillRoundedRect(x - 44, y - 50, 88, 30, 12);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - 41, y - 47, 82, 24, 10);
  g.fillStyle(0x222222, 1);
  g.fillRoundedRect(x - 36, y - 58, 44, 12, 5);
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(x + 26, y - 82, 6, 36);
  g.fillRect(x + 18, y - 84, 22, 5);
}
