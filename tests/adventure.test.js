import { describe, it, expect } from 'vitest';
import { USE_RANGE } from '../src/game/data/objects.js';
import { yawFromDirection } from '../src/engine/index.js';
import { Adventure } from '../src/game/adventure/Adventure.js';
import { GameState } from '../src/game/adventure/GameState.js';
import { ATTACKS } from '../src/game/data/attacks.js';

/**
 * Whole playthroughs, headless: the adventure layer driving the real
 * simulation. The player walks up to people and objects and presses
 * Interact (through the sandbox, so focus and range are exercised), picks
 * choices by their text, and fights are settled with a killing blow. This
 * checks the story's wiring end to end: dialogue → flags → gates → areas →
 * the boss → the ending, and both side quests.
 */

const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
const interact = { ...idle, buttons: { interact: { down: true, pressed: true, released: false } } };

/** Stand next to a thing, facing it, and press Interact. Returns the dialogue event. */
async function use(adv, thing) {
  const sb = adv.sandbox;
  const p = thing.position;
  sb.player.body.teleport({ x: p.x, y: p.y, z: p.z + 1.4 });
  sb.player.facing = Math.PI;
  for (let i = 0; i < 3; i++) sb.step(idle);
  let event = null;
  const off = adv.events.on('dialogue', (e) => (event = e));
  adv.step(interact, 1 / 60);
  off?.();
  return event;
}

/** Play a conversation, choosing options by (part of) their text. */
function converse(adv, event, picks = []) {
  const runner = adv.talk(event.id, event.npc);
  const lines = [];
  for (let guard = 0; runner.current && guard < 100; guard++) {
    const page = runner.current;
    lines.push(page.text);
    if (!page.choices) {
      runner.advance();
      continue;
    }
    const want = picks.shift();
    const choice = page.choices.find((c) => c.enabled && want && c.text.includes(want)) ?? page.choices.find((c) => c.enabled);
    runner.choose(choice.index);
  }
  return { ...adv.finish(), lines };
}

const find = (list, id) => list.find((x) => x.id === id);

/** A killing blow from the player. */
function kill(adv, foe) {
  const sb = adv.sandbox;
  sb.applyHit(sb.player, { ...ATTACKS.slash1, damage: 9999 }, { target: foe, result: 'hit', point: { ...foe.position } });
  sb.hitstop = 0;
}

