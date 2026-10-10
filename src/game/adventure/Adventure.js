import { EventBus } from '../../engine/index.js';
import { Sandbox } from '../sim/Sandbox.js';
import { PLAYER, ENEMIES } from '../data/actors.js';
import { AREAS } from '../data/areas/index.js';
import { NPCS } from '../data/npcs.js';
import { OBJECTS } from '../data/objects.js';
import { ITEMS } from '../data/items.js';
import { QUESTS } from '../data/quests.js';
import { EVENTS } from '../data/events.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { DIALOGUES } from '../data/dialogues/index.js';
import { DialogueRunner } from '../dialogue/DialogueRunner.js';
import { conditionContext, evaluateCondition } from './conditions.js';
import { applyEffects } from './effects.js';

/**
 * The adventure: the game's rules on top of the simulation. It owns the
 * GameState and the current area's Sandbox, and turns what happens in the
 * sandbox into progress:
 *
 *   walking into an exit       → 'travel' (the game fades and calls enter())
 *   walking into a trigger     → its event (data/events.js): a banner, effects
 *   reaching a hearthstone     → the checkpoint moves there ('checkpoint')
 *   pressing Interact          → 'dialogue': the game opens the box and plays
 *                                talk(); finish() applies what it asked for
 *                                (a shop, an encounter, travel, the ending)
 *   striking a switch          → its effects
 *   beating an enemy           → shells, and its `defeat` effects (the boss)
 *   drinking from the quick slot → a tonic used, health restored
 *   falling in battle          → 'died'; respawn() returns you to the checkpoint
 *
 * After any change it brings objects up to date with the flags (refresh) and
 * announces quest progress ('quest'). Everything is data-driven: no NPC,
 * object, item or quest has code of its own.
 *
 * It runs headless (no drawing), so whole playthroughs are tested in Node
 * (tests/adventure.test.js).
 */
export class Adventure {
  /**
   * @param {import('./GameState.js').GameState} state
   * @param {object} [options]
   * @param {() => import('../feel/feelSettings.js').FeelValues} [options.feel]
   * @param {Record<string, any>} [options.models]
   * @param {string} [options.playerName]  what {player} becomes in dialogue
   */
  constructor(state, { feel, models, playerName = 'Ren' } = {}) {
    this.state = state;
    this.getFeel = feel;
    this.models = models;
    this.playerName = playerName;
    /** Higher-level events for the game and UI. */
    this.events = new EventBus();
    /** @type {Sandbox | null} */
    this.sandbox = null;
    this.ctx = conditionContext(state);
    /** Areas built ahead of time (preloading the next area). @type {Map<string, import('three').Object3D>} */
    this.prepared = new Map();
    /** The conversation in progress. @type {{ runner: DialogueRunner, npc: string | null } | null} */
    this.talking = null;
    /** The fight in progress (Dorran's trial). @type {{ id: string, wave: number, foes: any[] } | null} */
    this.encounter = null;
    /** Multiplies damage the player takes (Settings → difficulty). */
    this.damageTaken = 1;
    // Quests already under way when the game is loaded don't announce themselves again.
    this.checkQuests(true);
  }

  /** @returns {import('../world/buildArea.js').AreaDef} */
  get area() {
    return AREAS[/** @type {keyof typeof AREAS} */ (this.state.area)];
  }

  /**
   * Go to an area (a new game, an exit, a respawn, a loaded save).
   * @param {string} areaId
   * @param {string} [spawn='start']
   * @returns {Promise<Sandbox>}
   */
  async enter(areaId, spawn = 'start') {
    const def = AREAS[/** @type {keyof typeof AREAS} */ (areaId)];
    if (!def) throw new Error(`No area "${areaId}"`);
    this.sandbox?.dispose();
    this.encounter = null;
    this.talking = null;
    const levelRoot = this.prepared.get(areaId);
    this.prepared.delete(areaId);
    const rules = Object.fromEntries((def.enemies ?? []).map((e) => [e.name, e]));
    const sandbox = await Sandbox.create({
      area: def,
      levelRoot,
      models: this.models,
      spawn,
      feel: this.getFeel?.(),
      seed: `${areaId}:${spawn}`,
      // Beaten enemies stay beaten (in this area, after a reload, after a
      // fall); `unless` can also keep one away.
      spawnEnemy: (s) => !this.state.isDefeated(def.id, s.name) && (!rules[s.name]?.unless || !evaluateCondition(rules[s.name].unless, this.ctx)),
      respawnPlayer: false,
    });
    this.sandbox = sandbox;
    this.state.area = areaId;
    this.state.spawn = spawn;
    sandbox.canUseItem = () => this.state.itemCount('tonic') > 0 && sandbox.player.hp < sandbox.player.maxHp;
    sandbox.damageTaken = this.damageTaken;
    this.applyUpgrades(true);
    this.refresh();
    this.listen(sandbox);
    return sandbox;
  }

