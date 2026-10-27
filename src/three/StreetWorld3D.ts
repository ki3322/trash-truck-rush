import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import type { Neighbor } from '../systems/NeighborAI';
import type { AimPreview, P3, PersonLike, SharedPose, ThrowView } from '../scenes/throw/ThrowView';
import { VIEW } from '../ui/view';
import { HERO_LOOK, NEIGHBOR_LOOKS, PX, Person3D, Truck3D, box, makeBag, makeScooter, mat } from './models';
import { LiveLabel, facadeTexture, signTexture } from './textures';
import { World3D } from './World3D';

const C = GAME_CONFIG;
const PREVIEW_DOTS = 32;
const ROAD_HALF = 4.2;
const SIDEWALK = 2.4;

/** Physics px → world metres. */
export function toWorld(p: P3, target = new THREE.Vector3()): THREE.Vector3 {
  return target.set(p.x * PX, (C.groundY - p.y) * PX, p.z * PX);
}

interface FadingBag {
  obj: THREE.Object3D;
  until: number;
  shrink: boolean;
}

/** Third-person 3D street for the throw phase (implements the ThrowView contract). */
export class StreetWorld3D implements ThrowView {
  readonly is3D = true;
  readonly player: PersonLike;
  private readonly hero: Person3D;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 720 / VIEW.height, 0.1, 160);
  private readonly truck: Truck3D;
  private readonly crowd = new Map<number, { person: Person3D; poseUntil: number }>();
  private readonly bags = new Map<number, THREE.Group>();
  private readonly fading: FadingBag[] = [];
  private readonly dots: THREE.InstancedMesh;
  private readonly ring: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private readonly labelText = new LiveLabel(256, 96);
  private readonly tmp = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private focus: THREE.Vector3 | null = null;
  private shakeLeft = 0;
  private clock = 0;
  private playerPos = new THREE.Vector3();

  constructor(private readonly world: World3D, private readonly phaserCanvas: HTMLCanvasElement, openingWidth: number, crowd: readonly Neighbor[]) {
    this.scene.background = new THREE.Color(0x9fd6f5);
    this.scene.fog = new THREE.Fog(0x9fd6f5, 35, 95);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a6a, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-6, 14, 8);
    this.scene.add(sun);

    this.buildStreet();
    this.truck = new Truck3D(openingWidth);
    this.scene.add(this.truck.root);

    this.hero = new Person3D(HERO_LOOK).setFace('panic');
    this.player = this.hero;
    this.scene.add(this.hero.root);

    crowd.forEach((n) => {
      const person = new Person3D(NEIGHBOR_LOOKS[n.look % NEIGHBOR_LOOKS.length]).setFace('panic');
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(n.name, 0x2d1b00, '#ffe066', 256, 96), depthTest: false }));
      tag.scale.set(0.62, 0.23, 1);
      tag.position.y = 2.75;
      person.root.add(tag);
      this.scene.add(person.root);
      this.crowd.set(n.id, { person, poseUntil: 0 });
    });

    this.dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
      PREVIEW_DOTS,
    );
    this.dots.renderOrder = 10;
    this.dots.count = 0;
    this.scene.add(this.dots);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelText.texture, depthTest: false }));
    this.label.scale.set(0.8, 0.3, 1);
    this.label.visible = false;
    this.scene.add(this.label);

    this.world.show(this.scene, this.camera, this.phaserCanvas);
  }

  // ── Scenery ─────────────────────────────────────────────
  private buildStreet(): void {
    const s = this.scene;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(140, ROAD_HALF * 2), mat(0x4d4d4d));
    road.rotation.x = -Math.PI / 2;
    road.position.set(40, 0, 0);
    s.add(road);
    for (let x = -20; x < 100; x += 4) {
      const dash = box(2, 0.01, 0.15, 0xffffff);
      dash.position.set(x, 0.01, -1.9);
      s.add(dash);
    }
    for (const side of [-1, 1]) {
      const edge = box(140, 0.02, 0.12, 0xf4d03f);
      edge.position.set(40, 0.01, side * (ROAD_HALF - 0.2));
      s.add(edge);
      const walk = box(140, 0.18, SIDEWALK, 0xbdbdbd);
      walk.position.set(40, 0.09, side * (ROAD_HALF + SIDEWALK / 2));
      s.add(walk);
    }
    const shops: [string, number][] = [
      ['幸福公寓', 0xc1121f], ['早餐店', 0xe63946], ['巷口超商', 0x2a9d8f], ['機車行', 0x3d7ae0],
      ['牛肉麵', 0xd35400], ['藥局', 0x27ae60], ['檳榔', 0x8e44ad], ['五金行', 0x7f8c8d],
    ];
    const facades = [0xe9dcb8, 0xc9d6df, 0xf2c6b4, 0xd8e2c5, 0xe8d0e0];
    for (const side of [-1, 1]) {
      let x = -14;
      let i = side > 0 ? 0 : 3;
      while (x < 90) {
        const w = 6 + ((i * 7) % 4);
        const floors = 4 + ((i * 3) % 3);
        const h = floors * 3.1;
        const z = side * (ROAD_HALF + SIDEWALK + 4);
        const tex = facadeTexture(facades[i % facades.length], floors);
        const front = new THREE.MeshLambertMaterial({ map: tex });
        const plain = mat(facades[i % facades.length]);
        // Box material order: +x, -x, +y, -y, +z, -z. The road-facing side gets the windows.
        const mats = [plain, plain, plain, plain, side > 0 ? plain : front, side > 0 ? front : plain];
        const b = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, h, 8), mats);
        b.position.set(x + w / 2, h / 2, z);
        s.add(b);
        // Arcade (騎樓): dark walkway band and pillars on the ground floor.
        const arcade = box(w - 0.2, 2.8, 0.3, 0x5b4a30);
        arcade.position.set(x + w / 2, 1.4, z - side * 4.05);
        s.add(arcade);
        const [name, color] = shops[i % shops.length];
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.2, w - 1), 1.05), new THREE.MeshBasicMaterial({ map: signTexture(name, color) }));
        sign.position.set(x + w / 2, 3.45, z - side * 4.22);
        sign.rotation.y = side > 0 ? Math.PI : 0;
        s.add(sign);
        if (i % 3 === 1) {
          const sc = makeScooter([0xe63946, 0x3d7ae0, 0x2a9d8f][i % 3]);
          sc.position.set(x + w / 2, 0.18, side * (ROAD_HALF + 0.8));
          sc.rotation.y = side > 0 ? 0.3 : -0.3;
          s.add(sc);
        }
        x += w;
        i++;
      }
    }
    // Utility poles with sagging wires
    for (let x = 4; x < 90; x += 14) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 10, 8), mat(0x8a8f98));
      pole.position.set(x, 5, -(ROAD_HALF + 0.6));
      s.add(pole);
      const bar = box(0.2, 0.2, 2.2, 0x2d1b00);
      bar.position.set(x, 9.3, -(ROAD_HALF + 0.6));
      s.add(bar);
    }
    const wire = new THREE.LineBasicMaterial({ color: 0x2d1b00 });
    for (const dz of [-0.8, 0.8]) {
      const pts: THREE.Vector3[] = [];
      for (let x = 4; x < 90; x += 1) pts.push(new THREE.Vector3(x, 9.2 - 0.5 * Math.sin((((x - 4) % 14) / 14) * Math.PI), -(ROAD_HALF + 0.6) + dz));
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
    }
  }

  // ── ThrowView ───────────────────────────────────────────
  setPlayerPosition(x: number, z: number): void {
    this.playerPos.set(x * PX, 0, z * PX);
    this.hero.root.position.copy(this.playerPos);
  }

  setTruck(rearX: number, speed: number, dtMs: number): void {
    this.truck.root.position.set(rearX * PX, 0, 0);
    this.truck.tick(dtMs, speed);
  }

  setTargetVisible(on: boolean): void {
    this.truck.setTargetVisible(on);
  }

  setNeighbors(neighbors: readonly Neighbor[]): void {
    neighbors.forEach((n) => {
      const c = this.crowd.get(n.id);
      if (!c) return;
      c.person.root.position.set(n.x * PX, 0, n.z * PX);
      if (this.clock < c.poseUntil) return;
      if (n.vx > 10) c.person.setPose('run').setRunSpeed(n.vx / C.chaseSpeed);
      else c.person.setPose('idle').setBagVisible(n.bags > 0);
    });
  }

  neighborPose(id: number, pose: SharedPose): void {
    const c = this.crowd.get(id);
    if (!c) return;
    c.person.setPose(pose);
    if (pose === 'throw') c.person.setBagVisible(false);
    if (pose === 'cheer') c.person.setFace('happy');
    if (pose === 'cry') c.person.setFace('sad');
    c.poseUntil = this.clock + (pose === 'throw' ? 0.45 : 1.6);
  }

  spawnBag(id: number, at: P3, color = 0xff9ec7): void {
    const b = makeBag(color, 1);
    toWorld(at, b.position);
    this.scene.add(b);
    this.bags.set(id, b);
  }

  syncBag(id: number, at: P3, dtMs: number): void {
    const b = this.bags.get(id);
    if (!b) return;
    toWorld(at, b.position);
    b.rotation.z -= (dtMs / 1000) * 6;
    b.rotation.x += (dtMs / 1000) * 2;
  }

  removeBag(id: number, how: 'hit' | 'miss'): void {
    const b = this.bags.get(id);
    if (!b) return;
    this.bags.delete(id);
    this.fading.push({ obj: b, until: this.clock + (how === 'hit' ? 0.3 : 1.2), shrink: how === 'hit' });
  }

  setPreview(p: AimPreview | null): void {
    if (!p || p.points.length === 0) {
      this.dots.count = 0;
      this.ring.visible = false;
      this.label.visible = false;
      return;
    }
    const m = new THREE.Matrix4();
    const step = Math.max(1, Math.floor(p.points.length / PREVIEW_DOTS));
    let n = 0;
    for (let i = step; i < p.points.length && n < PREVIEW_DOTS; i += step) {
      toWorld(p.points[i], this.tmp);
      m.makeTranslation(this.tmp.x, this.tmp.y, this.tmp.z);
      this.dots.setMatrixAt(n++, m);
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    const last = p.points[p.points.length - 1];
    toWorld(last, this.ring.position);
    this.ring.position.y = Math.max(0.03, this.ring.position.y);
    this.ring.visible = true;
    this.label.visible = p.showLabel;
    if (p.showLabel) {
      this.labelText.set(`${Math.round(p.pitchDeg)}° ${p.yawDeg >= 0 ? '→' : '←'}${Math.abs(Math.round(p.yawDeg))}°`);
      toWorld(p.points[Math.min(p.points.length - 1, 6)], this.label.position);
      this.label.position.y += 0.6;
    }
  }

  setSlowMo(focus: P3 | null): void {
    this.focus = focus ? toWorld(focus) : null;
  }

  toScreen(at: P3): { x: number; y: number } {
    const s = this.world.toScreen(toWorld(at), 720, VIEW.height);
    return { x: s.x, y: s.y - VIEW.half };
  }

  shake(): void {
    this.shakeLeft = 0.14;
  }

  tick(dtMs: number, aimYawDeg: number): void {
    const dt = dtMs / 1000;
    this.clock += dt;
    this.hero.tick(dtMs);
    this.crowd.forEach((c) => c.person.tick(dtMs));
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      if (f.shrink) f.obj.scale.multiplyScalar(0.86);
      if (this.clock >= f.until) {
        this.scene.remove(f.obj);
        this.fading.splice(i, 1);
      }
    }
    this.updateCamera(dt, aimYawDeg);
    this.world.render(this.phaserCanvas);
  }

  /** Over-the-right-shoulder follow camera; swings a little with sideways aim. */
  private updateCamera(dt: number, aimYawDeg: number): void {
    const yaw = (aimYawDeg * Math.PI) / 180;
    const p = this.playerPos;
    const wantPos = this.tmp;
    const wantLook = new THREE.Vector3();
    if (this.focus) {
      wantPos.set(this.focus.x - 2.6, this.focus.y + 1.3, this.focus.z + 1.6);
      wantLook.copy(this.focus);
    } else {
      // High over the right shoulder so you can see down into the hopper over the crowd.
      const back = 4.8;
      const side = 1.9;
      wantPos.set(p.x - back * Math.cos(yaw * 0.5) - side * Math.sin(yaw * 0.5), 5.3, p.z + side * Math.cos(yaw * 0.5) - back * Math.sin(yaw * 0.5));
      wantLook.set(p.x + 10 * Math.cos(yaw * 0.7), 1.2, p.z * 0.25 + 10 * Math.sin(yaw * 0.7));
    }
    const k = Math.min(1, dt * (this.focus ? 6 : 5));
    if (this.camPos.lengthSq() === 0) {
      this.camPos.copy(wantPos);
      this.camLook.copy(wantLook);
    }
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    this.camera.position.copy(this.camPos);
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * 0.12;
    }
    this.camera.lookAt(this.camLook);
  }

  destroy(): void {
    this.world.hide();
    this.labelText.dispose();
    World3D.dispose(this.scene);
  }
}

