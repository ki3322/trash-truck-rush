import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
type W = { __game: any; __physics: any; __physics3d: any; __ai: any };

const activeScene = (page: Page) =>
  page.evaluate(() => (window as unknown as W).__game.scene.getScenes(true).map((s: any) => s.scene.key).join(','));

async function waitForScene(page: Page, key: string, timeout = 15_000) {
  await page.waitForFunction((k) => (window as unknown as W).__game?.scene.getScene(k)?.sys.isActive(), key, { timeout });
}

/** Rule tests run in the 2D view: same rules, but fast in headless (software) WebGL. */
async function startRun(page: Page, difficulty: 'normal' | 'hard' | 'hell', view: '2d' | '3d' = '2d') {
  await page.goto(view === '2d' ? '/?view=2d' : '/');
  await waitForScene(page, 'Menu');
  await page.evaluate((d) => {
    const m = (window as unknown as W).__game.scene.getScene('Menu');
    m.selectDifficulty(d);
    m.startGame();
  }, difficulty);
  await waitForScene(page, 'Intro');
  await page.waitForTimeout(500); // keys are armed shortly after a scene starts
  await page.keyboard.press('Space'); // skip intro
  await sortAll(page, false);
  await page.waitForFunction(() => (window as unknown as W).__game.scene.getScene('Stair').controlling, null, { timeout: 10_000 });
}

/** Sort every item (correctly, or always into the bag when `sloppy`). */
async function sortAll(page: Page, sloppy: boolean) {
  await page.waitForFunction(() => (window as unknown as W).__game.scene.getScene('Sort').controlling, null, { timeout: 10_000 });
  for (let i = 0; i < 20; i++) {
    const cat = await page.evaluate(() => {
      const s = (window as unknown as W).__game.scene.getScene('Sort');
      if (!s.sys.isActive() || s.finished) return null;
      return s.busy ? 'busy' : s.items[s.index].category;
    });
    if (cat === null) return;
    if (cat !== 'busy') await page.keyboard.press(sloppy || cat === 'general' ? 'KeyA' : 'KeyD');
    await page.waitForTimeout(260);
  }
}

/** Alternate A/D and react to events until the stairs are done. */
async function runStairs(page: Page) {
  let foot = 'KeyA';
  for (let i = 0; i < 800; i++) {
    const st = await page.evaluate(() => {
      const s = (window as unknown as W).__game.scene.getScene('Stair');
      return s.sys.isActive() && !s.finished ? (s.active ? s.active.sched.type : 'run') : null;
    });
    if (st === null) return;
    if (st === 'bagTear') await page.waitForTimeout(1200);
    else if (st !== 'run') {
      await page.waitForTimeout(150);
      await page.keyboard.press('Space');
    } else {
      await page.keyboard.press(foot);
      foot = foot === 'KeyA' ? 'KeyD' : 'KeyA';
      await page.waitForTimeout(100);
    }
  }
}

/** Find a throw that goes in (optionally only via a bounce) using the game's own physics, then throw it. */
async function solveAndThrow(page: Page, requireBounce: boolean): Promise<boolean> {
  return page.evaluate((needBounce) => {
    const P = (window as unknown as W).__physics;
    const s = (window as unknown as W).__game.scene.getScene('Throw');
    const dt = 1 / 120;
    for (let angle = 20; angle <= 75; angle += 1) {
      for (let c = 0; c <= 1; c += 0.01) {
        const v = P.launchVelocity(angle, P.powerFromCharge(c));
        let b = { x: s.releaseX(), y: 918, vx: v.vx + s.chase.vx, vy: v.vy, bounces: 0 };
        let t = s.truckTimeMs;
        for (let i = 0; i < 900; i++) {
          t += dt * 1000;
          const shape = P.truckShape(P.truckRearX(t, s.truckStartX, s.cfg.truckSpeed), 1010, s.cfg.openingWidth);
          const r = P.advanceBag(b, shape, P.truckSpeedAt(t, s.cfg.truckSpeed), 1010, dt);
          if (r.kind === 'hit') {
            if (needBounce && r.state.bounces === 0) break;
            s.angleDeg = angle;
            s.throwBag(P.powerFromCharge(c));
            return true;
          }
          if (r.kind === 'miss') break;
          b = r.state;
        }
      }
    }
    return false;
  }, requireBounce);
}

