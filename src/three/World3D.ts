import * as THREE from 'three';

/**
 * A Three.js canvas layered *under* the (transparent) Phaser canvas.
 * Phaser keeps all input, HUD and buttons; 3D scenes only render here.
 * Renders at the device pixel ratio (capped at 2), so 3D stays sharp on phones.
 */
export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private active: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
  private lastRect = '';

  private constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.canvas.id = 'world3d';
    this.canvas.style.position = 'absolute';
    this.canvas.style.display = 'none';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '0';
  }

  /** Returns null when WebGL isn't available; callers fall back to the 2D scenes. */
  static tryCreate(parent: HTMLElement): World3D | null {
    try {
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const world = new World3D(renderer);
      parent.prepend(world.canvas);
      return world;
    } catch {
      return null;
    }
  }

  /** Match the Phaser canvas' on-screen rectangle exactly. */
  syncTo(target: HTMLCanvasElement): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const r = target.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    const key = `${r.left - p.left},${r.top - p.top},${r.width},${r.height}`;
    if (key === this.lastRect || r.width === 0) return;
    this.lastRect = key;
    this.canvas.style.left = `${r.left - p.left}px`;
    this.canvas.style.top = `${r.top - p.top}px`;
    this.renderer.setSize(r.width, r.height, true);
    if (this.active) {
      this.active.camera.aspect = r.width / r.height;
      this.active.camera.updateProjectionMatrix();
    }
  }

  show(scene: THREE.Scene, camera: THREE.PerspectiveCamera, target: HTMLCanvasElement): void {
    this.active = { scene, camera };
    this.canvas.style.display = 'block';
    this.lastRect = '';
    this.syncTo(target);
  }

  hide(): void {
    this.active = null;
    this.canvas.style.display = 'none';
  }

  render(target: HTMLCanvasElement): void {
    if (!this.active) return;
    this.syncTo(target);
    this.renderer.render(this.active.scene, this.active.camera);
  }

  /** Project a 3D point to Phaser's logical screen coordinates (for pop-up text). */
  toScreen(point: THREE.Vector3, logicalWidth: number, logicalHeight: number): { x: number; y: number } {
    if (!this.active) return { x: 0, y: 0 };
    const v = point.clone().project(this.active.camera);
    return { x: ((v.x + 1) / 2) * logicalWidth, y: ((1 - v.y) / 2) * logicalHeight };
  }

  /**
   * Free the geometry of a scene that is no longer used. Materials and
   * textures are cached and shared between runs, so they are kept.
   */
  static dispose(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      (obj as THREE.Mesh).geometry?.dispose();
    });
    scene.clear();
  }
}

let world: World3D | null | undefined;

/** Shared instance, created lazily; `null` means 3D is unavailable on this device. */
export function getWorld3D(): World3D | null {
  if (world === undefined) {
    const parent = document.getElementById('game');
    world = parent ? World3D.tryCreate(parent) : null;
  }
  return world;
}
