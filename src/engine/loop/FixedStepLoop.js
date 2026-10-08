/**
 * A fixed-timestep game loop with interpolated rendering.
 *
 * Why fixed timestep? Simulation and physics (movement, attacks, frame data,
 * Rapier) always advance in equal slices of 1/60 s, whatever the display
 * does. A 30 Hz phone, a 60 Hz laptop and a 144 Hz monitor run exactly the
 * same simulation, frame data means the same thing everywhere ("7 frames of
 * startup" is always 7/60 s), and a bug that happens once happens every time.
 * `tests/fixedStepLoop.test.js` checks this with the real game.
 *
 * Once per browser animation frame:
 *
 *   1. Measure how much real time passed since the last frame.
 *   2. Add it to an accumulator and run update(step) as many times as fits.
 *   3. Render once, with `alpha` = leftover / step (0..1): how far we are
 *      between the last simulated state and the next. Things are drawn at
 *      previous + (current - previous) * alpha, so motion is smooth at any
 *      refresh rate even though the simulation moves in steps.
 *
 *   real time ──►|----frame----|----frame----|--frame--|
 *   updates    ──►|  u  |  u  |  u  |  u  |  u  |  u  |
 *                                          leftover ─┘ = alpha
 *
 * The spiral of death. If one update ever takes longer than a step (a slow
 * phone, a debugger pause), the next frame owes more updates, which take
 * longer still, and the game never catches up. So a frame runs at most
 * `maxSteps` updates; any time still owed after that is dropped (counted in
 * `droppedTime`) and the game slows down for a moment instead of freezing.
 *
 * Slow motion: `timeScale` (0..1) feeds less real time into the accumulator.
 * The step itself never changes, so slow motion shows exactly the same
 * frames, just more slowly; nothing about the simulation differs.
 *
 * Hidden tabs: `pauseWhenHidden(document)` stops updates while the tab is in
 * the background and forgets the time spent away, so coming back doesn't
 * fast-forward the fight.
 */
export class FixedStepLoop {
  /**
   * @param {object} options
   * @param {(dt: number) => void} options.update  Called with the fixed step, in seconds.
   * @param {(alpha: number, frameTime: number) => void} options.render  Once per animation frame.
   * @param {number} [options.step=1/60]  Seconds per update.
   * @param {number} [options.maxSteps=5]  Most updates per animation frame (spiral-of-death cap).
   * @param {() => number} [options.now]  Clock in milliseconds (injectable for tests).
   * @param {(cb: FrameRequestCallback) => number} [options.requestFrame]
   * @param {(id: number) => void} [options.cancelFrame]
   */
  constructor({
    update,
    render,
    step = 1 / 60,
    maxSteps = 5,
    now = () => performance.now(),
    requestFrame = (cb) => requestAnimationFrame(cb),
    cancelFrame = (id) => cancelAnimationFrame(id),
  }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxSteps = maxSteps;
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;

    this.running = false;
    this.paused = false;
    this.accumulator = 0;
    /** 1 = real time; 0.25 = quarter speed (the lab's slow motion). */
    this.timeScale = 1;
    /** Number of update() calls so far. */
    this.tickCount = 0;
    /** Updates run during the last animation frame (0 is normal at 144 Hz). */
    this.lastSteps = 0;
    /** Seconds of real time thrown away by the maxSteps cap. */
    this.droppedTime = 0;
    this.lastTime = 0;
    this.frameId = 0;
    this.tick = this.tick.bind(this);
    /** @type {(() => void) | null} */
    this.detachVisibility = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = this.now();
    this.frameId = this.requestFrame(this.tick);
  }

  stop() {
    this.running = false;
    this.cancelFrame(this.frameId);
    this.detachVisibility?.();
  }

  /** Stop running updates. Rendering continues so menus over the game still draw. */
  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    // Forget the time spent paused so the simulation doesn't "catch up" on it.
    this.lastTime = this.now();
    this.accumulator = 0;
  }

  /**
   * Pause while the page is hidden (another tab, a minimised window).
   * @param {Document} doc
   */
  pauseWhenHidden(doc) {
    const onChange = () => {
      if (doc.hidden) this.pause();
      else this.resume();
    };
    doc.addEventListener('visibilitychange', onChange);
    this.detachVisibility = () => doc.removeEventListener('visibilitychange', onChange);
  }

  /**
   * Runs one animation frame. Public so tests can drive the loop by hand.
   * @param {number} [timestamp]  milliseconds
   */
  tick(timestamp = this.now()) {
    if (!this.running) return;
    let frameTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    if (frameTime < 0) frameTime = 0;

    let steps = 0;
    if (!this.paused) {
      this.accumulator += frameTime * this.timeScale;
      // A tiny epsilon so 1/60 + 1/60 + 1/60 sums to exactly three steps at 20 Hz.
      while (this.accumulator >= this.step - 1e-9) {
        if (steps >= this.maxSteps) {
          // Spiral-of-death guard: drop whole steps we can't afford, keep the fraction.
          const owed = Math.floor(this.accumulator / this.step);
          this.droppedTime += owed * this.step;
          this.accumulator -= owed * this.step;
          break;
        }
        this.update(this.step);
        this.tickCount++;
        steps++;
        this.accumulator -= this.step;
      }
      if (this.accumulator < 0) this.accumulator = 0;
    }
    this.lastSteps = steps;
    this.render(this.paused ? 1 : Math.min(1, this.accumulator / this.step), frameTime);
    this.frameId = this.requestFrame(this.tick);
  }
}
