import * as THREE from 'three';
import type { StairRunner, StairView } from '../scenes/stairs/StairView';
import type { EventType, ScheduledEvent } from '../types';
import { VIEW } from '../ui/view';
import type { Segment } from '../utils/stairPath';
import { FLIGHT_DROP, FLIGHT_RUN, LANE_GAP, STEP_RISE, STEP_RUN, TURN_OUT, floorY3, pose3At } from '../utils/stairPath3d';
import { HERO_LOOK, Person3D, box, makeBag, makeShoeCabinet, makeSlipper, mat, type PersonLook } from './models';
import { signTexture, tileTexture } from './textures';
import { World3D } from './World3D';

const LANE_HALF = 0.68;
const WALL_RIGHT = LANE_HALF + 0.1;
const WALL_LEFT = -LANE_GAP - LANE_HALF - 0.1;
const END_LEFT = -TURN_OUT - 0.55;
const END_RIGHT = FLIGHT_RUN + TURN_OUT + 0.55;
const GRAVITY = 9.8;

const GRANDMA_LOOK: PersonLook = {
  shirt: 0xc0392b, pants: 0x34495e, skin: 0xf6c9a0, hair: 0xcfcfcf, hairStyle: 'bun', slippers: 0x8d6e63, scale: 0.85, bag: 0x27ae60,
};

interface Particle {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  until: number;
  spin: number;
}

