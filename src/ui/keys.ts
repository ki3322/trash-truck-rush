import type Phaser from 'phaser';

/**
 * Bind a keyboard event that ignores OS auto-repeat (Phaser forwards repeats
 * for `kb.on`) and, optionally, presses in the first `armDelayMs` after the
 * scene starts so a key still held from the previous scene can't trigger it.
 */
export function onKey(
  scene: Phaser.Scene,
  eventName: string,
  handler: () => void,
  armDelayMs = 0,
): void {
  // The game loop clock; scene.time.now is stale during create() on a scene's first run.
  const armedAt = scene.game.getTime() + armDelayMs;
  scene.input.keyboard?.on(eventName, (event: KeyboardEvent) => {
    if (event.repeat || scene.game.getTime() < armedAt) return;
    handler();
  });
}
