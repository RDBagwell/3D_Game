import { StateMachine, approach, approachAngle, yawFromDirection, DEG, button } from '../../engine/index.js';
import { ATTACKS, totalFrames } from '../data/attacks.js';
import { PLAYER } from '../data/actors.js';
import { attackPhase, isInFront } from '../combat/hitboxes.js';

/**
 * The hero, as an explicit state machine.
 *
 *   idle ⇄ run ⇄ strafe (locked on)      attack → attack → attack (combo)
 *     │      │      │                       │  ╲ roll (cancel window)
 *     └──────┴──────┴─→ roll, attack, shield ...
 *   any → hitstun → idle/run/strafe   any → knockdown → idle/run/strafe   any → dead
 *
 * TRANSITIONS below is the full table. Each state in `states()` owns:
 *   - its animation (ANIMATIONS, read by the view),
 *   - its movement rules (speed, turning, lunges),
 *   - which inputs it listens to, and so which transitions it takes.
 *
 * The simulation is plain data in and out: `update(frame, ctx)` reads an
 * InputFrame and the world context, moves the CharacterBody and emits events
 * ('swing', 'roll', 'footstep'...). Nothing here touches the renderer, so it
 * runs in Node for tests.
 */

/** @typedef {'idle' | 'run' | 'strafe' | 'attack' | 'roll' | 'shield' | 'hitstun' | 'knockdown' | 'dead'} PlayerState */

/** @type {Record<PlayerState, PlayerState[]>} */
export const TRANSITIONS = {
  idle: ['run', 'strafe', 'attack', 'roll', 'shield', 'hitstun', 'knockdown', 'dead'],
  run: ['idle', 'strafe', 'attack', 'roll', 'shield', 'hitstun', 'knockdown', 'dead'],
  strafe: ['idle', 'run', 'attack', 'roll', 'shield', 'hitstun', 'knockdown', 'dead'],
  attack: ['attack', 'idle', 'run', 'strafe', 'roll', 'hitstun', 'knockdown', 'dead'],
  roll: ['idle', 'run', 'strafe', 'attack', 'roll', 'hitstun', 'knockdown', 'dead'],
  shield: ['idle', 'run', 'strafe', 'attack', 'roll', 'hitstun', 'knockdown', 'dead'],
  hitstun: ['hitstun', 'idle', 'run', 'strafe', 'knockdown', 'dead'],
  knockdown: ['idle', 'run', 'strafe', 'dead'],
  dead: [],
};

/** Which clip each state plays (attacks use their own `anim`). */
export const ANIMATIONS = {
  idle: 'Idle',
  run: 'Running_A',
  strafe: 'Idle',
  roll: 'Dodge_Forward',
  shield: 'Blocking',
  hitstun: 'Hit_A',
  knockdown: 'Death_B',
  getUp: 'Lie_StandUp',
  dead: 'Death_A',
};

/**
 * @typedef {object} PlayerContext
 * @property {number} tick
 * @property {number} dt
 * @property {import('../../engine/index.js').InputBuffer} buffer
 * @property {{ forward: { x: number, z: number }, right: { x: number, z: number } }} axes  camera ground axes
 * @property {import('../feel/feelSettings.js').FeelValues} feel
 * @property {{ position: { x: number, y: number, z: number } } | null} lockTarget
 * @property {{ position: { x: number, y: number, z: number }, alive: boolean }[]} enemies  for aim assist
 * @property {(name: string, data?: any) => void} emit
 */

/**
 * @typedef {object} Body
 * @property {{ x: number, y: number, z: number }} position
 * @property {boolean} grounded
 * @property {number} airFrames
 * @property {(dx: number, dz: number, dt: number) => any} move
 * @property {(p: { x: number, y: number, z: number }) => void} [teleport]
 * @property {(solid: boolean) => void} [setSolid]
 */

