import { StateMachine, approach, approachAngle, angleDelta, yawFromDirection, DEG, button } from '../../engine/index.js';
import { ATTACKS, totalFrames, PLAYER_COMBO } from '../data/attacks.js';
import { PLAYER } from '../data/actors.js';
import { attackPhase, isInFront } from '../combat/hitboxes.js';

/**
 * The hero, as an explicit state machine.
 *
 *   idle ⇄ run ⇄ strafe (locked on)      attack → attack → attack (combo)
 *     │      │      │                       │  ╲ roll (cancel window)
 *     └──────┴──────┴─→ roll, attack, shield ...
 *   any → hitstun → idle/run/strafe   any → knockdown → idle/run/strafe   any → dead
 *   idle/run/strafe/shield → drink (a tonic from the quick slot) → idle/run/strafe
 *   idle/run/strafe → fall (off an edge) → land (a long drop) → idle/run/strafe
 *   attack (attack held through the swing) → charge → attack (charged chop) or idle
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

/** @typedef {'idle' | 'run' | 'strafe' | 'attack' | 'roll' | 'shield' | 'drink' | 'charge' | 'fall' | 'land' | 'hitstun' | 'knockdown' | 'dead'} PlayerState */

/** @type {Record<PlayerState, PlayerState[]>} */
export const TRANSITIONS = {
  idle: ['run', 'strafe', 'attack', 'roll', 'shield', 'drink', 'fall', 'hitstun', 'knockdown', 'dead'],
  run: ['idle', 'strafe', 'attack', 'roll', 'shield', 'drink', 'fall', 'hitstun', 'knockdown', 'dead'],
  strafe: ['idle', 'run', 'attack', 'roll', 'shield', 'drink', 'fall', 'hitstun', 'knockdown', 'dead'],
  attack: ['attack', 'charge', 'idle', 'run', 'strafe', 'roll', 'hitstun', 'knockdown', 'dead'],
  charge: ['attack', 'idle', 'run', 'strafe', 'roll', 'hitstun', 'knockdown', 'dead'],
  roll: ['idle', 'run', 'strafe', 'attack', 'roll', 'hitstun', 'knockdown', 'dead'],
  shield: ['idle', 'run', 'strafe', 'attack', 'roll', 'drink', 'hitstun', 'knockdown', 'dead'],
  drink: ['idle', 'run', 'strafe', 'hitstun', 'knockdown', 'dead'],
  fall: ['land', 'idle', 'run', 'strafe', 'hitstun', 'knockdown', 'dead'],
  land: ['idle', 'run', 'strafe', 'roll', 'hitstun', 'knockdown', 'dead'],
  hitstun: ['hitstun', 'idle', 'run', 'strafe', 'knockdown', 'dead'],
  knockdown: ['idle', 'run', 'strafe', 'dead'],
  dead: [],
};

/**
 * How long a Use item press waits, in updates, for the hero to be free to
 * drink (two thirds of a second: long enough to outlast a whole swing or roll).
 */
const USE_ITEM_BUFFER = 40;

