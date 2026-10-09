import { describe, it, expect } from 'vitest';
import { evaluateCondition, conditionContext } from '../src/game/adventure/conditions.js';
import { applyEffects } from '../src/game/adventure/effects.js';
import { GameState } from '../src/game/adventure/GameState.js';
import { DialogueRunner } from '../src/game/dialogue/DialogueRunner.js';
import { validateDialogue } from '../src/game/dialogue/validateDialogue.js';
import { DIALOGUES } from '../src/game/data/dialogues/index.js';
import { FLAGS } from '../src/game/data/flags.js';
import { ITEMS } from '../src/game/data/items.js';
import { ENCOUNTERS } from '../src/game/data/encounters.js';
import { SHOPS } from '../src/game/data/shops.js';

/**
 * The dialogue system ported from Island RPG: conditions, effects, the
 * runner and the validator (the RPG's tests/dialogue.test.js, against this
 * game's data).
 */

const known = { flags: FLAGS, items: ITEMS, encounters: ENCOUNTERS, shops: SHOPS };

/** Play a conversation, choosing by text; returns every line shown. */
function play(id, state, picks = []) {
  const runner = new DialogueRunner(DIALOGUES[id], state, id, { player: 'Ren' }).start();
  const lines = [];
  for (let guard = 0; runner.current && guard < 50; guard++) {
    const page = runner.current;
    lines.push(page.text);
    if (!page.choices) runner.advance();
    else {
      const want = picks.shift();
      const choice = page.choices.find((c) => c.enabled && c.text.includes(want ?? '')) ?? page.choices[0];
      runner.choose(choice.index);
    }
  }
  return { runner, lines };
}

describe('conditions', () => {
  it('checks flags, items and shells', () => {
    const state = new GameState();
    const ctx = conditionContext(state);
    expect(evaluateCondition({ flag: 'ina_met' }, ctx)).toBe(false);
    state.flags.add('ina_met');
    expect(evaluateCondition({ flag: 'ina_met' }, ctx)).toBe(true);
    expect(evaluateCondition({ notFlag: 'ina_met' }, ctx)).toBe(false);
    state.addItem('tonic', 2);
    expect(evaluateCondition({ hasItem: 'tonic' }, ctx)).toBe(true);
    expect(evaluateCondition({ hasItem: 'tonic', count: 3 }, ctx)).toBe(false);
    expect(evaluateCondition({ lacksItem: 'satchel' }, ctx)).toBe(true);
    state.shells = 15;
    expect(evaluateCondition({ shells: 12 }, ctx)).toBe(true);
    expect(evaluateCondition({ shellsBelow: 12 }, ctx)).toBe(false);
  });

  it('treats several keys as AND, and supports any / all / not', () => {
    const state = new GameState();
    const ctx = conditionContext(state);
    state.flags.add('a');
    expect(evaluateCondition({ flag: 'a', notFlag: 'b' }, ctx)).toBe(true);
    expect(evaluateCondition({ flag: 'a', hasItem: 'tonic' }, ctx)).toBe(false);
    expect(evaluateCondition({ any: [{ flag: 'b' }, { flag: 'a' }] }, ctx)).toBe(true);
    expect(evaluateCondition({ all: [{ flag: 'b' }, { flag: 'a' }] }, ctx)).toBe(false);
    expect(evaluateCondition({ not: { flag: 'b' } }, ctx)).toBe(true);
    expect(evaluateCondition(undefined, ctx)).toBe(true);
    expect(() => evaluateCondition({ level: 3 }, ctx)).toThrow(/Unknown condition/);
  });
});

