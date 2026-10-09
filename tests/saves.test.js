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
    expect(saves.save('slot2', state.toSaveData()).ok).toBe(true);
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
    saves.save('slot1', data);
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
    saves.save('slot1', midGame().toSaveData());
    storage.setItem('emberwake:slot3', '{"format":"save","version":1,"data":{"area":42}');
    const list = slotSummaries(saves);
    expect(list.map((s) => s.status)).toEqual(['ok', 'empty', 'unreadable']);
    expect(list[0]).toMatchObject({ place: 'The Hearth Halls', progress: 'The Hearth Halls', playTime: 312.5 });
    expect(list[2].problem).toMatch(/not valid JSON/);
    // The damaged save is kept aside, not lost.
    expect(storage.getItem('emberwake:slot3:corrupt')).toContain('"area":42');
    expect(mostRecentSlot(saves)).toBe('slot1');
  });

  it('reject a save that parses but makes no sense', () => {
    expect(validateSaveData({ ...midGame().toSaveData(), area: 'atlantis' })).toEqual(['data.area "atlantis" is not an area in this version of the game']);
    expect(validateSaveData({ ...midGame().toSaveData(), items: { tonic: -1 } })[0]).toMatch(/whole number/);
    const saves = createSaves(new MemoryStorage());
    const bad = createSaves(new MemoryStorage());
    void bad;
    expect(saves.save('slot1', { area: 'village' }).ok).toBe(false);
  });

  it('refuse a save from a newer version, with a reason', () => {
    const storage = new MemoryStorage();
    storage.setItem('emberwake:slot1', JSON.stringify({ format: 'save', version: SAVE_VERSION + 1, data: {} }));
    const result = loadGame(createSaves(storage), 'slot1');
    expect(result.state).toBe(null);
    expect(result.warning).toMatch(/newer version/);
  });
});
