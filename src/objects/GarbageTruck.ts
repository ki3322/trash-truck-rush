import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { COLORS, FONT_FAMILY } from '../ui/theme';

const T = GAME_CONFIG.truck;

/**
 * Taiwanese-style yellow garbage truck. The container origin is the truck's
 * rear-bottom corner (rear x, ground y) so it lines up with `truckShape()`.
 */
export class GarbageTruck extends Phaser.GameObjects.Container {
  private readonly wheels: Phaser.GameObjects.Graphics[] = [];
  private readonly targetMarker: Phaser.GameObjects.Graphics;
  private readonly openingWidth: number;
  private noteTimer = 0;
  private bounce = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, openingWidth: number, showTarget = true) {
    super(scene, x, y);
    this.openingWidth = openingWidth;
    const g = scene.add.graphics();
    this.drawBody(g);
    this.add(g);

    const boxX = T.lipWidth * 2 + openingWidth;
    const label = scene.add
      .text(boxX + T.boxWidth / 2, -T.boxHeight + 60, '♪ 垃圾車 ♪', {
        fontFamily: FONT_FAMILY, fontSize: '26px', fontStyle: '900', color: '#1f5130',
      })
      .setOrigin(0.5);
    const sub = scene.add
      .text(boxX + T.boxWidth / 2, -T.boxHeight + 98, '資源回收・一般垃圾', {
        fontFamily: FONT_FAMILY, fontSize: '15px', fontStyle: '800', color: '#1f5130',
      })
      .setOrigin(0.5);
    this.add([label, sub]);

    const frontX = boxX + T.boxWidth + T.cabWidth;
    [30 + openingWidth / 2, boxX + T.boxWidth - 40, frontX - 38].forEach((wx) => {
      const w = scene.add.graphics({ x: wx, y: -T.wheelRadius });
      w.fillStyle(COLORS.ink, 1);
      w.fillCircle(0, 0, T.wheelRadius);
      w.fillStyle(0x555555, 1);
      w.fillCircle(0, 0, T.wheelRadius - 6);
      w.fillStyle(0xcccccc, 1);
      w.fillCircle(0, 0, 9);
      w.fillStyle(COLORS.ink, 1);
      w.fillRect(-2, -T.wheelRadius + 6, 4, T.wheelRadius * 2 - 12);
      w.fillRect(-T.wheelRadius + 6, -2, T.wheelRadius * 2 - 12, 4);
      this.wheels.push(w);
      this.add(w);
    });

    this.targetMarker = scene.add.graphics();
    this.add(this.targetMarker);
    this.targetMarker.setVisible(showTarget);
    scene.add.existing(this);
  }

  private drawBody(g: Phaser.GameObjects.Graphics): void {
    const W = this.openingWidth;
    const rimY = -T.rimHeight;
    const boxX = T.lipWidth * 2 + W;
    const cabX = boxX + T.boxWidth;
    const frontX = cabX + T.cabWidth;
    const bottom = -T.chassisClearance;

    // Chassis
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(-4, bottom - 6, frontX + 8, 16);

    // Hopper (rear loading bin)
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(-4, rimY - 4, boxX + 8, -rimY + bottom + 8);
    g.fillStyle(0xd9a800, 1);
    g.fillRect(0, rimY, boxX, -rimY + bottom);
    g.fillStyle(0x2b2b2b, 1);
    g.fillRect(T.lipWidth, rimY, W, T.lipHeight - 6);
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(T.lipWidth, rimY + T.lipHeight - 14, W, 8);
    // Hazard stripes on the hopper
    for (let i = 0; i < 6; i++) {
      g.fillStyle(i % 2 === 0 ? COLORS.ink : COLORS.yellowLight, 1);
      g.fillRect(4 + (i * (boxX - 8)) / 6, bottom - 26, (boxX - 8) / 6, 14);
    }
    // Rear light
    g.fillStyle(0xff3b30, 1);
    g.fillRect(2, rimY + T.lipHeight + 8, 8, 18);

    // Box
    const boxTop = -T.boxHeight;
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(boxX - 4, boxTop - 4, T.boxWidth + 8, -boxTop + bottom + 8, 8);
    g.fillStyle(COLORS.yellow, 1);
    g.fillRoundedRect(boxX, boxTop, T.boxWidth, -boxTop + bottom, 6);
    g.fillStyle(0xffffff, 0.3);
    g.fillRect(boxX + 8, boxTop + 8, T.boxWidth - 16, 8);
    g.fillStyle(0x3a8f3a, 1);
    g.fillRect(boxX, boxTop + 115, T.boxWidth, 16);
    // Speaker on the roof
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(boxX + 20, boxTop - 18, 34, 18);
    g.fillStyle(0xdddddd, 1);
    g.fillRect(boxX + 24, boxTop - 14, 26, 10);

    // Cab
    const cabTop = -T.cabHeight;
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(cabX - 4, cabTop - 4, T.cabWidth + 8, -cabTop + bottom + 8, 12);
    g.fillStyle(COLORS.yellowLight, 1);
    g.fillRoundedRect(cabX, cabTop, T.cabWidth, -cabTop + bottom, 10);
    g.fillStyle(0x7fd0ff, 1);
    g.fillRoundedRect(cabX + 16, cabTop + 12, T.cabWidth - 24, 50, 6);
    g.fillStyle(0x2b1d14, 1);
    g.fillCircle(cabX + 40, cabTop + 44, 12);
    g.fillStyle(0xffffff, 1);
    g.fillRect(frontX - 10, bottom - 34, 10, 14);
  }

  /** Visual-only update: wheels, bounce and floating music notes. */
  tick(dtMs: number, speed: number): void {
    const rot = (speed * dtMs) / 1000 / T.wheelRadius;
    this.wheels.forEach((w) => (w.rotation += rot));
    this.bounce += dtMs * 0.02;
    const jiggle = speed > 0 ? Math.sin(this.bounce) * 1.2 : 0;
    this.setRotation(jiggle * 0.004);

    this.noteTimer -= dtMs;
    if (this.noteTimer <= 0) {
      this.noteTimer = 420;
      this.emitNote();
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.bounce * 0.4);
    const m = this.targetMarker;
    m.clear();
    if (!m.visible) return;
    const left = T.lipWidth;
    const rimY = -T.rimHeight;
    m.lineStyle(5, 0x00e676, 0.6 + pulse * 0.4);
    m.strokeRect(left, rimY - 4, this.openingWidth, 10);
    m.fillStyle(0x00e676, 0.85);
    const cx = left + this.openingWidth / 2;
    const ay = rimY - 30 - pulse * 10;
    m.fillTriangle(cx - 14, ay, cx + 14, ay, cx, ay + 18);
  }

  private emitNote(): void {
    const sx = this.x + T.lipWidth * 2 + this.openingWidth + 37;
    const sy = this.y - T.boxHeight - 18;
    const note = this.scene.add
      .text(sx, sy, Phaser.Math.RND.pick(['♪', '♫', '♬']), {
        fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: '900', color: '#2d1b00',
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: note,
      y: sy - 90,
      x: sx + Phaser.Math.Between(-40, 30),
      alpha: 0,
      angle: Phaser.Math.Between(-30, 30),
      duration: 1400,
      onComplete: () => note.destroy(),
    });
  }

  setTargetVisible(on: boolean): void {
    this.targetMarker.setVisible(on);
  }

  get frontOffset(): number {
    return T.lipWidth * 2 + this.openingWidth + T.boxWidth + T.cabWidth;
  }
}
