/**
 * A small performance read-out: frames per second, frame time, draw calls,
 * triangles and the physics step time, refreshed four times a second.
 *
 * Frame time is the real time between animation frames (what the player
 * feels), averaged over the refresh period, with the worst frame shown too:
 * one 50 ms hitch matters more than a good average.
 *
 * Draw calls and triangles come from `renderer.info` (three.js counts them
 * per render); `autoReset` must stay on, which is three's default.
 */
export class PerfHud {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.el = document.createElement('pre');
    this.el.className = 'perf-hud';
    this.el.hidden = true;
    container.append(this.el);
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
    this.physicsMs = 0;
    this.physicsSamples = 0;
    /** Last values shown, also read by tests and the screenshot script. */
    this.stats = { fps: 0, frameMs: 0, worstMs: 0, calls: 0, triangles: 0, physicsMs: 0 };
  }

  /** @param {boolean} visible */
  setVisible(visible) {
    this.el.hidden = !visible;
  }

  /** @param {number} ms */
  addPhysicsSample(ms) {
    this.physicsMs += ms;
    this.physicsSamples++;
  }

  /**
   * @param {number} frameTime  seconds since the last frame
   * @param {{ render: { calls: number, triangles: number } }} info  renderer.info
   * @param {string} [extra]  more lines (renderer name, steps per frame)
   */
  frame(frameTime, info, extra = '') {
    this.frames++;
    this.time += frameTime;
    this.worst = Math.max(this.worst, frameTime);
    if (this.time < 0.25) return;
    this.stats = {
      fps: Math.round(this.frames / this.time),
      frameMs: (this.time / this.frames) * 1000,
      worstMs: this.worst * 1000,
      calls: info.render.calls,
      triangles: info.render.triangles,
      physicsMs: this.physicsSamples ? this.physicsMs / this.physicsSamples : 0,
    };
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
    this.physicsMs = 0;
    this.physicsSamples = 0;
    if (this.el.hidden) return;
    const s = this.stats;
    this.el.textContent =
      `${s.fps} fps   ${s.frameMs.toFixed(1)} ms (worst ${s.worstMs.toFixed(1)})\n` +
      `draw calls ${s.calls}   triangles ${s.triangles.toLocaleString('en')}\n` +
      `physics step ${s.physicsMs.toFixed(2)} ms` +
      (extra ? `\n${extra}` : '');
  }
}
