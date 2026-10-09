import { createPhysics, Level, EventBus, InputBuffer, FollowCamera, Rng, button, yawFromDirection, approachAngle, angleDelta } from '../../engine/index.js';
import { TICK } from '../config.js';
import { PLAYER, ENEMIES } from '../data/actors.js';
import { Player } from '../player/Player.js';
import { Grunt } from '../enemies/Grunt.js';
import { Enemy } from '../enemies/Enemy.js';
import { Dummy } from '../enemies/Dummy.js';
import { resolveSwing, attackPhase, hitSpheresAt, sphereHitsCapsule } from '../combat/hitboxes.js';
import { PROJECTILES } from '../data/attacks.js';
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
const BUFFERED = ['attack', 'roll', 'useItem'];

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
    /** Who holds each group's attack tokens (grunts: one at a time; cindermites: two). @type {Map<string, Set<string>>} */
    this.tokens = new Map();
    /** Projectiles in flight. @type {Projectile[]} */
    this.projectiles = [];
    this.projectileCount = 0;
    /** Wind-ups take this much longer, and enemies move a little slower (the "slower enemies" assist). */
    this.enemySlow = 1;
    this.feel = feel;
    this.respawnPlayer = respawnPlayer;
    this.disposed = false;
    /** Whether the quick slot has something to use (the adventure sets this). */
    this.canUseItem = () => false;
    /** Multiplies damage the player takes (the difficulty assist). */
    this.damageTaken = 1;
    /** Lock on by itself to an enemy that has noticed you (the auto-lock assist). */
    this.autoLock = false;
    this.autoLockPause = 0;
    this.camera = new FollowCamera({ probe: (o, d, max, r) => physics.sphereCast(o, d, max, r) });

    const start = level.spawns.player[spawn] ?? level.spawns.player.start ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    this.playerSpawn = start;
    const body = physics.createCharacter({ position: start.position, radius: PLAYER.radius, height: PLAYER.height });
    this.player = new Player(body, { yaw: start.yaw });

    /** Enemies that fight. @type {Enemy[]} */
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

    /** @type {Enemy | Dummy | null} */
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
   * @returns {Enemy | null}
   */
  spawnFoe(type, name, position, yaw) {
    const def = /** @type {any} */ (ENEMIES)[type];
    if (!def || type === 'dummy') return null;
    const body = this.physics.createCharacter({ position, radius: def.radius, height: def.height });
    const foe = type === 'grunt' ? new Grunt(`grunt_${name}`, body, position, yaw) : new Enemy(`${type}_${name}`, type, body, position, yaw);
    foe.spawnName = name;
    foe.speedScale = this.enemySlow > 1 ? 0.85 : 1;
    this.foes.push(foe);
    this.emit('spawned', { foe });
    return foe;
  }

  /**
   * The "slower enemies" assist: longer wind-ups, slower feet.
   * @param {boolean} on
   */
  setSlowEnemies(on) {
    this.enemySlow = on ? 1.35 : 1;
    for (const f of this.foes) f.speedScale = on ? 0.85 : 1;
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

  /** The boss, if it's here and standing. */
  get boss() {
    return this.foes.find((f) => f.def.brain === 'warden' && f.alive) ?? null;
  }

  /** Every enemy (foes and dummies). */
  get enemies() {
    return [...this.foes, ...this.dummies];
  }

  /** @returns {(Player | Enemy | Dummy)[]} */
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
      canUseItem: this.canUseItem,
    });

    for (const foe of this.foes) this.updateFoe(foe);
    for (const dummy of this.dummies) dummy.update(TICK);
    this.updateNpcs();

    this.physics.step();
    this.resolveCombat();
    this.updateProjectiles();
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

  /**
   * While a conversation has the player's attention: the fight is paused,
   * the camera frames the player and who they're talking to over the
   * player's shoulder, and NPCs turn to face them.
   * @param {{ x: number, y: number, z: number } | null} focus
   */
  frameTalk(focus) {
    this.remember();
    this.camera.snapshot();
    this.updateNpcs();
    const p = this.player.position;
    let shot;
    if (focus) {
      const dx = focus.x - p.x;
      const dz = focus.z - p.z;
      // Face each other.
      this.player.facing = approachAngle(this.player.facing, yawFromDirection(dx, dz), 6 * TICK);
      const toward = Math.atan2(dx, dz);
      // Behind the player and off to one side: whichever side the camera is already nearer.
      const sides = [toward + Math.PI - 0.95, toward + Math.PI + 0.95];
      const yaw = Math.abs(angleDelta(this.camera.yaw, sides[0])) <= Math.abs(angleDelta(this.camera.yaw, sides[1])) ? sides[0] : sides[1];
      shot = { pivot: { x: p.x + dx * 0.45, y: p.y + 1.45, z: p.z + dz * 0.45 }, yaw, pitch: -0.14, distance: 3.6 };
    }
    this.camera.update(TICK, { target: p, lead: { x: 0, z: 0 }, look: { x: 0, y: 0 }, lockTarget: null, recenter: null, shot });
  }

  /**
   * A framed camera shot with nothing else moving (the ending).
   * @param {{ pivot: { x: number, y: number, z: number }, yaw: number, pitch: number, distance: number }} shot
   */
  frameShot(shot) {
    this.remember();
    this.camera.snapshot();
    this.camera.update(TICK, { target: this.player.position, lead: { x: 0, z: 0 }, look: { x: 0, y: 0 }, lockTarget: null, recenter: null, shot });
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
    if (this.autoLockPause > 0) this.autoLockPause--;
    if (this.autoLock && !this.lockTarget && this.autoLockPause === 0) {
      // The nearest enemy that's after you, within reach of a fight.
      let best = null;
      let bestD = 9;
      for (const f of this.foes) {
        if (!f.alive || !f.brain.aware) continue;
        const d = Math.hypot(f.position.x - p.x, f.position.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) this.setLock(best);
    }

    if (button(frame, 'lockOn').pressed) {
      if (this.lockTarget) {
        this.setLock(null);
        // Let go on purpose: don't grab another for a few seconds.
        this.autoLockPause = 180;
      } else {
        const target = selectTarget(this.enemies, p, axes.forward);
        if (target) this.setLock(/** @type {Enemy | Dummy} */ (target));
        else this.recenter = this.player.facing;
      }
    }

    // Switching: a flick of the camera stick, mouse or arrow keys while locked.
    if (this.flick.cooldown > 0) this.flick.cooldown--;
    if (this.lockTarget) {
      this.flick.sum = this.flick.sum * 0.8 + frame.look.x;
      if (Math.abs(this.flick.sum) > 0.12 && this.flick.cooldown === 0) {
        const next = switchTarget(this.lockTarget, this.enemies, p, axes.right, this.flick.sum > 0 ? 1 : -1);
        if (next !== this.lockTarget) this.setLock(/** @type {Enemy | Dummy} */ (next));
        this.flick.cooldown = 18;
        this.flick.sum = 0;
      }
    } else {
      this.flick.sum = 0;
    }
  }

  /** @param {Enemy | Dummy | null} target */
  setLock(target) {
    const old = this.lockTarget;
    this.lockTarget = target;
    if (target) this.emit('lockOn', { target, previous: old });
    else if (old) this.emit('lockOff', { previous: old });
  }

  // ------------------------------------------------------------------ enemies

  /**
   * @private
   * @param {Enemy} foe
   */
  updateFoe(foe) {
    if (!foe.alive) return;
    const p = this.player.position;
    const dx = p.x - foe.position.x;
    const dz = p.z - foe.position.z;
    const before = { x: foe.position.x, z: foe.position.z };
    const token = foe.def.token ?? { group: foe.kind, max: 1 };
    foe.update(
      {
        see: {
          distance: Math.hypot(dx, dz),
          bearing: yawFromDirection(dx, dz),
          playerAlive: this.player.alive,
          playerSwingId: this.player.swingId,
          playerAttacking: this.player.attackPhase === 'startup',
        },
        facing: foe.facing,
        random: () => this.rng.next(),
        requestToken: (id) => this.takeToken(token.group, token.max, id),
        releaseToken: (id) => this.tokens.get(token.group)?.delete(id),
        emit: (name, data) => this.emit(name, { ...data, grunt: foe, foe }),
        slow: this.enemySlow,
        shoot: (projectile, yaw, spread = [0]) => {
          for (const off of spread) this.shoot(projectile, foe, yaw + off);
        },
        summon: (type, marker) => {
          const at = this.level.markers[marker];
          if (!at) return;
          const summoned = this.spawnFoe(type, `${foe.spawnName || foe.id}_${marker}_${this.tick}`, { x: at.x, y: at.y, z: at.z }, 0);
          if (summoned) {
            summoned.brain.aware = true;
            this.emit('summoned', { foe: summoned, by: foe });
          }
        },
      },
      TICK,
    );
    // Enemy footsteps, so you can hear them coming.
    const moved = Math.hypot(foe.position.x - before.x, foe.position.z - before.z);
    const s = (this.strides.get(foe.id) ?? 0) + moved;
    if (s > 1.4 * (foe.height / 1.75)) {
      this.strides.set(foe.id, 0);
      this.emit('footstep', { position: foe.position, who: foe, left: false });
    } else {
      this.strides.set(foe.id, s);
    }
  }

  /**
   * @private
   * @param {string} group
   * @param {number} max
   * @param {string} id
   */
  takeToken(group, max, id) {
    let holders = this.tokens.get(group);
    if (!holders) this.tokens.set(group, (holders = new Set()));
    if (holders.has(id)) return true;
    if (holders.size >= max) return false;
    holders.add(id);
    return true;
  }

  /** Which grunt holds the attack token (session 1's single token), or null. */
  get attackToken() {
    const holders = this.tokens.get('grunt');
    return holders && holders.size > 0 ? [...holders][0] : null;
  }

  // ------------------------------------------------------------------ projectiles

  /**
   * Throw a projectile from an enemy along a yaw.
   * @param {string} kind  a key of PROJECTILES
   * @param {Enemy} owner
   * @param {number} yaw
   */
  shoot(kind, owner, yaw) {
    const def = PROJECTILES[kind];
    if (!def) return;
    const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const start = { x: owner.position.x + dir.x * (owner.radius + 0.4), y: owner.position.y + def.height, z: owner.position.z + dir.z * (owner.radius + 0.4) };
    /** @type {Projectile} */
    const p = { id: `bolt_${++this.projectileCount}`, kind, def, owner, position: start, prev: { ...start }, velocity: { x: dir.x * def.speed, z: dir.z * def.speed }, age: 0, dodged: false };
    this.projectiles.push(p);
    this.emit('shoot', { projectile: p });
  }

  /** @private Move projectiles; they hit the player, a shield, a sword, or a wall. */
  updateProjectiles() {
    if (this.projectiles.length === 0) return;
    const player = this.player;
    const swordSpheres = player.fsm.is('attack') && player.attack && player.attackFrameNow >= 0 ? hitSpheresAt(player.attack, player.attackFrameNow, player.position, player.facing) : [];
    for (const p of this.projectiles) {
      const def = p.def;
      p.prev.x = p.position.x;
      p.prev.y = p.position.y;
      p.prev.z = p.position.z;
      p.age += TICK;
      const step = Math.hypot(p.velocity.x, p.velocity.z) * TICK;
      const dir = { x: p.velocity.x / def.speed, y: 0, z: p.velocity.z / def.speed };
      const wall = this.physics.rayDistance(p.position, dir, step + def.radius * 0.5);
      p.position.x += p.velocity.x * TICK;
      p.position.z += p.velocity.z * TICK;
      const sphere = { ...p.position, r: def.radius };
      if (swordSpheres.some((s) => Math.hypot(s.x - sphere.x, s.y - sphere.y, s.z - sphere.z) <= s.r + sphere.r)) {
        this.endProjectile(p, 'cut');
        this.hitstop = Math.max(this.hitstop, Math.round(3 * Number(this.feel.hitstopScale)));
        continue;
      }
      if (player.alive && sphereHitsCapsule(player.position, player.radius, player.height, sphere)) {
        const from = { x: p.position.x - dir.x * 2, z: p.position.z - dir.z * 2 };
        const knockback = { x: dir.x * def.knockback * Number(this.feel.knockbackScale), z: dir.z * def.knockback * Number(this.feel.knockbackScale) };
        const base = { attacker: p.owner, target: player, attack: def, point: { ...p.position }, direction: dir, projectile: p };
        if (player.isInvulnerable()) {
          if (!p.dodged) this.emit('dodge', base);
          p.dodged = true;
        } else if (player.blocks(from)) {
          player.blockHit({ knockback });
          this.hitstop = Math.max(this.hitstop, Math.round(2 * Number(this.feel.hitstopScale)));
          this.emit('block', base);
          this.endProjectile(p, 'blocked');
          continue;
        } else {
          const counter = false; // bolts and embers are never counter hits
          const damage = Math.max(1, Math.round(def.damage * this.damageTaken));
          player.takeHit({ damage, knockback, hitstun: def.hitstun, knockdown: counter });
          this.hitstop = Math.max(this.hitstop, Math.round(def.hitstop * Number(this.feel.hitstopScale)));
          this.emit('hit', { ...base, damage, killed: !player.alive, counter });
          this.endProjectile(p, 'hit');
          continue;
        }
      }
      if ((wall !== null && wall <= step) || p.age >= def.life) this.endProjectile(p, p.age >= def.life ? 'fizzle' : 'wall');
    }
    this.projectiles = this.projectiles.filter((p) => !p.ended);
  }

  /**
   * @private
   * @param {Projectile} p
   * @param {'hit' | 'blocked' | 'cut' | 'wall' | 'fizzle'} reason
   */
  endProjectile(p, reason) {
    p.ended = true;
    this.emit('projectileEnd', { projectile: p, reason, point: { ...p.position } });
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
    if (this.focus && button(frame, 'interact').pressed) {
      const o = this.focus.kind === 'object' ? this.objects.find((x) => x.id === this.focus?.id) : null;
      // A switch is struck, not used: Interact turns to it and swings.
      if (o?.type === 'switch') this.player.swingAt(o.position);
      else this.emit('interact', { ...this.focus });
    }
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
    for (const foe of this.foes) {
      if (!foe.alive || !foe.attack) continue;
      const frame = foe.brain.frameNow;
      if (frame < 0) continue;
      for (const r of resolveSwing(foe, foe.attack, frame, [player], foe.swingHits)) this.applyHit(foe, foe.attack, r);
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
   * @param {Player | Enemy} attacker
   * @param {import('../data/attacks.js').Attack} attack
   * @param {import('../combat/hitboxes.js').HitResult} result
   */
  applyHit(attacker, attack, result) {
    const target = /** @type {Player | Enemy | Dummy} */ (/** @type {unknown} */ (result.target));
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
      // A counter hit: a heavy blow caught you winding up a swing, so you're knocked down.
      const counter = target instanceof Player && Boolean(attack.counterHit) && target.fsm.is('attack') && Boolean(target.attack) && attackPhase(/** @type {any} */ (target.attack), target.attackFrameNow) === 'startup';
      let damage = attack.damage;
      if (attacker instanceof Player) damage = Math.round(damage * attacker.damageScale);
      if (target instanceof Enemy) damage = Math.max(1, Math.round(damage * target.brain.damageTaken));
      if (target instanceof Player) damage = Math.max(1, Math.round(damage * this.damageTaken));
      target.takeHit({ damage, poise: attack.poise, knockback, hitstun: attack.hitstun, knockdown: attack.knockdown || counter });
      this.hitstop = Math.max(this.hitstop, Math.round(attack.hitstop * Number(this.feel.hitstopScale)));
      const weak = target instanceof Enemy && target.brain.damageTaken > 1;
      this.emit('hit', { ...base, damage, killed: wasAlive && !target.alive, counter, weak });
      if (wasAlive && !target.alive && target instanceof Enemy) {
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
      if (grunt.alive || grunt.def.respawnSeconds <= 0) continue;
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
  static isActive(/** @type {Player | Enemy} */ actor) {
    if (actor instanceof Player) return actor.fsm.is('attack') && actor.attack !== null && attackPhase(actor.attack, actor.attackFrameNow) === 'active';
    return actor.alive && Boolean(actor.attack) && actor.brain.frameNow >= 0 && attackPhase(actor.attack, actor.brain.frameNow) === 'active';
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

/**
 * @typedef {object} Projectile
 * @property {string} id
 * @property {string} kind
 * @property {import('../data/attacks.js').ProjectileDef} def
 * @property {Enemy} owner
 * @property {{ x: number, y: number, z: number }} position
 * @property {{ x: number, y: number, z: number }} prev
 * @property {{ x: number, z: number }} velocity
 * @property {number} age  seconds
 * @property {boolean} dodged  already rolled through once
 * @property {boolean} [ended]
 */

/** @param {number} yaw */
function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
