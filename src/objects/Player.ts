import Phaser from 'phaser';
import { COLORS } from '../ui/theme';

export type PlayerPose = 'idle' | 'run' | 'stumble' | 'dodge' | 'charge' | 'throw' | 'cheer' | 'cry' | 'phone' | 'still';
export type PlayerFace = 'normal' | 'panic' | 'happy' | 'sad' | 'focus' | 'shock';

const SKIN = 0xf6c9a0;
const SHIRT = 0xffffff;
const SHORTS = 0x3d7ae0;
const HAIR = 0x2b1d14;
const SLIPPER = 0x1f9e89;
export const BAG_COLOR = 0xff9ec7;

export function drawBag(g: Phaser.GameObjects.Graphics, x: number, y: number, s = 1): void {
  g.fillStyle(COLORS.ink, 1);
  g.fillEllipse(x, y + 2 * s, 36 * s, 34 * s);
  g.fillStyle(BAG_COLOR, 1);
  g.fillEllipse(x, y, 32 * s, 30 * s);
  g.fillStyle(0xffffff, 0.45);
  g.fillEllipse(x - 7 * s, y - 6 * s, 9 * s, 7 * s);
  g.fillStyle(BAG_COLOR, 1);
  g.fillTriangle(x - 7 * s, y - 13 * s, x + 7 * s, y - 13 * s, x, y - 4 * s);
  g.fillStyle(COLORS.ink, 1);
  g.fillTriangle(x - 8 * s, y - 22 * s, x - 1 * s, y - 13 * s, x - 9 * s, y - 13 * s);
  g.fillTriangle(x + 8 * s, y - 22 * s, x + 1 * s, y - 13 * s, x + 9 * s, y - 13 * s);
}

/**
 * The hero: slippers, shorts, T-shirt, garbage bag. Built from Graphics so
 * it needs no sprite sheets; poses are animated procedurally.
 */
export class Player extends Phaser.GameObjects.Container {
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly legL: Phaser.GameObjects.Graphics;
  private readonly legR: Phaser.GameObjects.Graphics;
  private readonly torso: Phaser.GameObjects.Graphics;
  private readonly armBack: Phaser.GameObjects.Graphics;
  private readonly armFront: Phaser.GameObjects.Graphics;
  private readonly head: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly bag: Phaser.GameObjects.Graphics;
  private readonly extraBag: Phaser.GameObjects.Graphics;
  private readonly sweat: Phaser.GameObjects.Graphics;
  private readonly rig: Phaser.GameObjects.Container;

