import Phaser from 'phaser';
import { drawBag } from '../objects/Player';
import { aimFromPull, type SlingAim } from '../systems/Slingshot';
import { Button } from '../ui/Button';
import { COLORS, TEXT } from '../ui/theme';
import { VIEW } from '../ui/view';

export interface ThrowHudModel {
  readonly remainingMs: number;
  readonly bagsTotal: number;
  readonly bagsUsed: number;
  readonly distanceM: number;
  readonly basePoints: number;
  /** Stamina in [0, 1]. */
  readonly stamina: number;
  readonly exhausted: boolean;
  /** The truck is about to get away: nudge the player to chase. */
  readonly truckEscaping: boolean;
}

export interface ThrowHudHandlers {
  readonly onRun: (on: boolean) => void;
  readonly onAim: (aim: SlingAim) => void;
  readonly onAimEnd: () => void;
}

export interface ThrowHudData {
  readonly handlers: ThrowHudHandlers;
  readonly showTutorial: boolean;
}

const TOP_BAR_H = 104;
const RUN_BTN = { x: 136, w: 232, h: 150, bottom: 110 } as const;
const BAND_COLORS = { weak: 0x7ed957, mid: 0xffd166, strong: 0xff6b6b } as const;

/**
 * Screen-fixed controls for the throw phase. Runs on top of ThrowScene with
 * its own camera, so the world can scroll and zoom without moving the HUD.
 * Owns pointer input: the 追 button and the pull-back slingshot anywhere else.
 */
export class ThrowHudScene extends Phaser.Scene {
  private handlers!: ThrowHudHandlers;
  private wantTutorial = false;
  private topBar!: Phaser.GameObjects.Container;
  private timeText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private pointsText!: Phaser.GameObjects.Text;
  private bagIcons!: Phaser.GameObjects.Graphics;
  private staminaBar!: Phaser.GameObjects.Graphics;
  private band!: Phaser.GameObjects.Graphics;
  private runBtn!: Button;
  private tutorial: Phaser.GameObjects.Container | null = null;
  private aim: { id: number; x: number; y: number } | null = null;
  private shownBagsUsed = -1;
  private shownExhausted = false;
  private ready = false;

  constructor() {
    super('ThrowHud');
  }

  init(data: ThrowHudData): void {
    this.handlers = data.handlers;
    this.wantTutorial = data.showTutorial;
    this.tutorial = null;
    this.aim = null;
    this.shownBagsUsed = -1;
    this.shownExhausted = false;
    this.ready = false;
  }

