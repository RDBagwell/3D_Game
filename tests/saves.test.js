import { describe, it, expect } from 'vitest';
import { MemoryStorage } from '../src/engine/index.js';
import { createSaves, slotSummaries, mostRecentSlot, loadGame, validateSaveData, SAVE_VERSION } from '../src/game/saves.js';
import { GameState } from '../src/game/adventure/GameState.js';
import { Adventure } from '../src/game/adventure/Adventure.js';

/**
 * The game's saves: one versioned record per slot (Island RPG's
 * SaveSystem), holding flags, items, shells, where you are and your
 * checkpoint, quest progress and play time.
 */

function midGame() {
  const s = GameState.newGame();
  s.flags.add('ina_met');
  s.flags.add('gate_open');
  s.addItem('tonic', 2);
  s.addItem('vigor_charm');
  s.shells = 41;
  s.area = 'halls';
  s.spawn = 'entrance';
  s.checkpoint = { area: 'halls', spawn: 'entrance' };
  s.questStages = { hearth: 2 };
  s.playTime = 312.5;
  return s;
}

describe('saves', () => {
  it('round-trip a playthrough through a slot', () => {
    const saves = createSaves(new MemoryStorage());
    const state = midGame();
    expect(saves.save('slot2', { ...state.toSaveData(), settings: null }).ok).toBe(true);
    const { state: back } = loadGame(saves, 'slot2');
    expect(back?.toSaveData()).toEqual(state.toSaveData());
  });

  it('resume where you stood with Save and quit, with your upgrades', async () => {
    const adv = new Adventure(midGame());
    await adv.enter('halls', 'entrance');
    adv.sandbox.player.body.teleport({ x: 1.5, y: 0, z: -5 });
    const data = adv.saveData(true);
    adv.dispose();
    expect(data.position).toMatchObject({ x: 1.5, z: -5 });
    const saves = createSaves(new MemoryStorage());
    saves.save('slot1', { ...data, settings: { damageTaken: 0.5, quality: 'low' } });
    expect(loadGame(saves, 'slot1').settings).toEqual({ damageTaken: 0.5 }); // the playthrough's, not the device's
    const again = new Adventure(/** @type {GameState} */ (loadGame(saves, 'slot1').state));
    await again.resume();
    expect(again.state.area).toBe('halls');
    expect(again.sandbox.player.position.x).toBeCloseTo(1.5, 1);
    expect(again.sandbox.player.position.z).toBeCloseTo(-5, 1);
    expect(again.sandbox.player.maxHp).toBe(130); // the Vigor Charm
    expect(again.state.flags.has('gate_open')).toBe(true);
    again.dispose();
  });

  it('list three slots: empty, saved, and damaged, without throwing', () => {
    const storage = new MemoryStorage();
    const saves = createSaves(storage);
    saves.save('slot1', { ...midGame().toSaveData(), settings: null });
    storage.setItem('emberwake:slot3', '{"format":"save","version":2,"data":{"area":42}');
    const list = slotSummaries(saves);
    expect(list.map((s) => s.status)).toEqual(['ok', 'empty', 'unreadable']);
    expect(list[0]).toMatchObject({ place: 'The Hearth Halls', progress: 'The Hearth Halls', playTime: 312.5 });
    expect(list[2].problem).toMatch(/not valid JSON/);
    // The damaged save is kept aside, not lost.
    expect(storage.getItem('emberwake:slot3:corrupt')).toContain('"area":42');
    expect(mostRecentSlot(saves)).toBe('slot1');
  });

  it('reject a save that parses but makes no sense', () => {
    expect(validateSaveData({ ...midGame().toSaveData(), settings: null, area: 'atlantis' })).toEqual(['data.area "atlantis" is not an area in this version of the game']);
    expect(validateSaveData({ ...midGame().toSaveData(), settings: null, items: { tonic: -1 } })[0]).toMatch(/whole number/);
    const saves = createSaves(new MemoryStorage());
    const bad = createSaves(new MemoryStorage());
    void bad;
    expect(saves.save('slot1', { area: 'village' }).ok).toBe(false);
  });

  it('survive the version bumps: a v1 save (before settings were saved) loads today', () => {
    const storage = new MemoryStorage();
    // Exactly what version 1 wrote (commit "cindermites, ash adepts, the Cinder Warden, saves and the ending").
    const v1 = createSaves(storage);
    v1.version = 1;
    v1.migrations = {};
    v1.validate = () => true;
    const { defeated: _v3, ...v1Data } = midGame().toSaveData();
    expect(v1.save('slot1', v1Data).ok).toBe(true);
    expect(JSON.parse(storage.getItem('emberwake:slot1') ?? '{}').version).toBe(1);
    const result = loadGame(createSaves(storage), 'slot1');
    expect(result.migratedFrom).toBe(1);
    expect(result.settings).toBe(null);
    expect(result.state?.toSaveData()).toEqual(midGame().toSaveData());
  });

  it('survive the version bump: a v2 save (before beaten enemies were remembered) loads in v3', () => {
    const storage = new MemoryStorage();
    const v2 = createSaves(storage);
    v2.version = 2;
    v2.migrations = {};
    v2.validate = () => true;
    const { defeated: _v3, ...v2Data } = midGame().toSaveData();
    expect(v2.save('slot1', { ...v2Data, settings: null }).ok).toBe(true);
    const result = loadGame(createSaves(storage), 'slot1');
    expect(result.migratedFrom).toBe(2);
    expect(result.state?.defeated.size).toBe(0);
    expect(result.state?.toSaveData()).toEqual(midGame().toSaveData());
  });

  it('survive the version bump: a v3 save (before smashed crates were remembered) loads in v4', () => {
    const storage = new MemoryStorage();
    const v3 = createSaves(storage);
    v3.version = 3;
    v3.migrations = {};
    v3.validate = () => true;
    const { looted: _v4, ...v3Data } = midGame().toSaveData();
    expect(v3.save('slot1', { ...v3Data, settings: null }).ok).toBe(true);
    const result = loadGame(createSaves(storage), 'slot1');
    expect(result.migratedFrom).toBe(3);
    expect(result.state?.looted.size).toBe(0);
    expect(result.state?.toSaveData()).toEqual(midGame().toSaveData());
  });

  it('refuse a save from a newer version, with a reason', () => {
    const storage = new MemoryStorage();
    storage.setItem('emberwake:slot1', JSON.stringify({ format: 'save', version: SAVE_VERSION + 1, data: {} }));
    const result = loadGame(createSaves(storage), 'slot1');
    expect(result.state).toBe(null);
    expect(result.warning).toMatch(/newer version/);
  });
});
