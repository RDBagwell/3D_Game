import { describe, it, expect } from 'vitest';
import { Sandbox } from '../src/game/sim/Sandbox.js';
import { CasterBrain } from '../src/game/enemies/CasterBrain.js';
import { WardenBrain, WARDEN_TRANSITIONS } from '../src/game/enemies/WardenBrain.js';
import { ENEMIES, ENEMY_BUDGET } from '../src/game/data/actors.js';
import { ATTACKS, PROJECTILES, HAZARDS } from '../src/game/data/attacks.js';
import { angleDelta, yawFromDirection, DEG } from '../src/engine/index.js';
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
    for (let i = 0; i < 3 + ENEMIES.adept.suspiciousFrames; i++) brain.update(ctx(12));
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

describe('enemies that fight back (in the simulation)', () => {
  /** A sandbox with only the enemies a test adds, the hero at the origin facing +z. */
  async function arena() {
    const sb = await Sandbox.create({ grunts: false });
    sb.player.body.teleport({ x: 0, y: 0, z: 0 });
    sb.player.facing = 0;
    return sb;
  }

  it("an adept's flare bursts under you if you stand still, but not after you roll out", async () => {
    for (const roll of [false, true]) {
      const sb = await arena();
      const adept = sb.spawnFoe('adept', 'f', { x: 0, y: 0, z: 7 }, Math.PI);
      sb.flare('flare', /** @type {any} */ (adept));
      const events = [];
      sb.events.on('hazardBurst', () => events.push('burst'));
      sb.events.on('hit', (e) => e.hazard && events.push('hit'));
      for (let i = 0; i < 90; i++) sb.step(roll && i === 10 ? { ...hold('roll'), move: { x: 1, y: 0 } } : idle);
      expect(events[0]).toBe('burst');
      expect(events.includes('hit')).toBe(!roll);
      expect(sb.player.hp).toBe(roll ? sb.player.maxHp : sb.player.maxHp - HAZARDS.flare.damage);
      sb.dispose();
    }
  });

  it("a cindermite's leap reaches you from four metres", async () => {
    const sb = await arena();
    const mite = /** @type {any} */ (sb.spawnFoe('mite', 'l', { x: 0, y: 0, z: 4 }, Math.PI));
    sb.step(idle);
    mite.brain.aware = true;
    mite.brain.attack = ATTACKS.miteLeap;
    mite.brain.fsm.force('windup');
    let hit = null;
    sb.events.on('hit', (e) => e.target === sb.player && (hit = e.attack));
    for (let i = 0; i < 80 && !hit; i++) sb.step(idle);
    expect(hit).toBe(ATTACKS.miteLeap);
    sb.dispose();
  });

  it('a wind-up past its armour point carries on through a hit', async () => {
    const sb = await arena();
    const grunt = /** @type {any} */ (sb.spawnFoe('grunt', 'a', { x: 0, y: 0, z: 1.8 }, Math.PI));
    sb.step(idle);
    grunt.brain.aware = true;
    grunt.brain.attack = ATTACKS.gruntChop;
    grunt.brain.fsm.force('windup');
    for (let i = 0; i < Math.ceil(ATTACKS.gruntChop.startup * 0.7); i++) sb.step(idle);
    let armored = false;
    sb.events.on('hit', (e) => e.target === grunt && (armored = e.armored));
    sb.applyHit(sb.player, ATTACKS.slash1, { target: grunt, result: 'hit', point: { ...grunt.position } });
    expect(armored).toBe(true);
    expect(grunt.state).toBe('windup');
    expect(grunt.hp).toBe(grunt.maxHp - ATTACKS.slash1.damage);
    sb.dispose();
  });

  it('steers round a wall between it and you', async () => {
    const sb = await arena();
    // A wall 3 m wide across the way, halfway.
    sb.physics.addStaticBox({ x: 1.5, y: 1, z: 0.2 }, { x: 0, y: 1, z: 3 });
    const grunt = /** @type {any} */ (sb.spawnFoe('grunt', 'w', { x: 0, y: 0, z: 6.5 }, Math.PI));
    sb.step(idle);
    grunt.brain.alert();
    let frames = 0;
    while (Math.hypot(grunt.position.x, grunt.position.z) > ENEMIES.grunt.circleDistance + 1 && frames < 360) {
      sb.step(idle);
      frames++;
    }
    expect(frames).toBeLessThan(360);
    sb.dispose();
  });

  it('calls allies who can see it; they come though they have not seen you', async () => {
    const sb = await arena();
    const a = /** @type {any} */ (sb.spawnFoe('grunt', 'a', { x: 0, y: 0, z: 9 }, Math.PI)); // facing you
    const b = /** @type {any} */ (sb.spawnFoe('grunt', 'b', { x: 4, y: 0, z: 13 }, 0)); // facing away, out of earshot
    const alerted = [];
    sb.events.on('alerted', (e) => alerted.push(e.foe.id));
    for (let i = 0; i < 5; i++) sb.step(idle);
    expect(a.brain.aware).toBe(true);
    expect(b.brain.aware).toBe(true);
    expect(alerted).toEqual([b.id]);
    sb.dispose();
  });

  it('never has more than the room budget attacking at once', async () => {
    const sb = await arena();
    sb.player.maxHp = sb.player.hp = 1e6;
    const foes = [
      sb.spawnFoe('grunt', 'a', { x: -3, y: 0, z: 3 }, Math.PI),
      sb.spawnFoe('grunt', 'b', { x: 3, y: 0, z: 3 }, Math.PI),
      sb.spawnFoe('mite', 'c', { x: 0, y: 0, z: 4 }, Math.PI),
      sb.spawnFoe('adept', 'd', { x: 0, y: 0, z: 8 }, Math.PI),
    ];
    let most = 0;
    let swings = 0;
    sb.events.on('swing', () => swings++);
    for (let i = 0; i < 20 * 60; i++) {
      sb.step(idle);
      most = Math.max(most, sb.threatInPlay);
      expect(sb.threatInPlay).toBeLessThanOrEqual(ENEMY_BUDGET);
    }
    expect(foes.every((f) => f?.brain.aware)).toBe(true);
    expect(most).toBe(ENEMY_BUDGET); // a grunt and a mite (or two light ones) at once
    expect(swings).toBeGreaterThan(5);
    sb.dispose();
  });
});

