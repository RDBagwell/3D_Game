/**
 * Action-based input for keyboard and mouse, gamepads and touch.
 *
 * Game code never asks "is J down?"; it asks "was `attack` pressed this
 * update?". A table of bindings maps each action to any number of physical
 * inputs, so keys can be remapped and every device works everywhere.
 *
 * Binding strings (the same format as Island RPG's, plus the mouse):
 *   'key:KeyJ'    keyboard, by KeyboardEvent.code (layout-independent)
 *   'mouse:0'     mouse button (0 left, 1 middle, 2 right)
 *   'btn:2'       gamepad button, standard mapping (0 = bottom face button)
 *   'axis:1-'     gamepad axis pushed negative past the dead zone
 *
 * Two analog values are separate from the actions:
 *   move   from the left stick, or the move_* actions (WASD), or the touch stick
 *   look   camera turn in radians this update: mouse movement (pointer
 *          locked), right stick, look_* actions (arrow keys), touch drag
 *
 * Gamepads: any pad whose `mapping` is "standard" works with the same
 * bindings (Xbox, PlayStation, Switch Pro, 8BitDo...). A non-standard pad
 * still works, with buttons wherever the browser puts them; `gamepadStandard`
 * tells the controls screen to say so.
 *
 * Call `sample(dt)` exactly once per fixed update. It returns an InputFrame:
 * plain data that the simulation reads. Tests build InputFrames by hand.
 */

/** @typedef {Record<string, string[]>} Bindings */

/**
 * @typedef {object} ButtonState
 * @property {boolean} down      held now
 * @property {boolean} pressed   went down this update
 * @property {boolean} released  went up this update
 */

/**
 * @typedef {object} InputFrame
 * @property {{ x: number, y: number }} move  -1..1, y = forward
 * @property {{ x: number, y: number }} look  radians this update (x = turn right, y = look up)
 * @property {Record<string, ButtonState>} buttons
 */

/** @typedef {'keyboard' | 'gamepad' | 'touch'} Device */

const UP = { down: false, pressed: false, released: false };

/**
 * An InputFrame with nothing pressed.
 * @returns {InputFrame}
 */
