import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig';
import { faceTexture, signTexture, type Face3D } from './textures';

/** Low-poly, code-built 3D models. 1 unit = 1 m; physics px → m is ÷ pxPerMeter. */

export const PX = 1 / GAME_CONFIG.pxPerMeter;

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

/** Soft round shadow under characters (cheaper than real shadow maps on phones). */
export function blobShadow(radius: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  return m;
}

// ── People ───────────────────────────────────────────────

export type Pose3D = 'idle' | 'run' | 'stumble' | 'dodge' | 'charge' | 'throw' | 'cheer' | 'cry' | 'still';

export interface PersonLook {
  readonly shirt: number;
  readonly pants: number;
  readonly skin: number;
  readonly hair: number;
  readonly hairStyle: 'short' | 'bun' | 'cap' | 'bald';
  readonly slippers: number;
  readonly scale: number;
  readonly bag: number;
}

export const HERO_LOOK: PersonLook = {
  shirt: 0xffffff, pants: 0x3d7ae0, skin: 0xf6c9a0, hair: 0x2b1d14, hairStyle: 'short', slippers: 0x1f9e89, scale: 1.4, bag: 0xff9ec7,
};

export function makeBag(color = 0xff9ec7, size = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32 * size, 14, 10), mat(color));
  body.scale.set(1, 0.9, 1);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1 * size, 0.2 * size, 6), mat(color));
  knot.position.y = 0.33 * size;
  const ears = new THREE.Mesh(new THREE.BoxGeometry(0.06 * size, 0.18 * size, 0.24 * size), mat(0x2d1b00));
  ears.position.y = 0.44 * size;
  g.add(body, knot, ears);
  return g;
}

/**
 * A cartoon resident, facing +x. Same pose vocabulary as the 2D Player so the
 * game logic can drive either.
 */
export class Person3D {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly face: THREE.Mesh;
  private readonly bag: THREE.Group;
  private readonly extraBag: THREE.Group;
  private readonly slipperR: THREE.Mesh;
  private pose: Pose3D = 'idle';
  private faceKind: Face3D = 'normal';
  private phase = Math.random() * 6;
  private runSpeed = 0;
  private charge = 0;

