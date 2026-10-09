import { describe, it, expect } from 'vitest';
import { selectTarget, switchTarget, shouldBreakLock, LOCK } from '../src/game/combat/lockOn.js';

const t = (id, x, z, alive = true) => ({ id, position: { x, y: 0, z }, alive });
const forward = { x: 0, z: -1 }; // the camera looks along -Z
const right = { x: 1, z: 0 };
const me = { x: 0, z: 0 };

describe('lock-on target selection', () => {
  it('prefers what is in front of the camera over what is merely closer', () => {
    const ahead = t('ahead', 0, -8);
    const edge = t('edge', 3, -1.5); // closer, but far off-centre
    expect(selectTarget([edge, ahead], me, forward)?.id).toBe('ahead');
  });

  it('among targets straight ahead, picks the nearer', () => {
    expect(selectTarget([t('far', 0, -10), t('near', 0, -3)], me, forward)?.id).toBe('near');
  });

  it('ignores the dead, the distant and what is behind', () => {
    expect(selectTarget([t('dead', 0, -3, false)], me, forward)).toBeNull();
    expect(selectTarget([t('far', 0, -(LOCK.maxDistance + 1))], me, forward)).toBeNull();
    expect(selectTarget([t('behind', 0, 4)], me, forward)).toBeNull();
  });

  it('switches to the next target on the side the stick is flicked', () => {
    const left = t('left', -3, -5);
    const mid = t('mid', 0, -5);
    const r1 = t('right1', 2, -5);
    const r2 = t('right2', 5, -5);
    const all = [left, mid, r1, r2];
    expect(switchTarget(mid, all, me, right, 1).id).toBe('right1');
    expect(switchTarget(mid, all, me, right, -1).id).toBe('left');
    expect(switchTarget(r2, all, me, right, 1).id).toBe('right2'); // nothing further right: stay
    expect(switchTarget(mid, [mid, t('deadR', 2, -5, false)], me, right, 1).id).toBe('mid');
  });

  it('breaks the lock when the target dies or gets too far away', () => {
    expect(shouldBreakLock(t('a', 0, -5), me)).toBe(false);
    expect(shouldBreakLock(t('a', 0, -5, false), me)).toBe(true);
    expect(shouldBreakLock(t('a', 0, -(LOCK.breakDistance + 0.5)), me)).toBe(true);
  });

  it('skips targets it cannot see (behind a wall)', () => {
    const near = t('near', 0, -3);
    const far = t('far', 0, -8);
    const hidden = (/** @type {any} */ c) => c.id !== 'near';
    expect(selectTarget([near, far], me, forward, {}, hidden)?.id).toBe('far');
    expect(switchTarget(far, [far, t('r', 2, -8), near], me, right, 1, {}, (c) => c.id !== 'r').id).toBe('far');
  });
});

describe('lock-on in the world', () => {
  it('does not lock onto an enemy behind the closed portcullis', async () => {
    const { Adventure } = await import('../src/game/adventure/Adventure.js');
    const { GameState } = await import('../src/game/adventure/GameState.js');
    const adv = new Adventure(GameState.newGame());
    adv.state.flags.add('gate_open');
    await adv.enter('halls', 'start');
    const sb = adv.sandbox;
    for (const f of sb.foes) if (!f.spawnName?.startsWith('vault')) f.hp = 0; // only the Key Vault's, behind the gate
    sb.player.body.teleport({ x: 0, y: 0.2, z: -26 });
    sb.player.facing = Math.PI; // facing the gate (-Z)
    sb.camera.reset(sb.player.position, Math.PI);
    const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
    for (let i = 0; i < 3; i++) adv.step(idle, 1 / 60);
    adv.step({ ...idle, buttons: { lockOn: { down: true, pressed: true, released: false } } }, 1 / 60);
    expect(sb.lockTarget).toBe(null);
    adv.dispose();
  });

  it('when the locked target falls, the lock moves to the next enemy in sight', async () => {
    const { Sandbox } = await import('../src/game/sim/Sandbox.js');
    const { ATTACKS } = await import('../src/game/data/attacks.js');
    const sb = await Sandbox.create({ grunts: false });
    sb.player.body.teleport({ x: 0, y: 0, z: 0 });
    const a = sb.spawnFoe('grunt', 'a', { x: 0, y: 0, z: -4 }, 0);
    const b = sb.spawnFoe('grunt', 'b', { x: 2, y: 0, z: -5 }, 0);
    const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
    sb.step(idle);
    sb.setLock(a);
    sb.applyHit(sb.player, { ...ATTACKS.slash1, damage: 9999 }, { target: a, result: 'hit', point: { ...a.position } });
    expect(a.alive).toBe(false);
    expect(sb.lockTarget).toBe(b);
    sb.dispose();
  });
});
