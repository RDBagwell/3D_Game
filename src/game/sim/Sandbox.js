import { createPhysics, Level, EventBus, InputBuffer, FollowCamera, Rng, button, yawFromDirection, approachAngle, angleDelta } from '../../engine/index.js';
import { TICK } from '../config.js';
import { PLAYER, ENEMIES } from '../data/actors.js';
import { Player } from '../player/Player.js';
import { Grunt } from '../enemies/Grunt.js';
import { Dummy } from '../enemies/Dummy.js';
import { resolveSwing, attackPhase, hitSpheresAt } from '../combat/hitboxes.js';
import { selectTarget, switchTarget, shouldBreakLock } from '../combat/lockOn.js';
import { defaultFeel } from '../feel/feelSettings.js';
import { buildArea } from '../world/buildArea.js';
import { AREAS } from '../data/areas/index.js';
import { NPCS, TALK_RANGE } from '../data/npcs.js';
import { OBJECTS, USE_RANGE, HEARTHSTONE_RANGE } from '../data/objects.js';

/**
 * The whole simulation of one area, advanced one fixed step at a time by
 * `step(inputFrame)`. It owns the physics world, the level, the player, the
 * enemies, the people and objects in the area, the camera's simulated state,
 * lock-on and combat.
 *
 * It never draws or plays sound. It emits events ('hit', 'block', 'dodge',
 * 'swing', 'footstep', 'windup', 'lockOn'...) that the presentation layer
 * (src/game/view/) turns into pictures, particles and sound. So the same
 * simulation runs in the browser and in Node for tests, and two runs fed the
 * same InputFrames produce the same fight, bit for bit.
 *
 * Order of one step:
 *   1. record button presses in the input buffer
 *   2. remember positions (for interpolated drawing)
 *   3. if hit-stop is running: count it down and only move the camera
 *   4. lock-on: acquire, release, switch, break
 *   5. player, then enemies, decide and move (character controller)
 *   6. physics step
 *   7. hitboxes against hurtboxes: hits, blocks, dodges, hit-stop
 *   8. camera, triggers, exits, what the player can interact with, respawns
 *
 * Areas: a village, a dungeon, the training grounds (src/game/data/areas/).
 * The adventure layer (src/game/adventure/) decides what objects look like
 * and what talking or opening does; the sandbox only knows where things are,
 * what is solid, and when the player reaches, strikes or uses them
 * ('interact', 'objectHit', 'touch', 'exit').
 */

/** Actions recorded in the input buffer. */
const BUFFERED = ['attack', 'roll'];

export class Sandbox {
  /**
   * Build an area and everything in it.
   * @param {object} [options]
   * @param {string | import('../world/buildArea.js').AreaDef} [options.area='training']
   * @param {import('three').Object3D} [options.levelRoot]  an already built scene for the area (a preload, or a Blender export)
   * @param {Record<string, any>} [options.models]  loaded glTFs (the scene's props; none in tests)
   * @param {string} [options.spawn='start']  spawn_player_<name> to start at
   * @param {import('../feel/feelSettings.js').FeelValues} [options.feel]
   * @param {number | string} [options.seed='island']
   * @param {boolean} [options.grunts=true]  false: no enemies but dummies (some tests)
   * @param {(spawn: { type: string, name: string }) => boolean} [options.spawnEnemy]  false skips an enemy (a beaten boss)
   * @param {boolean} [options.respawnPlayer]  the sandbox revives the player itself (default: where enemies respawn too)
   */
  static async create({ area = 'training', levelRoot, models, spawn = 'start', feel, seed = 'island', grunts = true, spawnEnemy, respawnPlayer } = {}) {
    const physics = await createPhysics();
    const def = typeof area === 'string' ? AREAS[/** @type {keyof typeof AREAS} */ (area)] : area;
    if (!def) throw new Error(`No area "${area}"`);
    const root = levelRoot ?? buildArea(def, models);
    const level = Level.fromScene(root, physics, { defaultSurface: def.defaultSurface });
    return new Sandbox(physics, level, {
      feel: feel ?? defaultFeel(),
      seed,
      grunts,
      area: def,
      spawn,
      spawnEnemy: spawnEnemy ?? (() => true),
      respawnPlayer: respawnPlayer ?? Boolean(def.respawnEnemies),
    });
  }

