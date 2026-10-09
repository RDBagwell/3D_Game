/**
 * Publish/subscribe. The simulation emits events ("hit", "footstep",
 * "block"); presentation (sound, particles, camera shake, HUD) listens. The
 * simulation never calls the renderer or the audio directly, which keeps it
 * runnable in Node for tests.
 *
 *   const off = events.on('hit', (hit) => ...);
 *   events.emit('hit', { damage: 10 });
 *   off();
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<(...args: any[]) => void>>} */
    this.listeners = new Map();
  }

  /**
   * @param {string} name
   * @param {(...args: any[]) => void} fn
   * @returns {() => void} unsubscribe
   */
  on(name, fn) {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * @param {string} name
   * @param {...any} args
   */
  emit(name, ...args) {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }

  clear() {
    this.listeners.clear();
  }
}
