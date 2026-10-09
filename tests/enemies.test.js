import { describe, it, expect } from 'vitest';
import { Sandbox } from '../src/game/sim/Sandbox.js';
import { CasterBrain } from '../src/game/enemies/CasterBrain.js';
import { WardenBrain, WARDEN_TRANSITIONS } from '../src/game/enemies/WardenBrain.js';
import { ENEMIES } from '../src/game/data/actors.js';
import { ATTACKS, PROJECTILES } from '../src/game/data/attacks.js';
import { fightWarden } from './helpers/bossBot.js';

/**
 * The two new enemy types and the boss: their brains with made-up
 * perceptions (as tests/gruntAi.test.js does for the grunt), their
 * projectiles in the real simulation, and a whole Warden fight played by a
 * scripted player (tests/helpers/bossBot.js).
 */

const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
const hold = (/** @type {string} */ b) => ({ ...idle, buttons: { [b]: { down: true, pressed: true, released: false } } });

/** A brain context with the player at a distance, straight ahead. */
function ctx(distance, extra = {}) {
  const events = [];
  return {
    events,
    see: { distance, bearing: 0, playerAlive: true, playerSwingId: 0, playerAttacking: false },
    facing: 0,
    random: () => 0.5,
    requestToken: () => true,
    releaseToken: () => {},
    emit: (name, data) => events.push([name, data]),
    ...extra,
  };
}

describe('ash adept (caster)', () => {
  it('keeps its distance: closes in from far, backs away when you rush it', () => {
    const brain = new CasterBrain('a', ENEMIES.adept);
    brain.update(ctx(12));
    brain.update(ctx(12));
    expect(brain.state).toBe('chase');
    expect(brain.intent.move).toBe('toward');
    brain.cooldown = 999;
    for (let i = 0; i < 3; i++) brain.update(ctx(8));
    expect(brain.state).toBe('keep');
    for (let i = 0; i < 3; i++) brain.update(ctx(2.5));
    expect(brain.state).toBe('flee');
    expect(brain.intent.move).toBe('away');
  });

  it('telegraphs every bolt and stops aiming before it lets go', () => {
    const brain = new CasterBrain('a', ENEMIES.adept);
    const shots = [];
    const c = ctx(7, { shoot: (kind, yaw) => shots.push([kind, yaw]) });
    brain.aware = true;
    brain.cooldown = 0;
    brain.fsm.force('keep');
    brain.update(c);
    expect(brain.state).toBe('cast');
    expect(brain.telegraph).toBe(true);
    let frames = 0;
    while (shots.length === 0 && frames < 200) {
      brain.update(c);
      frames++;
      if (frames === ENEMIES.adept.castFrames - ENEMIES.adept.commitFrames + 1) expect(brain.intent.turnRate).toBe(0);
    }
    expect(frames).toBeGreaterThanOrEqual(ENEMIES.adept.castFrames - 1);
    expect(shots[0][0]).toBe('cinderBolt');
    expect(c.events.some(([n]) => n === 'windup')).toBe(true);
  });
});

describe('projectiles', () => {
  async function bolt(setup) {
    const sb = await Sandbox.create({ grunts: false });
    const player = sb.player;
    player.body.teleport({ x: 0, y: 0, z: -4 });
    player.facing = 0; // facing +z, towards the adept
    const adept = sb.spawnFoe('adept', 't', { x: 0, y: 0, z: 2 }, Math.PI);
    sb.shoot('cinderBolt', adept, Math.PI);
    const events = [];
    for (const n of ['hit', 'block', 'dodge', 'projectileEnd']) sb.events.on(n, (e) => events.push(n === 'projectileEnd' ? `end:${e.reason}` : n));
    for (let i = 0; i < 120; i++) sb.step(setup(i, sb));
    const out = { events, hp: player.hp, maxHp: player.maxHp };
    sb.dispose();
    return out;
  }

  it('hits you if you stand still', async () => {
    const r = await bolt(() => idle);
    expect(r.events).toContain('hit');
    expect(r.hp).toBe(r.maxHp - PROJECTILES.cinderBolt.damage);
  });

  it('is blocked by a raised shield', async () => {
    const r = await bolt(() => hold('shield'));
    expect(r.events).toContain('block');
    expect(r.hp).toBe(r.maxHp);
  });

  it('parried as the shield goes up, it flies back and hits the adept', async () => {
    const events = [];
    const r = await bolt((i, sb) => {
      if (i === 0) {
        sb.events.on('parry', () => events.push('parry'));
        sb.events.on('hit', (e) => e.reflected && events.push('reflected hit'));
      }
      // Raise the shield just before it arrives (about 32 frames out).
      return i >= 28 ? hold('shield') : idle;
    });
    expect(events).toEqual(['parry', 'reflected hit']);
    expect(r.hp).toBe(r.maxHp);
  });

  it('passes through a well-timed roll', async () => {
    // The bolt covers 5.3 m at 8.5 m/s: about 37 frames. Roll a little before.
    const r = await bolt((i) => (i === 26 ? { ...hold('roll'), move: { x: 0, y: -1 } } : idle));
    expect(r.events).toContain('dodge');
    expect(r.hp).toBe(r.maxHp);
  });
});