  /**
   * @param {import('../../engine/index.js').Physics} physics
   * @param {Level} level
   * @param {object} o
   * @param {import('../feel/feelSettings.js').FeelValues} o.feel
   * @param {number | string} o.seed
   * @param {boolean} o.grunts
   * @param {import('../world/buildArea.js').AreaDef} o.area
   * @param {string} o.spawn
   * @param {(s: { type: string, name: string }) => boolean} o.spawnEnemy
   * @param {boolean} o.respawnPlayer
   */
  constructor(physics, level, { feel, seed, grunts, area, spawn, spawnEnemy, respawnPlayer }) {
    this.physics = physics;
    this.level = level;
    this.area = area;
    this.events = new EventBus();
    this.rng = new Rng(seed);
    this.buffer = new InputBuffer(120);
    this.tick = 0;
    /** Updates left in the current hit-stop freeze. */
    this.hitstop = 0;
    /** @type {string | null} which grunt may attack right now */
    this.attackToken = null;
    this.feel = feel;
    this.respawnPlayer = respawnPlayer;
    this.disposed = false;
    this.camera = new FollowCamera({ probe: (o, d, max, r) => physics.sphereCast(o, d, max, r) });

    const start = level.spawns.player[spawn] ?? level.spawns.player.start ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    this.playerSpawn = start;
    const body = physics.createCharacter({ position: start.position, radius: PLAYER.radius, height: PLAYER.height });
    this.player = new Player(body, { yaw: start.yaw });

    /** Enemies that fight. @type {Grunt[]} */
    this.foes = [];
    /** @type {Dummy[]} */
    this.dummies = [];
    for (const s of level.spawns.enemies) {
      if (!spawnEnemy(s)) continue;
      if (s.type === 'dummy') {
        this.dummies.push(new Dummy(`dummy_${s.name}`, s.position, s.yaw));
        physics.addStaticBox({ x: 0.1, y: 0.6, z: 0.1 }, { x: s.position.x, y: s.position.y + 0.6, z: s.position.z });
      } else if (grunts) {
        this.spawnFoe(s.type, s.name, s.position, s.yaw);
      }
    }

    /** People to talk to: where they stand and which way they face. @type {SimNpc[]} */
    this.npcs = level.npcs
      .filter((p) => Object.hasOwn(NPCS, p.id))
      .map((p) => {
        physics.addStaticBox({ x: 0.3, y: 0.85, z: 0.3 }, { x: p.position.x, y: p.position.y + 0.85, z: p.position.z });
        return { id: p.id, kind: 'npc', position: { x: p.position.x, y: p.position.y, z: p.position.z }, facing: p.yaw, homeYaw: p.yaw, talking: false, hidden: false };
      });

    /**
     * Interactive objects. The adventure layer sets `open`, `hidden` and
     * `prompt` from the game's flags (setObject); the sandbox keeps their
     * collision in step.
     * @type {SimObject[]}
     */
    this.objects = level.objects
      .filter((p) => Object.hasOwn(OBJECTS, p.id))
      .map((p) => {
        const def = OBJECTS[p.id];
        let collider = null;
        if (def.solid) {
          const [w, h, d] = def.solid;
          collider = physics.addStaticBox({ x: w / 2, y: h / 2, z: d / 2 }, { x: p.position.x, y: p.position.y + h / 2, z: p.position.z }, yawQuat(p.yaw));
        }
        return { id: p.id, kind: 'object', type: def.type, position: { x: p.position.x, y: p.position.y, z: p.position.z }, facing: p.yaw, open: false, hidden: false, prompt: def.prompt ?? null, collider, near: false };
      });

    /** What the player would use by pressing Interact now (an NPC or object), or null. @type {Focus | null} */
    this.focus = null;
    /** The exit the player stood in last update (exits fire on the way in). @type {string | null} */
    this.inExit = level.exitAt(start.position) ? 'start' : null;

    /** @type {Grunt | Dummy | null} */
    this.lockTarget = null;
    this.flick = { sum: 0, frames: 0, cooldown: 0 };
    this.respawnTimer = 0;
    /** Last step's lock-on recentre request (consumed by the camera). @type {number | null} */
    this.recenter = null;
    /** Per-actor stride counters for enemy footsteps. @type {Map<string, number>} */
    this.strides = new Map();
    /** Previous positions and facings, for interpolation. @type {Map<string, { x: number, y: number, z: number, facing: number }>} */
    this.prev = new Map();

    this.setFeel(feel);
    this.camera.reset(this.player.position, this.player.facing);
    this.remember();
  }

