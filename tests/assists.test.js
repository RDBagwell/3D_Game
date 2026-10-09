import { describe, it, expect } from 'vitest';
import { ControlAssists } from '../src/game/input/controlAssists.js';
import { sanitizeSettings } from '../src/game/settings.js';
import { Sandbox } from '../src/game/sim/Sandbox.js';

/**
 * Accessibility and difficulty: hold or toggle for the shield and lock-on,
 * auto lock-on, slower enemies and damage taken.
 */

const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
const b = (/** @type {string} */ name, down, pressed, released = false) => ({ ...idle, buttons: { [name]: { down, pressed, released } } });

describe('hold or toggle', () => {
  it('toggle shield: a press raises it and keeps it up, the next lowers it', () => {
    const a = new ControlAssists();
    const modes = { shieldMode: /** @type {const} */ ('toggle'), lockMode: /** @type {const} */ ('toggle') };
    expect(a.apply(b('shield', true, true), modes, false).buttons.shield.down).toBe(true);
    expect(a.apply(idle, modes, false).buttons.shield.down).toBe(true); // let go: still up
    expect(a.apply(b('shield', true, true), modes, false).buttons.shield.down).toBe(false);
    expect(a.apply(idle, modes, false).buttons.shield.down).toBe(false);
  });

  it('hold lock-on: locked while held, released when let go', () => {
    const a = new ControlAssists();
    const modes = { shieldMode: /** @type {const} */ ('hold'), lockMode: /** @type {const} */ ('hold') };
    expect(a.apply(b('lockOn', true, true), modes, false).buttons.lockOn.pressed).toBe(true); // lock on
    expect(a.apply(b('lockOn', true, false), modes, true).buttons.lockOn.pressed).toBe(false); // keep holding
    expect(a.apply(b('lockOn', false, false, true), modes, true).buttons.lockOn.pressed).toBe(true); // let go: release
  });

  it('the defaults pass input through untouched', () => {
    const frame = b('shield', true, true);
    expect(new ControlAssists().apply(frame, { shieldMode: 'hold', lockMode: 'toggle' }, false)).toBe(frame);
  });
});

describe('settings', () => {
  it('accept the new options and fall back on nonsense', () => {
    const s = sanitizeSettings({ quality: 'medium', damageTaken: 0.5, autoLock: true, slowEnemies: true, shieldMode: 'toggle', lockMode: 'hold', textSpeed: 'fast' });
    expect(s).toMatchObject({ quality: 'medium', damageTaken: 0.5, autoLock: true, slowEnemies: true, shieldMode: 'toggle', lockMode: 'hold', textSpeed: 'fast' });
    const bad = sanitizeSettings({ quality: 'ultra', damageTaken: 0, shieldMode: 'maybe' });
    expect(bad.damageTaken).toBe(1);
    expect(bad.shieldMode).toBe('hold');
    expect(['low', 'medium', 'high']).toContain(bad.quality);
  });
});

describe('assists in the fight', () => {
  it('auto lock-on grabs an enemy that comes for you, and lets you let go', async () => {
    const sb = await Sandbox.create();
    sb.autoLock = true;
    sb.player.body.teleport({ x: 0, y: 0, z: -22 });
    sb.player.facing = Math.PI;
    for (let i = 0; i < 60 && !sb.lockTarget; i++) sb.step(idle);
    expect(sb.lockTarget?.kind).toBe('grunt');
    sb.step(b('lockOn', true, true));
    expect(sb.lockTarget).toBe(null);
    for (let i = 0; i < 30; i++) sb.step(idle);
    expect(sb.lockTarget).toBe(null); // not straight back on
    sb.dispose();
  });

  it('slower enemies wind up for longer', async () => {
    const windupFrames = async (slow) => {
      const sb = await Sandbox.create({ area: 'halls', spawn: 'entrance', spawnEnemy: (s) => s.name === 'steps_a' });
      sb.setSlowEnemies(slow);
      const mite = sb.foes[0];
      sb.player.body.teleport({ x: mite.position.x, y: 0, z: mite.position.z + 1.2 });
      let frames = 0;
      for (let i = 0; i < 600; i++) {
        sb.step(idle);
        if (mite.state === 'windup') frames++;
        if (mite.state === 'attack') break;
      }
      sb.dispose();
      return frames;
    };
    const normal = await windupFrames(false);
    const slow = await windupFrames(true);
    expect(normal).toBeGreaterThan(10);
    expect(slow).toBeGreaterThan(normal * 1.25);
  });

  it('damage taken scales what reaches you', async () => {
    const sb = await Sandbox.create();
    sb.damageTaken = 0.5;
    const grunt = sb.grunts[0];
    sb.applyHit(grunt, grunt.attack, { target: sb.player, result: 'hit', point: { ...sb.player.position } });
    expect(sb.player.maxHp - sb.player.hp).toBe(Math.round(grunt.attack.damage * 0.5));
    sb.dispose();
  });
});
