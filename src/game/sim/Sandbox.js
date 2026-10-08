import { createPhysics, Level, EventBus, InputBuffer, FollowCamera, Rng, button, yawFromDirection } from '../../engine/index.js';
import { TICK } from '../config.js';
import { PLAYER, ENEMIES } from '../data/actors.js';
import { Player } from '../player/Player.js';
import { Grunt } from '../enemies/Grunt.js';
import { Dummy } from '../enemies/Dummy.js';
import { resolveSwing, attackPhase } from '../combat/hitboxes.js';
import { selectTarget, switchTarget, shouldBreakLock } from '../combat/lockOn.js';
import { defaultFeel } from '../feel/feelSettings.js';
import { buildTrainingGrounds, PROPS } from '../scenes/trainingGrounds.js';

/**
 * The whole simulation of the combat sandbox, advanced one fixed step at a
 * time by `step(inputFrame)`. It owns the physics world, the level, the
 * player, the enemies, the camera's simulated state, lock-on and combat.
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
 *   8. camera, triggers, respawns
 */

/** Actions recorded in the input buffer. */
const BUFFERED = ['attack', 'roll'];

export class Sandbox {
  /**
   * Build the training grounds (or another level) and everything in it.
   * @param {object} [options]
   * @param {import('three').Object3D} [options.levelRoot]  default: the training grounds
   * @param {import('../feel/feelSettings.js').FeelValues} [options.feel]
   * @param {number | string} [options.seed='island']
   * @param {boolean} [options.grunts=true]  false: only the dummy (some tests)
   */
  static async create({ levelRoot, feel, seed = 'island', grunts = true } = {}) {
    const physics = await createPhysics();
    const root = levelRoot ?? buildTrainingGrounds();
    const level = Level.fromScene(root, physics);
    return new Sandbox(physics, level, { feel: feel ?? defaultFeel(), seed, grunts });
  }

  /**
   * @param {import('../../engine/index.js').Physics} physics
   * @param {Level} level
   * @param {{ feel: import('../feel/feelSettings.js').FeelValues, seed: number | string, grunts: boolean }} options
   */
  constructor(physics, level, { feel, seed, grunts }) {
    this.physics = physics;
    this.level = level;
    this.events = new EventBus();
    this.rng = new Rng(seed);
    this.buffer = new InputBuffer(120);
    this.tick = 0;
    /** Updates left in the current hit-stop freeze. */
    this.hitstop = 0;
    /** @type {string | null} which grunt may attack right now */
    this.attackToken = null;
    this.feel = feel;
    this.camera = new FollowCamera({ probe: (o, d, max, r) => physics.sphereCast(o, d, max, r) });

    for (const prop of PROPS) {
      const size = prop.kind === 'barrel' ? [0.38, 0.5, 0.38] : prop.kind === 'crate' ? [0.42, 0.42, 0.42] : [0.6, 0.9, 0.2];
      physics.addStaticBox({ x: size[0], y: size[1], z: size[2] }, { x: prop.position[0], y: prop.position[1] + size[1], z: prop.position[2] }, yawQuat(prop.yaw));
    }

    const start = level.spawns.player.start ?? { position: { x: 0, y: 0, z: 0 }, yaw: 0 };
    this.playerSpawn = start;
    const body = physics.createCharacter({ position: start.position, radius: PLAYER.radius, height: PLAYER.height });
    this.player = new Player(body, { yaw: start.yaw });

    /** @type {Grunt[]} */
    this.grunts = [];
    /** @type {Dummy[]} */
    this.dummies = [];
    for (const spawn of level.spawns.enemies) {
      if (spawn.type === 'dummy') {
        this.dummies.push(new Dummy(`dummy_${spawn.name}`, spawn.position, spawn.yaw));
        physics.addStaticBox({ x: 0.1, y: 0.6, z: 0.1 }, { x: spawn.position.x, y: spawn.position.y + 0.6, z: spawn.position.z });
      } else if (spawn.type === 'grunt' && grunts) {
        const def = ENEMIES.grunt;
        const gbody = physics.createCharacter({ position: spawn.position, radius: def.radius, height: def.height });
        this.grunts.push(new Grunt(`grunt_${spawn.name}`, gbody, spawn.position, spawn.yaw));
      }
    }

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

  /** Every enemy (grunts and dummies). */
  get enemies() {
    return [...this.grunts, ...this.dummies];
  }

  /** @returns {(Player | Grunt | Dummy)[]} */
  get actors() {
    return [this.player, ...this.grunts, ...this.dummies];
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

    for (const grunt of this.grunts) this.updateGrunt(grunt);
    for (const dummy of this.dummies) dummy.update(TICK);

    this.physics.step();
    this.resolveCombat();
    this.updateCamera(frame);
    this.level.updateTriggers('player', this.player.position, (id) => this.emit('triggerEnter', { id }), (id) => this.emit('triggerExit', { id }));
    this.updateRespawns();
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
    for (const grunt of this.grunts) {
      if (!grunt.alive) continue;
      const frame = grunt.brain.frameNow;
      if (frame < 0) continue;
      for (const r of resolveSwing(grunt, grunt.attack, frame, [player], grunt.swingHits)) this.applyHit(grunt, grunt.attack, r);
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
      target.takeHit({ damage: attack.damage, poise: attack.poise, knockback, hitstun: attack.hitstun, knockdown: attack.knockdown });
      this.hitstop = Math.max(this.hitstop, Math.round(attack.hitstop * Number(this.feel.hitstopScale)));
      this.emit('hit', { ...base, damage: attack.damage, killed: wasAlive && !target.alive });
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

  /** @private */
  updateRespawns() {
    if (!this.player.alive) {
      this.respawnTimer += TICK;
      if (this.respawnTimer >= PLAYER.respawnSeconds) {
        this.respawnTimer = 0;
        const s = this.playerSpawn;
        this.player.respawn(s.position, s.yaw, (pos) => this.player.body.teleport?.(pos));
        this.camera.reset(this.player.position, this.player.facing);
        this.setLock(null);
        this.emit('respawn', { who: this.player });
      }
    }
    for (const grunt of this.grunts) {
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

  dispose() {
    this.events.clear();
    this.physics.dispose();
  }
}

/** @param {number} yaw */
function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