  /**
   * Add an enemy (from a spawn point, or called in mid-fight).
   * @param {string} type  a key of ENEMIES
   * @param {string} name
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} yaw
   * @returns {Grunt | null}
   */
  spawnFoe(type, name, position, yaw) {
    if (type !== 'grunt') return null;
    const def = ENEMIES.grunt;
    const body = this.physics.createCharacter({ position, radius: def.radius, height: def.height });
    const foe = new Grunt(`${type}_${name}`, body, position, yaw);
    this.foes.push(foe);
    return foe;
  }

  /**
   * Set an object's state (from the game's flags).
   * @param {string} id
   * @param {{ open?: boolean, hidden?: boolean, prompt?: string | null }} state
   */
  setObject(id, state) {
    const o = this.objects.find((x) => x.id === id);
    if (!o) return;
    Object.assign(o, state);
    if (o.collider) this.physics.setColliderEnabled(o.collider, !o.open && !o.hidden);
  }

  /** @param {import('../feel/feelSettings.js').FeelValues} feel */
  setFeel(feel) {
    this.feel = feel;
    this.camera.settings = {
      smoothing: Number(feel.cameraSmoothing),
      lookAhead: Number(feel.lookAhead),
      collision: Boolean(feel.cameraCollision),
      lockFraming: Boolean(feel.lockFraming),
    };
  }

  /** The sword-and-shield grunts among the foes. */
  get grunts() {
    return this.foes.filter((f) => f.kind === 'grunt');
  }

  /** Every enemy (foes and dummies). */
  get enemies() {
    return [...this.foes, ...this.dummies];
  }

  /** @returns {(Player | Grunt | Dummy)[]} */
  get actors() {
    return [this.player, ...this.foes, ...this.dummies];
  }

  /**
   * Advance one fixed step.
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   */
  step(frame) {
    this.tick++;
    const pressed = BUFFERED.filter((a) => button(frame, a).pressed);
    this.buffer.update(this.tick, pressed);
    this.remember();
    this.camera.snapshot();

    if (this.hitstop > 0) {
      // Hit-stop: the fight freezes; presses are still buffered, the camera still turns.
      this.hitstop--;
      this.updateCamera(frame);
      return;
    }

    this.updateLock(frame);
    const emit = (/** @type {string} */ name, /** @type {any} */ data) => this.emit(name, data);
    const axes = this.camera.groundAxes();
    this.player.update(frame, {
      tick: this.tick,
      dt: TICK,
      buffer: this.buffer,
      axes,
      feel: this.feel,
      lockTarget: this.lockTarget,
      enemies: this.enemies,
      emit,
    });

    for (const foe of this.foes) this.updateGrunt(foe);
    for (const dummy of this.dummies) dummy.update(TICK);
    this.updateNpcs();

    this.physics.step();
    this.resolveCombat();
    this.updateCamera(frame);
    this.level.updateTriggers('player', this.player.position, (id) => this.emit('triggerEnter', { id }), (id) => this.emit('triggerExit', { id }));
    this.updateWorld(frame);
    this.updateRespawns();
  }

