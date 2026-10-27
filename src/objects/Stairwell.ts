import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { COLORS, FONT_FAMILY } from '../ui/theme';
import { flightDrop, floorLandingY, type Segment } from '../utils/stairPath';
import { drawBox, drawPottedPlant } from './Props';
import { drawIronWindow, drawTiledWall } from './Scenery';

const C = GAME_CONFIG;
const CONCRETE = 0xb7b0a6;
const CONCRETE_DARK = 0x8f877c;
const NOSING = 0xd9d2c5;

export function stairwellHeight(startFloor: number): number {
  return floorLandingY(startFloor, 1) + 420;
}

/** Draws the whole zig-zag stairwell for a run (static, drawn once). */
export function drawStairwell(scene: Phaser.Scene, startFloor: number, segments: readonly Segment[]): void {
  const W = C.width;
  const H = stairwellHeight(startFloor);
  const bg = scene.add.graphics().setDepth(0);
  drawTiledWall(bg, 0, 0, W, H, COLORS.tileBeige, COLORS.tileLine, 26);
  // Darker lower wainscot band per floor for depth
  const fg = scene.add.graphics().setDepth(2);

  for (let f = startFloor; f >= 1; f--) {
    const y = floorLandingY(startFloor, f);
    drawFloorLanding(scene, bg, fg, y, f, startFloor);
    if (f > 1) drawMidLanding(bg, fg, y + flightDrop());
  }

  segments
    .filter((s) => s.kind === 'flight')
    .forEach((s) => drawFlight(fg, s));

  // Roof above the top floor
  bg.fillStyle(0x6b5a3a, 1);
  bg.fillRect(0, 0, W, Math.max(0, C.stairTopY - 230));
}

function drawFloorLanding(
  scene: Phaser.Scene,
  bg: Phaser.GameObjects.Graphics,
  fg: Phaser.GameObjects.Graphics,
  y: number,
  floor: number,
  startFloor: number,
): void {
  const left = C.stairLeftX - C.landingWidth;
  // Slab
  fg.fillStyle(COLORS.ink, 1);
  fg.fillRect(0, y, C.stairLeftX + 6, 30);
  fg.fillStyle(CONCRETE, 1);
  fg.fillRect(0, y + 3, C.stairLeftX + 2, 24);
  fg.fillStyle(NOSING, 1);
  fg.fillRect(0, y + 3, C.stairLeftX + 2, 5);

  if (floor === 1) {
    // Ground floor: iron gate to the street + mailboxes
    bg.fillStyle(COLORS.ink, 1);
    bg.fillRect(0, y - 190, 64, 190);
    bg.fillStyle(0x6d4c41, 1);
    bg.fillRect(0, y - 186, 58, 186);
    bg.fillStyle(0xffe9a8, 1);
    bg.fillRect(0, y - 170, 40, 150);
    bg.fillStyle(0x8d6e63, 1);
    for (let i = 0; i < 6; i++) bg.fillRect(40, y - 176 + i * 28, 16, 14);
    bg.fillStyle(0x90a4ae, 1);
    bg.fillRect(160, y - 150, 130, 80);
    bg.fillStyle(COLORS.ink, 1);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) bg.fillRect(166 + c * 31, y - 140 + r * 36, 26, 4);
    scene.add.text(225, y - 175, '信箱', { fontFamily: FONT_FAMILY, fontSize: '20px', fontStyle: '900', color: '#2d1b00' }).setOrigin(0.5).setDepth(1);
    scene.add
      .text(32, y - 214, '出口', { fontFamily: FONT_FAMILY, fontSize: '24px', fontStyle: '900', color: '#ffffff', backgroundColor: '#2a9d8f', padding: { x: 6, y: 2 } })
      .setOrigin(0.5)
      .setDepth(1);
    return;
  }

  // Apartment door with spring couplet (春聯) and floor plate
  const doorX = Math.max(4, left - 10);
  bg.fillStyle(COLORS.ink, 1);
  bg.fillRect(doorX, y - 170, 86, 170);
  bg.fillStyle(floor % 2 === 0 ? 0x8d6e63 : 0x5d7b6f, 1);
  bg.fillRect(doorX + 4, y - 166, 78, 166);
  bg.fillStyle(0xe63946, 1);
  bg.fillRect(doorX + 30, y - 160, 26, 34);
  bg.fillStyle(0xffd166, 1);
  bg.fillCircle(doorX + 68, y - 80, 5);
  scene.add
    .text(doorX + 43, y - 143, '福', { fontFamily: FONT_FAMILY, fontSize: '20px', fontStyle: '900', color: '#ffd166' })
    .setOrigin(0.5)
    .setAngle(180)
    .setDepth(1);
  scene.add
    .text(C.stairLeftX + 70, y - 200, `${floor}F`, {
      fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: '900', color: '#ffffff', backgroundColor: '#2d1b00', padding: { x: 10, y: 2 },
    })
    .setOrigin(0.5)
    .setDepth(1);
  drawIronWindow(bg, C.stairLeftX + 140, y - 230, 180, 120);
  if (floor === startFloor) {
    scene.add
      .text(C.stairLeftX + 230, y - 260, '我家', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: '900', color: '#2d1b00' })
      .setOrigin(0.5)
      .setDepth(1);
  }
  // Clutter: plants and boxes next to doors
  if (floor % 2 === 0) drawPottedPlant(bg, C.stairLeftX + 20, y);
  else drawBox(bg, C.stairLeftX + 20, y, 40, 30);
}

