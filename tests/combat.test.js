import { describe, it, expect } from 'vitest';
import { ATTACKS, totalFrames, PLAYER_COMBO } from '../src/game/data/attacks.js';
import { attackPhase, hitboxAt, sphereHitsCapsule, isInFront, resolveSwing } from '../src/game/combat/hitboxes.js';
import { Sandbox } from '../src/game/sim/Sandbox.js';
import { defaultFeel } from '../src/game/feel/feelSettings.js';
import { PLAYER } from '../src/game/data/actors.js';

const hold = (/** @type {string} */ b) => ({ move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: { [b]: { down: true, pressed: true, released: false } } });

/** A combatant standing at (x, z), facing yaw. */
function body(id, team, x, z, facing = 0, extra = {}) {
  return { id, team, position: { x, y: 0, z }, facing, radius: 0.4, height: 1.7, alive: true, isInvulnerable: () => false, blocks: () => false, ...extra };
}

describe('attack frame data', () => {
  it('every attack is well formed', () => {
    for (const [key, a] of Object.entries(ATTACKS)) {
      expect(a.startup, key).toBeGreaterThan(0);
      expect(a.active, key).toBeGreaterThan(0);
      expect(a.recovery, key).toBeGreaterThan(0);
      expect(a.damage, key).toBeGreaterThan(0);
      if (a.next) {
        expect(ATTACKS[a.next], `${key}.next`).toBeDefined();
        expect(a.chainFrom, key).toBeGreaterThanOrEqual(a.startup + a.active); // can't chain before it has hit
        expect(a.chainFrom, key).toBeLessThan(totalFrames(a));
      }
    }
    expect(PLAYER_COMBO.every((k) => ATTACKS[k])).toBe(true);
  });

  it("the hero's swings each have a measured impact point, so the blade lands with the hit", () => {
    for (const key of PLAYER_COMBO) {
      const a = ATTACKS[/** @type {keyof typeof ATTACKS} */ (key)];
      expect(a.animImpact, key).toBeGreaterThan(0);
      expect(a.animImpact, key).toBeLessThan(1);
    }
  });

  it('phases follow startup, active and recovery frames', () => {
    const a = ATTACKS.slash1;
    expect(attackPhase(a, 0)).toBe('startup');
    expect(attackPhase(a, a.startup - 1)).toBe('startup');
    expect(attackPhase(a, a.startup)).toBe('active');
    expect(attackPhase(a, a.startup + a.active - 1)).toBe('active');
    expect(attackPhase(a, a.startup + a.active)).toBe('recovery');
    expect(attackPhase(a, totalFrames(a))).toBe('done');
  });

  it('the hitbox exists only during active frames', () => {
    const a = ATTACKS.slash1;
    for (let f = 0; f < totalFrames(a) + 2; f++) {
      const active = f >= a.startup && f < a.startup + a.active;
      expect(hitboxAt(a, f, { x: 0, y: 0, z: 0 }, 0) !== null, `frame ${f}`).toBe(active);
    }
  });

  it('the hitbox is in front of the attacker, sweeping its arc', () => {
    const a = ATTACKS.slash1;
    const first = /** @type {any} */ (hitboxAt(a, a.startup, { x: 0, y: 0, z: 0 }, 0));
    const last = /** @type {any} */ (hitboxAt(a, a.startup + a.active - 1, { x: 0, y: 0, z: 0 }, 0));
    expect(first.z).toBeGreaterThan(0); // facing 0 = +Z
    expect(last.z).toBeGreaterThan(0);
    expect(Math.sign(first.x)).not.toBe(Math.sign(last.x)); // swept from one side to the other
  });

  it('sphere against capsule', () => {
    expect(sphereHitsCapsule({ x: 0, y: 0, z: 0 }, 0.4, 1.7, { x: 0.8, y: 1, z: 0, r: 0.5 })).toBe(true);
    expect(sphereHitsCapsule({ x: 0, y: 0, z: 0 }, 0.4, 1.7, { x: 1.0, y: 1, z: 0, r: 0.5 })).toBe(false);
    expect(sphereHitsCapsule({ x: 0, y: 0, z: 0 }, 0.4, 1.7, { x: 0, y: 2.5, z: 0, r: 0.3 })).toBe(false); // over its head
  });

  it('a swing hits only during active frames, and each target once', () => {
    const a = ATTACKS.slash1;
    const attacker = body('p', 'player', 0, 0, 0);
    const target = body('e', 'enemy', 0, 1.1);
    const hits = new Set();
    let count = 0;
    for (let f = 0; f < totalFrames(a); f++) {
      const r = resolveSwing(attacker, a, f, [target], hits);
      if (r.length) expect(attackPhase(a, f)).toBe('active');
      count += r.length;
    }
    expect(count).toBe(1);
  });

  it('never hits teammates, the dead, or itself', () => {
    const a = ATTACKS.slash1;
    const attacker = body('p', 'player', 0, 0, 0);
    const friend = body('f', 'player', 0, 1);
    const corpse = body('c', 'enemy', 0, 1, 0, { alive: false });
    expect(resolveSwing(attacker, a, a.startup, [attacker, friend, corpse], new Set())).toEqual([]);
  });

  it('invulnerability is honoured', () => {
    const a = ATTACKS.slash1;
    const target = body('e', 'enemy', 0, 1, 0, { isInvulnerable: () => true });
    const [r] = resolveSwing(body('p', 'player', 0, 0, 0), a, a.startup, [target], new Set());
    expect(r.result).toBe('invulnerable');
  });

  it('blocking works from the front only', () => {
    // A defender at z = 1 facing back towards the attacker (yaw PI = -Z).
    expect(isInFront({ x: 0, z: 1 }, Math.PI, { x: 0, z: 0 }, 65)).toBe(true);
    expect(isInFront({ x: 0, z: 1 }, 0, { x: 0, z: 0 }, 65)).toBe(false); // attacked from behind
    const a = ATTACKS.slash1;
    const shieldUp = (/** @type {number} */ facing) =>
      body('e', 'enemy', 0, 1.1, facing, { blocks: (/** @type {any} */ from) => isInFront({ x: 0, z: 1.1 }, facing, from, 65) });
    expect(resolveSwing(body('p', 'player', 0, 0, 0), a, a.startup + 1, [shieldUp(Math.PI)], new Set())[0].result).toBe('blocked');
    expect(resolveSwing(body('p', 'player', 0, 0, 0), a, a.startup + 1, [shieldUp(0)], new Set())[0].result).toBe('hit');
  });
});

