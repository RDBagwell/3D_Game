import { evaluateCondition, conditionContext } from '../adventure/conditions.js';
import { applyEffects } from '../adventure/effects.js';

/**
 * Ported from Island RPG (RDBagwell/rpg, src/game/dialogue/DialogueRunner.js):
 * the same file format and behaviour, so dialogues move between the two
 * games unchanged. Differences: effects and conditions are this game's
 * (shells, no XP or party), and {shells} replaces {gold}.
 *
 * Plays a dialogue (a JSON file in data/dialogues/) against the game state.
 * It knows nothing about drawing: DialogueBox shows `current` and calls
 * advance() / choose(). That keeps it easy to test.
 *
 * The format is documented in docs/CONTENT.md. In short:
 *
 *   {
 *     "speaker": "Mara",                     default speaker for every node
 *     "start": "hello",
 *     "nodes": {
 *       "hello":  { "text": "Hi, {player}!", "next": "ask" },
 *       "ask":    { "text": "Need anything?", "choices": [
 *                   { "text": "Potions?", "if": { "notFlag": "got_potions" }, "next": "give" },
 *                   { "text": "Bye", "next": "bye" } ] },
 *       "give":   { "text": "Here.", "effects": [ { "giveItem": "potion" }, { "setFlag": "got_potions" } ], "next": "ask" },
 *       "check":  { "branch": [ { "if": { "hasItem": "satchel" }, "next": "thanks" }, { "next": "ask" } ] },
 *       "bye":    { "text": "See you.", "end": true }
 *     }
 *   }
 *
 * A node's effects run when the node is reached; a choice's effects run when
 * it is picked. Messages from effects ("Received Potion.") are shown as
 * extra pages.
 */

/**
 * @typedef {object} DialogueChoice
 * @property {string} text
 * @property {string} [next]
 * @property {Record<string, any>} [if]        requirement: greyed or hidden when false
 * @property {'hide' | 'grey'} [unavailable]   what to do when `if` is false (default 'hide')
 * @property {Record<string, any>} [showIf]    when false the choice is never listed
 * @property {Record<string, any>[]} [effects]
 * @property {boolean} [end]
 */

/**
 * @typedef {object} DialogueNode
 * @property {string | null} [speaker]
 * @property {string} [text]
 * @property {string} [next]
 * @property {DialogueChoice[]} [choices]
 * @property {{ if?: Record<string, any>, next: string }[]} [branch]
 * @property {Record<string, any>[]} [effects]
 * @property {boolean} [end]
 */

/**
 * @typedef {object} Dialogue
 * @property {string} [speaker]
 * @property {string} start
 * @property {Record<string, DialogueNode>} nodes
 */

/**
 * What the dialogue box should show right now.
 * @typedef {object} DialoguePage
 * @property {string | null} speaker
 * @property {string} text
 * @property {{ text: string, enabled: boolean, index: number }[] | null} choices  null = press confirm to continue
 * @property {boolean} notice  true for system messages ("Received Ember Tonic.")
 */

export class DialogueRunner {
  /**
   * @param {Dialogue} dialogue
   * @param {import('../adventure/GameState.js').GameState} state
   * @param {string} [id]  for error messages
   * @param {{ player?: string }} [names]  what {player} becomes
   */
  constructor(dialogue, state, id = 'dialogue', names = {}) {
    this.names = names;
    this.dialogue = dialogue;
    this.state = state;
    this.id = id;
    this.ctx = conditionContext(state);
    /** @type {DialoguePage[]} */
    this.pages = [];
    /** What happens when the pages run out. @type {{ type: 'goto', node: string } | { type: 'end' } | { type: 'choose', node: DialogueNode }} */
    this.after = { type: 'end' };
    this.done = false;
    /** A shop requested by an effect, to open after the conversation. @type {string | null} */
    this.shop = null;
    /** An area to travel to after the conversation. @type {{ area: string, spawn: string } | null} */
    this.travel = null;
    /** A fight to start after the conversation. @type {string | null} */
    this.encounter = null;
    /** The ending plays after the conversation. */
    this.ending = false;
    /** Restore the player's health (an effect asked for it). */
    this.heal = false;
    /** Something changed the game state (flags, items, shells): the world and quests need a look. */
    this.changed = false;
  }

  /** Begin at the start node. */
  start() {
    this.enter(this.dialogue.start);
    this.settle();
    return this;
  }

  /** @returns {DialoguePage | null} */
  get current() {
    return this.done ? null : this.pages[0] ?? null;
  }

