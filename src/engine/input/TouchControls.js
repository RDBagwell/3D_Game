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
 * The stick and the camera drag listen to the game's own surface (the
 * canvas) and only to fingers and pens: there is no invisible layer over the
 * game, so on a laptop with a touchscreen the mouse keeps working (clicks
 * reach the canvas, pointer lock works) while the touchscreen drives the
 * stick. Only the buttons are real elements that take input.
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
   * @param {HTMLElement} container  where the buttons and the stick's picture go
   * @param {{ buttons: TouchButton[], surface: HTMLElement, stickRadius?: number, lookScale?: number }} options
   *        surface: the element fingers drag on (the canvas)
   */
  constructor(input, container, { buttons, surface, stickRadius = 56, lookScale = 1.6 }) {
    this.surface = surface;
    this.input = input;
    this.stickRadius = stickRadius;
    this.lookScale = lookScale;
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;

    // The stick's picture only: it takes no input itself.
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'touch-stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'touch-stick-knob';
    this.stickBase.append(this.stickKnob);
    this.root.append(this.stickBase);

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
    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onUp);
    container.append(this.root);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.pointers.clear();
    this.stickKnob.style.transform = '';
    this.stickBase.classList.remove('active');
    this.input.setVirtualMove(0, 0);
  }

  get visible() {
    return !this.root.hidden;
  }

  /** @param {PointerEvent} e */
  onDown(e) {
    // Fingers and pens only, and only while shown: the mouse belongs to the game.
    if (e.pointerType === 'mouse' || this.root.hidden) return;
    e.preventDefault();
    this.surface.setPointerCapture?.(e.pointerId);
    const rect = this.surface.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Left 45% of the screen, lower 65%: the stick. Anywhere else: the camera.
    if (x < rect.width * 0.45 && y > rect.height * 0.35 && ![...this.pointers.values()].some((p) => p.kind === 'stick')) {
      this.pointers.set(e.pointerId, { kind: 'stick', x: e.clientX, y: e.clientY });
      const box = this.root.getBoundingClientRect();
      this.stickBase.style.left = `${e.clientX - box.left}px`;
      this.stickBase.style.top = `${e.clientY - box.top}px`;
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
    this.surface.removeEventListener('pointerdown', this.onDown);
    this.surface.removeEventListener('pointermove', this.onMove);
    this.surface.removeEventListener('pointerup', this.onUp);
    this.surface.removeEventListener('pointercancel', this.onUp);
    this.root.remove();
  }
}

/**
 * True on devices whose main pointer is a finger (phones, tablets). A laptop
 * with a touchscreen has a mouse or touchpad as its main pointer, so this is
 * false there; the game switches to touch controls when a finger is actually
 * used (Game.listen).
 */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}
