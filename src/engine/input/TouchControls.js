/**
 * On-screen controls for phones and tablets: a floating virtual stick on the
 * left, camera drag on the right, and buttons sized for thumbs.
 *
 *   const touch = new TouchControls(input, container, {
 *     buttons: [{ action: 'attack', label: 'Attack', className: 'touch-attack' }, ...],
 *   });
 *   touch.show(); // .hide(), .destroy()
 *
 * The stick appears where the left thumb lands (a "floating" stick), so it
 * never needs to be found by feel. Dragging anywhere else on the right half
 * turns the camera. Several fingers work at once. It drives the Input through
 * setVirtual / setVirtualMove / addVirtualLook, so everything that reads
 * actions works on a phone unchanged.
 *
 * It only builds DOM elements (.touch-controls, .touch-stick, .touch-button);
 * the page's CSS decides how they look.
 */

/**
 * @typedef {object} TouchButton
 * @property {string} action
 * @property {string} label
 * @property {string} [className]
 * @property {boolean} [toggle]  tap to switch on and off instead of hold
 */

export class TouchControls {
  /**
   * @param {import('./Input.js').Input} input
   * @param {HTMLElement} container
   * @param {{ buttons: TouchButton[], stickRadius?: number, lookScale?: number }} options
   */
  constructor(input, container, { buttons, stickRadius = 56, lookScale = 1.6 }) {
    this.input = input;
    this.stickRadius = stickRadius;
    this.lookScale = lookScale;
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;

    this.lookZone = document.createElement('div');
    this.lookZone.className = 'touch-look-zone';
    this.stickZone = document.createElement('div');
    this.stickZone.className = 'touch-stick-zone';
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-stick-knob';
    this.stickBase.append(this.stickKnob);
    this.stickZone.append(this.stickBase);
    this.root.append(this.lookZone, this.stickZone);

    /** @type {Map<number, { kind: 'stick' | 'look', x: number, y: number }>} */
    this.pointers = new Map();

    for (const def of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `touch-button ${def.className ?? ''}`;
      el.textContent = def.label;
      el.setAttribute('aria-label', def.label);
      let on = false;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture?.(e.pointerId);
        if (def.toggle) {
          on = !on;
          el.classList.toggle('on', on);
          input.setVirtual(def.action, on);
        } else {
          el.classList.add('on');
          input.setVirtual(def.action, true);
        }
      });
      const release = (/** @type {PointerEvent} */ e) => {
        e.preventDefault();
        if (def.toggle) return;
        el.classList.remove('on');
        input.setVirtual(def.action, false);
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      this.root.append(el);
    }

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    for (const zone of [this.stickZone, this.lookZone]) {
      zone.addEventListener('pointerdown', this.onDown);
      zone.addEventListener('pointermove', this.onMove);
      zone.addEventListener('pointerup', this.onUp);
      zone.addEventListener('pointercancel', this.onUp);
    }
    container.append(this.root);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.input.setVirtualMove(0, 0);
  }

  get visible() {
    return !this.root.hidden;
  }

  /** @param {PointerEvent} e */
  onDown(e) {
    e.preventDefault();
    const zone = /** @type {HTMLElement} */ (e.currentTarget);
    zone.setPointerCapture?.(e.pointerId);
    if (zone === this.stickZone) {
      this.pointers.set(e.pointerId, { kind: 'stick', x: e.clientX, y: e.clientY });
      const rect = this.stickZone.getBoundingClientRect();
      this.stickBase.style.left = `${e.clientX - rect.left}px`;
      this.stickBase.style.top = `${e.clientY - rect.top}px`;
      this.stickBase.classList.add('active');
    } else {
      this.pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  }

  /** @param {PointerEvent} e */
  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'stick') {
      let dx = e.clientX - p.x;
      let dy = e.clientY - p.y;
      const len = Math.hypot(dx, dy);
      if (len > this.stickRadius) {
        dx = (dx / len) * this.stickRadius;
        dy = (dy / len) * this.stickRadius;
      }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(1, len / this.stickRadius);
      const dead = 0.12;
      const scaled = mag < dead ? 0 : (mag - dead) / (1 - dead);
      this.input.setVirtualMove(len ? (dx / Math.max(len, 1e-6)) * scaled : 0, len ? (-dy / Math.max(len, 1e-6)) * scaled : 0);
    } else {
      this.input.addVirtualLook((e.clientX - p.x) * this.lookScale, (e.clientY - p.y) * this.lookScale);
      p.x = e.clientX;
      p.y = e.clientY;
    }
  }

  /** @param {PointerEvent} e */
  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'stick') {
      this.stickKnob.style.transform = '';
      this.stickBase.classList.remove('active');
      this.input.setVirtualMove(0, 0);
    }
  }

  destroy() {
    this.root.remove();
  }
}

/** True on devices whose main pointer is a finger. */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
}
