import * as THREE from 'three';
import { FONT_FAMILY } from '../ui/theme';

/** Procedural canvas textures (tiles, signs, faces) — no image files needed. */

const cache = new Map<string, THREE.CanvasTexture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Ceramic wall tiles typical of old Taiwanese apartments. */
export function tileTexture(base: number, line: number, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const tex = canvasTexture(`tile-${base}-${line}`, 128, 128, (ctx) => {
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = css(line);
    for (let i = 0; i < 128; i += 32) {
      ctx.fillRect(0, i, 128, 3);
      ctx.fillRect(i, 0, 3, 128);
    }
  }).clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

/** Facade with green iron-grille windows (鐵窗). */
export function facadeTexture(base: number, floors: number): THREE.CanvasTexture {
  return canvasTexture(`facade-${base}-${floors}`, 256, 128 * floors, (ctx) => {
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, 256, 128 * floors);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < 128 * floors; y += 16) ctx.fillRect(0, y, 256, 2);
    for (let f = 0; f < floors; f++) {
      const y = f * 128 + 24;
      for (const x of [24, 140]) {
        ctx.fillStyle = '#9ed8f5';
        ctx.fillRect(x, y, 92, 70);
        ctx.fillStyle = '#3f7d4f';
        for (let gx = x; gx <= x + 92; gx += 10) ctx.fillRect(gx - 1, y - 6, 3, 82);
        ctx.fillRect(x - 6, y - 6, 104, 5);
        ctx.fillRect(x - 6, y + 34, 104, 4);
        ctx.fillRect(x - 6, y + 72, 104, 5);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, f * 128 + 120, 256, 8);
    }
  });
}

/** Shop sign / label with big CJK text. */
export function signTexture(text: string, bg: number, fg = '#ffffff', w = 512, h = 128): THREE.CanvasTexture {
  return canvasTexture(`sign-${text}-${bg}-${fg}-${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = css(bg);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2d1b00';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = fg;
    ctx.font = `900 ${Math.round(h * 0.6)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4, w - 30);
  });
}

export type Face3D = 'normal' | 'panic' | 'happy' | 'sad' | 'focus' | 'shock';

/** Cartoon face drawn on a plane in front of the head. */
export function faceTexture(face: Face3D, skin: number): THREE.CanvasTexture {
  return canvasTexture(`face-${face}-${skin}`, 128, 128, (ctx) => {
    ctx.fillStyle = css(skin);
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,120,120,0.55)';
    ctx.beginPath();
    ctx.arc(28, 82, 11, 0, Math.PI * 2);
    ctx.arc(100, 82, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d1b00';
    ctx.strokeStyle = '#2d1b00';
    ctx.lineWidth = 6;
    const eyes = (r: number) => {
      ctx.beginPath();
      ctx.arc(42, 58, r, 0, Math.PI * 2);
      ctx.arc(86, 58, r, 0, Math.PI * 2);
      ctx.fill();
    };
    switch (face) {
      case 'panic':
      case 'shock':
        eyes(10);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(45, 54, 4, 0, Math.PI * 2);
        ctx.arc(89, 54, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2d1b00';
        ctx.beginPath();
        ctx.ellipse(64, 96, 12, face === 'shock' ? 16 : 10, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'happy':
        ctx.beginPath();
        ctx.arc(42, 62, 10, Math.PI, 0);
        ctx.moveTo(96, 62);
        ctx.arc(86, 62, 10, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(64, 88, 18, 0, Math.PI);
        ctx.fill();
        break;
      case 'sad':
        ctx.fillRect(30, 56, 24, 6);
        ctx.fillRect(74, 56, 24, 6);
        ctx.beginPath();
        ctx.arc(64, 108, 14, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.fillStyle = '#6ec6ff';
        ctx.fillRect(36, 66, 8, 24);
        ctx.fillRect(84, 66, 8, 24);
        break;
      case 'focus':
        ctx.fillRect(30, 54, 24, 8);
        ctx.fillRect(74, 54, 24, 8);
        ctx.fillRect(54, 94, 22, 6);
        break;
      default:
        eyes(7);
        ctx.fillRect(54, 94, 22, 6);
    }
  });
}

/** A single canvas texture whose text is redrawn in place (no cache growth). */
export class LiveLabel {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D | null;
  private text = '';

  constructor(private readonly w: number, private readonly h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    this.ctx = canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  set(text: string): void {
    if (text === this.text || !this.ctx) return;
    this.text = text;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(45,27,0,0.85)';
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 24);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.font = `900 ${Math.round(h * 0.55)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3, w - 20);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