test('menu renders with all buttons and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await waitForScene(page, 'Menu');
  expect(await activeScene(page)).toBe('Menu');
  expect(errors).toEqual([]);
});

for (const difficulty of ['normal', 'hard', 'hell'] as const) {
  test(`full successful run on ${difficulty}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await startRun(page, difficulty);
    await runStairs(page);
    await waitForScene(page, 'Throw');
    await page.waitForFunction(() => !!(window as unknown as W).__physics);
    // Solve for a hitting throw against the moving truck using the game's own physics.
    const thrown = await solveAndThrow(page, false);
    expect(thrown).toBe(true);
    await waitForScene(page, 'Result');
    const outcome = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Result').outcome);
    expect(outcome.success).toBe(true);
    expect(outcome.throwDistanceM).toBeGreaterThan(0);
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('trash-truck-rush.save') ?? '{}'));
    expect(save.stats.wins).toBe(1);
    expect(save.best[difficulty].bestScore).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('missing all three bags ends with out_of_bags', async ({ page }) => {
  await startRun(page, 'normal');
  await runStairs(page);
  await waitForScene(page, 'Throw');
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => (window as unknown as W).__game.scene.getScene('Throw').canThrow());
    // A flat, weak throw always lands short.
    await page.evaluate(() => {
      const s = (window as unknown as W).__game.scene.getScene('Throw');
      s.angleDeg = 15;
      s.throwBag(320);
    });
  }
  await waitForScene(page, 'Result');
  const o = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Result').outcome);
  expect(o.success).toBe(false);
  expect(o.failReason).toBe('out_of_bags');
  expect(o.attemptsUsed).toBe(3);
});

test('running out of time on the stairs fails cleanly and retry restarts', async ({ page }) => {
  await startRun(page, 'hard');
  await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Stair');
    s.clock = { ...s.clock, penaltyMs: s.clock.totalMs };
  });
  await waitForScene(page, 'Result');
  const o = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Result').outcome);
  expect(o.failReason).toBe('stairs_timeout');
  // A press right away is ignored (a key held from gameplay must not skip results)…
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect(await activeScene(page)).toBe('Result');
  // …but works once armed.
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await waitForScene(page, 'Intro');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await sortAll(page, false);
  await page.waitForFunction(() => {
    const s = (window as unknown as W).__game.scene.getScene('Stair');
    return s.sys.isActive() && s.runner.progress === 0 && s.failedEvents.length === 0;
  });
});

test('challenge link locks difficulty and seed', async ({ page }) => {
  await page.goto('/?challenge=1.x.abc123.2850.168');
  await waitForScene(page, 'Menu');
  const panel = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Menu').challengePanel !== null);
  expect(panel).toBe(true);
  await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Menu').startGame());
  await waitForScene(page, 'Intro');
  const setup = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Intro').setup);
  expect(setup.difficulty).toBe('hell');
  expect(setup.seed).toBe(parseInt('abc123', 36));
});

test('tampered challenge links are ignored', async ({ page }) => {
  await page.goto('/?challenge=1.h.%3Cscript%3E.99999999.1');
  await waitForScene(page, 'Menu');
  const panel = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Menu').challengePanel);
  expect(panel).toBeNull();
});

test('game still works when localStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await waitForScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('mashing the action key before an event locks it out briefly', async ({ page }) => {
  await startRun(page, 'normal');
  const locked = await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Stair');
    s.onAction(); // no event active → lockout
    return s.actionLockUntil > s.now;
  });
  expect(locked).toBe(true);
});

test('Threads fallback reports opened, not failed, when a tab opens', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page, 'Menu');
  const result = await page.evaluate(async () => {
    const opened: string[] = [];
    window.open = ((url: string) => { opened.push(url); return {} as Window; }) as typeof window.open;
    const m = await import('/src/systems/ShareSystem.ts' as string);
    const r = await m.shareToThreads('hello', null);
    return { r, url: opened[0] };
  });
  expect(result.r).toBe('opened_threads');
  expect(result.url).toContain('threads.net/intent/post?text=hello');
});

test('a bank shot off the truck still goes in and earns the bounce bonus', async ({ page }) => {
  await startRun(page, 'normal');
  await runStairs(page);
  await waitForScene(page, 'Throw');
  await page.waitForFunction(() => !!(window as unknown as W).__physics);
  expect(await solveAndThrow(page, true)).toBe(true);
  await waitForScene(page, 'Result');
  const o = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Result').outcome);
  expect(o.success).toBe(true);
  expect(o.bounces).toBeGreaterThan(0);
});

test('sorting mistakes cost time and show up in the result', async ({ page }) => {
  await page.goto('/?view=2d');
  await waitForScene(page, 'Menu');
  await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Menu').startGame());
  await waitForScene(page, 'Intro');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await sortAll(page, true); // everything into the bag → every recyclable is wrong
  await waitForScene(page, 'Stair');
  const st = await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Stair');
    return { mistakes: s.sort.mistakes, penalty: s.clock.penaltyMs };
  });
  expect(st.mistakes).toBeGreaterThanOrEqual(2);
  expect(st.penalty).toBe(st.mistakes * 1500);
});

test('holding 追 chases the truck, drains stamina and stays behind the truck', async ({ page }) => {
  await startRun(page, 'normal');
  await runStairs(page);
  await waitForScene(page, 'Throw');
  // Let the truck pull away first; at the start it is parked right in front of you.
  await page.waitForTimeout(3500);
  const x0 = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Throw').chase.x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  const mid = await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Throw');
    return { x: s.chase.x, stamina: s.chase.stamina, vx: s.chase.vx, truckRear: s.truckRear };
  });
  await page.keyboard.up('KeyD');
  expect(mid.x).toBeGreaterThan(x0 + 60);
  expect(mid.stamina).toBeLessThan(100);
  expect(mid.x).toBeLessThanOrEqual(mid.truckRear - 70 + 1);
  // A throw on the run carries the runner's speed.
  await page.waitForFunction(() => !!(window as unknown as W).__physics);
  expect(await solveAndThrow(page, false)).toBe(true);
  await waitForScene(page, 'Result');
  const o = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Result').outcome);
  expect(o.success).toBe(true);
});

test('two thumbs: hold 追 with the left, slingshot-aim and throw with the right', async ({ page, context }) => {
  await startRun(page, 'normal');
  await runStairs(page);
  await waitForScene(page, 'Throw');
  await page.waitForTimeout(2600); // let the truck pull away so there is room to run
  // Bottom-anchored controls: world y = design y + half, camera shifts another half.
  const toPage = (gx: number, gy: number) =>
    page.evaluate(([x, y]) => {
      const g = (window as unknown as W).__game;
      const r = g.canvas.getBoundingClientRect();
      const k = r.width / 720;
      const half = (g.scale.height - 1280) / 2;
      return [r.left + x * k, r.top + (y + 2 * half) * k];
    }, [gx, gy]);
  const [rx, ry] = await toPage(720 * 0.26, 1198);
  const [tx, ty] = await toPage(720 * 0.74, 1198);
  const cdp = await context.newCDPSession(page);
  const tp = (id: number, x: number, y: number) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 });
  const x0 = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Throw').chase.x);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, rx, ry)] });
  await page.waitForTimeout(300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, rx, ry), tp(2, tx, ty)] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, rx, ry), tp(2, tx, ty - i * 8)] });
    await page.waitForTimeout(50);
  }
  const mid = await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Throw');
    return { x: s.chase.x, angle: s.angleDeg, charging: s.charging };
  });
  expect(mid.x).toBeGreaterThan(x0 + 20); // left thumb is running
  expect(mid.angle).toBeGreaterThan(45); // right thumb slid up → higher angle
  expect(mid.charging).toBe(true);

  // Lift only the right thumb (it has slid off the button) → the bag is thrown.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp(2, tx, ty - 48)] });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Throw').attempts);
  expect(after).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp(1, rx, ry)] });
});

test('3D: both phases render in third person, and a ballistic throw from the side lane goes in', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await startRun(page, 'normal', '3d');
  const stair3d = await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Stair');
    const c = document.getElementById('world3d') as HTMLCanvasElement | null;
    return { is3D: s.view.is3D, canvas: !!c && c.style.display !== 'none' && c.width > 0 };
  });
  expect(stair3d).toEqual({ is3D: true, canvas: true });
  // Skip the run itself (software WebGL is slow headless): jump the runner to the bottom.
  await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Stair');
    s.runner = { ...s.runner, progress: s.total };
    s.displayP = s.total;
  });
  await waitForScene(page, 'Throw', 30_000);
  await page.waitForFunction(() => !!(window as unknown as W).__ai);
  const throw3d = await page.evaluate(() => {
    const s = (window as unknown as W).__game.scene.getScene('Throw');
    return { is3D: s.view.is3D, lane: s.laneZ, crowd: s.neighbors.length };
  });
  expect(throw3d.is3D).toBe(true);
  expect(throw3d.lane).not.toBe(0);
  expect(throw3d.crowd).toBeGreaterThan(0);
  // Wait until the truck is cruising, then aim with the same ballistics the neighbours use.
  await page.waitForFunction(() => (window as unknown as W).__game.scene.getScene('Throw').truckTimeMs > 3200, null, { timeout: 60_000 });
  const thrown = await page.evaluate(() => {
    const w = window as unknown as W;
    const s = w.__game.scene.getScene('Throw');
    const speed = w.__physics.truckSpeedAt(s.truckTimeMs, s.cfg.truckSpeed);
    // Lob it: flat throws can clip the near rim (which correctly bounces them off).
    for (const pitch of [54, 50, 58, 46, 62]) {
      const v = w.__ai.aimAt(s.releaseX(), s.laneZ, { rearX: s.truckRear, speed, openingWidth: s.cfg.openingWidth }, pitch);
      if (!v) continue;
      const vx = v.vx - s.chase.vx;
      const power = Math.hypot(vx, v.vy, v.vz);
      if (power < 320 || power > 900) continue;
      s.angleDeg = (Math.asin(-v.vy / power) * 180) / Math.PI;
      s.yawDeg = (Math.atan2(v.vz, vx) * 180) / Math.PI;
      s.throwBag(power);
      return { pitch, yaw: s.yawDeg };
    }
    return null;
  });
  expect(thrown).not.toBeNull();
  expect(Math.abs(thrown!.yaw)).toBeGreaterThan(1); // had to aim sideways from the side lane
  await waitForScene(page, 'Result', 60_000);
  const o = await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Result').outcome);
  expect(o.success).toBe(true);
  expect(o.neighborsBeaten).toBeGreaterThanOrEqual(0);
  // The 3D layer is hidden again outside 3D scenes.
  const hidden = await page.evaluate(() => (document.getElementById('world3d') as HTMLCanvasElement).style.display);
  expect(hidden).toBe('none');
  expect(errors).toEqual([]);
});

test('?view=2d forces the classic side view', async ({ page }) => {
  await startRun(page, 'normal', '2d');
  expect(await page.evaluate(() => (window as unknown as W).__game.scene.getScene('Stair').view.is3D)).toBe(false);
});
