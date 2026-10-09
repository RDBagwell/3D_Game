import { describe, it, expect } from 'vitest';
import { FixedStepLoop } from '../src/engine/index.js';
import { Sandbox } from '../src/game/sim/Sandbox.js';

/**
 * A loop driven by a fake clock: `frames` are the real times (ms) at which
 * the browser would call requestAnimationFrame.
 * @param {(dt: number) => void} update
 * @param {number[]} frames
 * @param {Partial<ConstructorParameters<typeof FixedStepLoop>[0]>} [options]
 */
function drive(update, frames, options = {}) {
  let now = 0;
  const alphas = [];
  const loop = new FixedStepLoop({
    update,
    render: (alpha) => alphas.push(alpha),
    now: () => now,
    requestFrame: () => 0,
    cancelFrame: () => {},
    ...options,
  });
  loop.start();
  for (const t of frames) {
    now = t;
    loop.tick(t);
  }
  return { loop, alphas };
}

/** Frame times for `seconds` at `fps`. */
const at = (fps, seconds) => Array.from({ length: Math.round(fps * seconds) }, (_, i) => ((i + 1) * 1000) / fps);

describe('FixedStepLoop', () => {
  it('runs 60 updates per simulated second at 30, 60 and 144 fps', () => {
    for (const fps of [30, 60, 144]) {
      let count = 0;
      drive(() => count++, at(fps, 2));
      expect(count, `${fps} fps`).toBe(120);
    }
  });

  it('always passes the same fixed dt', () => {
    const dts = new Set();
    drive((dt) => dts.add(dt), at(144, 1).concat(at(30, 1).map((t) => t + 1000)));
    expect([...dts]).toEqual([1 / 60]);
  });

  it('reports alpha between 0 and 1 for interpolation', () => {
    const { alphas } = drive(() => {}, at(144, 1));
    expect(alphas.every((a) => a >= 0 && a <= 1)).toBe(true);
    expect(new Set(alphas.map((a) => a.toFixed(2))).size).toBeGreaterThan(2); // really in between
  });

  it('caps catch-up steps per frame (no spiral of death)', () => {
    let count = 0;
    // One frame arrives 2 s late (a debugger pause, a slow phone).
    const { loop } = drive(() => count++, [17, 2017], { maxSteps: 5 });
    expect(count).toBe(1 + 5);
    expect(loop.droppedTime).toBeGreaterThan(1.8);
  });

  it('runs no updates while paused and forgets paused time on resume', () => {
    let count = 0;
    let now = 0;
    const loop = new FixedStepLoop({ update: () => count++, render: () => {}, now: () => now, requestFrame: () => 0, cancelFrame: () => {} });
    loop.start();
    loop.pause();
    for (let t = 16; t < 5000; t += 16) loop.tick((now = t));
    expect(count).toBe(0);
    now = 5000;
    loop.resume();
    loop.tick((now = 5016));
    expect(count).toBe(0); // 16 ms < one step: no catch-up burst
  });

  it('pauses when the page is hidden', () => {
    const doc = /** @type {any} */ (new EventTarget());
    doc.hidden = false;
    const loop = new FixedStepLoop({ update: () => {}, render: () => {}, now: () => 0, requestFrame: () => 0, cancelFrame: () => {} });
    loop.pauseWhenHidden(doc);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(loop.paused).toBe(true);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(loop.paused).toBe(false);
  });

  it('slow motion runs fewer updates per real second but the same dt', () => {
    let count = 0;
    const { loop } = drive(() => count++, [], {});
    loop.timeScale = 0.25;
    for (const t of at(60, 1)) loop.tick(t);
    expect(count).toBe(15);
  });
});

describe('frame-rate independence (the real game simulation)', () => {
  /**
   * Inputs on a timeline in seconds: run forward, attack three times, roll,
   * lock on. Held buttons are "down"; a press is "pressed" on the first
   * update at or after its time.
   */
  const SCRIPT = [
    { t: 0, move: { x: 0, y: 1 } },
    { t: 0.5, press: 'attack' },
    { t: 0.6, press: 'attack' },
    { t: 0.75, press: 'attack' },
    { t: 1.5, move: { x: 1, y: 0.4 }, press: 'roll' },
    { t: 2.0, move: { x: 0, y: 0 }, press: 'lockOn' },
    { t: 2.25, move: { x: -0.7, y: 0.7 }, press: 'attack' },
    { t: 3.0, move: { x: 0, y: -1 }, look: 0.05 },
  ];

  /**
   * Run the sandbox under a FixedStepLoop at a given frame pattern for
   * `ticks` updates and return its fingerprint.
   * @param {number[]} frames
   * @param {number} ticks
   */
  async function run(frames, ticks) {
    const sandbox = await Sandbox.create({ seed: 7 });
    const pending = SCRIPT.map((e) => ({ ...e }));
    let move = { x: 0, y: 0 };
    let look = 0;
    drive(() => {
      if (sandbox.tick >= ticks) return;
      const time = sandbox.tick / 60;
      /** @type {Record<string, { down: boolean, pressed: boolean, released: boolean }>} */
      const buttons = {};
      while (pending.length && pending[0].t <= time + 1e-9) {
        const e = /** @type {any} */ (pending.shift());
        if (e.move) move = e.move;
        if (e.look !== undefined) look = e.look;
        if (e.press) buttons[e.press] = { down: true, pressed: true, released: false };
      }
      sandbox.step({ move, look: { x: look, y: 0 }, buttons });
    }, frames);
    expect(sandbox.tick).toBe(ticks);
    const print = sandbox.fingerprint();
    sandbox.dispose();
    return print;
  }

  it('gives the same result at 30, 60 and 144 fps, and with uneven frames', async () => {
    const ticks = 240; // 4 simulated seconds
    const at60 = await run(at(60, 4.5), ticks);
    const at30 = await run(at(30, 4.5), ticks);
    const at144 = await run(at(144, 4.5), ticks);
    // Uneven frames: 7-40 ms apart, like a busy phone.
    const jitter = [];
    for (let t = 0, i = 0; t < 4600; i++) jitter.push((t += 7 + ((i * 37) % 34)));
    const atJitter = await run(jitter, ticks);
    expect(at30).toEqual(at60);
    expect(at144).toEqual(at60);
    expect(atJitter).toEqual(at60);
    // ...and the script really did something (the hero moved and fought).
    expect(Math.hypot(at60[4], at60[6] - 1.5)).toBeGreaterThan(3);
  });

  it('keeps running after a step throws', () => {
    let frames = 0;
    let count = 0;
    const loop = new FixedStepLoop({
      update: () => {
        if (++count === 2) throw new Error('boom');
      },
      render: () => {},
      now: () => 0,
      requestFrame: () => ++frames,
      cancelFrame: () => {},
    });
    loop.start();
    expect(() => loop.tick(1000 / 60)).not.toThrow();
    expect(() => loop.tick(2000 / 60)).toThrow('boom');
    loop.tick(3000 / 60);
    expect(count).toBe(4); // the next frame retries the failed step, then takes its own
    expect(frames).toBe(4); // start + one per tick, the throwing one included
  });
});