  constructor(private readonly look: PersonLook = HERO_LOOK) {
    const s = look.scale;
    this.root.add(blobShadow(0.45 * s));
    this.root.add(this.body);
    this.body.scale.setScalar(s);

    const leg = (z: number, group: THREE.Group) => {
      group.position.set(0, 0.8, z);
      const l = box(0.13, 0.78, 0.13, look.skin);
      l.position.y = -0.4;
      const slipper = box(0.3, 0.05, 0.15, look.slippers);
      slipper.position.set(0.05, -0.79, 0);
      group.add(l, slipper);
      this.body.add(group);
      return slipper;
    };
    leg(-0.1, this.legL);
    this.slipperR = leg(0.1, this.legR);

    const shorts = box(0.28, 0.24, 0.44, look.pants);
    shorts.position.y = 0.86;
    const shirt = box(0.28, 0.5, 0.42, look.shirt);
    shirt.position.y = 1.18;
    const logo = box(0.02, 0.1, 0.18, 0xf5c400);
    logo.position.set(0.15, 1.22, 0);
    this.body.add(shorts, shirt, logo);

    const arm = (z: number, group: THREE.Group) => {
      group.position.set(0, 1.38, z);
      const a = box(0.11, 0.55, 0.11, look.skin);
      a.position.y = -0.28;
      const sleeve = box(0.14, 0.16, 0.14, look.shirt);
      sleeve.position.y = -0.06;
      group.add(a, sleeve);
      this.body.add(group);
    };
    arm(-0.27, this.armL);
    arm(0.27, this.armR);

    this.head.position.y = 1.66;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat(look.skin));
    this.face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ map: faceTexture('normal', look.skin), transparent: false }),
    );
    this.face.position.x = 0.195;
    this.face.rotation.y = Math.PI / 2;
    this.head.add(skull, this.face, this.makeHair());
    this.body.add(this.head);

    this.bag = makeBag(look.bag, 0.9);
    this.bag.position.set(0.05, -0.62, 0.05);
    this.armR.add(this.bag);
    this.extraBag = makeBag(0xffd166, 0.7);
    this.extraBag.position.set(0, -0.6, -0.05);
    this.extraBag.visible = false;
    this.armL.add(this.extraBag);
  }

  private makeHair(): THREE.Object3D {
    const g = new THREE.Group();
    const { hair, hairStyle } = this.look;
    if (hairStyle === 'bald') return g;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hairStyle === 'cap' ? 0xe63946 : hair));
    cap.position.y = 0.03;
    g.add(cap);
    if (hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(hair));
      bun.position.set(-0.12, 0.2, 0);
      g.add(bun);
    }
    if (hairStyle === 'cap') {
      const brim = box(0.2, 0.03, 0.3, 0xe63946);
      brim.position.set(0.17, 0.05, 0);
      g.add(brim);
    }
    return g;
  }

  setFace(face: Face3D): this {
    if (face !== this.faceKind) {
      this.faceKind = face;
      (this.face.material as THREE.MeshBasicMaterial).map = faceTexture(face, this.look.skin);
    }
    return this;
  }

  setPose(pose: Pose3D): this {
    this.pose = pose;
    return this;
  }

  getPose(): Pose3D {
    return this.pose;
  }

  setRunSpeed(r: number): this {
    this.runSpeed = Math.min(1, Math.max(0, r));
    return this;
  }

  setCharge(r: number): this {
    this.charge = r;
    return this;
  }

  setBagVisible(on: boolean): this {
    this.bag.visible = on;
    return this;
  }

  setExtraBag(on: boolean): this {
    this.extraBag.visible = on;
    return this;
  }

  setBarefoot(on: boolean): this {
    this.slipperR.visible = !on;
    return this;
  }

  /** World position of the bag hand. */
  handWorld(target = new THREE.Vector3()): THREE.Vector3 {
    return this.bag.getWorldPosition(target);
  }

  tick(dtMs: number): void {
    const dt = dtMs / 1000;
    const hz = this.pose === 'run' ? 2 + this.runSpeed * 4 : 1.2;
    this.phase += dt * hz * Math.PI * 2;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    let legA = 0;
    let legB = 0;
    let armA = 0.15;
    let armB = -0.15;
    let lean = 0;
    let lift = 0;
    let headTilt = 0;
    switch (this.pose) {
      case 'idle':
        lift = Math.abs(s) * 0.02;
        break;
      case 'still':
        lift = Math.sin(this.phase * 3) * 0.01;
        this.setFace('focus');
        break;
      case 'run': {
        const amp = 0.55 + this.runSpeed * 0.45;
        legA = s * amp;
        legB = -s * amp;
        armA = -s * amp * 1.2;
        armB = s * amp * 1.2;
        lean = -0.12 - this.runSpeed * 0.15;
        lift = Math.abs(c) * (0.05 + this.runSpeed * 0.06);
        break;
      }
      case 'stumble':
        lean = 0.35;
        armA = 2.4;
        armB = 2.8;
        legA = 0.6;
        this.setFace('shock');
        break;
      case 'dodge':
        lift = 0.35;
        legA = 0.9;
        legB = -0.6;
        armA = 2.6;
        armB = 2.2;
        break;
      case 'charge':
        armB = -1.4 - this.charge * 1.2;
        armA = 0.6;
        lean = 0.12 + this.charge * 0.1;
        legA = 0.3;
        legB = -0.3;
        this.setFace('focus');
        break;
      case 'throw':
        armB = 2.5;
        armA = -0.5;
        lean = -0.2;
        legA = -0.3;
        legB = 0.4;
        break;
      case 'cheer':
        lift = Math.abs(s) * 0.4;
        armA = 2.9 + s * 0.2;
        armB = 2.9 - s * 0.2;
        this.setFace('happy');
        break;
      case 'cry':
        lean = -0.25;
        headTilt = -0.35 + s * 0.04;
        armA = 0.1;
        armB = -0.1;
        this.setFace('sad');
        break;
    }
    this.legL.rotation.z = legA;
    this.legR.rotation.z = legB;
    this.armL.rotation.z = armA;
    this.armR.rotation.z = armB;
    this.body.rotation.z = lean;
    this.body.position.y = lift;
    this.head.rotation.z = headTilt;
  }
}