  create(): void {
    this.buildTopBar();
    this.buildControls();
    this.bindAim();
    if (this.wantTutorial) this.showTutorial();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
    });
    this.ready = true;
  }

  // ── Layout ──────────────────────────────────────────────
  private buildTopBar(): void {
    const W = VIEW.width;
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.ink, 0.88);
    bg.fillRoundedRect(12, 12, W - 24, TOP_BAR_H, 22);
    this.timeText = this.add.text(36, 34, '', { ...TEXT.hud, fontSize: '44px' });
    this.bagIcons = this.add.graphics();
    this.distText = this.add.text(W - 36, 26, '', { ...TEXT.hud, fontSize: '32px' }).setOrigin(1, 0);
    this.pointsText = this.add.text(W - 36, 70, '', { ...TEXT.hud, fontSize: '22px', color: '#ffe066' }).setOrigin(1, 0);
    this.topBar = this.add.container(0, 0, [bg, this.timeText, this.bagIcons, this.distText, this.pointsText]).setDepth(100);
  }

  private buildControls(): void {
    const { width: W, height: H } = VIEW;
    const touch = this.sys.game.device.input.touch;
    this.band = this.add.graphics().setDepth(90);
    this.staminaBar = this.add.graphics().setDepth(101);
    this.runBtn = new Button(this, RUN_BTN.x, H - RUN_BTN.bottom, {
      width: RUN_BTN.w, height: RUN_BTN.h, label: touch ? '追！\n按住' : '追！\n按住 (D)', fontSize: 40, fill: COLORS.yellow, silent: true,
      releaseOutside: true,
      onDown: () => this.handlers.onRun(true),
      onUp: () => this.handlers.onRun(false),
    });
    this.runBtn.setDepth(110);
    const hint = touch ? '按住畫面往後拉 ↙ 瞄準\n放開就丟！' : '按住滑鼠往後拉 ↙ 瞄準，放開就丟\n或：空白鍵蓄力・↑↓ 調角度';
    this.add
      .text(W - 28, H - RUN_BTN.bottom, hint, { ...TEXT.hud, fontSize: '26px', align: 'right', lineSpacing: 8 })
      .setOrigin(1, 0.5)
      .setAlpha(0.9)
      .setDepth(101);
  }

  /** Any touch that isn't on a button starts a slingshot pull. */
  private bindAim(): void {
    const move = (p: Phaser.Input.Pointer): void => {
      if (!this.aim || p.id !== this.aim.id) return;
      const aim = aimFromPull(this.aim.x, this.aim.y, p.x, p.y);
      this.drawBand(p.x, p.y, aim);
      if (aim.armed) this.dismissTutorial();
      this.handlers.onAim(aim);
    };
    const end = (p: Phaser.Input.Pointer): void => {
      if (!this.aim || p.id !== this.aim.id) return;
      this.aim = null;
      this.band.clear();
      this.handlers.onAimEnd();
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || this.aim) return;
      this.aim = { id: p.id, x: p.x, y: p.y };
      move(p);
    });
    this.input.on('pointermove', move);
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
  }

  private drawBand(x: number, y: number, aim: SlingAim): void {
    if (!this.aim) return;
    const color = aim.ratio < 0.5 ? BAND_COLORS.weak : aim.ratio < 0.85 ? BAND_COLORS.mid : BAND_COLORS.strong;
    this.band.clear();
    this.band.lineStyle(10, COLORS.ink, 0.6);
    this.band.lineBetween(this.aim.x, this.aim.y, x, y);
    this.band.lineStyle(6, aim.armed ? color : 0xffffff, 1);
    this.band.lineBetween(this.aim.x, this.aim.y, x, y);
    this.band.fillStyle(COLORS.ink, 0.6);
    this.band.fillCircle(this.aim.x, this.aim.y, 16);
    this.band.fillStyle(0xffffff, 1);
    this.band.fillCircle(this.aim.x, this.aim.y, 10);
    this.band.fillStyle(aim.armed ? color : 0xffffff, 1);
    this.band.fillCircle(x, y, 22);
    this.band.lineStyle(5, COLORS.ink, 1);
    this.band.strokeCircle(x, y, 22);
  }

  // ── Per-frame state from ThrowScene ─────────────────────
  render(m: ThrowHudModel): void {
    if (!this.ready) return;
    this.timeText.setText(`⏱ ${(m.remainingMs / 1000).toFixed(1)}`).setColor(m.remainingMs < 5000 ? '#ff6b6b' : '#ffffff');
    this.distText
      .setText(m.truckEscaping ? `🚛 ${m.distanceM.toFixed(1)} 公尺 快追！` : `🚛 ${m.distanceM.toFixed(1)} 公尺`)
      .setColor(m.truckEscaping ? '#ff6b6b' : '#ffffff');
    this.pointsText.setText(`這裡命中 +${m.basePoints}`);
    if (m.bagsUsed !== this.shownBagsUsed) {
      this.shownBagsUsed = m.bagsUsed;
      this.drawBags(m.bagsTotal, m.bagsUsed);
    }
    if (m.exhausted !== this.shownExhausted) {
      this.shownExhausted = m.exhausted;
      this.runBtn.setFill(m.exhausted ? 0xb0a99f : COLORS.yellow).setLabel(m.exhausted ? '喘…\n休息中' : '追！\n按住');
    }
    this.drawStamina(m.stamina, m.exhausted);
  }

  private drawBags(total: number, used: number): void {
    const x0 = VIEW.width / 2 - ((total - 1) * 46) / 2 - 30;
    this.bagIcons.clear();
    for (let i = 0; i < total; i++) {
      if (i >= used) drawBag(this.bagIcons, x0 + i * 46, 70, 0.9);
      else {
        this.bagIcons.fillStyle(0x666666, 1);
        this.bagIcons.fillCircle(x0 + i * 46, 66, 10);
      }
    }
  }

  private drawStamina(ratio: number, exhausted: boolean): void {
    const x = RUN_BTN.x - RUN_BTN.w / 2;
    const y = VIEW.height - RUN_BTN.bottom - RUN_BTN.h / 2 - 34;
    this.staminaBar.clear();
    this.staminaBar.fillStyle(COLORS.ink, 0.85);
    this.staminaBar.fillRoundedRect(x - 4, y - 4, RUN_BTN.w + 8, 26, 13);
    this.staminaBar.fillStyle(exhausted ? 0xff6b6b : 0x6ec6ff, 1);
    this.staminaBar.fillRoundedRect(x, y, Math.max(14, RUN_BTN.w * Phaser.Math.Clamp(ratio, 0, 1)), 18, 9);
  }

  /** Hidden during the slow-motion close-up so nothing covers the bag. */
  setTopVisible(on: boolean): void {
    if (this.ready) this.topBar.setVisible(on);
  }

  banner(text: string, color: string): void {
    if (!this.ready) return;
    const t = this.add
      .text(VIEW.width / 2, 250, text, { ...TEXT.title, fontSize: '56px', color, align: 'center' })
      .setOrigin(0.5)
      .setDepth(200)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 1100, duration: 300, onComplete: () => t.destroy() });
  }

  // ── First-run tutorial ──────────────────────────────────
  private showTutorial(): void {
    const { width: W, height: H } = VIEW;
    const cy = H * 0.42;
    const box = this.add.graphics();
    box.fillStyle(COLORS.ink, 0.82);
    box.fillRoundedRect(40, cy - 150, W - 80, 300, 24);
    const text = this.add
      .text(W / 2, cy - 78, '按住畫面 → 往左下拉 → 放開丟出\n拉越長丟越遠', { ...TEXT.hud, fontSize: '30px', align: 'center', color: '#ffe066', lineSpacing: 10 })
      .setOrigin(0.5);
    const from = { x: W / 2 + 90, y: cy + 10 };
    const to = { x: W / 2 - 60, y: cy + 100 };
    const line = this.add.graphics();
    const finger = this.add.text(from.x, from.y, '👆', { fontSize: '64px' }).setOrigin(0.5, 0.1);
    this.tweens.add({
      targets: finger,
      x: to.x,
      y: to.y,
      duration: 900,
      hold: 350,
      repeat: -1,
      repeatDelay: 300,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        line.clear();
        line.lineStyle(6, BAND_COLORS.mid, 1);
        line.lineBetween(from.x, from.y, finger.x, finger.y);
        line.fillStyle(0xffffff, 1);
        line.fillCircle(from.x, from.y, 10);
      },
    });
    this.tutorial = this.add.container(0, 0, [box, text, line, finger]).setDepth(150);
  }

  dismissTutorial(): void {
    const t = this.tutorial;
    if (!t) return;
    this.tutorial = null;
    this.tweens.killTweensOf(t.list);
    this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
  }
}