  /**
   * Step with no input: everyone else carries on (used while a menu or a
   * conversation has the player's attention... and in tests).
   */
  idle() {
    this.step({ move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} });
  }

  /** @private */
  remember() {
    for (const a of this.actors) {
      let p = this.prev.get(a.id);
      if (!p) this.prev.set(a.id, (p = { x: 0, y: 0, z: 0, facing: 0 }));
      p.x = a.position.x;
      p.y = a.position.y;
      p.z = a.position.z;
      p.facing = a.facing;
    }
  }

  /**
   * @param {string} name
   * @param {any} [data]
   */
  emit(name, data = {}) {
    if (name === 'footstep') data.surface = this.level.surfaceAt(data.position);
    this.events.emit(name, data);
  }

  // ------------------------------------------------------------------ lock-on

  /**
   * @private
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   */
  updateLock(frame) {
    const p = this.player.position;
    const axes = this.camera.groundAxes();
    this.recenter = null;
    if (this.lockTarget && shouldBreakLock(this.lockTarget, p)) this.setLock(null);

    if (button(frame, 'lockOn').pressed) {
      if (this.lockTarget) {
        this.setLock(null);
      } else {
        const target = selectTarget(this.enemies, p, axes.forward);
        if (target) this.setLock(/** @type {Grunt | Dummy} */ (target));
        else this.recenter = this.player.facing;
      }
    }

    // Switching: a flick of the camera stick, mouse or arrow keys while locked.
    if (this.flick.cooldown > 0) this.flick.cooldown--;
    if (this.lockTarget) {
      this.flick.sum = this.flick.sum * 0.8 + frame.look.x;
      if (Math.abs(this.flick.sum) > 0.12 && this.flick.cooldown === 0) {
        const next = switchTarget(this.lockTarget, this.enemies, p, axes.right, this.flick.sum > 0 ? 1 : -1);
        if (next !== this.lockTarget) this.setLock(/** @type {Grunt | Dummy} */ (next));
        this.flick.cooldown = 18;
        this.flick.sum = 0;
      }
    } else {
      this.flick.sum = 0;
    }
  }

  /** @param {Grunt | Dummy | null} target */
  setLock(target) {
    const old = this.lockTarget;
    this.lockTarget = target;
    if (target) this.emit('lockOn', { target, previous: old });
    else if (old) this.emit('lockOff', { previous: old });
  }

  // ------------------------------------------------------------------ enemies

  /**
   * @private
   * @param {Grunt} grunt
   */
  updateGrunt(grunt) {
    if (!grunt.alive) return;
    const p = this.player.position;
    const dx = p.x - grunt.position.x;
    const dz = p.z - grunt.position.z;
    const before = { x: grunt.position.x, z: grunt.position.z };
    grunt.update(
      {
        see: {
          distance: Math.hypot(dx, dz),
          bearing: yawFromDirection(dx, dz),
          playerAlive: this.player.alive,
          playerSwingId: this.player.swingId,
          playerAttacking: this.player.attackPhase === 'startup',
        },
        facing: grunt.facing,
        random: () => this.rng.next(),
        requestToken: (id) => {
          if (this.attackToken === null || this.attackToken === id) {
            this.attackToken = id;
            return true;
          }
          return false;
        },
        releaseToken: (id) => {
          if (this.attackToken === id) this.attackToken = null;
        },
        emit: (name, data) => this.emit(name, { ...data, grunt }),
      },
      TICK,
    );
    // Enemy footsteps, so you can hear them coming.
    const moved = Math.hypot(grunt.position.x - before.x, grunt.position.z - before.z);
    const s = (this.strides.get(grunt.id) ?? 0) + moved;
    if (s > 1.4) {
      this.strides.set(grunt.id, 0);
      this.emit('footstep', { position: grunt.position, who: grunt, left: false });
    } else {
      this.strides.set(grunt.id, s);
    }
  }

  // ------------------------------------------------------------------ people, objects and exits

  /** @private NPCs turn towards the player while talking, and back again after. */
  updateNpcs() {
    const p = this.player.position;
    for (const npc of this.npcs) {
      const want = npc.talking ? yawFromDirection(p.x - npc.position.x, p.z - npc.position.z) : npc.homeYaw;
      npc.facing = approachAngle(npc.facing, want, 5 * TICK);
    }
  }

  /**
   * @private
   * Exits, hearthstones, and what the player is facing that they could use.
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   */
  updateWorld(frame) {
    const p = this.player.position;
    const exit = this.player.alive ? this.level.exitAt(p) : null;
    const key = exit ? `${exit.area}:${exit.spawn}` : null;
    if (exit && this.inExit === null) this.emit('exit', { area: exit.area, spawn: exit.spawn });
    this.inExit = key;

    for (const o of this.objects) {
      if (o.type !== 'hearthstone') continue;
      const near = Math.hypot(o.position.x - p.x, o.position.z - p.z) <= HEARTHSTONE_RANGE;
      if (near && !o.near) this.emit('touch', { id: o.id });
      o.near = near;
    }

    this.focus = this.player.alive && this.player.canAct ? this.findFocus() : null;
    if (this.focus && button(frame, 'interact').pressed) this.emit('interact', { ...this.focus });
  }

  /**
   * The NPC or object the player would use: in range, roughly in front,
   * nearest first.
   * @returns {Focus | null}
   */
  findFocus() {
    const p = this.player.position;
    /** @type {Focus | null} */
    let best = null;
    let bestScore = Infinity;
    /**
     * @param {SimNpc | SimObject} thing
     * @param {number} range
     * @param {string} label
     */
    const consider = (thing, range, label) => {
      const dx = thing.position.x - p.x;
      const dz = thing.position.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) return;
      const off = Math.abs(angleDelta(this.player.facing, yawFromDirection(dx, dz)));
      if (off > 1.75 && dist > 1.2) return;
      const score = dist + off * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: thing.kind, id: thing.id, label };
      }
    };
    for (const npc of this.npcs) if (!npc.hidden) consider(npc, TALK_RANGE, 'Talk');
    for (const o of this.objects) if (!o.hidden && o.prompt) consider(o, USE_RANGE, o.prompt);
    return best;
  }

  // ------------------------------------------------------------------ combat

  /** @private */
  resolveCombat() {
    const player = this.player;
    if (player.fsm.is('attack') && player.attack) {
      const frame = player.attackFrameNow;
      if (frame >= 0) {
        for (const r of resolveSwing(player, player.attack, frame, this.enemies, player.swingHits)) this.applyHit(player, player.attack, r);
      }
    }
    this.strikeObjects();
    for (const grunt of this.foes) {
      if (!grunt.alive) continue;
      const frame = grunt.brain.frameNow;
      if (frame < 0) continue;
      for (const r of resolveSwing(grunt, grunt.attack, frame, [player], grunt.swingHits)) this.applyHit(grunt, grunt.attack, r);
    }
  }

  /** @private The player's sword against switches. */
  strikeObjects() {
    const player = this.player;
    if (!player.fsm.is('attack') || !player.attack || player.attackFrameNow < 0) return;
    const spheres = hitSpheresAt(player.attack, player.attackFrameNow, player.position, player.facing);
    for (const o of this.objects) {
      if (o.type !== 'switch' || o.hidden || player.swingHits.has(o.id)) continue;
      const c = { x: o.position.x, y: o.position.y + 1.1, z: o.position.z };
      if (spheres.some((s) => Math.hypot(s.x - c.x, s.y - c.y, s.z - c.z) <= s.r + 0.6)) {
        player.swingHits.add(o.id);
        this.hitstop = Math.max(this.hitstop, Math.round(4 * Number(this.feel.hitstopScale)));
        this.emit('objectHit', { id: o.id, point: c, attack: player.attack });
      }
    }
  }

  /**
   * @param {Player | Grunt} attacker
   * @param {import('../data/attacks.js').Attack} attack
   * @param {import('../combat/hitboxes.js').HitResult} result
   */
  applyHit(attacker, attack, result) {
    const target = /** @type {Player | Grunt | Dummy} */ (/** @type {unknown} */ (result.target));
    let dx = target.position.x - attacker.position.x;
    let dz = target.position.z - attacker.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const force = attack.knockback * Number(this.feel.knockbackScale);
    const knockback = { x: dx * force, z: dz * force };
    const base = { attacker, target, attack, point: result.point, direction: { x: dx, y: 0, z: dz } };

    if (result.result === 'hit') {
      const wasAlive = target.alive;
      // A counter hit: caught in the middle of your own swing, you're knocked down.
      const counter = target instanceof Player && target.fsm.is('attack');
      target.takeHit({ damage: attack.damage, poise: attack.poise, knockback, hitstun: attack.hitstun, knockdown: attack.knockdown || counter });
      this.hitstop = Math.max(this.hitstop, Math.round(attack.hitstop * Number(this.feel.hitstopScale)));
      this.emit('hit', { ...base, damage: attack.damage, killed: wasAlive && !target.alive, counter });
      if (wasAlive && !target.alive && target instanceof Grunt) {
        target.body.setSolid?.(false);
        if (this.lockTarget === target) this.setLock(null);
      }
    } else if (result.result === 'blocked') {
      target.blockHit({ knockback });
      this.hitstop = Math.max(this.hitstop, Math.round(2 * Number(this.feel.hitstopScale)));
      this.emit('block', base);
    } else {
      this.emit('dodge', base);
    }
  }

  // ------------------------------------------------------------------ camera and respawns

  /**
   * @private
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   */
  updateCamera(frame) {
    const v = this.player.velocity;
    const speed = Math.hypot(v.x, v.z);
    const lead = speed > 0.1 ? { x: (v.x / speed) * Math.min(1, speed / PLAYER.runSpeed), z: (v.z / speed) * Math.min(1, speed / PLAYER.runSpeed) } : { x: 0, z: 0 };
    this.camera.update(TICK, {
      target: this.player.position,
      lead,
      look: this.hitstop > 0 && this.lockTarget ? { x: 0, y: 0 } : frame.look,
      lockTarget: this.lockTarget ? this.lockTarget.position : null,
      recenter: this.recenter,
    });
    this.recenter = null;
  }

  /**
   * Bring the player back at a spawn (default: where they arrived), at full health.
   * @param {string} [spawn]
   */
  revivePlayer(spawn) {
    const s = (spawn && this.level.spawns.player[spawn]) || this.playerSpawn;
    this.player.respawn(s.position, s.yaw, (pos) => this.player.body.teleport?.(pos));
    this.camera.reset(this.player.position, this.player.facing);
    this.setLock(null);
    this.inExit = this.level.exitAt(s.position) ? 'start' : null;
    this.emit('respawn', { who: this.player });
  }

  /** @private */
  updateRespawns() {
    if (!this.player.alive && this.respawnPlayer) {
      this.respawnTimer += TICK;
      if (this.respawnTimer >= PLAYER.respawnSeconds) {
        this.respawnTimer = 0;
        this.revivePlayer();
      }
    }
    // In the training grounds enemies come back; elsewhere they stay down
    // until the area is entered again.
    if (!this.area.respawnEnemies) return;
    for (const grunt of this.foes) {
      if (grunt.alive) continue;
      grunt.respawnTimer -= TICK;
      if (grunt.respawnTimer <= 0) {
        grunt.respawn((pos) => grunt.body.teleport?.(pos));
        grunt.body.setSolid?.(true);
        this.emit('respawn', { who: grunt });
      }
    }
  }

  /**
   * A compact fingerprint of the simulation state, for determinism tests.
   * @returns {number[]}
   */
  fingerprint() {
    const out = [this.tick, this.hitstop, this.camera.yaw, this.camera.pitch];
    for (const a of this.actors) out.push(a.position.x, a.position.y, a.position.z, a.facing, a.hp);
    return out;
  }

  /** Whether an attack is in its active frames (for drawing hitboxes). */
  static isActive(/** @type {Player | Grunt} */ actor) {
    if (actor instanceof Player) return actor.fsm.is('attack') && actor.attack !== null && attackPhase(actor.attack, actor.attackFrameNow) === 'active';
    return actor.alive && actor.brain.frameNow >= 0 && attackPhase(actor.attack, actor.brain.frameNow) === 'active';
  }

  /** Free the physics world (safe to call twice). */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.clear();
    this.physics.dispose();
  }
}

/**
 * @typedef {object} SimNpc
 * @property {string} id
 * @property {'npc'} kind
 * @property {{ x: number, y: number, z: number }} position
 * @property {number} facing
 * @property {number} homeYaw
 * @property {boolean} talking
 * @property {boolean} hidden
 */

/**
 * @typedef {object} SimObject
 * @property {string} id
 * @property {'object'} kind
 * @property {string} type
 * @property {{ x: number, y: number, z: number }} position
 * @property {number} facing
 * @property {boolean} open
 * @property {boolean} hidden
 * @property {string | null} prompt  the verb to show, or null when it can't be used
 * @property {any} collider
 * @property {boolean} near
 */

/** @typedef {{ kind: 'npc' | 'object', id: string, label: string }} Focus */

/** @param {number} yaw */
function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