/** Neighbour looks for the crowd (阿伯、阿姨、學生、上班族…). */
export const NEIGHBOR_LOOKS: readonly PersonLook[] = [
  { shirt: 0xe9e9e9, pants: 0x4a4a4a, skin: 0xe9b98f, hair: 0xbdbdbd, hairStyle: 'bald', slippers: 0x3d7ae0, scale: 1.35, bag: 0xffd166 }, // 阿伯
  { shirt: 0xc0392b, pants: 0x34495e, skin: 0xf3c7a5, hair: 0x5d4037, hairStyle: 'bun', slippers: 0xe63946, scale: 1.3, bag: 0x7ed957 }, // 阿姨
  { shirt: 0x2a9d8f, pants: 0x1d3557, skin: 0xf6c9a0, hair: 0x1b1b1b, hairStyle: 'cap', slippers: 0xffffff, scale: 1.38, bag: 0x6ec6ff }, // 學生
  { shirt: 0xdfe7f2, pants: 0x22223b, skin: 0xedc3a0, hair: 0x111111, hairStyle: 'short', slippers: 0x111111, scale: 1.45, bag: 0xb388ff }, // 上班族
  { shirt: 0xf4a261, pants: 0x6d4c41, skin: 0xd9a37a, hair: 0x3e2723, hairStyle: 'short', slippers: 0x2a9d8f, scale: 1.33, bag: 0xff9ec7 }, // 夜市老闆
];

// ── Garbage truck ────────────────────────────────────────

const T = GAME_CONFIG.truck;

/** Taiwanese yellow garbage truck. Origin = rear-bottom-centre; drives toward +x. */
export class Truck3D {
  readonly root = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly target: THREE.LineLoop;
  private pulse = 0;

  constructor(openingWidthPx: number) {
    const halfW = GAME_CONFIG.truckHalfWidth * PX;
    const openHalf = GAME_CONFIG.openingHalfWidth * PX;
    const W = halfW * 2;
    const lip = T.lipWidth * PX;
    const open = openingWidthPx * PX;
    const rim = T.rimHeight * PX;
    const lipH = T.lipHeight * PX;
    const clearance = T.chassisClearance * PX;
    const boxX = lip * 2 + open;
    const boxW = T.boxWidth * PX;
    const cabW = T.cabWidth * PX;
    const hopperLen = boxX;

    const add = (m: THREE.Mesh, x: number, y: number, z = 0) => {
      m.position.set(x, y, z);
      this.root.add(m);
      return m;
    };
    // Chassis + lower hopper body
    add(box(hopperLen + boxW + cabW, 0.25, W * 0.9, 0x2d1b00), (hopperLen + boxW + cabW) / 2, clearance - 0.05);
    const bodyH = rim - lipH - clearance;
    add(box(hopperLen, bodyH, W, 0xd9a800), hopperLen / 2, clearance + bodyH / 2);
    // Hopper walls up to the rim (rear, front, and side strips beside the opening)
    const wallH = lipH;
    const wallY = rim - wallH / 2;
    add(box(lip, wallH, W, 0xd9a800), lip / 2, wallY);
    add(box(lip, wallH, W, 0xd9a800), lip + open + lip / 2, wallY);
    const side = halfW - openHalf;
    add(box(open, wallH, side, 0xd9a800), lip + open / 2, wallY, openHalf + side / 2);
    add(box(open, wallH, side, 0xd9a800), lip + open / 2, wallY, -openHalf - side / 2);
    // Dark trash pile inside the opening
    add(box(open, 0.1, openHalf * 2, 0x2b2b2b), lip + open / 2, rim - 0.35);
    // Hazard stripes on the rear
    for (let i = 0; i < 6; i++) {
      add(box(0.02, 0.28, W / 6, i % 2 ? 0xffe066 : 0x2d1b00), -0.011, clearance + 0.45, -halfW + W / 12 + (i * W) / 6);
    }
    add(box(0.03, 0.35, 0.18, 0xff3b30), -0.02, rim - lipH - 0.4, halfW - 0.2);
    add(box(0.03, 0.35, 0.18, 0xff3b30), -0.02, rim - lipH - 0.4, -halfW + 0.2);

    // Box
    const boxH = T.boxHeight * PX;
    add(box(boxW, boxH - clearance, W, 0xf5c400), boxX + boxW / 2, clearance + (boxH - clearance) / 2);
    add(box(boxW, 0.3, W + 0.02, 0x3a8f3a), boxX + boxW / 2, clearance + (boxH - clearance) * 0.42);
    add(box(0.6, 0.3, 0.5, 0xdddddd), boxX + 0.6, boxH + 0.15);
    const sign = new THREE.MeshBasicMaterial({ map: signTexture('♪ 垃圾車 ♪', 0xf5c400, '#1f5130') });
    for (const z of [halfW + 0.012, -halfW - 0.012]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(boxW * 0.85, boxW * 0.22), sign);
      p.position.set(boxX + boxW / 2, clearance + (boxH - clearance) * 0.7, z);
      p.rotation.y = z > 0 ? 0 : Math.PI;
      this.root.add(p);
    }
    // Cab
    const cabH = T.cabHeight * PX;
    const cabX = boxX + boxW;
    add(box(cabW, cabH - clearance, W, 0xffe066), cabX + cabW / 2, clearance + (cabH - clearance) / 2);
    add(box(0.05, 0.9, W * 0.8, 0x7fd0ff), cabX + cabW + 0.01, cabH - 0.75);

