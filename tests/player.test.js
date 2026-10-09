import { describe, it, expect } from 'vitest';
import { StateMachine } from '../src/engine/index.js';
import { TRANSITIONS } from '../src/game/player/Player.js';
import { ATTACKS, totalFrames } from '../src/game/data/attacks.js';
import { PLAYER } from '../src/game/data/actors.js';
import { playerHarness } from './helpers/playerHarness.js';

describe('StateMachine', () => {
  it('only allows transitions in its table, and counts refusals', () => {
    const fsm = new StateMachine({ states: { a: {}, b: {}, c: {} }, transitions: { a: ['b'], b: ['c'], c: [] }, initial: 'a' });
    expect(fsm.go('c')).toBe(false);
    expect(fsm.refused).toBe(1);
    expect(fsm.go('b')).toBe(true);
    expect(fsm.current).toBe('b');
    expect(fsm.history.map((h) => h.to)).toEqual(['a', 'b']);
  });

  it('counts frames from 0 in each state', () => {
    const fsm = new StateMachine({ states: { a: {}, b: {} }, transitions: { a: ['b'], b: [] }, initial: 'a' });
    fsm.update(1 / 60);
    fsm.update(1 / 60);
    expect(fsm.frames).toBe(2);
    fsm.go('b');
    expect(fsm.frames).toBe(0);
  });
});