describe('senses in the Hearth Halls', () => {
  it('the Key Vault enemies do not notice you through the closed portcullis', async () => {
    const { Adventure } = await import('../src/game/adventure/Adventure.js');
    const { GameState } = await import('../src/game/adventure/GameState.js');
    const adv = new Adventure(GameState.newGame());
    adv.state.flags.add('gate_open');
    await adv.enter('halls', 'start');
    const sb = adv.sandbox;
    const vault = sb.foes.filter((f) => f.spawnName?.startsWith('vault'));
    for (const f of sb.foes) if (!vault.includes(f)) f.hp = 0;
    sb.player.body.teleport({ x: 0, y: 0.2, z: -26 });
    for (let i = 0; i < 3; i++) adv.step(idle, 1 / 60);
    // (They may have glimpsed you at the entrance before the teleport took effect.)
    for (const f of vault) f.brain.reset();
    // Some of them would see you, but for the gate: in range and looking your way.
    const p = sb.player.position;
    const inSight = vault.filter((f) => {
      const d = Math.hypot(p.x - f.position.x, p.z - f.position.z);
      const off = Math.abs(angleDelta(f.facing, yawFromDirection(p.x - f.position.x, p.z - f.position.z)));
      return d <= f.def.sightRange && off <= (f.def.sightFov / 2) * DEG && d > f.def.hearRange;
    });
    expect(inSight.length).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) adv.step(idle, 1 / 60);
    expect(vault.some((f) => f.brain.aware)).toBe(false);
    adv.dispose();
  });
});