  /** Move on from a page without choices. */
  advance() {
    const page = this.current;
    if (!page || page.choices) return;
    this.pages.shift();
    this.settle();
  }

  /**
   * Pick a choice by its index in current.choices.
   * @param {number} index
   */
  choose(index) {
    const page = this.current;
    const option = page?.choices?.find((c) => c.index === index);
    if (!page || !option || !option.enabled || this.after.type !== 'choose') return;
    const choice = this.after.node.choices[index];
    this.pages.shift();
    const result = this.runEffects(choice.effects);
    this.pages.push(...result.pages);
    if (choice.end || result.end || !choice.next) this.after = { type: 'end' };
    else this.after = { type: 'goto', node: choice.next };
    this.settle();
  }

  // ----------------------------------------------------------------- private

  /**
   * Reach a node: follow branches, run effects, queue its pages.
   * @private
   * @param {string} nodeId
   */
  enter(nodeId) {
    let id = nodeId;
    let node = this.node(id);
    // Branch nodes pick where to go; follow them until a real node.
    for (let hops = 0; node.branch; hops++) {
      if (hops > 50) throw new Error(`${this.id}: branch loop at "${id}"`);
      const branchResult = this.runEffects(node.effects);
      this.pages.push(...branchResult.pages);
      if (branchResult.end) {
        this.after = { type: 'end' };
        return;
      }
      const match = node.branch.find((b) => evaluateCondition(b.if, this.ctx));
      if (!match) {
        this.after = { type: 'end' };
        return;
      }
      id = match.next;
      node = this.node(id);
    }

    const result = this.runEffects(node.effects);
    const rawSpeaker = node.speaker !== undefined ? node.speaker : this.dialogue.speaker ?? null;
    const speaker = rawSpeaker ? this.format(rawSpeaker) : rawSpeaker;

    if (node.choices && !result.end) {
      // Effect messages first, then the question with its choices.
      this.pages.push(...result.pages);
      this.pages.push({ speaker, text: node.text ? this.format(node.text) : '', choices: this.visibleChoices(node), notice: false });
      this.after = { type: 'choose', node };
      return;
    }
    // The node's own line, then the messages its effects produced.
    if (node.text) this.pages.push({ speaker, text: this.format(node.text), choices: null, notice: false });
    this.pages.push(...result.pages);
    if (node.end || result.end || !node.next) this.after = { type: 'end' };
    else this.after = { type: 'goto', node: node.next };
  }

  /**
   * Keep entering nodes until there is a page to show or the dialogue ends.
   * @private
   */
  settle() {
    for (let guard = 0; this.pages.length === 0; guard++) {
      if (guard > 100) throw new Error(`${this.id}: dialogue loops without showing any text`);
      if (this.after.type === 'goto') {
        this.enter(this.after.node);
      } else {
        this.done = true;
        return;
      }
    }
  }

  /**
   * @private
   * @param {Record<string, any>[] | undefined} effects
   */
  runEffects(effects) {
    if (effects?.length) this.changed = true;
    const result = applyEffects(effects, this.state);
    if (result.shop) this.shop = result.shop;
    if (result.travel) this.travel = result.travel;
    if (result.encounter) this.encounter = result.encounter;
    if (result.ending) this.ending = true;
    if (result.heal) this.heal = true;
    /** @type {DialoguePage[]} */
    const pages = result.notices.map((text) => ({ speaker: null, text, choices: null, notice: true }));
    return { ...result, pages };
  }

  /**
   * @private
   * @param {DialogueNode} node
   */
  visibleChoices(node) {
    const list = [];
    node.choices.forEach((choice, index) => {
      if (!evaluateCondition(choice.showIf, this.ctx)) return;
      const enabled = evaluateCondition(choice.if, this.ctx);
      if (!enabled && (choice.unavailable ?? 'hide') === 'hide') return;
      list.push({ text: this.format(choice.text), enabled, index });
    });
    return list;
  }

  /**
   * @private
   * @param {string} id
   * @returns {DialogueNode}
   */
  node(id) {
    const node = this.dialogue.nodes[id];
    if (!node) throw new Error(`${this.id}: there is no node "${id}"`);
    return node;
  }

  /**
   * Fill in {player} and {shells}.
   * @private
   * @param {string} text
   */
  format(text) {
    return text
      .replaceAll('{player}', this.names.player ?? 'Ren')
      .replaceAll('{shells}', String(this.state.shells));
  }
}

/** Placeholders allowed in dialogue text. */
export const TEXT_PLACEHOLDERS = ['player', 'shells'];