describe('player state machine', () => {
  it('has a transition table where every target is a real state, and dead is final', () => {
    const states = Object.keys(TRANSITIONS);
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) expect(states, `${from} → ${to}`).toContain(to);
    }
    expect(TRANSITIONS.dead).toEqual([]);
  });

  it('idle → run with the stick, run → idle when released', () => {
    const h = playerHarness({ accelTime: 0, decelTime: 0 });
    expect(h.step({ move: { x: 0, y: 1 } })).toBe('run');
    expect(h.player.velocity.z).toBeCloseTo(-PLAYER.runSpeed); // forward is -Z
    expect(h.step()).toBe('idle');
  });

  it('accelerates over the lab\'s acceleration time, or instantly at 0', () => {
    const eased = playerHarness({ accelTime: 0.2 });
    eased.step({ move: { x: 0, y: 1 } });
    const after1 = Math.abs(eased.player.velocity.z);
    expect(after1).toBeCloseTo(PLAYER.runSpeed / 12, 5); // 1/60 s of a 0.2 s ramp
    eased.steps(11, { move: { x: 0, y: 1 } });
    expect(Math.abs(eased.player.velocity.z)).toBeCloseTo(PLAYER.runSpeed, 5);
  });

  it('attack → combo when the press is buffered, within the window', () => {
    const h = playerHarness({ comboBuffer: 10 });
    h.step({ press: ['attack'] });
    expect(h.player.state).toBe('attack');
    expect(h.player.attackKey).toBe('slash1');
    // The attack's frame 0 runs on the next update. Press again early, at
    // frame 3: 10 frames before slash1 can chain (frame 13).
    h.steps(3);
    h.step({ press: ['attack'] });
    h.steps(ATTACKS.slash1.chainFrom - 3);
    expect(h.player.attackKey).toBe('slash2');
  });

  it('drops an early press with no buffer (the "Raw" feel)', () => {
    const h = playerHarness({ comboBuffer: 0 });
    h.step({ press: ['attack'] });
    h.steps(3);
    h.step({ press: ['attack'] }); // far too early, and not remembered
    h.steps(totalFrames(ATTACKS.slash1));
    expect(h.player.state).toBe('idle');
    expect(h.player.swingId).toBe(1);
  });

  it('chains with no buffer if the press lands inside the window', () => {
    const h = playerHarness({ comboBuffer: 0 });
    h.step({ press: ['attack'] });
    h.steps(ATTACKS.slash1.chainFrom); // now at frame chainFrom
    h.step({ press: ['attack'] });
    expect(h.player.attackKey).toBe('slash2');
  });

  it('the third hit ends the combo', () => {
    const h = playerHarness();
    h.step({ press: ['attack'] });
    for (let i = 0; i < 60; i++) h.step(i % 6 === 0 ? { press: ['attack'] } : {});
    expect(h.player.swingId).toBe(3);
    h.steps(40);
    expect(h.player.state).toBe('idle');
  });

  it('roll-cancels an attack only inside the cancel window', () => {
    const on = playerHarness({ cancelWindows: true, rollBuffer: 8 });
    on.step({ press: ['attack'] });
    on.steps(ATTACKS.slash1.rollCancelFrom); // frames 0..rollCancelFrom-1
    on.step({ press: ['roll'] }); // frame rollCancelFrom: the window is open
    expect(on.player.state).toBe('roll');

    const off = playerHarness({ cancelWindows: false, rollBuffer: 0 });
    off.step({ press: ['attack'] });
    off.steps(ATTACKS.slash1.rollCancelFrom);
    off.step({ press: ['roll'] });
    expect(off.player.state).toBe('attack'); // committed to the swing
  });

  it('a roll pressed slightly early is buffered (roll buffering)', () => {
    const buffered = playerHarness({ rollBuffer: 8, cancelWindows: true });
    buffered.step({ press: ['attack'] });
    buffered.steps(ATTACKS.slash1.rollCancelFrom - 5);
    buffered.step({ press: ['roll'] }); // 4 frames before the window opens
    buffered.steps(5);
    expect(buffered.player.state).toBe('roll');

    const strict = playerHarness({ rollBuffer: 0, cancelWindows: true });
    strict.step({ press: ['attack'] });
    strict.steps(ATTACKS.slash1.rollCancelFrom - 5);
    strict.step({ press: ['roll'] });
    strict.steps(5);
    expect(strict.player.state).toBe('attack');
  });

  it('is invulnerable for exactly the lab\'s roll i-frames', () => {
    const h = playerHarness({ rollIframes: 12 });
    h.step({ press: ['roll'] });
    const invulnerable = [];
    for (let f = 0; f < PLAYER.roll.frames; f++) {
      invulnerable.push(h.player.isInvulnerable());
      h.step();
    }
    const first = invulnerable.indexOf(true);
    expect(first).toBe(PLAYER.roll.iframesFrom);
    expect(invulnerable.filter(Boolean)).toHaveLength(12);

    const none = playerHarness({ rollIframes: 0 });
    none.step({ press: ['roll'] });
    for (let f = 0; f < PLAYER.roll.frames; f++) {
      expect(none.player.isInvulnerable()).toBe(false);
      none.step();
    }
  });

  it('coyote time: can still roll a few frames after leaving the ground', () => {
    const h = playerHarness({ coyoteFrames: 6, rollBuffer: 0 });
    h.body.grounded = false;
    h.body.airFrames = 4;
    h.step({ press: ['roll'] });
    expect(h.player.state).toBe('roll');

    const late = playerHarness({ coyoteFrames: 6, rollBuffer: 0 });
    late.body.grounded = false;
    late.body.airFrames = 7;
    late.step({ press: ['roll'] });
    expect(late.player.state).not.toBe('roll');

    const none = playerHarness({ coyoteFrames: 0, rollBuffer: 0 });
    none.body.grounded = false;
    none.body.airFrames = 1;
    none.step({ press: ['roll'] });
    expect(none.player.state).not.toBe('roll');
  });

  it('shield blocks from the front only', () => {
    const h = playerHarness();
    h.step({ hold: ['shield'] });
    expect(h.player.state).toBe('shield');
    // Facing is PI (towards -Z).
    expect(h.player.blocks({ x: 0, z: -3 })).toBe(true);
    expect(h.player.blocks({ x: 2, z: -2 })).toBe(true); // 45° off
    expect(h.player.blocks({ x: 0, z: 3 })).toBe(false); // behind
    expect(h.player.blocks({ x: 3, z: 0 })).toBe(false); // 90° to the side
    h.step();
    expect(h.player.state).toBe('idle'); // let go
    expect(h.player.blocks({ x: 0, z: -3 })).toBe(false);
  });

  it('hit-stun, knockdown and death', () => {
    const h = playerHarness();
    h.player.takeHit({ damage: 10, knockback: { x: 0, z: 1 }, hitstun: 12 });
    expect(h.player.state).toBe('hitstun');
    h.step({ press: ['attack'] }); // can't act while stunned
    expect(h.player.state).toBe('hitstun');
    h.steps(12);
    expect(['idle', 'attack']).toContain(h.player.state);

    const k = playerHarness();
    k.player.takeHit({ damage: 10, knockback: { x: 0, z: 0 }, hitstun: 10, knockdown: true });
    expect(k.player.state).toBe('knockdown');
    expect(k.player.isInvulnerable()).toBe(true);
    k.steps(PLAYER.knockdownFrames + 1);
    expect(k.player.state).toBe('idle');

    const d = playerHarness();
    d.player.takeHit({ damage: 500, knockback: { x: 0, z: 0 }, hitstun: 10 });
    expect(d.player.state).toBe('dead');
    expect(d.player.fsm.go('idle')).toBe(false);
  });
});
