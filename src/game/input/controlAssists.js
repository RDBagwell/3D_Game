/**
 * Hold or toggle, for the shield and lock-on (Settings → Controls).
 *
 * The simulation only knows "shield is held" and "lock-on was pressed".
 * These turn the player's actual presses into that:
 *
 *   shield  hold    as pressed (the default)
 *           toggle  a press raises it and keeps it up; the next press lowers it
 *   lockOn  toggle  a press locks on, the next lets go (the default)
 *           hold    locked only while the button is held: letting go releases
 *
 * Pure: give it the InputFrame and whether a lock is active; it returns the
 * frame to simulate.
 */
export class ControlAssists {
  constructor() {
    this.shieldUp = false;
  }

  /**
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   * @param {{ shieldMode: 'hold' | 'toggle', lockMode: 'toggle' | 'hold' }} modes
   * @param {boolean} locked  a lock-on target is held right now
   * @returns {import('../../engine/input/Input.js').InputFrame}
   */
  apply(frame, modes, locked) {
    if (modes.shieldMode === 'hold' && modes.lockMode === 'toggle') return frame;
    const buttons = { ...frame.buttons };
    const get = (/** @type {string} */ a) => buttons[a] ?? { down: false, pressed: false, released: false };
    if (modes.shieldMode === 'toggle') {
      if (get('shield').pressed) this.shieldUp = !this.shieldUp;
      buttons.shield = { down: this.shieldUp, pressed: get('shield').pressed && this.shieldUp, released: get('shield').pressed && !this.shieldUp };
    } else {
      this.shieldUp = false;
    }
    if (modes.lockMode === 'hold') {
      const b = get('lockOn');
      // A press while locked must not unlock (hold means hold); letting go does.
      const press = b.pressed && !locked;
      const release = b.released && locked;
      buttons.lockOn = { down: b.down, pressed: press || release, released: b.released };
    }
    return { ...frame, buttons };
  }

  /** Forget toggles (a new area, a respawn). */
  reset() {
    this.shieldUp = false;
  }
}
