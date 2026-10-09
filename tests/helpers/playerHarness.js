import { InputBuffer } from '../../src/engine/index.js';
import { Player } from '../../src/game/player/Player.js';
import { defaultFeel } from '../../src/game/feel/feelSettings.js';

/**
 * A Player on a fake body (flat ground, no physics), with helpers to feed it
 * input one update at a time. The camera looks along -Z, like the game's start.
 * @param {Partial<import('../../src/game/feel/feelSettings.js').FeelValues>} [feel]
 */
export function playerHarness(feel = {}) {
  const body = {
    position: { x: 0, y: 0, z: 0 },
    grounded: true,
    airFrames: 0,
    /** @param {number} dx @param {number} dz */
    move(dx, dz) {
      this.position.x += dx;
      this.position.z += dz;
    },
  };
  const player = new Player(body, { yaw: Math.PI });
  const buffer = new InputBuffer();
  const values = { ...defaultFeel(), ...feel };
  /** @type {any[]} */
  const events = [];
  let tick = 0;
  let lockTarget = null;

  /**
   * One update.
   * @param {{ move?: { x: number, y: number }, press?: string[], hold?: string[] }} [input]
   */
  const step = (input = {}) => {
    tick++;
    const press = input.press ?? [];
    buffer.update(tick, press.filter((a) => a === 'attack' || a === 'roll'));
    /** @type {Record<string, any>} */
    const buttons = {};
    for (const a of input.hold ?? []) buttons[a] = { down: true, pressed: false, released: false };
    for (const a of press) buttons[a] = { down: true, pressed: true, released: false };
    player.update(
      { move: input.move ?? { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons },
      {
        tick,
        dt: 1 / 60,
        buffer,
        axes: { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } },
        feel: values,
        lockTarget,
        enemies: [],
        emit: (name, data) => events.push({ name, data, tick }),
      },
    );
    return player.state;
  };

  /**
   * @param {number} n
   * @param {Parameters<typeof step>[0]} [input]
   */
  const steps = (n, input) => {
    for (let i = 0; i < n; i++) step(input);
    return player.state;
  };

  return {
    player, body, buffer, events, step, steps, feel: values,
    get tick() { return tick; },
    /** @param {any} target */
    setLock(target) { lockTarget = target; },
  };
}
