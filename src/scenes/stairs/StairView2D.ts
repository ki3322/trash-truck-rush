import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { Player, drawBag } from '../../objects/Player';
import { drawGrandma, drawShoeCabinet, drawSlipper } from '../../objects/Props';
import { drawStairwell, stairwellHeight } from '../../objects/Stairwell';
import type { EventType, ScheduledEvent } from '../../types';
import { COLORS, FONT_FAMILY } from '../../ui/theme';
import { VIEW } from '../../ui/view';
import { positionAt, type Segment } from '../../utils/stairPath';
import type { StairRunner, StairView } from './StairView';

/** The original side-view stairwell (fallback when 3D isn't available). */
export class StairView2D implements StairView {
  readonly is3D = false;
  readonly runner: StairRunner;
  private readonly player: Player;
  private readonly props = new Map<EventType, Phaser.GameObjects.Graphics | Phaser.GameObjects.Container>();
  private slipper: Phaser.GameObjects.Graphics | null = null;
  private momBag: Phaser.GameObjects.Graphics | null = null;
  private momHead: Phaser.GameObjects.Text | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    startFloor: number,
    private readonly segments: readonly Segment[],
    schedule: readonly ScheduledEvent[],
    private readonly windowMs: number,
  ) {
    drawStairwell(scene, startFloor, segments);
    const start = positionAt(segments, 0);
    this.player = new Player(scene, start.x, start.y, 0.9).setDepth(20).setPose('idle').setFace('panic');
    this.runner = this.player;
    schedule.forEach((e) => {
      if (e.type === 'shoeCabinet') {
        const p = positionAt(segments, e.atUnit + 1.6);
        this.props.set(e.type, drawShoeCabinet(scene, p.x, p.y).setDepth(15));
      } else if (e.type === 'grandma') {
        const p = positionAt(segments, e.atUnit + 2.2);
        this.props.set(e.type, drawGrandma(scene, p.x, p.y).setDepth(15).setScale(-0.82 * p.dir, 0.82));
      }
    });
    const cam = scene.cameras.main;
    cam.setBounds(0, 0, GAME_CONFIG.width, stairwellHeight(startFloor));
    cam.startFollow(this.player, true, 0.12, 0.12, 0, -140);
  }

  place(progress: number): void {
    const pos = positionAt(this.segments, progress);
    this.player.setPosition(pos.x, pos.y).setFacing(pos.dir);
  }

  runnerScreen(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y - 150 };
  }

  eventStart(type: EventType): void {
    if (type === 'slipper') {
      this.player.setBarefoot(true);
      const s = drawSlipper(this.scene, this.player.x, this.player.y - 6).setDepth(25);
      this.slipper = s;
      this.scene.tweens.add({ targets: s, x: s.x + 140 * this.player.facingDir, y: s.y - 140, angle: 540, duration: this.windowMs * 0.5, ease: 'Quad.easeOut' });
    }
    if (type === 'momBag') {
      const cam = this.scene.cameras.main;
      this.momHead = this.scene.add
        .text(GAME_CONFIG.width - 110, 300, '👩 媽媽', { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: '900', color: '#ffffff', backgroundColor: '#c1121f', padding: { x: 10, y: 6 } })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(130);
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(131);
      drawBag(g, 0, 0, 1.1);
      g.setPosition(GAME_CONFIG.width - 110, 360);
      this.momBag = g;
      this.scene.tweens.add({ targets: g, x: this.player.x + 30, y: this.player.y - cam.scrollY - 80, angle: 360, duration: this.windowMs, ease: 'Quad.easeIn' });
    }
  }

  eventEnd(type: EventType, success: boolean, slowMs: number): void {
    const prop = this.props.get(type);
    if (prop) {
      if (type === 'grandma') this.scene.tweens.add({ targets: prop, alpha: success ? 0.35 : 0.8, y: prop.y - 12, duration: 300 });
      else this.scene.tweens.add({ targets: prop, angle: success ? 0 : 8, alpha: 0.7, duration: 200, yoyo: !success });
    }
    if (type === 'slipper' && this.slipper) {
      const s = this.slipper;
      this.slipper = null;
      this.scene.tweens.killTweensOf(s);
      if (success) {
        this.scene.tweens.add({ targets: s, x: this.player.x, y: this.player.y, duration: 160, onComplete: () => s.destroy() });
        this.player.setBarefoot(false);
      } else {
        this.scene.tweens.add({ targets: s, alpha: 0, y: s.y + 300, duration: 600, onComplete: () => s.destroy() });
        this.scene.time.delayedCall(slowMs, () => this.player.setBarefoot(false));
      }
    }
    if (type === 'momBag' && this.momBag) {
      const b = this.momBag;
      this.momBag = null;
      this.scene.tweens.killTweensOf(b);
      const cam = this.scene.cameras.main;
      if (success) {
        this.scene.tweens.add({ targets: b, x: this.player.x - 20, y: this.player.y - cam.scrollY - 60, scale: 0.5, duration: 150, onComplete: () => b.destroy() });
        this.player.setExtraBag(true);
      } else {
        this.scene.tweens.add({ targets: b, y: VIEW.height + 80, duration: 500, onComplete: () => b.destroy() });
      }
      const head = this.momHead;
      this.momHead = null;
      if (head) this.scene.tweens.add({ targets: head, alpha: 0, delay: 400, duration: 300, onComplete: () => head.destroy() });
    }
    if (type === 'bagTear' && !success) this.scatterTrash();
  }

  private scatterTrash(): void {
    const colors = [0xffffff, 0xe63946, 0x2a9d8f, 0xf4a261, 0x8d6e63];
    for (let i = 0; i < 12; i++) {
      const r = this.scene.add
        .rectangle(this.player.x, this.player.y - 50, Phaser.Math.Between(8, 18), Phaser.Math.Between(6, 14), Phaser.Math.RND.pick(colors))
        .setStrokeStyle(2, COLORS.ink)
        .setDepth(26);
      this.scene.tweens.add({
        targets: r,
        x: r.x + Phaser.Math.Between(-110, 110),
        y: r.y + Phaser.Math.Between(20, 70),
        angle: Phaser.Math.Between(-180, 180),
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => this.scene.tweens.add({ targets: r, alpha: 0, delay: 600, duration: 300, onComplete: () => r.destroy() }),
      });
    }
  }

  exitDoor(): void {
    this.scene.tweens.add({ targets: this.player, x: -60, duration: 450 });
  }

  tick(dtMs: number): void {
    this.player.tick(dtMs);
  }

  destroy(): void {
    this.props.clear();
  }
}