function drawMidLanding(bg: Phaser.GameObjects.Graphics, fg: Phaser.GameObjects.Graphics, y: number): void {
  const rightX = C.stairLeftX + C.stepsPerFlight * C.stepWidth;
  fg.fillStyle(COLORS.ink, 1);
  fg.fillRect(rightX - 6, y, C.width - rightX + 6, 30);
  fg.fillStyle(CONCRETE, 1);
  fg.fillRect(rightX - 2, y + 3, C.width - rightX + 2, 24);
  fg.fillStyle(NOSING, 1);
  fg.fillRect(rightX - 2, y + 3, C.width - rightX + 2, 5);
  drawIronWindow(bg, rightX + 20, y - 210, 130, 140);
  drawPottedPlant(bg, C.width - 30, y);
}

function drawFlight(g: Phaser.GameObjects.Graphics, s: Segment): void {
  const n = s.units;
  for (let k = 0; k < n; k++) {
    const top = s.y0 + k * C.stepHeight;
    const xa = s.x0 + s.dir * k * C.stepWidth;
    const xb = xa + s.dir * C.stepWidth;
    const x = Math.min(xa, xb);
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(x - 2, top - 2, C.stepWidth + 4, C.stepHeight + 58);
    g.fillStyle(k % 2 === 0 ? CONCRETE : 0xb0a99f, 1);
    g.fillRect(x, top, C.stepWidth, C.stepHeight + 54);
    g.fillStyle(NOSING, 1);
    g.fillRect(x, top, C.stepWidth, 6);
    g.fillStyle(CONCRETE_DARK, 1);
    g.fillRect(x, top + C.stepHeight + 40, C.stepWidth, 14);
  }
  // Handrail (old green-painted steel)
  const railOff = 78;
  g.lineStyle(7, COLORS.ink, 1);
  g.lineBetween(s.x0, s.y0 - railOff, s.x1, s.y1 - railOff);
  g.lineStyle(4, COLORS.ironGreen, 1);
  g.lineBetween(s.x0, s.y0 - railOff, s.x1, s.y1 - railOff);
  for (let k = 0; k <= n; k += 2) {
    const px = s.x0 + s.dir * k * C.stepWidth + s.dir * 10;
    const py = s.y0 + k * C.stepHeight;
    g.fillStyle(COLORS.ironGreen, 1);
    g.fillRect(px - 2, py - railOff, 4, railOff - 4);
  }
}
