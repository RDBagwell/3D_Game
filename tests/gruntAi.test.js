import { describe, it, expect } from 'vitest';
import { GruntBrain, GRUNT_TRANSITIONS } from '../src/game/enemies/GruntBrain.js';
import { ATTACKS } from '../src/game/data/attacks.js';
import { ENEMIES } from '../src/game/data/actors.js';

/**
 * A brain with a scripted world: the player's distance and bearing, a token
 * that can be granted or refused, and a fixed "random" number.
 */
function harness({ distance = 20, bearing = 0, facing = 0, random = 0.99, token = true } = {}) {
  const brain = new GruntBrain('g');
  const world = { distance, bearing, facing, random, token, swingId: 0, attacking: false, events: /** @type {string[]} */ ([]), holder: /** @type {string | null} */ (null) };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      brain.update({
        see: { distance: world.distance, bearing: world.bearing, playerAlive: true, playerSwingId: world.swingId, playerAttacking: world.attacking },
        facing: world.facing,
        random: () => world.random,
        requestToken: (id) => {
          if (!world.token || (world.holder && world.holder !== id)) return false;
          world.holder = id;
          return true;
        },
        releaseToken: (id) => {
          if (world.holder === id) world.holder = null;
        },
        emit: (name) => world.events.push(name),
      });
    }
    return brain.state;
  };
  return { brain, world, step };
}

const g = ENEMIES.grunt;
const chop = ATTACKS.gruntChop;

describe('grunt AI', () => {
  it('has a transition table where every target is a real state', () => {
    for (const tos of Object.values(GRUNT_TRANSITIONS)) for (const to of tos) expect(Object.keys(GRUNT_TRANSITIONS)).toContain(to);
  });

  it('stays idle until the player is seen, then chases', () => {
    const h = harness({ distance: g.sightRange + 2 });
    expect(h.step(10)).toBe('idle');
    h.world.distance = g.sightRange - 1;
    expect(h.step(2)).toBe('chase');
    expect(h.world.events).toContain('noticed');
  });

  it('does not see the player behind it, but hears them close by', () => {
    const h = harness({ distance: 6, bearing: Math.PI, facing: 0 });
    expect(h.step(5)).toBe('idle');
    h.world.distance = g.hearRange - 0.5;
    h.step(2);
    expect(h.brain.aware).toBe(true);
    expect(['chase', 'circle']).toContain(h.brain.state); // that close, it may go straight to circling
  });

  it('chase → circle when close, and circles while another grunt holds the token', () => {
    const h = harness({ distance: 5, token: false });
    h.step(2);
    h.world.distance = g.circleDistance;
    expect(h.step(2)).toBe('circle');
    expect(h.step(200)).toBe('circle');
    expect(['circle', 'away']).toContain(h.brain.intent.move);
  });

  it('with the token: approach → wind-up (the telegraph) → attack → recover → circle', () => {
    const h = harness({ distance: 5 });
    h.step(2);
    h.world.distance = g.circleDistance;
    h.step(2);
    // Wait out the starting cooldown, then it takes its turn.
    let guard = 0;
    while (h.brain.state === 'circle' && guard++ < 200) h.step();
    expect(h.brain.state).toBe('approach');
    expect(h.world.holder).toBe('g');
    h.world.distance = g.attackRange - 0.1;
    expect(h.step()).toBe('windup');
    expect(h.world.events).toContain('windup');
    // The wind-up lasts exactly the attack's startup frames.
    let windup = 1;
    while (h.step() === 'windup') windup++;
    expect(windup).toBe(chop.startup);
    expect(h.brain.state).toBe('attack');
    let active = 1;
    while (h.step() === 'attack') active++;
    expect(active).toBe(chop.active);
    expect(h.brain.state).toBe('recover');
    h.step(chop.recovery);
    expect(['circle', 'chase']).toContain(h.brain.state);
    expect(h.world.holder).toBeNull(); // token given back
  });

  it('stops tracking the player just before the blow lands (so a late roll works)', () => {
    const h = harness({ distance: 5 });
    h.step(2);
    h.world.distance = g.circleDistance;
    h.step(2);
    while (h.brain.state !== 'approach') h.step();
    h.world.distance = 1;
    h.step();
    h.step(chop.startup - g.commitFrames - 1);
    expect(h.brain.intent.turnRate).toBeGreaterThan(0);
    h.step(2);
    expect(h.brain.state).toBe('windup');
    expect(h.brain.intent.turnRate).toBe(0);
  });

  it('sometimes blocks when the player starts a swing nearby', () => {
    const h = harness({ distance: 5, random: 0 }); // "random" always says yes
    h.step(2);
    h.world.distance = 2.5;
    h.world.swingId = 1;
    h.world.attacking = true;
    expect(h.step()).toBe('block');
    h.step(g.blockFrames + 1);
    expect(h.brain.state).not.toBe('block');

    const never = harness({ distance: 5, random: 0.99 });
    never.step(2);
    never.world.distance = 2.5;
    never.world.swingId = 1;
    never.world.attacking = true;
    expect(never.step()).not.toBe('block');
  });

  it('is interrupted by hits: hit-stun, or stagger when its poise breaks; then death', () => {
    const h = harness({ distance: 2 });
    h.step(3);
    h.brain.onHit(false);
    expect(h.brain.state).toBe('hitstun');
    h.step(g.hitstunFrames + 1);
    expect(h.brain.state).not.toBe('hitstun');
    h.brain.onHit(true);
    expect(h.brain.state).toBe('stagger');
    h.brain.onDeath();
    expect(h.brain.state).toBe('dead');
    expect(h.step(100)).toBe('dead');
  });
});
