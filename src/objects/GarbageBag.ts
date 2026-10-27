import Phaser from 'phaser';
import type { BagState } from '../utils/physics';
import { drawBag } from './Player';

/** Thrown bag. Position is driven by the physics model; this only renders. */
export class GarbageBag extends Phaser.GameObjects.Container {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly history: { x: number; y: number }[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.trail = scene.add.graphics();
    this.gfx = scene.add.graphics();
    drawBag(this.gfx, 0, 4);
    this.add(this.gfx);
    scene.add.existing(this);
  }

  sync(state: BagState, dtMs: number): void {
    this.setPosition(state.x, state.y);
    this.gfx.rotation += (state.vx / 260) * (dtMs / 1000) * Math.PI;
    this.history.push({ x: state.x, y: state.y });
    if (this.history.length > 14) this.history.shift();
    this.trail.clear();
    this.history.forEach((p, i) => {
      this.trail.fillStyle(0xffffff, (i / this.history.length) * 0.5);
      this.trail.fillCircle(p.x, p.y, 3 + (i / this.history.length) * 6);
    });
  }

  destroy(fromScene?: boolean): void {
    this.trail.destroy();
    super.destroy(fromScene);
  }
}
