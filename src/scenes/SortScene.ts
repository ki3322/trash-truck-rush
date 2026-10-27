import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import { drawTiledWall } from '../objects/Scenery';
import { audio } from '../systems/AudioSystem';
import { createClock, penalize, remainingMs, startClock, tickClock, type GameClock } from '../systems/GameClock';
import { gameFlow } from '../systems/GameFlow';
import { CATEGORY_LABEL, isCorrect, pickSortItems, wrongBinMessage, type TrashItem } from '../systems/SortSystem';
import type { RunSetup, SortResult, TrashCategory } from '../types';
import { Button } from '../ui/Button';
import { onKey } from '../ui/keys';
import { haptic } from '../systems/Haptics';
import { bottomY, centerView, fillViewExtents, topY } from '../ui/view';
import { popText } from '../ui/Overlay';
import { COLORS, FONT_FAMILY, TEXT } from '../ui/theme';

export interface StairSceneData {
  readonly setup: RunSetup;
  readonly sort: SortResult;
  readonly clock: GameClock;
}

const CARD_Y = 560;
const BIN_Y = 1080;
const BIN_X: Readonly<Record<TrashCategory, number>> = { general: 186, recycle: 534 };
const FLY_MS = 180;

/**
 * Before running downstairs: drop general waste in the bag, recyclables in
 * the bin. Tap a bin or swipe the item left/right. The game clock starts here.
 */
export class SortScene extends Phaser.Scene {
  private setup!: RunSetup;
  private items: TrashItem[] = [];
  private index = 0;
  private mistakes = 0;
  private clock: GameClock = createClock(0);
  private controlling = false;
  private busy = false;
  private finished = false;
  private elapsedMs = 0;
  private swipeStartX: number | null = null;

  private card!: Phaser.GameObjects.Container;
  private emoji!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private queue!: Phaser.GameObjects.Text;

  constructor() {
    super('Sort');
  }

  init(setup: RunSetup): void {
    const cfg = DIFFICULTY_CONFIG[setup.difficulty];
    this.setup = setup;
    this.items = pickSortItems(setup.seed, cfg.sortItems);
    this.index = 0;
    this.mistakes = 0;
    this.clock = createClock(cfg.durationSec * 1000);
    this.controlling = false;
    this.busy = false;
    this.finished = false;
    this.elapsedMs = 0;
    this.swipeStartX = null;
  }

  create(): void {
    const { width: W, height: H } = GAME_CONFIG;
    centerView(this);
    fillViewExtents(this, 0xf3e7c9, 0xb08968);
    const g = this.add.graphics();
    drawTiledWall(g, 0, 0, W, H, 0xf3e7c9, 0xe6d6ae, 30);
    g.fillStyle(0xb08968, 1);
    g.fillRect(0, 880, W, H - 880);

    const hud = this.add.graphics();
    hud.fillStyle(COLORS.ink, 0.88);
    hud.fillRoundedRect(12, topY(12), W - 24, 100, 22);
    this.timeText = this.add.text(36, topY(34), '', { ...TEXT.hud, fontSize: '40px' });
    this.progressText = this.add.text(W - 36, topY(38), '', { ...TEXT.hud, fontSize: '30px', color: '#ffe066' }).setOrigin(1, 0);

    this.add
      .text(W / 2, topY(190), '先分類，再衝下樓！', { ...TEXT.h2, fontSize: '50px' })
      .setOrigin(0.5);
    this.add
      .text(W / 2, topY(252), '一般垃圾 → 垃圾袋　可回收 → 回收桶', { ...TEXT.body, fontSize: '28px', fontStyle: '900' })
      .setOrigin(0.5);
    this.queue = this.add.text(W / 2, 330, '', { fontFamily: FONT_FAMILY, fontSize: '44px' }).setOrigin(0.5);

    this.buildCard();
    this.buildBins();
    this.add
      .text(W / 2, bottomY(880), '← 滑動卡片，或點下面的桶 →', { ...TEXT.body, fontSize: '26px', color: '#6b5a3a' })
      .setOrigin(0.5);
    this.bindInput();
    this.refresh();
    this.runCountdown();
  }