export class Player {
  /**
   * @param {Body} body
   * @param {{ yaw?: number }} [options]
   */
  constructor(body, { yaw = 0 } = {}) {
    this.id = 'player';
    /** @type {'player'} */
    this.team = 'player';
    this.body = body;
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.maxHp = PLAYER.maxHp;
    this.hp = PLAYER.maxHp;
    /** Yaw the hero faces (front = +Z rotated by yaw). */
    this.facing = yaw;
    /** Horizontal velocity, m/s. */
    this.velocity = { x: 0, z: 0 };
    /** Knockback velocity, decays separately from movement. */
    this.push = { x: 0, z: 0 };
    /** @type {import('../data/attacks.js').Attack | null} */
    this.attack = null;
    this.attackKey = '';
    /** Tick the current attack started (presses before it don't chain). */
    this.attackStartTick = 0;
    /** The attack frame executed this update (-1 if none): what the hitbox check uses. */
    this.attackFrameNow = -1;
    /** Ids this swing already hit. */
    this.swingHits = new Set();
    /** Increases each swing, so enemies can react once per attack. */
    this.swingId = 0;
    this.rollDir = { x: 0, z: 1 };
    this.hitstunFrames = 0;
    this.invulnerableFrames = 0;
    this.distanceSinceStep = 0;
    this.footLeft = false;
    /** Last InputFrame's move, camera-relative, for the view (strafe animation). */
    this.localMove = { x: 0, y: 0 };
    /** @type {PlayerContext | null} */
    this.ctx = null;
    /** @type {import('../../engine/input/Input.js').InputFrame | null} */
    this.frame = null;

    /** @type {StateMachine<PlayerState>} */
    this.fsm = new StateMachine({ states: this.states(), transitions: TRANSITIONS, initial: 'idle' });
  }

  get position() {
    return this.body.position;
  }

  get alive() {
    return this.hp > 0;
  }

  get state() {
    return this.fsm.current;
  }

  /** Free to do something else (not attacking, rolling, hurt or down): talking, opening, using an item. */
  get canAct() {
    const s = this.fsm.current;
    return s === 'idle' || s === 'run' || s === 'strafe';
  }

  /** Frames into the current state. */
  get stateFrames() {
    return this.fsm.frames;
  }

  isInvulnerable() {
    if (this.fsm.is('knockdown') || this.fsm.is('dead') || this.invulnerableFrames > 0) return true;
    if (!this.fsm.is('roll') || !this.ctx) return false;
    const f = this.fsm.frames;
    const from = PLAYER.roll.iframesFrom;
    return f >= from && f < from + Number(this.ctx.feel.rollIframes);
  }

  /** @param {{ x: number, z: number }} from */
  blocks(from) {
    return this.fsm.is('shield') && isInFront(this.position, this.facing, from, PLAYER.blockHalfAngle);
  }

  /** The active attack's phase, or null. */
  get attackPhase() {
    return this.fsm.is('attack') && this.attack ? attackPhase(this.attack, this.fsm.frames) : null;
  }

  /**
   * One fixed update.
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   * @param {PlayerContext} ctx
   */
  update(frame, ctx) {
    this.frame = frame;
    this.ctx = ctx;
    if (this.invulnerableFrames > 0) this.invulnerableFrames--;
    this.fsm.update(ctx.dt);
    // Knockback slides the hero whatever the state, and fades quickly.
    const decay = Math.exp(-ctx.dt * 7);
    this.push.x *= decay;
    this.push.z *= decay;
    const dx = (this.velocity.x + this.push.x) * ctx.dt;
    const dz = (this.velocity.z + this.push.z) * ctx.dt;
    this.body.move(dx, dz, ctx.dt);
    this.footsteps(Math.hypot(dx, dz));
  }

  // ------------------------------------------------------------------ states

