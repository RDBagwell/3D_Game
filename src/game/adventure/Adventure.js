import { EventBus } from '../../engine/index.js';
import { Sandbox } from '../sim/Sandbox.js';
import { AREAS } from '../data/areas/index.js';
import { NPCS } from '../data/npcs.js';
import { OBJECTS } from '../data/objects.js';
import { conditionContext, evaluateCondition } from './conditions.js';
import { applyEffects } from './effects.js';

/**
 * The adventure: the game's rules on top of the simulation. It owns the
 * GameState and the current area's Sandbox, and turns what happens in the
 * sandbox into progress:
 *
 *   walking into an exit       → 'travel' (the game fades and calls enter())
 *   reaching a hearthstone     → the checkpoint moves there ('checkpoint')
 *   pressing Interact          → 'dialogue' with an NPC's or object's dialogue
 *   striking a switch          → its effects ('notice')
 *   falling in battle          → 'died'; respawn() returns you to the checkpoint
 *
 * Objects look the way the flags say (OBJECTS[id].openIf / showIf), checked
 * again after every change. Everything here is data-driven: no NPC, object or
 * quest has code of its own.
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
   */
  constructor(state, { feel, models } = {}) {
    this.state = state;
    this.getFeel = feel;
    this.models = models;
    /** Higher-level events for the game and UI. */
    this.events = new EventBus();
    /** @type {Sandbox | null} */
    this.sandbox = null;
    this.ctx = conditionContext(state);
    /** Areas built ahead of time (preloading the next area). @type {Map<string, import('three').Object3D>} */
    this.prepared = new Map();
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
    const levelRoot = this.prepared.get(areaId);
    this.prepared.delete(areaId);
    const enemyRules = Object.fromEntries((def.enemies ?? []).map((e) => [e.name, e]));
    const sandbox = await Sandbox.create({
      area: def,
      levelRoot,
      models: this.models,
      spawn,
      feel: this.getFeel?.(),
      seed: `${areaId}:${spawn}`,
      spawnEnemy: (s) => {
        // A beaten boss stays beaten: `unless` names the flag that keeps it away.
        const unless = enemyRules[s.name]?.unless;
        return !unless || !evaluateCondition(unless, this.ctx);
      },
      respawnPlayer: false,
    });
    this.sandbox = sandbox;
    this.state.area = areaId;
    this.state.spawn = spawn;
    this.refresh();
    this.listen(sandbox);
    return sandbox;
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
    this.sandbox?.step(frame);
  }

  /** Bring every object and NPC in the area up to date with the flags. */
  refresh() {
    const sb = this.sandbox;
    if (!sb) return;
    for (const o of sb.objects) {
      const def = OBJECTS[o.id];
      const open = def.openIf ? evaluateCondition(def.openIf, this.ctx) : false;
      const hidden = def.showIf ? !evaluateCondition(def.showIf, this.ctx) : false;
      // Gates, doors and chests can be used while closed; pickups and hearths while they're there.
      const prompt = def.dialogue && !(open && def.type !== 'hearth') ? def.prompt ?? 'Examine' : null;
      sb.setObject(o.id, { open, hidden, prompt: def.type === 'hearth' && open ? null : prompt });
    }
    this.events.emit('refresh', {});
  }

  /**
   * Run effects (from a switch, an encounter, a dialogue) and announce what changed.
   * @param {Record<string, any>[] | undefined} effects
   */
  apply(effects) {
    const result = applyEffects(effects, this.state);
    if (result.heal && this.sandbox) this.sandbox.player.hp = this.sandbox.player.maxHp;
    for (const text of result.notices) this.events.emit('notice', { text });
    this.refresh();
    return result;
  }

  /**
   * @private
   * @param {Sandbox} sb
   */
  listen(sb) {
    sb.events.on('exit', (e) => this.events.emit('travel', { area: e.area, spawn: e.spawn }));
    sb.events.on('touch', (e) => {
      const def = OBJECTS[e.id];
      if (def?.type !== 'hearthstone' || !def.checkpoint) return;
      const c = this.state.checkpoint;
      const fresh = c.area !== this.state.area || c.spawn !== def.checkpoint;
      this.state.checkpoint = { area: this.state.area, spawn: def.checkpoint };
      sb.player.hp = sb.player.maxHp;
      this.events.emit('checkpoint', { id: e.id, fresh });
    });
    sb.events.on('interact', (e) => {
      if (e.kind === 'npc') {
        const npc = NPCS[/** @type {keyof typeof NPCS} */ (e.id)];
        this.events.emit('dialogue', { id: npc.dialogue, npc: e.id });
      } else {
        const def = OBJECTS[e.id];
        if (def.dialogue) this.events.emit('dialogue', { id: def.dialogue, object: e.id });
      }
    });
    sb.events.on('objectHit', (e) => {
      const def = OBJECTS[e.id];
      const open = def.openIf ? evaluateCondition(def.openIf, this.ctx) : false;
      if (open || !def.hitEffects) return;
      this.apply(def.hitEffects);
      this.events.emit('switched', { id: e.id, point: e.point });
    });
    sb.events.on('died', (d) => {
      if (d.who === sb.player) this.events.emit('died', {});
    });
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