describe('the Cinder Warden', () => {
  it('has a transition table where every target is a state', () => {
    const states = Object.keys(WARDEN_TRANSITIONS);
    for (const [from, tos] of Object.entries(WARDEN_TRANSITIONS)) for (const to of tos) expect(states, `${from} → ${to}`).toContain(to);
  });

  it('telegraphs both attacks for at least half a second, the slam longest', () => {
    expect(ATTACKS.wardenSweep.startup).toBeGreaterThanOrEqual(30);
    expect(ATTACKS.wardenSlam.startup).toBeGreaterThan(ATTACKS.wardenSweep.startup);
  });

  it('is armoured, except while its axe is stuck after a slam (the weak point)', () => {
    const brain = new WardenBrain('w', ENEMIES.warden);
    const c = ctx(2);
    brain.update(c);
    expect(brain.damageTaken).toBe(ENEMIES.warden.armour);
    brain.rest = 0;
    brain.attack = ATTACKS.wardenSlam;
    brain.fsm.force('windup');
    let frames = 0;
    while (brain.state !== 'stuck' && frames++ < 200) brain.update(c);
    expect(brain.state).toBe('stuck');
    expect(brain.damageTaken).toBe(ENEMIES.warden.weakPoint);
    expect(c.events.some(([n]) => n === 'opening')).toBe(true);
  });

  it('roars into phase two below half health and calls three cindermites', async () => {
    const sb = await Sandbox.create({ area: 'halls', spawn: 'ante', spawnEnemy: (s) => s.name === 'warden' });
    const warden = /** @type {any} */ (sb.foes[0]);
    sb.player.body.teleport({ x: 0, y: 0, z: -80 });
    for (let i = 0; i < 10; i++) sb.step(idle);
    expect(warden.brain.aware).toBe(true);
    warden.takeHit({ damage: warden.maxHp * 0.55, poise: 0, knockback: { x: 0, z: 0 } });
    sb.player.body.teleport({ x: 0, y: 0, z: -72 }); // out of reach while it roars
    let roared = false;
    sb.events.on('roar', () => (roared = true));
    for (let i = 0; i < 400 && warden.brain.phase === 1; i++) sb.step(idle);
    for (let i = 0; i < 60; i++) sb.step(idle);
    expect(roared).toBe(true);
    expect(warden.brain.phase).toBe(2);
    expect(sb.foes.filter((f) => f.kind === 'mite')).toHaveLength(3);
    sb.dispose();
  });

  // The scripted player (tests/helpers/bossBot.js) rolls this many frames
  // before each blow lands: from very late to quite early.
  const TIMINGS = [4, 8, 12, 16];

  it('can be beaten on Polished with one tonic, whatever the reaction timing', async () => {
    for (const reactFrames of TIMINGS) {
      const r = await fightWarden({ preset: 'polished', tonics: 1, reactFrames });
      expect(r.won, `react ${reactFrames}: ${JSON.stringify(r)}`).toBe(true);
      expect(r.phaseTwo).toBe(true);
    }
  }, 120_000);

  it('is harder on Raw: the same player loses some of those fights', async () => {
    const results = [];
    for (const reactFrames of TIMINGS) results.push(await fightWarden({ preset: 'raw', tonics: 1, reactFrames }));
    expect(results.some((r) => !r.won)).toBe(true);
    // ...but it's still fair: it can be won.
    expect(results.some((r) => r.won)).toBe(true);
  }, 120_000);
});
