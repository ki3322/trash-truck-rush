import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { GarbageBag } from '../../objects/GarbageBag';
import { GarbageTruck } from '../../objects/GarbageTruck';
import { Player } from '../../objects/Player';
import { drawSky, drawStreet } from '../../objects/Scenery';
import { COLORS } from '../../ui/theme';
import { clamp } from '../../utils/physics';
import type { AimPreview, P3, PersonLike, SharedPose, ThrowView } from './ThrowView';

const C = GAME_CONFIG;

/** The original side-view street, used when 3D isn't available. Ignores z. */
export class ThrowView2D implements ThrowView {
  readonly is3D = false;
  readonly player: PersonLike;
  private readonly hero: Player;
  private readonly truck: GarbageTruck;
  private readonly preview: Phaser.GameObjects.Graphics;
  private readonly aimLabel: Phaser.GameObjects.Text;
  private readonly bags = new Map<number, GarbageBag>();

  constructor(private readonly scene: Phaser.Scene, truckStartX: number, openingWidth: number) {
    const { width: W, height: H } = C;
    drawSky(scene, W, C.groundY);
    drawStreet(scene, W, C.groundY);
    scene.add.rectangle(W / 2, C.groundY + 150 + (H - C.groundY - 150) / 2, W, H - C.groundY - 150, 0x3a3a3a);
    this.truck = new GarbageTruck(scene, truckStartX, C.groundY, openingWidth).setDepth(10);
    this.hero = new Player(scene, C.playerX, C.groundY, 1).setDepth(12).setFacing(1).setPose('idle').setFace('panic');
    this.player = this.hero;
    this.preview = scene.add.graphics().setDepth(30);
    this.aimLabel = scene.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '30px', fontStyle: '900', color: '#ffe066', stroke: '#2d1b00', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);
  }

  setPlayerPosition(x: number): void {
    this.hero.setX(x);
  }

  setTruck(rearX: number, speed: number, dtMs: number): void {
    this.truck.setX(rearX);
    this.truck.tick(dtMs, speed);
  }

  setTargetVisible(on: boolean): void {
    this.truck.setTargetVisible(on);
  }

  setNeighbors(): void {
    // The 2D fallback has no crowd.
  }

  neighborPose(_id: number, _pose: SharedPose): void {
    // no crowd in 2D
  }

  spawnBag(id: number, at: P3): void {
    this.bags.set(id, new GarbageBag(this.scene, at.x, at.y).setDepth(25));
  }

  syncBag(id: number, at: P3, dtMs: number): void {
    this.bags.get(id)?.sync({ x: at.x, y: at.y, vx: 300, vy: 0 }, dtMs);
  }

  removeBag(id: number, how: 'hit' | 'miss'): void {
    const b = this.bags.get(id);
    if (!b) return;
    this.bags.delete(id);
    const tween = how === 'hit'
      ? { targets: b, y: b.y + 40, scale: 0.4, alpha: 0, duration: 260 }
      : { targets: b, scaleY: 0.7, alpha: 0, delay: 450, duration: 350 };
    this.scene.tweens.add({ ...tween, onComplete: () => b.destroy() });
  }

  setPreview(p: AimPreview | null): void {
    this.preview.clear();
    if (!p || p.points.length === 0) {
      this.aimLabel.setVisible(false);
      return;
    }
    p.points.forEach((pt, i) => {
      if (i % 4 !== 0) return;
      const a = 1 - i / p.points.length;
      this.preview.fillStyle(COLORS.ink, a * 0.7);
      this.preview.fillCircle(pt.x, pt.y, 7);
      this.preview.fillStyle(0xffffff, a);
      this.preview.fillCircle(pt.x, pt.y, 4.5);
    });
    const o = p.points[0];
    const rad = (p.pitchDeg * Math.PI) / 180;
    this.aimLabel
      .setVisible(p.showLabel)
      .setText(`${Math.round(p.pitchDeg)}°`)
      .setPosition(o.x + Math.cos(rad) * 110, o.y - Math.sin(rad) * 110);
    this.preview.lineStyle(6, 0xffe066, 1);
    this.preview.lineBetween(o.x, o.y, o.x + Math.cos(rad) * 70, o.y - Math.sin(rad) * 70);
  }

  setSlowMo(focus: P3 | null): void {
    const cam = this.scene.cameras.main;
    if (focus) {
      cam.zoomTo(1.35, 180);
      cam.pan(clamp(focus.x + 60, 270, C.width - 270), clamp(focus.y + 40, 480, C.groundY - 160), 180);
    } else {
      cam.zoomTo(1, 250);
      cam.pan(C.width / 2, C.height / 2, 250);
    }
  }

  toScreen(at: P3): { x: number; y: number } {
    return { x: at.x, y: at.y };
  }

  shake(): void {
    this.scene.cameras.main.shake(80, 0.004);
  }

  tick(dtMs: number): void {
    this.hero.tick(dtMs);
  }

  destroy(): void {
    this.bags.clear();
  }
}
