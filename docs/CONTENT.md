# Adding content

Everything in the adventure is data in `src/game/data/`: people, what they
say, quests, items, the shop, objects you can open or strike, fights, and
the two areas. Adding an NPC, a quest or a chest never needs engine or game
code. `npm test` checks all of it (`src/game/content/validateContent.js`),
including that every quest can still be finished from a new game.

The dialogue format, the conditions and the effects are **Island RPG's**
(`RDBagwell/rpg`, `docs/CONTENT.md`), ported: a dialogue file moves between
the two games unchanged as long as it only uses keys both know. The
differences are listed at the end.

| File | What's in it |
| --- | --- |
| `data/dialogues/<id>.json` | Conversations (one file each; nothing to register) |
| `data/npcs.js` | Who the villagers are: name, model, dialogue |
| `data/objects.js` | Gates, doors, chests, switches, pickups, hearthstones, the Hearth |
| `data/flags.js` | Every story flag, with what it means |
| `data/items.js` | Items: tonics (quick slot), upgrades, key items |
| `data/quests.js` | The quest log |
| `data/shops.js` | Shops |
| `data/encounters.js` | Fights started from dialogue (Dorran's ring trial) |
| `data/events.js` | What walking into a `trigger_<id>` box does |
| `data/areas/*.js` | The village and the Hearth Halls: layout, and who and what is where |
| `data/actors.js`, `data/attacks.js` | Enemy numbers and frame data |

## 1. Add an NPC

1. A line in `data/npcs.js`:

   ```js
   pell: { name: 'Pell', model: 'npc_rogue', dialogue: 'pell', hide: ['1H_Crossbow', '2H_Crossbow'] },
   ```

   `model` is a character in `MODELS` (`data/assets.js`); `hide` lists the
   accessories to leave off (KayKit characters carry every weapon).
2. A dialogue, `data/dialogues/pell.json` (section 2).
3. Place them. In an area's data: `npcs: [{ id: 'pell', at: [4, 0, 12], yaw: Math.PI }]`;
   or in Blender, an Empty named `npc_pell` (docs/BLENDER.md).

Walk up to them: the prompt says "Talk · Pell". They turn to face you, the
camera frames you both, and the fight is paused while you talk.

## 2. Write a dialogue

A dialogue is a JSON file of **nodes**. Each node is one line (or a
decision) and says what comes next.

```json
{
  "$comment": "Pell, at the market. Anything under $comment is ignored.",
  "speaker": "Pell",
  "start": "greet",
  "nodes": {
    "greet": {
      "branch": [
        { "if": { "notFlag": "pell_met" }, "next": "hello" },
        { "next": "again" }
      ]
    },
    "hello": { "text": "Fresh off the boat? I'm Pell.", "effects": [{ "setFlag": "pell_met" }], "next": "menu" },
    "again": { "text": "Back again, {player}? You've {shells} shells.", "next": "menu" },
    "menu": {
      "text": "What'll it be?",
      "choices": [
        { "text": "Spare a tonic?", "if": { "notFlag": "pell_gave_tonic" }, "next": "gift" },
        { "text": "Buy a map (20 shells)", "if": { "shells": 20 }, "unavailable": "grey", "next": "map" },
        { "text": "I found your key", "showIf": { "hasItem": "pell_key" }, "next": "key" },
        { "text": "Bye", "end": true }
      ]
    },
    "gift": { "text": "Here.", "effects": [{ "giveItem": "tonic" }, { "setFlag": "pell_gave_tonic" }], "next": "menu" },
    "map": { "text": "Pleasure.", "effects": [{ "takeShells": 20 }], "next": "menu" },
    "key": { "text": "My key!", "effects": [{ "takeItem": "pell_key" }, { "giveShells": 30 }], "next": "menu" }
  }
}
```

Add new flags to `data/flags.js` first: the validator rejects unknown ones
(typos are the commonest dialogue bug).

### The rules

**A node** is one of:

| Shape | Keys | What happens |
| --- | --- | --- |
| A line | `text`, `next` | Show the text; Continue goes to `next` |
| A last line | `text`, `"end": true` | Show the text; Continue ends the conversation |
| A question | `text`, `choices` | Show the text, then the choices |
| A decision | `branch` | No text: go to the first entry whose `if` is true. The last entry has no `if` (the fallback) |

Any node can also have `speaker` (overrides the file's; `""` for narration)
and `effects` (changes made when the node is reached).

**A choice** has `text` and `next` or `"end": true`, plus optionally `if` (a
condition: when false the choice is hidden, or greyed out with "(not yet)"
when it has `"unavailable": "grey"`), `showIf` (never listed when false) and
`effects`. At least one choice in every question must have no condition, so
nobody gets stuck.

**Conditions** (in `if`, `showIf`, `branch`, and in quests, objects and events):

| Condition | True when |
| --- | --- |
| `{ "flag": "x" }` / `{ "notFlag": "x" }` | flag x is set / not set |
| `{ "hasItem": "tonic" }` | you carry at least one |
| `{ "hasItem": "tonic", "count": 3 }` | at least 3 |
| `{ "lacksItem": "satchel" }` | none |
| `{ "shells": 20 }` / `{ "shellsBelow": 20 }` | at least / fewer than 20 shells |
| `{ "flag": "a", "hasItem": "b" }` | several keys: **all** must be true |
| `{ "any": [ ... ] }` / `{ "all": [ ... ] }` / `{ "not": { ... } }` | either / all / the opposite |

**Effects** (run top to bottom):

| Effect | Does |
| --- | --- |
| `{ "setFlag": "x" }` / `{ "clearFlag": "x" }` | set / clear a flag |
| `{ "giveItem": "tonic", "count": 2 }` / `{ "takeItem": "satchel" }` | give / take items |
| `{ "giveShells": 25 }` / `{ "takeShells": 12 }` | change shells |
| `{ "heal": true }` | full health |
| `{ "shop": "bram" }` | open a shop when the conversation closes |
| `{ "encounter": "ring_trial" }` | start a fight (`data/encounters.js`) when the conversation closes |
| `{ "travel": "halls", "spawn": "start" }` | go to an area when the conversation closes |
| `{ "ending": true }` | play the ending when the conversation closes |
| `{ "end": true }` | end the conversation after this node |

The player sees "Received Hearth Key." and similar for items and shells, so
you don't write those.

**Text** can use `{player}` (the courier's name) and `{shells}`.

### Checking

`npm test` reports, by file and node: links to missing nodes, nodes that
can't be reached, dead ends, a `branch` with no fallback, unknown flags,
items, shops, encounters and areas, misspelled keys, unknown
`{placeholders}`, and NPCs or objects whose dialogue doesn't exist. Run just
the content checks with `npm run validate`.

## 3. Add an item

In `data/items.js`. Three kinds:

- `consumable`: goes in the quick slot (Use item: **R**, **Y / △**, or the
  Tonic button). `heal` is how much health it restores. Drinking takes
  `PLAYER.drink.frames` (about a second) and heals at `effectFrame`; a hit
  before then spills it. Give it a `price` to sell it.
- `upgrade`: always on while carried. `maxHp` adds health, `damage`
  multiplies the sword's damage. This is how you get stronger: there are no
  levels or experience (README, "Why no XP").
- `key`: for doors, quests and conditions. Never sold.

## 4. Add a quest

In `data/quests.js`. A quest only *describes* progress; flags and items
drive it:

```js
map: {
  name: 'A Map for Pell',
  stages: [
    { when: { flag: 'pell_met' }, text: 'Pell wants a map of the halls.' },
    { when: { hasItem: 'halls_map' }, text: 'You have a map. Bring it to Pell.' },
  ],
  done: { flag: 'pell_map_given' },
  doneText: 'Pell has his map.',
},
```

The log (pause menu → **Quests**) shows the last stage whose `when` is true,
or `doneText` once `done` is. Each new stage shows a "Quest updated" notice.
`main: true` lists it first. The validator checks that `done` and every
stage can actually be reached from a new game.

## 5. Add an object

In `data/objects.js`, then place it with `object_<id>` (Blender) or in an
area's `objects`. Types:

| Type | Behaviour |
| --- | --- |
| `gate` | A portcullis (`model`), an empty archway once `openIf` is true (`openModel`). Solid while closed |
| `door` | A doorway whose door swings open when `openIf` is true. Solid while closed |
| `chest` | Its lid lifts when `openIf` is true; usable until then |
| `switch` | A crystal: striking it with the sword runs `hitEffects` (once: until `openIf` is true) |
| `pickup` | A thing on the ground with a glint; `showIf` decides when it's there |
| `hearthstone` | Walking near it makes it your checkpoint (`checkpoint`: a spawn name in the area) and heals you |
| `hearth` | The cold Hearth: usable until lit |

`dialogue` is played when you use it (`prompt` is the verb: "Open",
"Unlock", "Examine"). That's where a door checks for its key and a chest
gives its contents: the same conditions and effects as any conversation.

**Gating for the reachability check:** anything placed behind a gate or
door gets `behind: '<object id>'` in the area data, so the validator knows
it can only be reached once that object is open. (The walls do the actual
blocking; `tests/world.test.js` checks that closed gates block the way.)

## 6. Add a fight

`data/encounters.js`: waves of enemies that appear at `marker_<name>`
points, started from dialogue with `{ "encounter": "<id>" }`. When the last
wave falls its `win` effects run. Enemies placed in an area
(`spawn_enemy_<type>_<name>`) can also have `defeat` effects (the Warden
leaves the Hearth Ember) and `unless` (a beaten boss stays beaten).

## 7. Add a trigger event

Place a `trigger_<id>` box, and add the event in `data/events.js`:

```js
arena: { if: { notFlag: 'warden_defeated' }, once: 'warden_seen', banner: 'Something huge stands guard.' },
```

`if` gates it, `once` names a flag that is set when it runs (so it runs
once), `banner` is shown, `effects` are applied.

## 8. Add an area

1. `data/areas/<id>.js` (see `village.js` and `halls.js`; the format is
   documented in `src/game/world/buildArea.js`), listed in
   `data/areas/index.js`.
2. Exits: `exits: [{ to: 'village', spawn: 'gate', at, size }]`, and an exit
   back. The validator checks both ends.
3. Or build it in Blender with the same names (docs/BLENDER.md).

## Differences from Island RPG

| Island RPG | Here |
| --- | --- |
| `gold`, `goldBelow`, `giveGold`, `takeGold`, `{gold}` | `shells`, `shellsBelow`, `giveShells`, `takeShells`, `{shells}` |
| `level`, `levelBelow`, `giveXp`, `inParty`, `joinParty` | none: no levels, no party |
| `battle` | `encounter` (a real-time fight in the area) |
| `travel` to a Tiled map | `travel` to an area |
| none | `ending` |
| Events with `dialogue` | Events with `banner`; objects open dialogues instead |
