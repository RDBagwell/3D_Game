import { describe, it, expect } from 'vitest';
import { validateContent } from '../src/game/content/validateContent.js';
import { DIALOGUES } from '../src/game/data/dialogues/index.js';
import { FLAGS } from '../src/game/data/flags.js';
import { ITEMS, START_ITEMS } from '../src/game/data/items.js';
import { QUESTS } from '../src/game/data/quests.js';
import { SHOPS } from '../src/game/data/shops.js';
import { ENCOUNTERS } from '../src/game/data/encounters.js';
import { EVENTS } from '../src/game/data/events.js';
import { NPCS } from '../src/game/data/npcs.js';
import { OBJECTS } from '../src/game/data/objects.js';
import { AREAS, START } from '../src/game/data/areas/index.js';
import { ENEMIES } from '../src/game/data/actors.js';
import { MODELS } from '../src/game/data/assets.js';

/**
 * The content validator (src/game/content/validateContent.js): dialogues,
 * quests, items, shops, events, encounters, NPCs, objects and areas, and a
 * check that every quest can be completed from a new game.
 */

const content = {
  dialogues: DIALOGUES,
  flags: FLAGS,
  items: ITEMS,
  quests: QUESTS,
  shops: SHOPS,
  encounters: ENCOUNTERS,
  events: EVENTS,
  npcs: NPCS,
  objects: OBJECTS,
  areas: AREAS,
  enemies: ENEMIES,
  models: MODELS,
  start: START,
  startItems: START_ITEMS,
};

describe('content', () => {
  it('is all valid, and every quest can be completed', () => {
    const errors = validateContent(content);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('has the dialogues the story needs', () => {
    for (const id of ['ina', 'bram', 'wren', 'dorran', 'hearth', 'ending']) expect(DIALOGUES[id], id).toBeTruthy();
  });

  it('catches a typo in a flag, an NPC with no dialogue, and an unreachable quest', () => {
    const broken = structuredClone({ ...content, areas: undefined, dialogues: undefined });
    const dialogues = structuredClone(DIALOGUES);
    dialogues.wren.nodes.found.effects[2] = { setFlag: 'satchel_retruned' };
    const npcs = { ...NPCS, ghost: { name: 'Ghost', model: 'npc_mage', dialogue: 'ghost' } };
    const quests = { ...QUESTS, impossible: { name: 'Impossible', stages: [{ when: { flag: 'hearth_lit' }, text: 'x' }], done: { all: [{ flag: 'hearth_lit' }, { notFlag: 'hearth_lit' }] }, doneText: 'x' } };
    const errors = validateContent({ ...content, ...broken, areas: AREAS, dialogues, npcs, quests: QUESTS });
    expect(errors.join('\n')).toMatch(/unknown flag "satchel_retruned"/);
    expect(errors.join('\n')).toMatch(/npc "ghost": unknown dialogue "ghost"/);
    const unreachable = validateContent({ ...content, quests });
    expect(unreachable.join('\n')).toMatch(/quest "impossible" .* can't be completed/);
  });

  it('catches an NPC placed in an area that does not exist in data', () => {
    const areas = { ...AREAS, village: { ...AREAS.village, npcs: [...(AREAS.village.npcs ?? []), { id: 'nobody', at: /** @type {[number, number, number]} */ ([0, 0, 0]) }] } };
    expect(validateContent({ ...content, areas }).join('\n')).toMatch(/npc "nobody": no such NPC/);
  });
});