/** Third-person 3D stairwell (implements the StairView contract). */
export class StairWorld3D implements StairView {
  readonly is3D = true;
  readonly runner: StairRunner;
  private readonly hero: Person3D;
  private readonly scene = new THREE.Scene();
  // Near plane 0.6 m: railings/walls right at the lens get clipped away during U-turns.
  private readonly camera = new THREE.PerspectiveCamera(72, 720 / VIEW.height, 0.6, 80);
  private readonly props = new Map<EventType, THREE.Object3D>();
  private readonly particles: Particle[] = [];
  private grandma: Person3D | null = null;
  private slipper: Particle | null = null;
  private momBag: Particle | null = null;
  private exitUntil = 0;
  private clock = 0;
  private heading = 0;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly world: World3D,
    private readonly phaserCanvas: HTMLCanvasElement,
    private readonly startFloor: number,
    private readonly segments: readonly Segment[],
    schedule: readonly ScheduledEvent[],
    private readonly windowMs: number,
  ) {
    this.scene.background = new THREE.Color(0x3b3226);
    this.scene.fog = new THREE.Fog(0x3b3226, 9, 22);
    this.scene.add(new THREE.HemisphereLight(0xfff4dd, 0x6b5a3a, 1.8));
    const lamp = new THREE.DirectionalLight(0xffffff, 1.0);
    lamp.position.set(2, 8, 4);
    this.scene.add(lamp);

    this.buildStairwell();
    // Smaller than on the street: the stairwell is narrow and the camera needs to see the flight ahead.
    this.hero = new Person3D({ ...HERO_LOOK, scale: 0.95 }).setFace('panic');
    this.runner = this.hero;
    this.scene.add(this.hero.root);
    this.placeProps(schedule);
    this.place(0);
    this.world.show(this.scene, this.camera, this.phaserCanvas);
  }

  // ── Stairwell geometry ──────────────────────────────────
  private buildStairwell(): void {
    const s = this.scene;
    const flights = this.segments.filter((g) => g.kind === 'flight').length;
    const top = floorY3(this.startFloor);
    const wallH = top + 4;
    const wallMat = (w: number) => new THREE.MeshLambertMaterial({ map: tileTexture(0xe9dcb8, 0xd2c29a, w / 0.6, wallH / 0.6) });

    const wall = (w: number, x: number, z: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat(w));
      m.position.set(x, wallH / 2 - 0.5, z);
      m.rotation.y = rotY;
      s.add(m);
    };
    const span = END_RIGHT - END_LEFT;
    const midX = (END_LEFT + END_RIGHT) / 2;
    wall(span, midX, WALL_LEFT, 0); // faces +z (into the stairwell)
    wall(span, midX, WALL_RIGHT, Math.PI); // faces -z
    const depth = WALL_RIGHT - WALL_LEFT;
    const midZ = (WALL_LEFT + WALL_RIGHT) / 2;
    wall(depth, END_LEFT, midZ, Math.PI / 2);
    wall(depth, END_RIGHT, midZ, -Math.PI / 2);

    // Flights: chunky concrete steps with a nosing strip, plus a green railing.
    let k = 0;
    this.segments.forEach((seg) => {
      if (seg.kind !== 'flight') return;
      const topY = top - k * FLIGHT_DROP;
      const z = k % 2 === 0 ? 0 : -LANE_GAP;
      const right = seg.dir > 0;
      for (let st = 0; st < seg.units; st++) {
        const y = topY - st * STEP_RISE;
        const x0 = right ? st * STEP_RUN : FLIGHT_RUN - (st + 1) * STEP_RUN;
        const block = box(STEP_RUN, 0.6, LANE_HALF * 2, st % 2 ? 0xb0a99f : 0xb7b0a6);
        block.position.set(x0 + STEP_RUN / 2, y - 0.3, z);
        const nose = box(0.06, 0.04, LANE_HALF * 2, 0xd9d2c5);
        nose.position.set(right ? x0 + STEP_RUN - 0.03 : x0 + 0.03, y, z);
        s.add(block, nose);
      }
      // Railing on the inner side, between the two lanes.
      const railZ = z + (k % 2 === 0 ? -LANE_HALF : LANE_HALF);
      const len = Math.hypot(FLIGHT_RUN, FLIGHT_DROP);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), mat(0x3f7d4f));
      rail.position.set(FLIGHT_RUN / 2, topY - FLIGHT_DROP / 2 + 0.85, railZ);
      rail.rotation.z = (right ? 1 : -1) * (Math.PI / 2 - Math.atan2(FLIGHT_DROP, FLIGHT_RUN));
      s.add(rail);
      for (let st = 0; st <= seg.units; st += 2) {
        const post = box(0.035, 0.85, 0.035, 0x3f7d4f);
        const x = right ? st * STEP_RUN : FLIGHT_RUN - st * STEP_RUN;
        post.position.set(x, topY - st * STEP_RISE + 0.42, railZ);
        s.add(post);
      }
      k++;
    });

    // Landings at every level; floor landings (even) are on the left with a door.
    for (let j = 0; j <= flights; j++) {
      const y = top - j * FLIGHT_DROP;
      const left = j % 2 === 0;
      const x0 = left ? END_LEFT : FLIGHT_RUN;
      const x1 = left ? 0 : END_RIGHT;
      const slab = box(x1 - x0, 0.3, WALL_RIGHT - WALL_LEFT, 0xb7b0a6);
      slab.position.set((x0 + x1) / 2, y - 0.15, midZ);
      s.add(slab);
      const floor = this.startFloor - j / 2;
      if (left) this.decorateFloorLanding(y, floor, j === flights);
      else this.decorateMidLanding(y);
    }
  }

  private decorateFloorLanding(y: number, floor: number, ground: boolean): void {
    const s = this.scene;
    const doorX = END_LEFT + 0.02;
    if (ground) {
      const gate = box(0.05, 2.6, 1.4, 0x6d4c41);
      gate.position.set(doorX, y + 1.3, -LANE_GAP / 2);
      const light = box(0.04, 2.2, 0.9, 0xffe9a8);
      light.position.set(doorX + 0.01, y + 1.2, -LANE_GAP / 2);
      const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshBasicMaterial({ map: signTexture('出口', 0x2a9d8f) }));
      exit.position.set(doorX + 0.05, y + 2.85, -LANE_GAP / 2);
      exit.rotation.y = Math.PI / 2;
      s.add(gate, light, exit);
      return;
    }
    const door = box(0.06, 2.2, 1.0, floor % 2 === 0 ? 0x8d6e63 : 0x5d7b6f);
    door.position.set(doorX, y + 1.1, -LANE_GAP / 2);
    const fu = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('福', 0xe63946, '#ffd166', 128, 128) }));
    fu.position.set(doorX + 0.04, y + 1.7, -LANE_GAP / 2);
    fu.rotation.set(0, Math.PI / 2, Math.PI / 4);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: signTexture(`${floor}F`, 0x2d1b00, '#ffffff', 256, 128) }));
    plate.position.set(doorX + 0.04, y + 2.55, -LANE_GAP / 2);
    plate.rotation.y = Math.PI / 2;
    const cabinet = makeShoeCabinet();
    cabinet.scale.setScalar(0.7);
    cabinet.position.set(END_LEFT + 0.35, y, WALL_LEFT + 0.35);
    s.add(door, fu, plate, cabinet);
  }

  private decorateMidLanding(y: number): void {
    const s = this.scene;
    const win = new THREE.Group();
    const glass = box(0.04, 1.1, 1.3, 0x9ed8f5);
    win.add(glass);
    for (let i = -0.6; i <= 0.6; i += 0.15) {
      const bar = box(0.06, 1.25, 0.03, 0x3f7d4f);
      bar.position.z = i;
      win.add(bar);
    }
    win.position.set(END_RIGHT - 0.04, y + 1.7, -LANE_GAP / 2);
    const pot = box(0.35, 0.35, 0.35, 0xc0603a);
    pot.position.set(END_RIGHT - 0.35, y + 0.18, WALL_RIGHT - 0.3);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0x2e8b57));
    leaves.position.set(END_RIGHT - 0.35, y + 0.6, WALL_RIGHT - 0.3);
    s.add(win, pot, leaves);
  }

  private placeProps(schedule: readonly ScheduledEvent[]): void {
    schedule.forEach((e) => {
      if (e.type === 'shoeCabinet') {
        const p = pose3At(this.segments, this.startFloor, e.atUnit + 1.6);
        const cab = makeShoeCabinet();
        cab.position.set(p.x, p.y, p.z);
        cab.rotation.y = -p.heading;
        this.scene.add(cab);
        this.props.set(e.type, cab);
      } else if (e.type === 'grandma') {
        const p = pose3At(this.segments, this.startFloor, e.atUnit + 2.2);
        const g = new Person3D(GRANDMA_LOOK).setFace('normal');
        g.root.position.set(p.x, p.y, p.z);
        g.root.rotation.y = -(p.heading + Math.PI); // coming up the stairs toward you
        g.setPose('idle');
        this.scene.add(g.root);
        this.grandma = g;
        this.props.set(e.type, g.root);
      }
    });
  }

  // ── StairView ───────────────────────────────────────────
  place(progress: number): void {
    const p = pose3At(this.segments, this.startFloor, progress);
    this.hero.root.position.set(p.x, p.y, p.z);
    // Smooth the facing so U-turns swing instead of snapping.
    let d = p.heading - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * 0.25;
    this.hero.root.rotation.y = -this.heading;
  }

  runnerScreen(): { x: number; y: number } {
    this.tmp.copy(this.hero.root.position);
    this.tmp.y += 2.0;
    return this.world.toScreen(this.tmp, 720, VIEW.height);
  }

  eventStart(type: EventType): void {
    const pos = this.hero.root.position;
    const fwd = new THREE.Vector3(Math.cos(this.heading), 0, Math.sin(this.heading));
    if (type === 'slipper') {
      this.hero.setBarefoot(true);
      const s = makeSlipper();
      s.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0));
      this.scene.add(s);
      this.slipper = { obj: s, vel: fwd.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 4, 0)), until: Infinity, spin: 9 };
      this.particles.push(this.slipper);
    }
    if (type === 'momBag') {
      const b = makeBag(0xffd166, 1.1);
      b.position.copy(pos).add(new THREE.Vector3(0, 6, 0));
      this.scene.add(b);
      const fall = 6 / (this.windowMs / 1000);
      this.momBag = { obj: b, vel: new THREE.Vector3(0, -fall, 0), until: Infinity, spin: 4 };
      this.particles.push(this.momBag);
    }
  }

  eventEnd(type: EventType, success: boolean, slowMs: number): void {
    if (type === 'grandma' && this.grandma) {
      if (success) {
        // Step aside against the wall and smile.
        this.grandma.root.position.z += this.grandma.root.position.z < -LANE_GAP / 2 ? -0.4 : 0.4;
        this.grandma.setFace('happy');
      } else {
        this.grandma.setFace('shock');
      }
    }
    if (type === 'shoeCabinet' && !success) {
      const cab = this.props.get('shoeCabinet');
      if (cab) cab.rotation.z = 0.25;
    }
    if (type === 'slipper' && this.slipper) {
      const s = this.slipper;
      this.slipper = null;
      if (success) {
        s.until = this.clock;
        this.hero.setBarefoot(false);
      } else {
        s.until = this.clock + 1.5;
        window.setTimeout(() => this.hero.setBarefoot(false), slowMs);
      }
    }
    if (type === 'momBag' && this.momBag) {
      const b = this.momBag;
      this.momBag = null;
      if (success) {
        b.until = this.clock;
        this.hero.setExtraBag(true);
      } else {
        b.vel.set(0.5, -6, 0.3);
        b.until = this.clock + 1.2;
      }
    }
    if (type === 'bagTear' && !success) this.scatterTrash();
  }

  private scatterTrash(): void {
    const colors = [0xffffff, 0xe63946, 0x2a9d8f, 0xf4a261, 0x8d6e63];
    const pos = this.hero.root.position;
    for (let i = 0; i < 14; i++) {
      const piece = box(0.12 + Math.random() * 0.1, 0.06, 0.1 + Math.random() * 0.1, colors[i % colors.length]);
      piece.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
      this.scene.add(piece);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        obj: piece,
        vel: new THREE.Vector3(Math.cos(a) * 1.8, 2.5 + Math.random() * 2, Math.sin(a) * 1.8),
        until: this.clock + 1.6,
        spin: 8,
      });
    }
  }

  exitDoor(): void {
    this.exitUntil = this.clock + 0.45;
  }

  tick(dtMs: number): void {
    const dt = dtMs / 1000;
    this.clock += dt;
    this.hero.tick(dtMs);
    this.grandma?.tick(dtMs);
    if (this.clock < this.exitUntil) this.hero.root.position.x -= dt * 4;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p === this.momBag) {
        // Homes in on the hero's hand while falling.
        const target = this.hero.root.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        p.obj.position.x += (target.x - p.obj.position.x) * Math.min(1, dt * 3);
        p.obj.position.z += (target.z - p.obj.position.z) * Math.min(1, dt * 3);
        p.obj.position.y = Math.max(target.y, p.obj.position.y + p.vel.y * dt);
      } else {
        p.vel.y -= GRAVITY * dt;
        p.obj.position.addScaledVector(p.vel, dt);
      }
      p.obj.rotation.x += p.spin * dt;
      if (this.clock >= p.until) {
        this.scene.remove(p.obj);
        this.particles.splice(i, 1);
      }
    }
    this.updateCamera(dt);
    this.world.render(this.phaserCanvas);
  }

  /** Behind and above the runner, looking down the flight; swings round at U-turns. */
  private updateCamera(dt: number): void {
    const p = this.hero.root.position;
    const fx = Math.cos(this.heading);
    const fz = Math.sin(this.heading);
    // Descending: "behind" is also higher up the flight, so look down over the shoulder.
    const want = this.tmp.set(p.x - fx * 3.3 - fz * 0.35, p.y + 3.0, p.z - fz * 3.3 + fx * 0.35);
    const look = new THREE.Vector3(p.x + fx * 2.6, p.y - 0.5, p.z + fz * 2.6);
    if (this.camPos.lengthSq() === 0) {
      this.camPos.copy(want);
      this.camLook.copy(look);
    }
    const k = Math.min(1, dt * 5);
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  destroy(): void {
    this.world.hide();
    World3D.dispose(this.scene);
  }
}
