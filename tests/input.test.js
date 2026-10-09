import { describe, it, expect } from 'vitest';
import { Input, InputBuffer, radialDeadzone, button } from '../src/engine/index.js';

/** @param {EventTarget} target @param {string} type @param {string} code */
function key(target, type, code) {
  target.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, preventDefault() {} }));
}

describe('InputBuffer', () => {
  it('uses a press made within the window, once', () => {
    const b = new InputBuffer();
    b.update(10, ['attack']);
    b.update(14, []);
    expect(b.consume('attack', 6)).toBe(true);
    expect(b.consume('attack', 6)).toBe(false);
  });

  it('loses a press older than the window', () => {
    const b = new InputBuffer();
    b.update(10, ['attack']);
    b.update(17, []);
    expect(b.consume('attack', 6)).toBe(false);
    expect(b.presses[0].expired).toBe(true);
  });

  it('window 0 means "this update only"', () => {
    const b = new InputBuffer();
    b.update(5, ['roll']);
    expect(b.consume('roll', 0)).toBe(true);
    b.update(6, ['roll']);
    b.update(7, []);
    expect(b.consume('roll', 0)).toBe(false);
  });

  it('ignores presses before a given tick (a press that started an attack can\'t also chain it)', () => {
    const b = new InputBuffer();
    b.update(10, ['attack']);
    b.update(12, []);
    expect(b.consume('attack', 10, 11)).toBe(false);
  });
});

describe('Input', () => {
  it('maps keys to actions: pressed for exactly one update', () => {
    const target = new EventTarget();
    const input = new Input({ keyboardTarget: target, bindings: { attack: ['key:KeyJ'] }, getGamepads: () => [] });
    key(target, 'keydown', 'KeyJ');
    expect(button(input.sample(1 / 60), 'attack')).toEqual({ down: true, pressed: true, released: false });
    expect(button(input.sample(1 / 60), 'attack').pressed).toBe(false);
    key(target, 'keyup', 'KeyJ');
    expect(button(input.sample(1 / 60), 'attack').released).toBe(true);
  });

  it('a tap between two updates still counts as a press', () => {
    const target = new EventTarget();
    const input = new Input({ keyboardTarget: target, bindings: { roll: ['key:Space'] }, getGamepads: () => [] });
    key(target, 'keydown', 'Space');
    key(target, 'keyup', 'Space');
    expect(button(input.sample(1 / 60), 'roll').pressed).toBe(true);
  });

  it('remapped keys work and the old key stops working', () => {
    const target = new EventTarget();
    const input = new Input({ keyboardTarget: target, bindings: { attack: ['key:KeyJ'] }, getGamepads: () => [] });
    input.setBindings({ attack: ['key:KeyF'] });
    key(target, 'keydown', 'KeyJ');
    expect(button(input.sample(1 / 60), 'attack').down).toBe(false);
    key(target, 'keydown', 'KeyF');
    expect(button(input.sample(1 / 60), 'attack').pressed).toBe(true);
  });

  it('reads any standard-mapping gamepad: buttons, left stick, right stick', () => {
    const pad = {
      index: 0, connected: true, id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c)', mapping: 'standard',
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 2, value: i === 2 ? 1 : 0 })),
      axes: [0, -1, 0.5, 0],
    };
    const input = new Input({ keyboardTarget: new EventTarget(), bindings: { attack: ['btn:2'] }, getGamepads: () => [/** @type {any} */ (pad)] });
    const frame = input.sample(1 / 60);
    expect(button(frame, 'attack').pressed).toBe(true);
    expect(frame.move.y).toBeCloseTo(1); // stick up = forward
    expect(frame.look.x).toBeGreaterThan(0);
    expect(input.lastDevice).toBe('gamepad');
    expect(input.gamepadStyle).toBe('playstation');
  });

  it('WASD diagonals are normalised; camera inversion and sensitivity apply', () => {
    const target = new EventTarget();
    const input = new Input({
      keyboardTarget: target, getGamepads: () => [],
      bindings: { move_forward: ['key:KeyW'], move_right: ['key:KeyD'], look_up: ['key:ArrowUp'] },
    });
    key(target, 'keydown', 'KeyW');
    key(target, 'keydown', 'KeyD');
    key(target, 'keydown', 'ArrowUp');
    let f = input.sample(1 / 60);
    expect(Math.hypot(f.move.x, f.move.y)).toBeCloseTo(1);
    const up = f.look.y;
    expect(up).toBeGreaterThan(0);
    input.look.invertY = true;
    input.look.sensitivity = 2;
    f = input.sample(1 / 60);
    expect(f.look.y).toBeCloseTo(-up * 2);
  });

  it('touch controls drive actions and movement through the virtual inputs', () => {
    const input = new Input({ keyboardTarget: new EventTarget(), bindings: { attack: [] }, getGamepads: () => [] });
    input.setVirtual('attack', true);
    input.setVirtualMove(0.5, 0.5);
    const f = input.sample(1 / 60);
    expect(button(f, 'attack').pressed).toBe(true);
    expect(f.move).toEqual({ x: 0.5, y: 0.5 });
    expect(input.lastDevice).toBe('touch');
  });

  it('round dead zone: nothing inside it, a smooth ramp outside', () => {
    expect(radialDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
    const r = radialDeadzone(1, 0, 0.2);
    expect(r.x).toBeCloseTo(1);
    expect(radialDeadzone(0.6, 0, 0.2).x).toBeCloseTo(0.5);
  });
});