    // Wheels (axis along z)
    const wheelR = T.wheelRadius * PX;
    for (const x of [lip + open / 2, boxX + boxW - 0.8, cabX + cabW - 0.75]) {
      for (const z of [halfW - 0.15, -halfW + 0.15]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 14), mat(0x222222));
        w.rotation.x = Math.PI / 2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.4, wheelR * 0.4, 0.32, 8), mat(0xbbbbbb));
        hub.rotation.x = Math.PI / 2;
        w.add(hub);
        add(w, x, wheelR, z);
        this.wheels.push(w);
      }
    }

    // Glowing target outline around the opening
    const pts = [
      new THREE.Vector3(lip, rim + 0.03, -openHalf),
      new THREE.Vector3(lip + open, rim + 0.03, -openHalf),
      new THREE.Vector3(lip + open, rim + 0.03, openHalf),
      new THREE.Vector3(lip, rim + 0.03, openHalf),
    ];
    this.target = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x00e676 }));
    this.root.add(this.target);
  }

  setTargetVisible(on: boolean): void {
    this.target.visible = on;
  }

  tick(dtMs: number, speedPx: number): void {
    const wheelR = T.wheelRadius * PX;
    const dist = (speedPx * PX * dtMs) / 1000;
    this.wheels.forEach((w) => (w.rotation.y -= dist / wheelR));
    this.pulse += dtMs / 1000;
    (this.target.material as THREE.LineBasicMaterial).color.setHSL(0.38, 1, 0.45 + 0.2 * Math.sin(this.pulse * 6));
  }
}

// ── Props ────────────────────────────────────────────────

export function makeShoeCabinet(): THREE.Group {
  const g = new THREE.Group();
  const cab = box(0.5, 1.1, 0.9, 0xb5835a);
  cab.position.y = 0.55;
  g.add(cab);
  [0xe63946, 0x3d7ae0, 0xffffff, 0x2a9d8f].forEach((c, i) => {
    const shoe = box(0.3, 0.12, 0.16, c);
    shoe.position.set(0.1, 1.17, -0.3 + i * 0.2);
    g.add(shoe);
  });
  return g;
}

export function makeSlipper(color = 0x1f9e89): THREE.Mesh {
  return box(0.42, 0.07, 0.2, color);
}

export function makeScooter(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = box(1.6, 0.55, 0.5, color);
  body.position.y = 0.6;
  const seat = box(0.7, 0.15, 0.45, 0x222222);
  seat.position.set(-0.2, 0.95, 0);
  const handle = box(0.08, 0.7, 0.6, 0x2d1b00);
  handle.position.set(0.7, 1.1, 0);
  g.add(body, seat, handle);
  for (const x of [-0.6, 0.6]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 12), mat(0x222222));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.3, 0);
    g.add(w);
  }
  return g;
}
