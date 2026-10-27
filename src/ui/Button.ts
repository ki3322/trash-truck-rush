import Phaser from 'phaser';
import { audio } from '../systems/AudioSystem';
import { COLORS, FONT_FAMILY } from './theme';

export interface ButtonOptions {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly fill?: number;
  readonly textColor?: string;
  readonly fontSize?: number;
  /** Fires on release inside the button (normal buttons). */
  readonly onClick?: () => void;
  /** Fires immediately on press (game controls). */
  readonly onDown?: (pointer: Phaser.Input.Pointer) => void;
  readonly onUp?: () => void;
  readonly silent?: boolean;
  /**
   * Keep the press alive when the finger slides off the button and end it
   * only when that finger lifts anywhere (slingshot-style drag controls).
   */
  readonly releaseOutside?: boolean;
}

/** Chunky cartoon button with drop shadow and press feedback. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private pressed = false;
  /** Pointer that started the press; other fingers can't release it. */
  private pressPointerId: number | null = null;
  private flashing = false;
  private enabled = true;
  private fill: number;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly opts: ButtonOptions) {
    super(scene, x, y);
    this.fill = opts.fill ?? COLORS.yellow;
    this.bg = scene.add.graphics();
    this.text = scene.add
      .text(0, -3, opts.label, {
        fontFamily: FONT_FAMILY,
        fontSize: `${opts.fontSize ?? 34}px`,
        fontStyle: '900',
        color: opts.textColor ?? '#2d1b00',
        align: 'center',
      })
      .setOrigin(0.5);
    this.add([this.bg, this.text]);
    this.setSize(opts.width, opts.height);
    // Container hit areas are measured from the top-left (Phaser adds the display origin).
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, opts.width, opts.height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.draw();

    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled || this.pressed) return;
      this.pressed = true;
      this.pressPointerId = p.id;
      this.draw();
      if (!opts.silent) audio.play('click');
      if (opts.releaseOutside) this.listenForGlobalRelease(p.id);
      opts.onDown?.(p);
    });
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (opts.releaseOutside) return; // handled by the scene-wide listener
      if (!this.enabled || (this.pressed && p.id !== this.pressPointerId)) return;
      const wasPressed = this.pressed;
      this.endPress();
      if (wasPressed) opts.onClick?.();
    });
    this.on('pointerout', (p: Phaser.Input.Pointer) => {
      if (opts.releaseOutside || !this.pressed || p.id !== this.pressPointerId) return;
      this.endPress();
    });
    scene.add.existing(this);
  }

  /** Id of the finger currently holding this button, if any. */
  get activePointerId(): number | null {
    return this.pressed ? this.pressPointerId : null;
  }

  private endPress(): void {
    this.pressed = false;
    this.pressPointerId = null;
    this.draw();
    this.opts.onUp?.();
  }

  private listenForGlobalRelease(pointerId: number): void {
    const input = this.scene.input;
    const onRelease = (p: Phaser.Input.Pointer) => {
      if (p.id !== pointerId) return;
      input.off('pointerup', onRelease);
      input.off('pointerupoutside', onRelease);
      if (this.pressed && this.pressPointerId === pointerId) this.endPress();
    };
    input.on('pointerup', onRelease);
    // Finger lifted outside the canvas (e.g. slid off the screen edge).
    input.on('pointerupoutside', onRelease);
  }

  setLabel(label: string): this {
    this.text.setText(label);
    return this;
  }

  setFill(fill: number): this {
    this.fill = fill;
    this.draw();
    return this;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.45);
    if (!on) this.pressed = false;
    this.draw();
    return this;
  }

  /** Visual press for keyboard-driven presses. */
  flash(): void {
    this.flashing = true;
    this.draw();
    this.scene.time.delayedCall(90, () => {
      this.flashing = false;
      this.draw();
    });
  }

  private draw(): void {
    const { width: w, height: h } = this.opts;
    const off = this.pressed || this.flashing ? 4 : 0;
    this.bg.clear();
    this.bg.fillStyle(COLORS.ink, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 18);
    this.bg.fillStyle(this.fill, 1);
    this.bg.fillRoundedRect(-w / 2, -h / 2 + off, w, h - 2, 18);
    this.bg.lineStyle(5, COLORS.ink, 1);
    this.bg.strokeRoundedRect(-w / 2, -h / 2 + off, w, h - 2, 18);
    this.bg.fillStyle(0xffffff, 0.35);
    this.bg.fillRoundedRect(-w / 2 + 10, -h / 2 + off + 7, w - 20, 10, 5);
    this.text.setY(-3 + off);
  }
}