  private buildCard(): void {
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.ink, 1);
    bg.fillRoundedRect(-170, -162, 340, 340, 30);
    bg.fillStyle(0xffffff, 1);
    bg.fillRoundedRect(-170, -170, 340, 340, 30);
    bg.lineStyle(6, COLORS.ink, 1);
    bg.strokeRoundedRect(-170, -170, 340, 340, 30);
    this.emoji = this.add.text(0, -30, '', { fontFamily: FONT_FAMILY, fontSize: '150px' }).setOrigin(0.5);
    this.nameText = this.add
      .text(0, 115, '', { fontFamily: FONT_FAMILY, fontSize: '36px', fontStyle: '900', color: '#2d1b00' })
      .setOrigin(0.5);
    this.card = this.add.container(GAME_CONFIG.width / 2, CARD_Y, [bg, this.emoji, this.nameText]).setVisible(false);
  }

  private buildBins(): void {
    const bins: [TrashCategory, string, number][] = [
      ['general', `🗑️ 垃圾袋\n${CATEGORY_LABEL.general}`, 0xff9ec7],
      ['recycle', `♻️ 回收桶\n${CATEGORY_LABEL.recycle}`, 0x6ec6ff],
    ];
    bins.forEach(([cat, label, fill]) => {
      new Button(this, BIN_X[cat], bottomY(BIN_Y), {
        width: 320, height: 250, label, fontSize: 40, fill, silent: true,
        onDown: () => this.choose(cat),
      });
    });
  }

  private bindInput(): void {
    onKey(this, 'keydown-A', () => this.choose('general'));
    onKey(this, 'keydown-LEFT', () => this.choose('general'));
    onKey(this, 'keydown-D', () => this.choose('recycle'));
    onKey(this, 'keydown-RIGHT', () => this.choose('recycle'));
    // Swipe anywhere above the bins: left = bag, right = recycling.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      this.swipeStartX = over.length === 0 && p.worldY < bottomY(BIN_Y) - 140 ? p.x : null;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.swipeStartX === null) return;
      const dx = p.x - this.swipeStartX;
      this.swipeStartX = null;
      if (Math.abs(dx) >= GAME_CONFIG.sortSwipeMinPx) this.choose(dx < 0 ? 'general' : 'recycle');
    });
  }

  private runCountdown(): void {
    const { width: W, height: H } = GAME_CONFIG;
    const label = this.add
      .text(W / 2, H / 2 - 100, '', { ...TEXT.title, fontSize: '170px', color: '#e85d04' })
      .setOrigin(0.5)
      .setDepth(300);
    const steps = ['3', '2', '1', '開始！'];
    steps.forEach((s, i) => {
      this.time.delayedCall(i * 550, () => {
        label.setText(s).setScale(1.6).setAlpha(1);
        this.tweens.add({ targets: label, scale: 1, duration: 230, ease: 'Back.easeOut' });
        audio.play(i === steps.length - 1 ? 'go' : 'count');
        if (i === steps.length - 1) {
          haptic('go');
          this.controlling = true;
          this.clock = startClock(this.clock);
          this.card.setVisible(true);
          this.tweens.add({ targets: label, alpha: 0, delay: 300, duration: 250 });
        }
      });
    });
  }

  private choose(bin: TrashCategory): void {
    if (!this.controlling || this.busy || this.finished) return;
    audio.unlock();
    const item = this.items[this.index];
    if (!item) return;
    this.busy = true;
    const correct = isCorrect(item, bin);
    if (correct) {
      audio.play('catch');
      haptic('tap');
      popText(this, BIN_X[bin], bottomY(BIN_Y) - 170, '✔', '#2a9d8f', 70);
    } else {
      this.mistakes += 1;
      this.clock = penalize(this.clock, GAME_CONFIG.sortMistakePenaltyMs);
      audio.play('stumble');
      haptic('wrong');
      this.cameras.main.shake(160, 0.008);
      this.showWrong(wrongBinMessage(item));
      popText(this, 130, topY(120), `-${GAME_CONFIG.sortMistakePenaltyMs / 1000} 秒`, '#e63946', 36);
    }
    // The item always ends up in the right bin, so players learn the rule.
    this.tweens.add({
      targets: this.card,
      x: BIN_X[item.category],
      y: bottomY(BIN_Y) - 40,
      scale: 0.25,
      angle: item.category === 'general' ? -25 : 25,
      duration: FLY_MS,
      ease: 'Quad.easeIn',
      onComplete: () => this.next(),
    });
  }

  /** Clear, slower-fading explanation under the card so players learn the rule. */
  private showWrong(message: string): void {
    const t = this.add
      .text(GAME_CONFIG.width / 2, CARD_Y + 240, message, {
        fontFamily: FONT_FAMILY, fontSize: '40px', fontStyle: '900', color: '#ffffff',
        backgroundColor: '#e63946', padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(200);
    this.tweens.add({ targets: t, alpha: 0, delay: 1100, duration: 300, onComplete: () => t.destroy() });
  }

  private next(): void {
    this.index += 1;
    this.busy = false;
    if (this.index >= this.items.length) {
      this.finish();
      return;
    }
    this.card.setPosition(GAME_CONFIG.width / 2, CARD_Y).setScale(0.6).setAngle(0);
    this.tweens.add({ targets: this.card, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.refresh();
  }

  private refresh(): void {
    const item = this.items[this.index];
    if (item) {
      this.emoji.setText(item.emoji);
      this.nameText.setText(item.name);
    }
    this.queue.setText(this.items.slice(this.index + 1).map((i) => i.emoji).join(' '));
    this.progressText.setText(`分類 ${Math.min(this.index, this.items.length)}/${this.items.length}`);
  }

  private finish(): void {
    this.finished = true;
    this.card.setVisible(false);
    this.refresh();
    const perfect = this.mistakes === 0;
    popText(this, GAME_CONFIG.width / 2, CARD_Y, perfect ? '分類滿分！綁好垃圾袋！' : '綁好垃圾袋！衝啊！', perfect ? '#2a9d8f' : '#e85d04', 50);
    audio.play('rustle');
    const sort: SortResult = {
      items: this.items.length,
      mistakes: this.mistakes,
      timeSec: Math.round(this.elapsedMs / 100) / 10,
    };
    this.time.delayedCall(550, () => {
      if (!gameFlow.go('stairs')) return;
      const data: StairSceneData = { setup: this.setup, sort, clock: this.clock };
      this.scene.start('Stair', data);
    });
  }

  update(_t: number, delta: number): void {
    if (this.controlling && !this.finished) {
      this.clock = tickClock(this.clock, delta);
      this.elapsedMs += delta;
    }
    const rem = remainingMs(this.clock);
    this.timeText.setText(`⏱ ${(rem / 1000).toFixed(1)}`);
  }
}
