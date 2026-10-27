import Phaser from 'phaser';
import { gameFlow } from '../systems/GameFlow';
import { FONT_FAMILY } from '../ui/theme';

/** All art is procedural, so boot only warms up the font and hands off to the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    // Render once so the CJK font is cached before the first real text draw.
    this.add.text(-100, -100, '垃圾車來了', { fontFamily: FONT_FAMILY, fontSize: '20px' });
    gameFlow.go('menu');
    this.scene.start('Menu');
  }
}