  /**
   * Pick up a loaded game: its area, and where you stood if you saved there.
   */
  async resume() {
    const s = this.state;
    const sb = await this.enter(s.area, s.spawn);
    if (s.position) {
      sb.player.body.teleport?.({ x: s.position.x, y: s.position.y, z: s.position.z });
      sb.player.facing = s.position.yaw;
      sb.camera.reset(sb.player.position, s.position.yaw);
      sb.inExit = sb.level.exitAt(sb.player.position) ? 'start' : null;
      s.position = null;
    }
    return sb;
  }

  /**
   * What to save: the state, and with `here`, exactly where the player stands.
   * @param {boolean} [here]
   */
  saveData(here = false) {
    const data = this.state.toSaveData();
    const p = this.sandbox?.player;
    if (here && p?.alive) return { ...data, position: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.facing } };
    return data;
  }

  /** Back to the last checkpoint after falling, at full health, with everything you had. */
  respawn() {
    const c = this.state.checkpoint;
    return this.enter(c.area, c.spawn);
  }

  /**
   * One fixed step of play.
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   * @param {number} dt
   */
  step(frame, dt) {
    this.state.playTime += dt;
    if (!this.sandbox) return;
    this.sandbox.step(frame);
    if (this.encounter) this.updateEncounter();
  }

  /** Upgrades are items: more health and a sharper sword while you carry them. */
  applyUpgrades(fill = false) {
    const player = this.sandbox?.player;
    if (!player) return;
    let maxHp = PLAYER.maxHp;
    let damage = 1;
    for (const [id, count] of this.state.items) {
      const item = ITEMS[id];
      if (!item || item.type !== 'upgrade' || count <= 0) continue;
      maxHp += item.maxHp ?? 0;
      damage *= item.damage ?? 1;
    }
    const gained = maxHp - player.maxHp;
    player.maxHp = maxHp;
    player.damageScale = damage;
    player.hp = fill ? maxHp : Math.min(maxHp, player.hp + Math.max(0, gained));
  }

  /** Bring every object in the area up to date with the flags. */
  refresh() {
    const sb = this.sandbox;
    if (!sb) return;
    for (const o of sb.objects) {
      const def = OBJECTS[o.id];
      // (A breakable's state is the fight's, not the flags': a smashed pillar stays smashed.)
      const open = def.type === 'breakable' ? o.open : def.openIf ? evaluateCondition(def.openIf, this.ctx) : false;
      const hidden = def.showIf ? !evaluateCondition(def.showIf, this.ctx) : false;
      // Gates, doors, chests and switches can be used while closed; pickups and the Hearth while there.
      const usable = (def.dialogue || def.hitEffects) && !(open && def.type !== 'hearth') && !(def.type === 'hearth' && open);
      sb.setObject(o.id, { open, hidden, prompt: usable ? def.prompt ?? 'Examine' : null });
    }
    this.events.emit('refresh', {});
  }

  /** Announce every quest under way as new (the start of a new game). */
  announceQuests() {
    for (const [id, quest] of Object.entries(QUESTS)) {
      const stage = this.state.questStages[id] ?? -1;
      if (stage >= 0 && stage < quest.stages.length) this.events.emit('quest', { id, name: quest.name, text: quest.stages[stage].text, status: 'new' });
    }
  }

  /**
   * Announce quests that moved on since last time ('quest' events).
   * @param {boolean} [silent]  just remember where they are (loading a save)
   */
  checkQuests(silent = false) {
    const seen = this.state.questStages;
    for (const [id, quest] of Object.entries(QUESTS)) {
      const done = evaluateCondition(quest.done, this.ctx);
      let stage = -1;
      quest.stages.forEach((s, i) => {
        if (evaluateCondition(s.when, this.ctx)) stage = i;
      });
      const now = done ? quest.stages.length : stage;
      const before = seen[id] ?? -1;
      if (now === before) continue;
      seen[id] = now;
      if (silent || now < before) continue;
      if (done) this.events.emit('quest', { id, name: quest.name, text: quest.doneText, status: 'done' });
      else if (before === -1) this.events.emit('quest', { id, name: quest.name, text: quest.stages[now].text, status: 'new' });
      else this.events.emit('quest', { id, name: quest.name, text: quest.stages[now].text, status: 'updated' });
    }
  }

  /**
   * Run effects (a switch, an encounter, an event, a defeat) and announce what changed.
   * @param {Record<string, any>[] | undefined} effects
   */
  apply(effects) {
    const result = applyEffects(effects, this.state);
    if (result.heal && this.sandbox) this.sandbox.player.hp = this.sandbox.player.maxHp;
    for (const text of result.notices) this.events.emit('notice', { text });
    this.afterChange();
    return result;
  }

  /** @private The state changed: objects, upgrades, quests. */
  afterChange() {
    this.applyUpgrades();
    this.refresh();
    this.checkQuests();
  }

  // ------------------------------------------------------------------ conversations

  /**
   * Start a conversation (the game shows it). NPCs turn to face you.
   * @param {string} id  dialogue id
   * @param {string | null} [npc]
   */
  talk(id, npc = null) {
    const dialogue = DIALOGUES[id];
    if (!dialogue) throw new Error(`No dialogue "${id}"`);
    const runner = new DialogueRunner(dialogue, this.state, id, { player: this.playerName }).start();
    this.talking = { runner, npc };
    const n = this.sandbox?.npcs.find((x) => x.id === npc);
    if (n) n.talking = true;
    this.sandbox?.setLock(null);
    return runner;
  }

  /**
   * The conversation is over: apply what it asked for, in the game's order.
   * @returns {{ shop: string | null, travel: { area: string, spawn: string } | null, ending: boolean }}
   */
  finish() {
    const t = this.talking;
    this.talking = null;
    if (!t) return { shop: null, travel: null, ending: false };
    const n = this.sandbox?.npcs.find((x) => x.id === t.npc);
    if (n) n.talking = false;
    const r = t.runner;
    if (r.heal && this.sandbox) this.sandbox.player.hp = this.sandbox.player.maxHp;
    if (r.changed) this.afterChange();
    if (r.encounter) this.startEncounter(r.encounter);
    return { shop: r.shop, travel: r.travel, ending: r.ending };
  }

  /** Keep the camera on the conversation and NPCs turning (the fight is paused while talking). */
  talkStep() {
    const sb = this.sandbox;
    const t = this.talking;
    if (!sb || !t) return;
    const npc = sb.npcs.find((x) => x.id === t.npc);
    sb.frameTalk(npc ? npc.position : null);
  }

  // ------------------------------------------------------------------ encounters

  /** @param {string} id */
  startEncounter(id) {
    const enc = ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (id)];
    if (!enc || !this.sandbox || enc.area !== this.state.area) return;
    this.encounter = { id, wave: -1, foes: [] };
    if (enc.intro) this.events.emit('banner', { text: enc.intro });
    this.events.emit('encounter', { id, status: 'start' });
    this.nextWave();
  }

  /** @private */
  nextWave() {
    const e = /** @type {NonNullable<Adventure['encounter']>} */ (this.encounter);
    const sb = /** @type {Sandbox} */ (this.sandbox);
    const enc = ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (e.id)];
    e.wave++;
    e.foes = enc.waves[e.wave].map((f, i) => {
      const at = sb.level.markers[f.at];
      return sb.spawnFoe(f.type, `${e.id}_${e.wave}_${i}`, { x: at.x, y: at.y, z: at.z }, 0);
    }).filter(Boolean);
    // They've been waiting in the pens: they know where you are.
    for (const foe of e.foes) foe.brain.aware = true;
    if (e.wave > 0) this.events.emit('banner', { text: `Wave ${e.wave + 1}!` });
  }

  /** @private */
  updateEncounter() {
    const e = /** @type {NonNullable<Adventure['encounter']>} */ (this.encounter);
    if (e.foes.some((f) => f.alive)) return;
    const enc = ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (e.id)];
    if (e.wave + 1 < enc.waves.length) return void this.nextWave();
    this.encounter = null;
    if (enc.outro) this.events.emit('banner', { text: enc.outro });
    this.events.emit('encounter', { id: e.id, status: 'won' });
    this.apply(enc.win);
  }

  // ------------------------------------------------------------------ the simulation's events

  /**
   * @private
   * @param {Sandbox} sb
   */
  listen(sb) {
    sb.events.on('exit', (e) => this.events.emit('travel', { area: e.area, spawn: e.spawn }));
    sb.events.on('triggerEnter', (e) => this.runEvent(e.id));
    sb.events.on('touch', (e) => {
      const def = OBJECTS[e.id];
      if (def?.type !== 'hearthstone' || !def.checkpoint) return;
      const c = this.state.checkpoint;
      const fresh = c.area !== this.state.area || c.spawn !== def.checkpoint;
      this.state.checkpoint = { area: this.state.area, spawn: def.checkpoint };
      // A reload starts here too.
      this.state.spawn = def.checkpoint;
      sb.player.hp = sb.player.maxHp;
      this.events.emit('checkpoint', { id: e.id, fresh });
    });
    sb.events.on('interact', (e) => {
      if (e.kind === 'npc') {
        const npc = NPCS[/** @type {keyof typeof NPCS} */ (e.id)];
        this.events.emit('dialogue', { id: npc.dialogue, npc: e.id });
      } else {
        const def = OBJECTS[e.id];
        if (def.dialogue) this.events.emit('dialogue', { id: def.dialogue, npc: null, object: e.id });
      }
    });
    sb.events.on('objectHit', (e) => {
      const def = OBJECTS[e.id];
      const open = def.openIf ? evaluateCondition(def.openIf, this.ctx) : false;
      if (open || !def.hitEffects) return;
      this.apply(def.hitEffects);
      this.events.emit('switched', { id: e.id, point: e.point });
    });
    sb.events.on('hit', (e) => {
      if (!e.killed || e.target === sb.player || e.target.kind === 'dummy') return;
      const foe = e.target;
      const shells = /** @type {Record<string, { shells?: number }>} */ (ENEMIES)[foe.kind]?.shells ?? 0;
      if (shells > 0) {
        this.state.shells += shells;
        this.events.emit('shells', { amount: shells, position: { ...foe.position } });
      }
      const rule = (this.area.enemies ?? []).find((x) => x.name === foe.spawnName);
      // Only the area's own enemies are remembered (not a trial's waves or a boss's summons).
      if (rule) this.state.defeated.add(`${this.area.id}:${rule.name}`);
      if (rule?.defeat) this.apply(rule.defeat);
    });
    sb.events.on('useItem', () => {
      if (!this.state.removeItem('tonic')) return;
      const heal = ITEMS.tonic.heal ?? 0;
      sb.player.hp = Math.min(sb.player.maxHp, sb.player.hp + heal);
      this.events.emit('healed', { amount: heal, left: this.state.itemCount('tonic') });
    });
    let refusedAt = -Infinity;
    sb.events.on('useItemRefused', () => {
      // One message for a burst of presses.
      if (sb.tick - refusedAt < 90) return;
      refusedAt = sb.tick;
      const text = this.state.itemCount('tonic') === 0 ? 'No tonics left. Bram sells them in the village.' : "You're already at full vigor.";
      this.events.emit('notice', { text });
    });
    sb.events.on('drinkSpilled', () => this.events.emit('notice', { text: 'Spilled! The tonic is still in your bag.' }));
    sb.events.on('died', (d) => {
      if (d.who !== sb.player) return;
      if (this.encounter) this.events.emit('encounter', { id: this.encounter.id, status: 'lost' });
      this.encounter = null;
      this.events.emit('died', {});
    });
  }

  /**
   * A trigger's event (data/events.js).
   * @param {string} id
   */
  runEvent(id) {
    const ev = EVENTS[/** @type {keyof typeof EVENTS} */ (id)];
    if (!ev) return;
    if (ev.if && !evaluateCondition(ev.if, this.ctx)) return;
    if (ev.once) {
      if (this.state.flags.has(ev.once)) return;
      this.state.flags.add(ev.once);
    }
    if (ev.banner) this.events.emit('banner', { text: ev.banner });
    if (ev.effects) this.apply(ev.effects);
  }

  /**
   * Build an area's scene ahead of time, so walking into its exit is quick.
   * @param {string} areaId
   * @param {(id: string) => import('three').Object3D} build
   */
  prepare(areaId, build) {
    if (!this.prepared.has(areaId)) this.prepared.set(areaId, build(areaId));
    return /** @type {import('three').Object3D} */ (this.prepared.get(areaId));
  }

  dispose() {
    this.sandbox?.dispose();
    this.sandbox = null;
    this.events.clear();
  }
}