describe('the adventure', () => {
  it('can be played from the dock to the ending', async () => {
    const adv = new Adventure(GameState.newGame());
    const quests = [];
    adv.events.on('quest', (q) => quests.push(`${q.status}:${q.id}`));
    await adv.enter('village', 'start');
    expect(adv.state.itemCount('lamp_crate')).toBe(1);

    // Elder Ina opens the gate.
    let ev = await use(adv, find(adv.sandbox.npcs, 'ina'));
    expect(ev).toEqual({ id: 'ina', npc: 'ina' });
    converse(adv, ev, ['Can I help', "I'll go"]);
    expect(adv.state.flags.has('gate_open')).toBe(true);
    expect(find(adv.sandbox.objects, 'hearth_gate').open).toBe(true);
    expect(quests).toContain('updated:hearth');

    // Into the halls: the exit behind the gate.
    await adv.enter('halls', 'start');
    // The crystal switch, struck with the sword.
    const sw = find(adv.sandbox.objects, 'hall_switch');
    adv.sandbox.events.emit('objectHit', { id: 'hall_switch', point: sw.position });
    expect(find(adv.sandbox.objects, 'hall_gate').open).toBe(true);

    // The chest: the Hearth Key and some shells.
    const shells = adv.state.shells;
    ev = await use(adv, find(adv.sandbox.objects, 'vault_chest'));
    converse(adv, ev);
    expect(adv.state.itemCount('hearth_key')).toBe(1);
    expect(adv.state.shells).toBe(shells + 25);
    expect(find(adv.sandbox.objects, 'vault_chest').prompt).toBe(null); // can't be opened twice

    // The locked door.
    ev = await use(adv, find(adv.sandbox.objects, 'vault_door'));
    converse(adv, ev);
    expect(find(adv.sandbox.objects, 'vault_door').open).toBe(true);
    expect(adv.state.itemCount('hearth_key')).toBe(0);

    // The last hearthstone becomes the checkpoint.
    adv.sandbox.player.body.teleport({ x: 0, y: 0, z: -60 });
    for (let i = 0; i < 3; i++) adv.step(idle, 1 / 60);
    expect(adv.state.checkpoint).toEqual({ area: 'halls', spawn: 'ante' });

    // The Warden falls and leaves the Hearth Ember.
    const warden = adv.sandbox.foes.find((f) => f.spawnName === 'warden');
    const shellsBefore = adv.state.shells;
    kill(adv, warden);
    expect(adv.state.flags.has('warden_defeated')).toBe(true);
    expect(adv.state.shells - shellsBefore).toBe(40); // paid once (it used to be twice)
    expect(adv.state.itemCount('hearth_ember')).toBe(1);

    // Light the Hearth: the ending.
    ev = await use(adv, find(adv.sandbox.objects, 'hearth'));
    const end = converse(adv, ev, ['Set the ember']);
    expect(end.ending).toBe(true);
    expect(adv.state.flags.has('hearth_lit')).toBe(true);
    expect(quests).toContain('done:hearth');
    // The lamp-stones you delivered are warm now.
    expect(adv.state.itemCount('lamp_crate')).toBe(0);
    expect(adv.state.itemCount('lamp_crate_lit')).toBe(1);

    // A beaten Warden doesn't come back.
    await adv.enter('halls', 'ante');
    expect(adv.sandbox.foes.some((f) => f.spawnName === 'warden')).toBe(false);
    adv.dispose();
  });

  it("Wren's satchel: find it, bring it back, get the Vigor Charm", async () => {
    const adv = new Adventure(GameState.newGame());
    await adv.enter('village', 'start');
    const satchel = find(adv.sandbox.objects, 'satchel');
    expect(satchel.hidden).toBe(true); // not until she's asked
    converse(adv, await use(adv, find(adv.sandbox.npcs, 'wren')), ["I'll look"]);
    expect(satchel.hidden).toBe(false);
    converse(adv, await use(adv, satchel));
    expect(adv.state.itemCount('satchel')).toBe(1);
    expect(satchel.hidden).toBe(true);
    converse(adv, await use(adv, find(adv.sandbox.npcs, 'wren')));
    expect(adv.state.itemCount('vigor_charm')).toBe(1);
    expect(adv.sandbox.player.maxHp).toBe(130);
    adv.dispose();
  });

  it("Dorran's ring trial: waves of enemies, then the Tempered Blade", async () => {
    const adv = new Adventure(GameState.newGame());
    await adv.enter('village', 'start');
    converse(adv, await use(adv, find(adv.sandbox.npcs, 'dorran')), ['Let them out']);
    expect(adv.encounter?.id).toBe('ring_trial');
    for (let wave = 0; wave < 5 && adv.encounter; wave++) {
      for (const foe of adv.encounter.foes) kill(adv, foe);
      adv.step(idle, 1 / 60);
    }
    expect(adv.encounter).toBe(null);
    expect(adv.state.flags.has('trial_won')).toBe(true);
    converse(adv, await use(adv, find(adv.sandbox.npcs, 'dorran')));
    expect(adv.state.itemCount('tempered_blade')).toBe(1);
    expect(adv.sandbox.player.damageScale).toBeCloseTo(1.4);
    adv.dispose();
  });

  it('a new game announces the quest you start with', () => {
    const adv = new Adventure(GameState.newGame());
    const quests = [];
    adv.events.on('quest', (q) => quests.push(`${q.status}:${q.id}`));
    adv.announceQuests();
    expect(quests).toEqual(['new:hearth']);
    adv.dispose();
  });

  it('a tonic heals, takes a moment, and is used up', async () => {
    const adv = new Adventure(GameState.newGame());
    await adv.enter('village', 'start');
    const player = adv.sandbox.player;
    player.hp = 30;
    const use = { ...idle, buttons: { useItem: { down: true, pressed: true, released: false } } };
    adv.step(use, 1 / 60);
    expect(player.state).toBe('drink');
    for (let i = 0; i < 60; i++) adv.step(idle, 1 / 60);
    expect(player.hp).toBe(75);
    expect(adv.state.itemCount('tonic')).toBe(0);
    adv.step(use, 1 / 60);
    expect(player.state).not.toBe('drink'); // none left
    adv.dispose();
  });

  it('a tonic pressed mid-swing is drunk once the swing ends; one refused or spilled says why', async () => {
    const adv = new Adventure(GameState.newGame());
    await adv.enter('village', 'start');
    const player = adv.sandbox.player;
    const notices = [];
    adv.events.on('notice', (n) => notices.push(n.text));
    const press = (/** @type {string} */ action) => ({ ...idle, buttons: { [action]: { down: true, pressed: true, released: false } } });

    // Full health: nothing drunk, and a message.
    adv.step(press('useItem'), 1 / 60);
    expect(player.state).not.toBe('drink');
    expect(notices.at(-1)).toMatch(/full vigor/);

    // Pressed during a swing: buffered, drunk when the swing ends.
    player.hp = 30;
    adv.step(press('attack'), 1 / 60);
    expect(player.state).toBe('attack');
    adv.step(press('useItem'), 1 / 60);
    let drank = false;
    for (let i = 0; i < 60 && !drank; i++) {
      adv.step(idle, 1 / 60);
      drank = player.state === 'drink';
    }
    expect(drank).toBe(true);

    // Hit before it takes effect: spilled, still in the bag.
    player.takeHit({ damage: 1, knockback: { x: 0, z: 0 }, hitstun: 10 });
    adv.step(idle, 1 / 60);
    expect(notices.at(-1)).toMatch(/Spilled/);
    expect(adv.state.itemCount('tonic')).toBe(1);
    adv.dispose();
  });

  it('beaten enemies stay beaten: back in the area, and after a save and reload', async () => {
    const adv = new Adventure(GameState.newGame());
    adv.state.flags.add('gate_open');
    await adv.enter('halls', 'start');
    const mite = adv.sandbox.foes.find((f) => f.spawnName === 'steps_a');
    kill(adv, mite);
    adv.step(idle, 1 / 60);
    expect(adv.state.isDefeated('halls', 'steps_a')).toBe(true);
    await adv.enter('village', 'gate');
    await adv.enter('halls', 'start');
    const names = () => adv.sandbox.foes.map((f) => f.spawnName);
    expect(names()).not.toContain('steps_a');
    expect(names()).toContain('steps_b');
    const reloaded = new Adventure(GameState.fromSaveData(adv.state.toSaveData()));
    await reloaded.enter('halls', 'start');
    expect(reloaded.sandbox.foes.map((f) => f.spawnName)).not.toContain('steps_a');
    adv.dispose();
    reloaded.dispose();
  });

  it('the crystal switch offers "Strike", and Interact swings at it from anywhere the prompt shows', async () => {
    for (const angle of [0, 0.8, -0.8, Math.PI]) {
      const adv = new Adventure(GameState.newGame());
      adv.state.flags.add('gate_open');
      await adv.enter('halls', 'start');
      const sb = adv.sandbox;
      for (const f of sb.foes) f.hp = 0; // a quiet hall
      const crystal = sb.objects.find((o) => o.id === 'hall_switch');
      // Just inside the prompt's reach, facing away a little.
      const r = USE_RANGE - 0.15;
      sb.player.body.teleport({ x: crystal.position.x - Math.cos(angle) * r, y: 0.4, z: crystal.position.z + Math.sin(angle) * r });
      sb.player.facing = yawFromDirection(crystal.position.x - sb.player.position.x, crystal.position.z - sb.player.position.z) + 0.6;
      for (let i = 0; i < 20; i++) adv.step(idle, 1 / 60);
      expect(sb.focus?.id, `angle ${angle}`).toBe('hall_switch');
      expect(sb.focus?.label).toBe('Strike');
      adv.step({ ...idle, buttons: { interact: { down: true, pressed: true, released: false } } }, 1 / 60);
      for (let i = 0; i < 40; i++) adv.step(idle, 1 / 60);
      expect(adv.state.flags.has('hall_gate_open'), `angle ${angle}`).toBe(true);
      expect(sb.focus?.id).not.toBe('hall_switch'); // no prompt once it's rung
      adv.dispose();
    }
  });

  it('falling returns you to the last hearthstone with everything you had', async () => {
    const adv = new Adventure(GameState.newGame());
    adv.state.flags.add('gate_open');
    await adv.enter('halls', 'start');
    for (let i = 0; i < 3; i++) adv.step(idle, 1 / 60);
    expect(adv.state.checkpoint).toEqual({ area: 'halls', spawn: 'entrance' });
    adv.state.addItem('tonic', 2);
    let died = false;
    adv.events.on('died', () => (died = true));
    const p = adv.sandbox.player;
    adv.sandbox.player.takeHit({ damage: 999, knockback: { x: 0, z: 0 }, hitstun: 10 });
    adv.step(idle, 1 / 60);
    expect(died).toBe(true);
    await adv.respawn();
    expect(adv.sandbox.player).not.toBe(p);
    expect(adv.sandbox.player.hp).toBe(adv.sandbox.player.maxHp);
    expect(adv.state.itemCount('tonic')).toBe(3);
    const at = adv.sandbox.level.spawns.player.entrance.position;
    expect(adv.sandbox.player.position.z).toBeCloseTo(at.z, 1);
    adv.dispose();
  });
});
