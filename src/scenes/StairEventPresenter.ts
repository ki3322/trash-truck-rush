import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { EVENT_DEFS } from '../systems/EventSystem';
import type { EventType } from '../types';
import { Button } from '../ui/Button';
import { VIEW } from '../ui/view';
import { COLORS, FONT_FAMILY } from '../ui/theme';

/**
 * HUD for stair events: warning banner, action button and timer/stillness
 * meter. World visuals (props, flying slipper…) live in the StairView;
 * rules stay in StairScene / EventSystem.
 */
export class StairEventPresenter {
  private readonly banner: Phaser.GameObjects.Container;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly actionBtn: Button;
  private readonly meterText: Phaser.GameObjects.Text;
  private actionCb: () => void = () => undefined;
  private shakeT = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const { width: W, height: H } = VIEW;

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

  resolve(): void {
    this.banner.setVisible(false);
    this.actionBtn.setVisible(false);
    this.meterText.setVisible(false);
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