describe('the Cinder Warden, rebuilt', () => {
  /** A Warden ready to pick its next attack, the player `distance` away straight ahead (+z) of the world. */
  function ready(distance, { facing = 0, random = 0.5, phase = 1 } = {}) {
    const brain = new WardenBrain('w', ENEMIES.warden);
    const c = ctx(distance, { facing, random: () => random });
    brain.aware = true;
    brain.rest = 0;
    brain.phase = phase;
    brain.fsm.force('approach');
    brain.update(c);
    return { brain, c };
  }

  it('picks by where you stand: a stomp behind it, sometimes a delayed slam from a few metres', () => {
    const behind = ready(2.5, { facing: Math.PI });
    expect(behind.brain.state).toBe('windup');
    expect(behind.brain.attackKey).toBe('wardenStomp');

    const far = ready(3.5, { random: 0.1 });
    expect(far.brain.attackKey).toBe('wardenSlamLate');
    expect(ATTACKS.wardenSlamLate.startup).toBeGreaterThan(ATTACKS.wardenSlam.startup);

    const near = ready(2.5, { random: 0.1 });
    expect(['wardenSweep', 'wardenSlam']).toContain(near.brain.attackKey);
  });

  it('in phase two, a sweep sometimes turns straight into a telegraphed slam', () => {
    const { brain, c } = ready(2.5, { random: 0.1, phase: 2 });
    brain.use('wardenSweep');
    let guard = 0;
    while (brain.state !== 'attack' && guard++ < 200) brain.update(c);
    while (brain.state === 'attack' && guard++ < 400) brain.update(c);
    expect(brain.state).toBe('windup');
    expect(brain.attackKey).toBe('wardenSlamFollow');
    expect(c.events.filter(([n]) => n === 'windup')).toHaveLength(2);
  });

  it("a fissure's rings burst one after another towards you, and hurt you once", async () => {
    const sb = await Sandbox.create({ area: 'halls', spawn: 'ante', spawnEnemy: (s) => s.name === 'warden', seed: 'warden' });
    const warden = /** @type {any} */ (sb.foes.find((f) => f.def.brain === 'warden'));
    sb.player.body.teleport({ x: 0, y: 0, z: -83.2 }); // on the line, between two rings
    sb.step(idle);
    const bursts = [];
    let hits = 0;
    sb.events.on('hazardBurst', (e) => bursts.push(sb.tick));
    sb.events.on('hit', (e) => e.hazard && hits++);
    sb.fissure(ENEMIES.warden.fissure, warden, 0);
    expect(sb.hazards.length).toBe(ENEMIES.warden.fissure.count);
    for (let i = 0; i < 120; i++) sb.step(idle);
    expect(bursts).toHaveLength(ENEMIES.warden.fissure.count);
    expect(bursts[1] - bursts[0]).toBe(ENEMIES.warden.fissure.stagger);
    expect(hits).toBe(1);
    sb.dispose();
  });

  it("a slam smashes the pillar it lands on: it stops blocking the way", async () => {
    const sb = await Sandbox.create({ area: 'halls', spawn: 'ante', spawnEnemy: (s) => s.name === 'warden', seed: 'warden' });
    const warden = /** @type {any} */ (sb.foes.find((f) => f.def.brain === 'warden'));
    const pillar = /** @type {any} */ (sb.objects.find((o) => o.id === 'arena_pillar_nw'));
    // The Warden on one side of the pillar, you hiding on the other.
    warden.body.teleport({ x: -8, y: 0, z: -81.2 });
    warden.facing = 0;
    sb.player.body.teleport({ x: -8, y: 0, z: -74.5 });
    sb.step(idle);
    const through = () => sb.physics.rayDistance({ x: -8, y: 1, z: -80 }, { x: 0, y: 0, z: 1 }, 4);
    expect(through()).not.toBeNull(); // the pillar is in the way
    warden.brain.aware = true;
    warden.brain.use('wardenSlam');
    let broken = null;
    sb.events.on('objectBroken', (e) => (broken = e.id));
    for (let i = 0; i < 120 && !broken; i++) sb.step(idle);
    expect(broken).toBe('arena_pillar_nw');
    expect(pillar.open).toBe(true);
    sb.step(idle); // (the physics world catches up on its next step)
    expect(through()).toBeNull();
    sb.dispose();
  });
});