  /** @returns {Record<PlayerState, import('../../engine/core/StateMachine.js').StateDef<PlayerState>>} */
  states() {
    return {
      idle: { update: () => this.locomotion(false) },
      run: { update: () => this.locomotion(false) },
      strafe: { update: () => this.locomotion(true) },
      attack: {
        enter: () => this.startAttack(),
        update: () => this.updateAttack(),
      },
      roll: {
        enter: () => this.startRoll(),
        update: () => this.updateRoll(),
      },
      shield: {
        enter: () => this.ctx?.emit('shieldUp', { position: this.position }),
        update: () => this.updateShield(),
      },
      hitstun: {
        update: () => {
          this.slowDown(0.05);
          if (this.fsm.frames >= this.hitstunFrames) this.toLocomotion();
        },
      },
      knockdown: {
        enter: () => {
          this.velocity.x = this.velocity.z = 0;
        },
        update: () => {
          if (this.fsm.frames >= PLAYER.knockdownFrames) {
            this.invulnerableFrames = 20; // a moment to get your bearings
            this.toLocomotion();
          }
        },
      },
      dead: {
        enter: () => {
          this.velocity.x = this.velocity.z = 0;
          this.ctx?.emit('died', { who: this });
        },
      },
    };
  }

  /**
   * Idle, run and strafe: the states where the hero is free to act.
   * @param {boolean} locked
   */
  locomotion(locked) {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const frame = /** @type {import('../../engine/input/Input.js').InputFrame} */ (this.frame);
    if (this.tryRoll()) return;
    if (ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer))) {
      this.attackKey = 'slash1';
      this.fsm.go('attack');
      return;
    }
    if (button(frame, 'shield').down) {
      this.fsm.go('shield');
      return;
    }

    const dir = this.moveDirection();
    const speed = locked ? PLAYER.strafeSpeed : PLAYER.runSpeed;
    this.accelerate(dir.x * speed, dir.z * speed, PLAYER.runSpeed);

    if (locked && ctx.lockTarget) {
      this.turnTowards(ctx.lockTarget.position);
    } else if (dir.amount > 0.05) {
      this.turn(yawFromDirection(dir.x, dir.z));
    }

    /** @type {PlayerState} */
    const want = ctx.lockTarget ? 'strafe' : dir.amount > 0.05 || Math.hypot(this.velocity.x, this.velocity.z) > 0.6 ? 'run' : 'idle';
    if (want !== this.fsm.current) this.fsm.go(want);
  }

  /** Back to idle, run or strafe after an action. */
  toLocomotion() {
    const ctx = this.ctx;
    if (ctx?.lockTarget) this.fsm.go('strafe');
    else if (this.moveDirection().amount > 0.05) this.fsm.go('run');
    else this.fsm.go('idle');
  }

  /** Roll if one is buffered and the hero is on the ground (or just left it: coyote time). */
  tryRoll() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const onGround = this.body.grounded || this.body.airFrames <= Number(ctx.feel.coyoteFrames);
    if (!onGround) return false;
    if (!ctx.buffer.consume('roll', Number(ctx.feel.rollBuffer))) return false;
    return this.fsm.go('roll');
  }

  startAttack() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    this.attack = ATTACKS[this.attackKey];
    this.attackStartTick = ctx.tick;
    this.attackFrameNow = -1;
    this.swingHits = new Set();
    this.swingId++;
    // Turn to the stick direction, then let aim assist (or the lock) correct it.
    const dir = this.moveDirection();
    if (ctx.lockTarget) {
      this.facing = yawFromDirection(ctx.lockTarget.position.x - this.position.x, ctx.lockTarget.position.z - this.position.z);
    } else {
      if (dir.amount > 0.3) this.facing = yawFromDirection(dir.x, dir.z);
      this.aimAssist();
    }
    ctx.emit('swing', { attack: this.attack, key: this.attackKey, position: this.position, attacker: this });
  }

  /** Nudge the facing towards the closest enemy roughly in front. */
  aimAssist() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const strength = Number(ctx.feel.aimAssist);
    if (strength <= 0) return;
    const maxTurn = 75 * DEG * strength;
    let best = null;
    let bestScore = Infinity;
    for (const enemy of ctx.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - this.position.x;
      const dz = enemy.position.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 3.2 || dist < 0.01) continue;
      const turn = Math.abs(approachAngle(0, yawFromDirection(dx, dz) - this.facing, Math.PI));
      if (turn > maxTurn) continue;
      const score = turn + dist * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = yawFromDirection(dx, dz);
      }
    }
    if (best !== null) this.facing = approachAngle(this.facing, best, maxTurn);
  }

  updateAttack() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const attack = /** @type {import('../data/attacks.js').Attack} */ (this.attack);
    const f = this.fsm.frames;
    this.attackFrameNow = f;
    const phase = attackPhase(attack, f);

    // Lunge forward through startup and active frames, then plant the feet.
    if (phase === 'startup' || phase === 'active') {
      const lunge = attack.lunge * (1 - f / (attack.startup + attack.active)) * 1.4;
      this.velocity.x = Math.sin(this.facing) * lunge;
      this.velocity.z = Math.cos(this.facing) * lunge;
    } else {
      this.slowDown(0.06);
    }
    if (ctx.lockTarget && f < 3) this.turnTowards(ctx.lockTarget.position);

    // Roll cancel: only inside the cancel window (when the lab allows it).
    if (ctx.feel.cancelWindows && f >= attack.rollCancelFrom && this.tryRoll()) return;

    // Combo: a press since this attack started, within the buffer window.
    if (attack.next && f >= attack.chainFrom && ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer), this.attackStartTick + 1)) {
      this.attackKey = attack.next;
      this.fsm.go('attack');
      return;
    }
    if (f >= totalFrames(attack) - 1) this.toLocomotion();
  }

  startRoll() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const dir = this.moveDirection();
    if (dir.amount > 0.2) {
      const len = Math.hypot(dir.x, dir.z);
      this.rollDir = { x: dir.x / len, z: dir.z / len };
    } else {
      this.rollDir = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    }
    if (!ctx.lockTarget) this.facing = yawFromDirection(this.rollDir.x, this.rollDir.z);
    ctx.emit('roll', { position: this.position, player: this });
  }

  updateRoll() {
    const f = this.fsm.frames;
    const t = f / PLAYER.roll.frames;
    const speed = PLAYER.roll.speed * Math.max(0.15, 1 - t * t);
    this.velocity.x = this.rollDir.x * speed;
    this.velocity.z = this.rollDir.z * speed;
    if (f >= PLAYER.roll.actFrom) {
      const ctx = /** @type {PlayerContext} */ (this.ctx);
      if (this.tryRoll()) return;
      if (ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer))) {
        this.attackKey = 'slash1';
        this.fsm.go('attack');
        return;
      }
    }
    if (f >= PLAYER.roll.frames - 1) this.toLocomotion();
  }

  updateShield() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const frame = /** @type {import('../../engine/input/Input.js').InputFrame} */ (this.frame);
    if (this.tryRoll()) return;
    if (ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer))) {
      this.attackKey = 'slash1';
      this.fsm.go('attack');
      return;
    }
    if (!button(frame, 'shield').down) {
      this.toLocomotion();
      return;
    }
    const dir = this.moveDirection();
    this.accelerate(dir.x * PLAYER.shieldSpeed, dir.z * PLAYER.shieldSpeed, PLAYER.runSpeed);
    if (ctx.lockTarget) this.turnTowards(ctx.lockTarget.position);
  }

  // ----------------------------------------------------------------- helpers

  /** The stick direction on the ground, relative to the camera, with its strength. */
  moveDirection() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const m = this.frame?.move ?? { x: 0, y: 0 };
    this.localMove = { x: m.x, y: m.y };
    const { forward, right } = ctx.axes;
    return { x: forward.x * m.y + right.x * m.x, z: forward.z * m.y + right.z * m.x, amount: Math.min(1, Math.hypot(m.x, m.y)) };
  }

  /**
   * Move the velocity towards a target, using the lab's acceleration and
   * deceleration times (0 = instant).
   * @param {number} tx
   * @param {number} tz
   * @param {number} topSpeed  the speed the times are measured against
   */
  accelerate(tx, tz, topSpeed) {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const speeding = Math.hypot(tx, tz) >= Math.hypot(this.velocity.x, this.velocity.z) - 1e-6;
    const time = Number(speeding ? ctx.feel.accelTime : ctx.feel.decelTime);
    if (time <= 0) {
      this.velocity.x = tx;
      this.velocity.z = tz;
      return;
    }
    // Constant acceleration towards the target velocity, as a vector (turning
    // while running carries some momentum through the turn).
    const maxDelta = (topSpeed / time) * ctx.dt;
    const dx = tx - this.velocity.x;
    const dz = tz - this.velocity.z;
    const len = Math.hypot(dx, dz);
    if (len <= maxDelta) {
      this.velocity.x = tx;
      this.velocity.z = tz;
    } else {
      this.velocity.x += (dx / len) * maxDelta;
      this.velocity.z += (dz / len) * maxDelta;
    }
  }

  /** @param {number} perFrame  fraction of speed lost each frame */
  slowDown(perFrame) {
    this.velocity.x = approach(this.velocity.x, 0, Math.abs(this.velocity.x) * perFrame + 0.05);
    this.velocity.z = approach(this.velocity.z, 0, Math.abs(this.velocity.z) * perFrame + 0.05);
  }

  /** @param {number} yaw */
  turn(yaw) {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const speed = Number(ctx.feel.turnSpeed);
    this.facing = speed >= 3600 ? yaw : approachAngle(this.facing, yaw, speed * DEG * ctx.dt);
  }

  /** @param {{ x: number, z: number }} p */
  turnTowards(p) {
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    if (dx * dx + dz * dz > 1e-4) this.turn(yawFromDirection(dx, dz));
  }

  /** @param {number} moved  metres this update */
  footsteps(moved) {
    const ctx = this.ctx;
    if (!ctx || !this.body.grounded) return;
    if (!(this.fsm.is('run') || this.fsm.is('strafe') || this.fsm.is('shield'))) return;
    this.distanceSinceStep += moved;
    if (this.distanceSinceStep >= PLAYER.stride) {
      this.distanceSinceStep = 0;
      this.footLeft = !this.footLeft;
      ctx.emit('footstep', { position: this.position, who: this, left: this.footLeft });
    }
  }

  // -------------------------------------------------------- being hit, respawning

  /**
   * Take a hit that wasn't blocked or dodged.
   * @param {{ damage: number, knockback: { x: number, z: number }, hitstun: number, knockdown?: boolean }} hit
   */
  takeHit(hit) {
    this.hp = Math.max(0, this.hp - hit.damage);
    this.push.x += hit.knockback.x;
    this.push.z += hit.knockback.z;
    this.velocity.x = this.velocity.z = 0;
    if (this.hp <= 0) {
      this.fsm.go('dead');
    } else if (hit.knockdown) {
      this.fsm.go('knockdown');
    } else {
      this.hitstunFrames = hit.hitstun;
      this.fsm.go('hitstun');
    }
  }

  /**
   * Block a hit with the shield: no damage, a push back.
   * @param {{ knockback: { x: number, z: number } }} hit
   */
  blockHit(hit) {
    this.push.x += hit.knockback.x * PLAYER.blockPush;
    this.push.z += hit.knockback.z * PLAYER.blockPush;
  }

  /**
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} yaw
   * @param {(p: { x: number, y: number, z: number }) => void} teleport
   */
  respawn(position, yaw, teleport) {
    teleport(position);
    this.hp = this.maxHp;
    this.facing = yaw;
    this.velocity = { x: 0, z: 0 };
    this.push = { x: 0, z: 0 };
    this.invulnerableFrames = 60;
    this.fsm.force('idle');
  }
}