  private pose: PlayerPose = 'idle';
  private faceKind: PlayerFace = 'normal';
  private phase = 0;
  private runSpeed = 0;
  private baseScale: number;
  private facing: 1 | -1 = 1;
  private barefoot = false;
  private charge = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, scale = 1) {
    super(scene, x, y);
    this.baseScale = scale;
    this.shadow = scene.add.ellipse(0, 2, 56, 12, 0x000000, 0.22);
    this.rig = scene.add.container(0, 0);
    this.legL = this.makeLeg(scene, -7, false);
    this.legR = this.makeLeg(scene, 7, false);
    this.torso = scene.add.graphics();
    this.armBack = this.makeArm(scene, -16);
    this.armFront = this.makeArm(scene, 16);
    this.bag = scene.add.graphics();
    drawBag(this.bag, 0, 0);
    this.extraBag = scene.add.graphics();
    drawBag(this.extraBag, 0, 0, 0.8);
    this.extraBag.setVisible(false);
    this.head = scene.add.container(0, -112);
    this.face = scene.add.graphics();
    this.sweat = scene.add.graphics();
    this.drawTorso();
    this.drawHead();

    this.rig.add([this.armBack, this.legL, this.legR, this.torso, this.head, this.extraBag, this.armFront, this.bag, this.sweat]);
    this.add([this.shadow, this.rig]);
    this.setScale(scale);
    scene.add.existing(this);
  }

  private makeLeg(scene: Phaser.Scene, x: number, bare: boolean): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics({ x, y: -42 });
    this.drawLeg(g, bare);
    return g;
  }

  private drawLeg(g: Phaser.GameObjects.Graphics, bare: boolean): void {
    g.clear();
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(-6, 0, 12, 38);
    g.fillStyle(SKIN, 1);
    g.fillRect(-4, 0, 8, 36);
    if (!bare) {
      g.fillStyle(COLORS.ink, 1);
      g.fillRoundedRect(-8, 34, 22, 8, 3);
      g.fillStyle(SLIPPER, 1);
      g.fillRoundedRect(-7, 35, 20, 5, 2);
    } else {
      g.fillStyle(SKIN, 1);
      g.fillRoundedRect(-5, 34, 14, 6, 3);
    }
  }

  private makeArm(scene: Phaser.Scene, x: number): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics({ x, y: -88 });
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(-6, -2, 12, 36, 5);
    g.fillStyle(SKIN, 1);
    g.fillRoundedRect(-4, 8, 8, 24, 4);
    g.fillStyle(SHIRT, 1);
    g.fillRoundedRect(-5, 0, 10, 12, 3);
    return g;
  }

  private drawTorso(): void {
    const g = this.torso;
    g.clear();
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(-21, -94, 42, 58, 8);
    g.fillStyle(SHIRT, 1);
    g.fillRoundedRect(-18, -91, 36, 40, 6);
    // Shirt print: a tiny garbage-truck icon
    g.fillStyle(COLORS.yellow, 1);
    g.fillRect(-9, -76, 14, 8);
    g.fillRect(5, -73, 6, 5);
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(-5, -67, 2);
    g.fillCircle(7, -67, 2);
    g.fillStyle(SHORTS, 1);
    g.fillRoundedRect(-18, -54, 36, 16, 4);
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(-18, -46, 36, 2);
  }

  private drawHead(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.ink, 1);
    g.fillCircle(0, 0, 25);
    g.fillStyle(SKIN, 1);
    g.fillCircle(0, 0, 22);
    g.fillStyle(HAIR, 1);
    g.fillRoundedRect(-23, -25, 46, 18, 9);
    g.fillRect(-23, -14, 8, 10);
    g.fillTriangle(4, -25, 18, -32, 14, -20);
    g.fillStyle(0xff8f8f, 0.6);
    g.fillCircle(-12, 9, 4);
    g.fillCircle(14, 9, 4);
    this.head.add([g, this.face]);
    this.drawFace();
  }

  private drawFace(): void {
    const g = this.face;
    g.clear();
    g.fillStyle(COLORS.ink, 1);
    switch (this.faceKind) {
      case 'panic':
      case 'shock':
        g.fillCircle(-7, -2, 4.5);
        g.fillCircle(9, -2, 4.5);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(-6, -3, 1.5);
        g.fillCircle(10, -3, 1.5);
        g.fillStyle(COLORS.ink, 1);
        g.fillEllipse(2, 12, 10, this.faceKind === 'shock' ? 12 : 8);
        break;
      case 'happy':
        g.lineStyle(3, COLORS.ink, 1);
        g.beginPath();
        g.arc(-7, 0, 4, Math.PI, 0);
        g.strokePath();
        g.beginPath();
        g.arc(9, 0, 4, Math.PI, 0);
        g.strokePath();
        g.fillStyle(0xc0392b, 1);
        g.slice(2, 8, 9, 0, Math.PI, false);
        g.fillPath();
        break;
      case 'sad':
        g.fillRect(-11, -2, 8, 3);
        g.fillRect(5, -2, 8, 3);
        g.lineStyle(3, COLORS.ink, 1);
        g.beginPath();
        g.arc(2, 16, 6, Math.PI * 1.1, Math.PI * 1.9);
        g.strokePath();
        g.fillStyle(0x6ec6ff, 1);
        g.fillEllipse(-8, 8, 4, 9);
        g.fillEllipse(10, 8, 4, 9);
        break;
      case 'focus':
        g.fillRect(-11, -4, 8, 4);
        g.fillRect(5, -4, 8, 4);
        g.fillRect(-3, 11, 10, 3);
        break;
      default:
        g.fillCircle(-7, -1, 3);
        g.fillCircle(9, -1, 3);
        g.fillRect(-2, 11, 8, 3);
    }
  }

  setFace(face: PlayerFace): this {
    if (face !== this.faceKind) {
      this.faceKind = face;
      this.drawFace();
    }
    return this;
  }

  setPose(pose: PlayerPose): this {
    this.pose = pose;
    return this;
  }

  getPose(): PlayerPose {
    return this.pose;
  }

  setFacing(dir: 1 | -1): this {
    this.facing = dir;
    this.scaleX = this.baseScale * dir;
    return this;
  }

  setRunSpeed(ratio: number): this {
    this.runSpeed = Phaser.Math.Clamp(ratio, 0, 1);
    return this;
  }

  setCharge(ratio: number): this {
    this.charge = ratio;
    return this;
  }

  setBagVisible(on: boolean): this {
    this.bag.setVisible(on);
    return this;
  }

  setExtraBag(on: boolean): this {
    this.extraBag.setVisible(on);
    return this;
  }

  setBarefoot(on: boolean): this {
    if (on === this.barefoot) return this;
    this.barefoot = on;
    this.drawLeg(this.legR, on);
    return this;
  }

  /** World position of the bag hand (used to spawn thrown bags). */
  handWorld(): Phaser.Math.Vector2 {
    const m = this.bag.getWorldTransformMatrix();
    return new Phaser.Math.Vector2(m.tx, m.ty);
  }

  tick(dtMs: number): void {
    const dt = dtMs / 1000;
    const speedHz = this.pose === 'run' ? 4 + this.runSpeed * 8 : 2;
    this.phase += dt * speedHz * Math.PI * 2 * (this.pose === 'run' ? 0.5 : 1);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    this.rig.setRotation(0);
    this.rig.setY(0);
    this.head.setRotation(0);
    this.sweat.clear();
    let legA = 0;
    let legB = 0;
    let armA = 0.2;
    let armB = -0.2;
    let bagX = 24;
    let bagY = -52;
    this.extraBag.setPosition(-26, -50);

    switch (this.pose) {
      case 'idle':
        this.rig.setY(Math.abs(s) * -2);
        break;
      case 'still':
        this.rig.setY(Math.sin(this.phase * 3) * 1.5);
        this.setFace('focus');
        break;
      case 'run': {
        const amp = 0.5 + this.runSpeed * 0.5;
        legA = s * amp;
        legB = -s * amp;
        armA = -s * amp * 1.2;
        armB = s * amp * 1.2;
        this.rig.setY(-Math.abs(c) * (4 + this.runSpeed * 4));
        this.rig.setRotation(0.08 + this.runSpeed * 0.12);
        bagX = 26 + s * 4;
        bagY = -48 + Math.abs(c) * 6;
        if (this.runSpeed > 0.4) this.drawSweat(s);
        break;
      }
      case 'stumble':
        this.rig.setRotation(-0.35 + s * 0.08);
        legA = 0.6;
        legB = -0.3;
        armA = -1.8;
        armB = -2.2;
        bagX = 30;
        bagY = -110;
        this.setFace('shock');
        break;
      case 'dodge':
        this.rig.setY(-26);
        legA = -0.9;
        legB = 0.7;
        armA = -2.4;
        armB = -2.0;
        bagX = 20;
        bagY = -120;
        break;
      case 'charge':
        armB = 1.6 + this.charge * 1.0;
        armA = -0.6;
        legA = 0.35;
        legB = -0.25;
        this.rig.setRotation(-0.12 - this.charge * 0.1);
        bagX = -26 - this.charge * 10;
        bagY = -112 + this.charge * 6;
        this.setFace('focus');
        break;
      case 'throw':
        armB = -2.2;
        armA = 0.6;
        legA = -0.3;
        legB = 0.4;
        this.rig.setRotation(0.15);
        break;
      case 'cheer':
        this.rig.setY(-Math.abs(s) * 26);
        armA = Math.PI - 0.4 + s * 0.2;
        armB = -(Math.PI - 0.4) - s * 0.2;
        legA = 0.3;
        legB = -0.3;
        this.setFace('happy');
        break;
      case 'cry':
        this.rig.setRotation(0.12);
        this.head.setRotation(0.25 + s * 0.04);
        armA = 0.1;
        armB = -0.1;
        this.setFace('sad');
        break;
      case 'phone':
        armB = -1.9;
        bagX = 0;
        bagY = 0;
        this.head.setRotation(0.2);
        break;
    }
    this.legL.setRotation(legA);
    this.legR.setRotation(legB);
    this.armBack.setRotation(armA);
    this.armFront.setRotation(armB);
    this.bag.setPosition(bagX, bagY);
    this.shadow.setScale(1 - Math.min(0.5, -this.rig.y / 60), 1);
  }

  private drawSweat(s: number): void {
    this.sweat.fillStyle(0x7fd0ff, 0.9);
    this.sweat.fillEllipse(-28, -128 + s * 6, 6, 10);
    this.sweat.fillEllipse(-36, -110 - s * 6, 5, 8);
  }

  get facingDir(): 1 | -1 {
    return this.facing;
  }
}