export function emptyFrame() {
  return { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
}

/**
 * @param {InputFrame} frame
 * @param {string} action
 * @returns {ButtonState}
 */
export function button(frame, action) {
  return frame.buttons[action] ?? UP;
}

export class Input {
  /**
   * @param {object} [options]
   * @param {Bindings} [options.bindings]
   * @param {EventTarget} [options.keyboardTarget]  default: window
   * @param {HTMLElement | null} [options.pointerElement]  element for mouse buttons and pointer lock
   * @param {() => ArrayLike<Gamepad | null>} [options.getGamepads]
   * @param {number} [options.stickDeadzone=0.18]
   */
  constructor(options = {}) {
    /** @type {Bindings} */
    this.bindings = {};
    this.stickDeadzone = options.stickDeadzone ?? 0.18;
    this.getGamepads =
      options.getGamepads ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));
    /** Camera settings, set by the game. */
    this.look = {
      /** 0.25..3, 1 = default */
      sensitivity: 1,
      invertX: false,
      invertY: false,
      /** radians per pixel of mouse movement at sensitivity 1 */
      mouseScale: 0.0024,
      /** radians per second for a full stick or key at sensitivity 1 */
      stickSpeed: 3.2,
    };

    this.keysDown = new Set();
    /** Keys pressed since the last sample, so very quick taps aren't lost. */
    this.keysTapped = new Set();
    /** Key codes pressed during the last sample (for "press a key" screens). */
    this.keysJustPressed = new Set();
    this.mouseDown = new Set();
    this.mouseTapped = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    /** @type {Map<string, boolean>} */
    this.virtual = new Map();
    this.virtualTapped = new Set();
    this.virtualMove = { x: 0, y: 0 };
    this.virtualLook = { x: 0, y: 0 };

    /** @type {Map<string, boolean>} */
    this.previous = new Map();
    /** @type {Device} */
    this.lastDevice = 'keyboard';
    /** 'xbox' | 'playstation' | 'nintendo' | 'generic', from the pad's id. */
    this.gamepadStyle = 'xbox';
    this.gamepadStandard = true;
    /** @type {Gamepad | null} */
    this.activePad = null;
    this.hasInteracted = false;
    /** When false, key events are ignored (a text field has focus, a menu is rebinding). */
    this.enabled = true;

    for (const [action, list] of Object.entries(options.bindings ?? {})) this.bind(action, list);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onContextMenu = (/** @type {Event} */ e) => e.preventDefault();

    this.keyboardTarget = options.keyboardTarget ?? (typeof window !== 'undefined' ? window : null);
    this.pointerElement = options.pointerElement ?? null;
    this.keyboardTarget?.addEventListener('keydown', this.onKeyDown);
    this.keyboardTarget?.addEventListener('keyup', this.onKeyUp);
    this.keyboardTarget?.addEventListener('blur', this.onBlur);
    if (this.pointerElement) {
      this.pointerElement.addEventListener('mousedown', this.onMouseDown);
      this.pointerElement.addEventListener('contextmenu', this.onContextMenu);
      this.keyboardTarget?.addEventListener('mouseup', this.onMouseUp);
      this.keyboardTarget?.addEventListener('mousemove', this.onMouseMove);
    }
  }

  /**
   * @param {string} action
   * @param {string[]} list
   */
  bind(action, list) {
    this.bindings[action] = [...list];
  }

  /** @param {Bindings} bindings */
  setBindings(bindings) {
    this.bindings = {};
    for (const [action, list] of Object.entries(bindings)) this.bind(action, list);
  }

  /** @returns {Bindings} */
  getBindings() {
    return Object.fromEntries(Object.entries(this.bindings).map(([a, l]) => [a, [...l]]));
  }

  /**
   * Set an action from touch controls (or any other source).
   * @param {string} action
   * @param {boolean} down
   */
  setVirtual(action, down) {
    if (down && !this.virtual.get(action)) this.virtualTapped.add(action);
    this.virtual.set(action, down);
    if (down) this.markDevice('touch');
  }

  /**
   * @param {number} x  -1..1
   * @param {number} y  -1..1, up = forward
   */
  setVirtualMove(x, y) {
    this.virtualMove.x = x;
    this.virtualMove.y = y;
    if (x || y) this.markDevice('touch');
  }

  /**
   * Add a touch-drag camera movement, in pixels.
   * @param {number} dx
   * @param {number} dy
   */
  addVirtualLook(dx, dy) {
    this.virtualLook.x += dx;
    this.virtualLook.y += dy;
    this.markDevice('touch');
  }

  /** True while the mouse is captured for camera control. */
  get pointerLocked() {
    return typeof document !== 'undefined' && !!this.pointerElement && document.pointerLockElement === this.pointerElement;
  }

  requestPointerLock() {
    if (!this.pointerElement || this.pointerLocked) return;
    try {
      const result = /** @type {any} */ (this.pointerElement.requestPointerLock());
      // Newer browsers return a promise that rejects if the user hasn't interacted yet.
      result?.catch?.(() => {});
    } catch {
      // Not allowed right now: mouse look waits for the next click.
    }
  }

  exitPointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  /**
   * Read every device and return this update's InputFrame.
   * @param {number} dt  seconds (for stick and key camera turning)
   * @returns {InputFrame}
   */
  sample(dt) {
    const pad = this.readGamepad();
    /** @type {Record<string, ButtonState>} */
    const buttons = {};
    for (const action of Object.keys(this.bindings)) {
      const down = this.isBound(action, pad, false) || this.virtual.get(action) === true;
      const tapped = this.isBound(action, pad, true) || this.virtualTapped.has(action);
      const was = this.previous.get(action) ?? false;
      const pressed = (down && !was) || (tapped && !was);
      buttons[action] = { down: down || pressed, pressed, released: was && !down };
      this.previous.set(action, down);
    }

    // Movement: keys, then the stick and the touch stick if they're pushed further.
    let mx = axisFromButtons(buttons, 'move_left', 'move_right');
    let my = axisFromButtons(buttons, 'move_back', 'move_forward');
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (pad) {
      const stick = radialDeadzone(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0), this.stickDeadzone);
      if (Math.hypot(stick.x, stick.y) > Math.hypot(mx, my)) [mx, my] = [stick.x, stick.y];
    }
    if (Math.hypot(this.virtualMove.x, this.virtualMove.y) > Math.hypot(mx, my)) [mx, my] = [this.virtualMove.x, this.virtualMove.y];

    // Camera: mouse and touch in pixels; stick and keys as a turning speed.
    const s = this.look.sensitivity;
    let lx = (this.mouseDelta.x + this.virtualLook.x) * this.look.mouseScale * s;
    let ly = -(this.mouseDelta.y + this.virtualLook.y) * this.look.mouseScale * s;
    let rate = { x: axisFromButtons(buttons, 'look_left', 'look_right'), y: axisFromButtons(buttons, 'look_down', 'look_up') };
    if (pad) {
      const stick = radialDeadzone(pad.axes[2] ?? 0, -(pad.axes[3] ?? 0), this.stickDeadzone);
      if (Math.abs(stick.x) > Math.abs(rate.x)) rate.x = stick.x;
      if (Math.abs(stick.y) > Math.abs(rate.y)) rate.y = stick.y;
    }
    lx += rate.x * this.look.stickSpeed * s * dt;
    ly += rate.y * this.look.stickSpeed * 0.6 * s * dt;
    if (this.look.invertX) lx = -lx;
    if (this.look.invertY) ly = -ly;

    this.keysJustPressed = new Set(this.keysTapped);
    this.keysTapped.clear();
    this.mouseTapped.clear();
    this.virtualTapped.clear();
    this.mouseDelta.x = this.mouseDelta.y = 0;
    this.virtualLook.x = this.virtualLook.y = 0;
    return { move: { x: mx, y: my }, look: { x: lx, y: ly }, buttons };
  }

  /**
   * @private
   * @param {string} action
   * @param {Gamepad | null} pad
   * @param {boolean} tapsOnly  check only presses since the last sample
   */
  isBound(action, pad, tapsOnly) {
    for (const binding of this.bindings[action] ?? []) {
      const [type, code] = binding.split(':');
      if (type === 'key') {
        if (tapsOnly ? this.keysTapped.has(code) : this.keysDown.has(code)) return true;
      } else if (type === 'mouse') {
        if (tapsOnly ? this.mouseTapped.has(Number(code)) : this.mouseDown.has(Number(code))) return true;
      } else if (!tapsOnly && pad && type === 'btn') {
        if (pad.buttons[Number(code)]?.pressed) return true;
      } else if (!tapsOnly && pad && type === 'axis') {
        const value = pad.axes[Number(code.slice(0, -1))] ?? 0;
        if (code.endsWith('-') ? value < -0.5 : value > 0.5) return true;
      }
    }
    return false;
  }

  /**
   * The gamepad to read: the last one that did anything.
   * @private
   * @returns {Gamepad | null}
   */
  readGamepad() {
    let pads;
    try {
      pads = this.getGamepads();
    } catch {
      return null;
    }
    let chosen = null;
    for (const pad of Array.from(pads ?? [])) {
      if (!pad || !pad.connected) continue;
      const active = pad.buttons.some((b) => b.pressed) || pad.axes.some((a) => Math.abs(a) > 0.4);
      if (active) {
        if (this.activePad?.index !== pad.index) this.identifyPad(pad);
        this.activePad = pad;
        this.markDevice('gamepad');
      }
      if (this.activePad && pad.index === this.activePad.index) chosen = pad;
    }
    return chosen;
  }

  /**
   * @private
   * @param {Gamepad} pad
   */
  identifyPad(pad) {
    const id = pad.id.toLowerCase();
    this.gamepadStandard = pad.mapping === 'standard';
    if (/playstation|dualshock|dualsense|054c/.test(id)) this.gamepadStyle = 'playstation';
    else if (/nintendo|switch|057e|joy-con|pro controller/.test(id)) this.gamepadStyle = 'nintendo';
    else if (/xbox|xinput|045e/.test(id)) this.gamepadStyle = 'xbox';
    else this.gamepadStyle = 'generic';
  }

  /**
   * Rumble the active gamepad, where the browser supports it.
   * @param {number} strong  0..1
   * @param {number} weak  0..1
   * @param {number} ms
   */
  rumble(strong, weak, ms) {
    const actuator = /** @type {any} */ (this.activePad)?.vibrationActuator;
    actuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
  }

  /**
   * @private
   * @param {Device} device
   */
  markDevice(device) {
    this.lastDevice = device;
    this.hasInteracted = true;
  }

  /** @param {KeyboardEvent} e */
  onKeyDown(e) {
    if (!this.enabled) return;
    const target = /** @type {HTMLElement | null} */ (e.target);
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (this.isGameKey(e.code)) e.preventDefault();
    if (!e.repeat) {
      this.keysDown.add(e.code);
      this.keysTapped.add(e.code);
    }
    this.markDevice('keyboard');
  }

  /** @param {KeyboardEvent} e */
  onKeyUp(e) {
    this.keysDown.delete(e.code);
  }

  /** Forget held keys when the window loses focus, so nothing gets stuck down. */
  onBlur() {
    this.keysDown.clear();
    this.mouseDown.clear();
  }

  /** @param {MouseEvent} e */
  onMouseDown(e) {
    this.mouseDown.add(e.button);
    this.mouseTapped.add(e.button);
    this.markDevice('keyboard');
  }

  /** @param {MouseEvent} e */
  onMouseUp(e) {
    this.mouseDown.delete(e.button);
  }

  /** @param {MouseEvent} e */
  onMouseMove(e) {
    if (!this.pointerLocked) return;
    this.mouseDelta.x += e.movementX;
    this.mouseDelta.y += e.movementY;
    this.markDevice('keyboard');
  }

  /**
   * Keys the game uses: the page shouldn't scroll or move focus on them.
   * @param {string} code
   */
  isGameKey(code) {
    return Object.values(this.bindings).some((list) => list.includes(`key:${code}`));
  }

  destroy() {
    this.keyboardTarget?.removeEventListener('keydown', this.onKeyDown);
    this.keyboardTarget?.removeEventListener('keyup', this.onKeyUp);
    this.keyboardTarget?.removeEventListener('blur', this.onBlur);
    this.keyboardTarget?.removeEventListener('mouseup', this.onMouseUp);
    this.keyboardTarget?.removeEventListener('mousemove', this.onMouseMove);
    this.pointerElement?.removeEventListener('mousedown', this.onMouseDown);
    this.pointerElement?.removeEventListener('contextmenu', this.onContextMenu);
  }
}

/**
 * @param {Record<string, ButtonState>} buttons
 * @param {string} negative
 * @param {string} positive
 */
function axisFromButtons(buttons, negative, positive) {
  return (buttons[positive]?.down ? 1 : 0) - (buttons[negative]?.down ? 1 : 0);
}

/**
 * A round dead zone, rescaled so movement starts smoothly from zero at its
 * edge (a square per-axis dead zone makes diagonals sticky).
 * @param {number} x
 * @param {number} y
 * @param {number} deadzone
 */
export function radialDeadzone(x, y, deadzone) {
  const len = Math.hypot(x, y);
  if (len < deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}
