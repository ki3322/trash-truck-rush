import Phaser from 'phaser';
import { COLORS, FONT_FAMILY } from '../ui/theme';
import { drawPottedPlant, drawScooter } from './Props';

/** Reusable backdrops drawn with Graphics (Taiwanese street + old apartment). */

export function drawSky(scene: Phaser.Scene, w: number, h: number, top = 0x8fd3ff, bottom = 0xfff1c1): void {
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(0xffffff, 0.85);
  [[120, 160, 1], [520, 110, 0.8], [620, 300, 0.6]].forEach(([x, y, s]) => {
    g.fillEllipse(x, y, 140 * s, 46 * s);
    g.fillEllipse(x + 40 * s, y - 16 * s, 90 * s, 46 * s);
  });
}

export function drawTiledWall(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, base: number, line: number, tile = 22): void {
  g.fillStyle(base, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(line, 1);
  for (let ty = y; ty < y + h; ty += tile) g.fillRect(x, ty, w, 2);
  for (let tx = x; tx < x + w; tx += tile * 2) g.fillRect(tx, y, 2, h);
}

/** Green iron-grille window (鐵窗). */
export function drawIronWindow(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  g.fillStyle(0x9ed8f5, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(0xffffff, 0.4);
  g.fillTriangle(x, y, x + w * 0.4, y, x, y + h * 0.5);
  g.fillStyle(COLORS.ironGreen, 1);
  for (let gx = x; gx <= x + w; gx += 12) g.fillRect(gx - 2, y - 8, 4, h + 16);
  g.fillRect(x - 8, y - 8, w + 16, 5);
  g.fillRect(x - 8, y + h / 2, w + 16, 4);
  g.fillRect(x - 8, y + h + 4, w + 16, 5);
}

/** Old 4–6 storey walk-up building facade. */
export function drawApartmentFacade(scene: Phaser.Scene, x: number, groundY: number, w: number, floors: number, floorH = 130): void {
  const g = scene.add.graphics();
  const top = groundY - floors * floorH;
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(x - 4, top - 4, w + 8, floors * floorH + 4);
  drawTiledWall(g, x, top, w, floors * floorH, COLORS.tileBeige, COLORS.tileLine, 18);
  for (let f = 0; f < floors; f++) {
    const fy = top + f * floorH;
    g.fillStyle(0xbfae86, 1);
    g.fillRect(x, fy + floorH - 10, w, 10);
    if (f < floors - 1) {
      drawIronWindow(g, x + 24, fy + 26, w * 0.32, floorH * 0.5);
      drawIronWindow(g, x + w * 0.55, fy + 26, w * 0.32, floorH * 0.5);
      // AC unit + plant on a ledge
      g.fillStyle(COLORS.ink, 1);
      g.fillRect(x + w * 0.55 + 6, fy + floorH * 0.5 + 34, 46, 26);
      g.fillStyle(0xeeeeee, 1);
      g.fillRect(x + w * 0.55 + 8, fy + floorH * 0.5 + 36, 42, 22);
    }
  }
  // Ground floor: iron door + mailboxes
  const gy = groundY - floorH;
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(x + 20, gy + 16, 90, floorH - 16);
  g.fillStyle(0x6d4c41, 1);
  g.fillRect(x + 24, gy + 20, 82, floorH - 20);
  g.fillStyle(0x8d6e63, 1);
  for (let i = 0; i < 4; i++) g.fillRect(x + 30, gy + 30 + i * 24, 70, 14);
  g.fillStyle(0x90a4ae, 1);
  g.fillRect(x + 130, gy + 40, 70, 46);
  g.fillStyle(COLORS.ink, 1);
  for (let i = 0; i < 3; i++) g.fillRect(x + 134 + i * 22, gy + 52, 18, 3);
  scene.add
    .text(x + w / 2, top + 4, '幸福公寓', { fontFamily: FONT_FAMILY, fontSize: '20px', fontStyle: '900', color: '#ffffff', backgroundColor: '#c1121f', padding: { x: 8, y: 4 } })
    .setOrigin(0.5, 0);
}

/** Street-side shop row with arcade (騎樓), signs, poles, scooters. */
export function drawStreet(scene: Phaser.Scene, w: number, groundY: number): void {
  const g = scene.add.graphics();
  // Back buildings
  const shops = [
    { x: 0, w: 250, h: 520, color: 0xe7d3a8, sign: '早餐店', signColor: 0xe63946 },
    { x: 250, w: 230, h: 600, color: 0xc9d6df, sign: '巷口超商', signColor: 0x2a9d8f },
    { x: 480, w: 240, h: 480, color: 0xf2c6b4, sign: '機車行', signColor: 0x3d7ae0 },
  ];
  shops.forEach((s) => {
    const top = groundY - s.h;
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(s.x, top - 4, s.w, s.h);
    drawTiledWall(g, s.x + 3, top, s.w - 6, s.h - 150, s.color, Phaser.Display.Color.ValueToColor(s.color).darken(8).color, 20);
    for (let fy = top + 30; fy < groundY - 230; fy += 120) drawIronWindow(g, s.x + 40, fy, s.w - 80, 64);
    // Arcade (騎樓): pillars and shadowed walkway
    g.fillStyle(0x6b5a3a, 1);
    g.fillRect(s.x + 3, groundY - 150, s.w - 6, 150);
    g.fillStyle(0x4a3d27, 1);
    g.fillRect(s.x + 3, groundY - 150, s.w - 6, 20);
    g.fillStyle(0xd8c8a0, 1);
    g.fillRect(s.x + 6, groundY - 150, 22, 150);
    g.fillRect(s.x + s.w - 28, groundY - 150, 22, 150);
    // Shop sign
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(s.x + 26, groundY - 214, s.w - 52, 56);
    g.fillStyle(s.signColor, 1);
    g.fillRect(s.x + 30, groundY - 210, s.w - 60, 48);
    scene.add
      .text(s.x + s.w / 2, groundY - 186, s.sign, { fontFamily: FONT_FAMILY, fontSize: '30px', fontStyle: '900', color: '#ffffff' })
      .setOrigin(0.5);
    // Warm shop light
    g.fillStyle(0xfff3b0, 0.65);
    g.fillRect(s.x + 40, groundY - 120, s.w - 80, 90);
  });
  // Vertical sign
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(452, groundY - 470, 50, 190);
  g.fillStyle(0xffd166, 1);
  g.fillRect(456, groundY - 466, 42, 182);
  scene.add
    .text(477, groundY - 375, '牛\n肉\n麵', { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: '900', color: '#c1121f', align: 'center', lineSpacing: 6 })
    .setOrigin(0.5);

  // Utility pole and wires
  g.fillStyle(0x7f8c8d, 1);
  g.fillRect(640, groundY - 640, 18, 640);
  g.fillStyle(COLORS.ink, 1);
  g.fillRect(610, groundY - 610, 80, 8);
  g.lineStyle(3, COLORS.ink, 0.8);
  g.beginPath();
  g.moveTo(0, groundY - 560);
  g.lineTo(649, groundY - 606);
  g.moveTo(0, groundY - 520);
  g.lineTo(649, groundY - 590);
  g.strokePath();
  // Street lamp
  g.fillStyle(0x546e7a, 1);
  g.fillRect(24, groundY - 420, 10, 420);
  g.fillRect(24, groundY - 420, 60, 8);
  g.fillStyle(0xfff59d, 1);
  g.fillEllipse(84, groundY - 406, 34, 16);

  // Sidewalk + road
  g.fillStyle(0xbdbdbd, 1);
  g.fillRect(0, groundY, w, 24);
  g.fillStyle(0x8e8e8e, 1);
  g.fillRect(0, groundY + 24, w, 8);
  g.fillStyle(0x4a4a4a, 1);
  g.fillRect(0, groundY + 32, w, 120);
  g.fillStyle(0xffffff, 1);
  for (let x = 20; x < w; x += 120) g.fillRect(x, groundY + 90, 60, 8);
  g.fillStyle(0xf4d03f, 1);
  g.fillRect(0, groundY + 36, w, 5);

  drawScooter(g, 200, groundY, 0xe63946);
  drawScooter(g, 318, groundY, 0x3d7ae0);
  drawPottedPlant(g, 560, groundY);
}