describe('effects', () => {
  it('sets flags, moves items and shells, and says what happened', () => {
    const state = new GameState();
    const r = applyEffects([{ setFlag: 'x' }, { giveItem: 'tonic', count: 2 }, { giveShells: 30 }, { takeShells: 12 }], state);
    expect(state.flags.has('x')).toBe(true);
    expect(state.itemCount('tonic')).toBe(2);
    expect(state.shells).toBe(18);
    expect(r.notices).toEqual(['Received 2 Ember Tonics.', 'Received 30 shells.', 'Paid 12 shells.']);
  });

  it('respects how many you can carry', () => {
    const state = new GameState();
    const r = applyEffects([{ giveItem: 'tonic', count: 9 }], state);
    expect(state.itemCount('tonic')).toBe(ITEMS.tonic.stack);
    expect(r.notices[1]).toMatch(/can't carry any more/);
  });

  it('asks for a shop, an encounter, travel or the ending when the conversation closes', () => {
    const state = new GameState();
    expect(applyEffects([{ shop: 'bram' }], state)).toMatchObject({ shop: 'bram', end: true });
    expect(applyEffects([{ encounter: 'ring_trial' }], state)).toMatchObject({ encounter: 'ring_trial', end: true });
    expect(applyEffects([{ travel: 'halls', spawn: 'ante' }], state)).toMatchObject({ travel: { area: 'halls', spawn: 'ante' } });
    expect(applyEffects([{ ending: true }], state)).toMatchObject({ ending: true, end: true });
  });
});

describe('DialogueRunner', () => {
  it('Ina: the first meeting, then the gate opens when you offer to help', () => {
    const state = GameState.newGame();
    const { lines } = play('ina', state, ['Can I help', "I'll go"]);
    expect(lines[0]).toMatch(/A courier, in this weather/);
    expect(state.flags.has('ina_met')).toBe(true);
    expect(state.flags.has('gate_open')).toBe(true);
    expect(lines.some((l) => l.includes('Ren'))).toBe(true); // {player}
    // Next time she remembers.
    expect(play('ina', state).lines[0]).toMatch(/gate's open/);
  });

  it('Bram: shows the shells you have and opens the shop', () => {
    const state = GameState.newGame();
    const { runner, lines } = play('bram', state, ['tonics']);
    expect(lines.some((l) => l.includes(`${state.shells} shells`))).toBe(true);
    expect(runner.shop).toBe('bram');
  });

  it('Wren: the satchel is traded for the Vigor Charm exactly once', () => {
    const state = GameState.newGame();
    play('wren', state, ["I'll look"]);
    expect(state.flags.has('wren_asked')).toBe(true);
    state.addItem('satchel');
    play('wren', state);
    expect(state.itemCount('vigor_charm')).toBe(1);
    expect(state.itemCount('satchel')).toBe(0);
    play('wren', state);
    expect(state.itemCount('vigor_charm')).toBe(1);
  });

  it('effects produce notice pages', () => {
    const state = GameState.newGame();
    const { lines } = play('vault_chest', state);
    expect(lines).toContain('Received Hearth Key.');
    expect(lines).toContain('Received 25 shells.');
  });

  it('greys or hides unavailable choices as configured', () => {
    const dialogue = {
      start: 'q',
      nodes: {
        q: {
          text: 'Pick',
          choices: [
            { text: 'Grey', if: { flag: 'nope' }, unavailable: 'grey', next: 'e' },
            { text: 'Hidden', if: { flag: 'nope' }, next: 'e' },
            { text: 'Never', showIf: { flag: 'nope' }, next: 'e' },
            { text: 'Fine', next: 'e' },
          ],
        },
        e: { text: 'Done', end: true },
      },
    };
    const runner = new DialogueRunner(dialogue, new GameState()).start();
    expect(runner.current?.choices).toEqual([
      { text: 'Grey', enabled: false, index: 0 },
      { text: 'Fine', enabled: true, index: 3 },
    ]);
    runner.choose(0); // greyed: ignored
    expect(runner.current?.text).toBe('Pick');
  });
});

describe('dialogue validator', () => {
  it('accepts every dialogue in the game', () => {
    for (const [id, d] of Object.entries(DIALOGUES)) expect(validateDialogue(id, d, known), id).toEqual([]);
  });

  it('finds missing nodes, unreachable nodes and dead ends', () => {
    const errors = validateDialogue('t', { start: 'a', nodes: { a: { text: 'x', next: 'gone' }, b: { text: 'y' } } }, known);
    expect(errors.join('\n')).toMatch(/missing node "gone"/);
    expect(errors.join('\n')).toMatch(/node "b": can never be reached/);
    expect(errors.join('\n')).toMatch(/node "b": is a dead end/);
  });

  it('finds unknown flags, items, shops, encounters, keys and placeholders', () => {
    const errors = validateDialogue('t', {
      start: 'a',
      nodes: { a: { text: 'Hi {gold}', nxt: 'a', effects: [{ setFlag: 'nope' }, { giveItem: 'potion' }, { shop: 'mara' }, { encounter: 'golem' }, { giveGold: 5 }], end: true } },
    }, known);
    const all = errors.join('\n');
    for (const bit of ['unknown flag "nope"', 'unknown item "potion"', 'unknown shop "mara"', 'unknown encounter "golem"', 'unknown effect "giveGold"', 'unknown key "nxt"', 'unknown placeholder {gold}']) {
      expect(all).toContain(bit);
    }
  });

  it('requires a fallback at the end of a branch list', () => {
    const errors = validateDialogue('t', { start: 'a', nodes: { a: { branch: [{ if: { flag: 'ina_met' }, next: 'b' }] }, b: { text: 'x', end: true } } }, known);
    expect(errors.join('\n')).toMatch(/fallback/);
  });
});
