import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { drawBag, type Player } from '../objects/Player';
import { drawGrandma, drawShoeCabinet, drawSlipper } from '../objects/Props';
import { EVENT_DEFS } from '../systems/EventSystem';
import type { EventType, ScheduledEvent } from '../types';
import { Button } from '../ui/Button';
import { VIEW } from '../ui/view';
import { COLORS, FONT_FAMILY } from '../ui/theme';
import { positionAt, type Segment } from '../utils/stairPath';

/**
 * Visuals for stair events: props placed ahead of time (so the player sees
 * them coming), the warning banner, the action button and the timer bar.
 * Game rules stay in StairScene / EventSystem.
 */
export class StairEventPresenter {
  private readonly banner: Phaser.GameObjects.Container;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly actionBtn: Button;
  private readonly meterText: Phaser.GameObjects.Text;
  private readonly props = new Map<EventType, Phaser.GameObjects.Graphics | Phaser.GameObjects.Container>();
  private slipper: Phaser.GameObjects.Graphics | null = null;
  private momBag: Phaser.GameObjects.Graphics | null = null;
  private momHead: Phaser.GameObjects.Text | null = null;
  private actionCb: () => void = () => undefined;
  private shakeT = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    segments: readonly Segment[],
    events: readonly ScheduledEvent[],
    private readonly windowMs: number,
  ) {
    const { width: W, height: H } = VIEW;
    events.forEach((e) => {
      if (e.type === 'shoeCabinet') {
        const p = positionAt(segments, e.atUnit + 1.6);
        this.props.set(e.type, drawShoeCabinet(scene, p.x, p.y).setDepth(15));
      } else if (e.type === 'grandma') {
        const p = positionAt(segments, e.atUnit + 2.2);
        this.props.set(e.type, drawGrandma(scene, p.x, p.y).setDepth(15).setScale(-0.82 * p.dir, 0.82));
      }
    });

    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.ink, 1);
    bg.fillRoundedRect(-W / 2 + 30, -50, W - 60, 108, 20);
    bg.fillStyle(0xfff3b0, 1);
    bg.fillRoundedRect(-W / 2 + 34, -54, W - 68, 104, 18);
    this.bannerText = scene.add
      .text(0, -12, '', { fontFamily: FONT_FAMILY, fontSize: '40px', fontStyle: '900', color: '#c1121f' })
      .setOrigin(0.5);
    this.bar = scene.add.graphics();
    this.banner = scene.add.container(W / 2, 220, [bg, this.bannerText, this.bar]).setScrollFactor(0).setDepth(140).setVisible(false);

    this.actionBtn = new Button(scene, W / 2, H - 320, {
      width: 420, height: 120, label: '', fontSize: 46, fill: COLORS.red, textColor: '#ffffff',
      onDown: () => this.actionCb(),
    });
    this.actionBtn.setScrollFactor(0).setDepth(145).setVisible(false);

    this.meterText = scene.add
      .text(W / 2, H - 330, '', {
        fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: '900', color: '#ffffff', stroke: '#2d1b00', strokeThickness: 8, align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(145)
      .setVisible(false);
  }

  onAction(cb: () => void): void {
    this.actionCb = cb;
  }

  show(type: EventType): void {
    const def = EVENT_DEFS[type];
    this.bannerText.setText(`⚠ ${def.prompt}`);
    this.banner.setVisible(true).setScale(0.6);
    this.scene.tweens.add({ targets: this.banner, scale: 1, duration: 200, ease: 'Back.easeOut' });
    if (def.action) {
      const keyHint = this.scene.sys.game.device.input.touch ? '' : '\n(空白鍵)';
      this.actionBtn.setLabel(`${def.action}${keyHint}`).setVisible(true).setEnabled(true).setScale(0.5);
      this.scene.tweens.add({ targets: this.actionBtn, scale: 1, duration: 180, ease: 'Back.easeOut' });
    } else {
      this.meterText.setVisible(true);
    }

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
      this.scene.tweens.add({
        targets: g,
        x: this.player.x + 30,
        y: this.player.y - cam.scrollY - 80,
        angle: 360,
        duration: this.windowMs,
        ease: 'Quad.easeIn',
      });
    }
  }

  updateMeter(stillRatio: number | null, timeRatio: number): void {
    const { width: W } = GAME_CONFIG;
    const r = Phaser.Math.Clamp(timeRatio, 0, 1);
    this.bar.clear();
    this.bar.fillStyle(0x555555, 1);
    this.bar.fillRoundedRect(-W / 2 + 70, 22, W - 140, 16, 8);
    this.bar.fillStyle(r > 0.4 ? 0x2a9d8f : 0xe63946, 1);
    this.bar.fillRoundedRect(-W / 2 + 70, 22, (W - 140) * r, 16, 8);
    if (stillRatio !== null) {
      const blocks = Math.round(stillRatio * 10);
      this.meterText.setText(`停下別踩！穩住垃圾袋\n${'■'.repeat(blocks)}${'□'.repeat(10 - blocks)}`);
    }
  }

  shakeBag(): void {
    this.shakeT = 200;
  }

  resolve(type: EventType, success: boolean, slowMs: number): void {
    this.banner.setVisible(false);
    this.actionBtn.setVisible(false);
    this.meterText.setVisible(false);
    const prop = this.props.get(type);
    if (prop) {
      if (type === 'grandma') {
        this.scene.tweens.add({ targets: prop, alpha: success ? 0.35 : 0.8, y: prop.y - 12, duration: 300 });
      } else {
        this.scene.tweens.add({ targets: prop, angle: success ? 0 : 8, alpha: 0.7, duration: 200, yoyo: !success });
      }
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

  tick(delta: number): void {
    if (this.shakeT > 0) {
      this.shakeT -= delta;
      this.meterText.setX(GAME_CONFIG.width / 2 + Math.sin(this.shakeT) * 8);
    }
  }

  clear(): void {
    this.banner.setVisible(false);
    this.actionBtn.setVisible(false);
    this.meterText.setVisible(false);
  }
}