/** Which clip each state plays (attacks use their own `anim`). */
export const ANIMATIONS = {
  idle: 'Idle',
  run: 'Running_A',
  walk: 'Walking_A',
  blockHit: 'Block_Hit',
  strafe: 'Idle',
  roll: 'Dodge_Forward',
  rollBackward: 'Dodge_Backward',
  rollLeft: 'Dodge_Left',
  rollRight: 'Dodge_Right',
  shield: 'Blocking',
  drink: 'Use_Item',
  charge: '1H_Melee_Attack_Chop',
  fall: 'Jump_Idle',
  land: 'Jump_Land',
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
 * @property {() => boolean} [canUseItem]  the quick slot has something to use
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
    /** Multiplies the damage of every swing (the Tempered Blade). */
    this.damageScale = 1;
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
    /** The tonic being drunk has taken effect. */
    this.drank = false;
    /** Updates the attack button has been held without a break (charging). */
    this.attackHeld = 0;
    /** Updates spent charging, and whether the charge is full. */
    this.chargeFrames = 0;
    this.charged = false;
    /** A pause combo waiting for a press: its attack, and the last tick it can start. @type {{ key: string, until: number } | null} */
    this.pauseChain = null;
    /** What aim assist chose at the start of this swing, tracked through its wind-up. @type {{ position: { x: number, z: number }, alive: boolean } | null} */
    this.assistTarget = null;
    /** Frames of parry window this time the shield went up, and when it last came down. */
    this.parryWindow = 0;
    this.shieldDownTick = -Infinity;
    /** The camera's yaw last update with the shield up (turning it turns the shield). @type {number | null} */
    this.shieldCameraYaw = null;
    this.rollDir = { x: 0, z: 1 };
    /** Updates spent falling (the fall state). */
    this.fallFrames = 0;
    /** The roll in progress: a roll, or a backstep (rolling in place while locked on). */
    this.rollKind = /** @type {'roll' | 'backstep'} */ ('roll');
    /** Which way the roll goes relative to where the hero faces (for its animation). */
    this.rollSide = /** @type {'forward' | 'backward' | 'left' | 'right'} */ ('forward');
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
    const iframes = Number(this.ctx.feel.rollIframes);
    if (this.rollKind === 'backstep') {
      const from = PLAYER.backstep.iframesFrom;
      return f >= from && f < from + Math.min(iframes, PLAYER.backstep.iframes);
    }
    const from = PLAYER.roll.iframesFrom;
    return f >= from && f < from + iframes;
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
    this.attackHeld = button(frame, 'attack').down ? this.attackHeld + 1 : 0;
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
        enter: () => {
          // A parry window, unless the shield was only just lowered (no tapping).
          const since = (this.ctx?.tick ?? 0) - this.shieldDownTick;
          this.parryWindow = since >= PLAYER.parry.cooldown ? PLAYER.parry.window : 0;
          this.shieldCameraYaw = null;
          this.ctx?.emit('shieldUp', { position: this.position });
        },
        update: () => this.updateShield(),
        exit: () => (this.shieldDownTick = this.ctx?.tick ?? 0),
      },
      charge: {
        enter: () => {
          this.chargeFrames = 0;
          this.charged = false;
        },
        update: () => this.updateCharge(),
        exit: () => (this.charged = false),
      },
      drink: {
        enter: () => {
          this.drank = false;
          this.ctx?.emit('drinkStart', { position: this.position });
        },
        update: () => this.updateDrink(),
        // Knocked out of it before the tonic took effect: spilled, not used.
        exit: () => {
          if (!this.drank) this.ctx?.emit('drinkSpilled', { position: this.position });
        },
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
      fall: {
        enter: () => (this.fallFrames = 0),
        update: () => this.updateFall(),
      },
      land: {
        enter: () => this.ctx?.emit('land', { position: this.position, player: this }),
        update: () => {
          this.slowDown(0.08);
          if (this.fsm.frames >= PLAYER.fall.landFrames - 1) this.toLocomotion();
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
    // Walked off an edge: falling (after a few frames, so a step down doesn't count).
    if (!this.body.grounded && this.body.airFrames > PLAYER.fall.after) {
      this.fsm.go('fall');
      return;
    }
    if (this.tryRoll()) return;
    if (ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer))) {
      this.attackKey = this.opener('ground');
      this.fsm.go('attack');
      return;
    }
    if (this.tryDrink()) return;
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

  /**
   * Turn to a point and swing (Interact on a crystal switch).
   * @param {{ x: number, z: number }} point
   */
  swingAt(point) {
    if (!this.canAct) return;
    this.facing = yawFromDirection(point.x - this.position.x, point.z - this.position.z);
    this.attackKey = PLAYER_COMBO[0];
    this.fsm.go('attack');
  }

  /** Back to idle, run or strafe after an action. */
  /** In the air: a little steering, no attacks or rolls; land when the feet touch. */
  updateFall() {
    this.fallFrames++;
    const dir = this.moveDirection();
    this.accelerate(dir.x * PLAYER.runSpeed * PLAYER.fall.airControl, dir.z * PLAYER.runSpeed * PLAYER.fall.airControl, PLAYER.runSpeed);
    if (!this.body.grounded) return;
    // A real drop lands with a moment's recovery; a short one just carries on.
    if (this.fallFrames + PLAYER.fall.after >= PLAYER.fall.hardAfter) this.fsm.go('land');
    else this.toLocomotion();
  }

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
    this.assistTarget = null;
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
    const maxTurn = PLAYER.aimAssist.maxTurnDeg * DEG * strength;
    let best = null;
    let bestScore = Infinity;
    const { range } = PLAYER.aimAssist;
    for (const enemy of ctx.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - this.position.x;
      const dz = enemy.position.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.01) continue;
      const turn = Math.abs(approachAngle(0, yawFromDirection(dx, dz) - this.facing, Math.PI));
      if (turn > maxTurn) continue;
      const score = turn + dist * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = yawFromDirection(dx, dz);
        this.assistTarget = enemy;
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
    // Aim assist keeps tracking its target through the wind-up, so a
    // sidestep doesn't dodge a swing that had already found it.
    else if (!ctx.lockTarget && phase === 'startup' && this.assistTarget?.alive) {
      const t = this.assistTarget.position;
      const rate = PLAYER.aimAssist.trackDegPerSec * Number(ctx.feel.aimAssist) * DEG * ctx.dt;
      this.facing = approachAngle(this.facing, yawFromDirection(t.x - this.position.x, t.z - this.position.z), rate);
    }

    // Roll cancel: only inside the cancel window (when the lab allows it).
    if (ctx.feel.cancelWindows && f >= attack.rollCancelFrom && this.tryRoll()) return;

    // Combo: a press since this attack started, within the buffer window.
    if (attack.next && f >= attack.chainFrom && ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer), this.attackStartTick + 1)) {
      // A press that came late (a pause) takes the attack's pause variant.
      this.attackKey = attack.pauseNext && f >= attack.chainFrom + PLAYER.combo.pauseFrom ? attack.pauseNext : attack.next;
      this.fsm.go('attack');
      return;
    }
    if (f >= totalFrames(attack) - 1) {
      // Held the button the whole swing: draw the sword back to charge.
      if (this.attackHeld >= totalFrames(attack) - 1 && this.attackKey !== 'chargeChop' && this.attackKey !== 'bash') {
        this.fsm.go('charge');
        return;
      }
      // A press just after this ends still counts as a pause combo.
      this.pauseChain = attack.pauseNext ? { key: attack.pauseNext, until: ctx.tick + PLAYER.combo.pauseWindow } : null;
      this.toLocomotion();
    }
  }

  startRoll() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const dir = this.moveDirection();
    this.rollKind = 'roll';
    if (dir.amount > 0.2) {
      const len = Math.hypot(dir.x, dir.z);
      this.rollDir = { x: dir.x / len, z: dir.z / len };
    } else if (ctx.lockTarget) {
      // No direction while locked on: hop straight back, still facing the target.
      this.rollKind = 'backstep';
      this.rollDir = { x: -Math.sin(this.facing), z: -Math.cos(this.facing) };
    } else {
      this.rollDir = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    }
    if (!ctx.lockTarget) this.facing = yawFromDirection(this.rollDir.x, this.rollDir.z);
    // Which way that is from where the hero faces (locked on, the hero keeps
    // facing the target, so a roll can go sideways or back).
    const ahead = this.rollDir.x * Math.sin(this.facing) + this.rollDir.z * Math.cos(this.facing);
    const right = this.rollDir.x * -Math.cos(this.facing) + this.rollDir.z * Math.sin(this.facing);
    if (Math.abs(ahead) >= Math.abs(right)) this.rollSide = ahead >= 0 ? 'forward' : 'backward';
    else this.rollSide = right > 0 ? 'right' : 'left';
    ctx.emit('roll', { position: this.position, player: this });
  }

  updateRoll() {
    const f = this.fsm.frames;
    const data = this.rollKind === 'backstep' ? PLAYER.backstep : PLAYER.roll;
    const t = f / data.frames;
    const speed = data.speed * Math.max(0.15, 1 - t * t);
    this.velocity.x = this.rollDir.x * speed;
    this.velocity.z = this.rollDir.z * speed;
    if (f >= data.actFrom) {
      const ctx = /** @type {PlayerContext} */ (this.ctx);
      if (this.tryRoll()) return;
      if (ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer))) {
        this.attackKey = this.opener('roll');
        this.fsm.go('attack');
        return;
      }
    }
    if (f >= data.frames - 1) this.toLocomotion();
  }

  /**
   * Use the quick slot (a tonic) if Use item was pressed recently: a press
   * mid-swing or mid-roll waits in the buffer for the hero to be free. A
   * press that can't be used (none left, full health) says why.
   */
  tryDrink() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    if (!ctx.buffer.consume('useItem', USE_ITEM_BUFFER)) return false;
    if (!ctx.canUseItem?.()) {
      ctx.emit('useItemRefused', {});
      return false;
    }
    return this.fsm.go('drink');
  }

  /**
   * Drinking: a slow walk, then the tonic takes effect at DRINK.effectFrame.
   * Hit before that and it's spilled (nothing used); after it, it's done.
   */
  updateDrink() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const f = this.fsm.frames;
    const dir = this.moveDirection();
    this.accelerate(dir.x * PLAYER.drink.speed, dir.z * PLAYER.drink.speed, PLAYER.runSpeed);
    if (f === PLAYER.drink.effectFrame) {
      this.drank = true;
      ctx.emit('useItem', { position: this.position });
    }
    if (f >= PLAYER.drink.frames - 1) this.toLocomotion();
  }

  updateShield() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const frame = /** @type {import('../../engine/input/Input.js').InputFrame} */ (this.frame);
    if (this.tryRoll()) return;
    if (this.tryDrink()) return;
    // Attack with the shield up: a bash that breaks a blocking enemy's guard.
    if (ctx.buffer.consume('attack', Number(ctx.feel.comboBuffer))) {
      this.attackKey = 'bash';
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
    else {
      // Not locked on: turning the camera turns the shield with it, so you
      // can face a new threat without letting it down.
      const f = ctx.axes.forward;
      const cam = yawFromDirection(f.x, f.z);
      if (this.shieldCameraYaw !== null) {
        const want = this.facing + angleDelta(this.shieldCameraYaw, cam);
        this.facing = approachAngle(this.facing, want, PLAYER.shieldTurnSpeed * DEG * ctx.dt);
      }
      this.shieldCameraYaw = cam;
    }
  }

  /** The shield went up in the last few frames: a blow now is parried. */
  get parrying() {
    return this.fsm.is('shield') && this.fsm.frames < this.parryWindow;
  }

  /**
   * The attack a fresh press starts, from what the hero was doing.
   * @param {'ground' | 'roll'} from
   * @returns {string}
   */
  opener(from) {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    if (this.pauseChain && ctx.tick <= this.pauseChain.until) {
      const key = this.pauseChain.key;
      this.pauseChain = null;
      return key;
    }
    this.pauseChain = null;
    if (from === 'roll') return 'rollSlash';
    if (this.fsm.is('run') && Math.hypot(this.velocity.x, this.velocity.z) >= PLAYER.runSpeed * PLAYER.dashFrom) return 'dashSlash';
    return PLAYER_COMBO[0];
  }

  /**
   * Charging: a slow walk with the sword drawn back. Let go when it's full
   * for the charged chop; let go early and nothing happens.
   */
  updateCharge() {
    const ctx = /** @type {PlayerContext} */ (this.ctx);
    const frame = /** @type {import('../../engine/input/Input.js').InputFrame} */ (this.frame);
    if (this.tryRoll()) return;
    this.chargeFrames++;
    if (!this.charged && this.chargeFrames >= PLAYER.charge.frames) {
      this.charged = true;
      ctx.emit('charged', { position: this.position, player: this });
    }
    if (!button(frame, 'attack').down) {
      if (this.charged) {
        this.attackKey = 'chargeChop';
        this.fsm.go('attack');
      } else {
        this.toLocomotion();
      }
      return;
    }
    const dir = this.moveDirection();
    this.accelerate(dir.x * PLAYER.charge.walkSpeed, dir.z * PLAYER.charge.walkSpeed, PLAYER.runSpeed);
    if (ctx.lockTarget) this.turnTowards(ctx.lockTarget.position);
    else if (dir.amount > 0.05) this.turn(yawFromDirection(dir.x, dir.z));
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