describe('combat in the sandbox', () => {
  const press = (/** @type {string} */ a) => ({ move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: { [a]: { down: true, pressed: true, released: false } } });
  const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };

  it('hitting the dummy: damage, hit-stop and knockback scale with the lab', async () => {
    const results = [];
    for (const feel of [defaultFeel(), { ...defaultFeel(), hitstopScale: 0, knockbackScale: 0 }]) {
      const sb = await Sandbox.create({ grunts: false, feel });
      // Stand in front of the dummy (at z = -4), facing it.
      sb.player.body.teleport?.({ x: 0, y: 0, z: -2.9 });
      sb.player.facing = Math.PI;
      let hitstop = 0;
      sb.events.on('hit', () => (hitstop = sb.hitstop));
      sb.step(press('attack'));
      for (let i = 0; i < 30; i++) sb.step(idle);
      const dummy = sb.dummies[0];
      results.push({ damage: dummy.totalDamage, hitstop, pushed: Math.abs(dummy.offsetVel.z) + Math.abs(dummy.offset.z) });
      sb.dispose();
    }
    expect(results[0].damage).toBe(ATTACKS.slash1.damage);
    expect(results[0].hitstop).toBe(ATTACKS.slash1.hitstop);
    expect(results[1].hitstop).toBe(0);
    expect(results[0].pushed).toBeGreaterThan(0);
    expect(results[1].pushed).toBe(0);
  });

  it('hit-stop freezes the fight but still buffers presses', async () => {
    const sb = await Sandbox.create({ grunts: false });
    sb.player.body.teleport?.({ x: 0, y: 0, z: -2.9 });
    sb.player.facing = Math.PI;
    sb.step(press('attack'));
    while (sb.hitstop === 0 && sb.tick < 40) sb.step(idle);
    expect(sb.hitstop).toBeGreaterThan(0);
    const frames = sb.player.fsm.frames;
    sb.step(press('attack')); // during the freeze
    expect(sb.player.fsm.frames).toBe(frames); // frozen
    expect(sb.buffer.presses.some((p) => p.tick === sb.tick && p.action === 'attack')).toBe(true);
    for (let i = 0; i < 30; i++) sb.step(idle);
    expect(sb.player.swingId).toBe(2); // the buffered press chained into slash2
    sb.dispose();
  });

  it('a heavy blow that catches the hero winding up a swing is a counter hit: knocked down', async () => {
    const sb = await Sandbox.create({ grunts: true });
    const grunt = sb.grunts[0];
    const player = sb.player;
    const hit = (/** @type {any} */ attack) => sb.applyHit(grunt, attack, { target: player, result: 'hit', point: { ...player.position } });
    const swing = () => {
      player.fsm.force('idle');
      player.hp = player.maxHp;
      sb.hitstop = 0; // the last hit's freeze
      sb.step(press('attack'));
      sb.step(idle);
      expect(player.state).toBe('attack');
    };
    // Heavy blow during the swing's startup: knocked down.
    swing();
    hit(ATTACKS.gruntChop);
    expect(player.state).toBe('knockdown');
    // Not swinging: an ordinary flinch.
    player.fsm.force('idle');
    hit(ATTACKS.gruntChop);
    expect(player.state).toBe('hitstun');
    // A light bite during the startup: just a flinch.
    swing();
    hit(ATTACKS.miteBite);
    expect(player.state).toBe('hitstun');
    // A heavy blow once the swing is already cutting (active frames): a flinch.
    swing();
    while (player.attackFrameNow < ATTACKS.slash1.startup) sb.step(idle);
    expect(player.state).toBe('attack');
    hit(ATTACKS.gruntChop);
    expect(player.state).toBe('hitstun');
    sb.dispose();
  });

  it('a blow caught as the shield goes up is parried: the attacker staggers and the hero takes nothing', async () => {
    const sb = await Sandbox.create({ grunts: true });
    const grunt = sb.grunts[0];
    const player = sb.player;
    const events = [];
    sb.events.on('parry', () => events.push('parry'));
    sb.step(hold('shield'));
    expect(player.parrying).toBe(true);
    sb.applyHit(grunt, ATTACKS.gruntChop, { target: player, result: 'blocked', point: { ...player.position } });
    expect(events).toEqual(['parry']);
    expect(player.hp).toBe(player.maxHp);
    expect(grunt.brain.state).toBe('stagger');
    sb.dispose();
  });

  it('a plain block costs a little chip damage, but never the last hit point', async () => {
    const sb = await Sandbox.create({ grunts: true });
    const grunt = sb.grunts[0];
    const player = sb.player;
    for (let i = 0; i < 20; i++) sb.step(hold('shield')); // past the parry window
    expect(player.parrying).toBe(false);
    sb.applyHit(grunt, ATTACKS.gruntChop, { target: player, result: 'blocked', point: { ...player.position } });
    const chip = Math.max(1, Math.round(ATTACKS.gruntChop.damage * PLAYER.blockChip));
    expect(player.hp).toBe(player.maxHp - chip);
    player.hp = 1;
    sb.applyHit(grunt, ATTACKS.gruntChop, { target: player, result: 'blocked', point: { ...player.position } });
    expect(player.hp).toBe(1);
    expect(player.alive).toBe(true);
    sb.dispose();
  });

  it('the shield bash goes through a guard and breaks it', async () => {
    const sb = await Sandbox.create({ grunts: true });
    const grunt = sb.grunts[0];
    sb.step(hold('none')); // one update, so the grunt's brain is running
    let broken = false;
    sb.events.on('hit', (e) => (broken = Boolean(e.guardBroken)));
    sb.applyHit(sb.player, ATTACKS.bash, { target: grunt, result: 'blocked', point: { ...grunt.position } });
    expect(broken).toBe(true);
    expect(grunt.brain.state).toBe('stagger');
    // An ordinary slash into a guard is still just blocked.
    grunt.brain.fsm.force('circle');
    broken = false;
    let blocked = false;
    sb.events.on('block', () => (blocked = true));
    sb.applyHit(sb.player, ATTACKS.slash1, { target: grunt, result: 'blocked', point: { ...grunt.position } });
    expect(blocked).toBe(true);
    expect(grunt.brain.state).not.toBe('stagger');
    sb.dispose();
  });
});
