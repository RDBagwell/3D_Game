import { StateMachine, angleDelta, DEG } from '../../engine/index.js';
import { ATTACKS } from '../data/attacks.js';
import { ENEMIES } from '../data/actors.js';

/**
 * The decisions of a melee enemy (grunts and cindermites, with different
 * numbers from data/actors.js), as a state machine that only thinks. It is given
 * what the grunt perceives each update and sets `intent` (how to move and
 * where to face); the Grunt entity carries that out and owns the body. Kept
 * apart so the AI can be tested with made-up perceptions and no physics.
 *
 *   idle ──sees you──▶ chase ──close──▶ circle ──its turn──▶ approach ──in range──▶ windup ──▶ attack ──▶ recover ─┐
 *     ▲                  ▲                 │ ▲                                                                    │
 *     └──lost you────────┴─────────────────┘ └────────────────────────────────────────────────────────────────────┘
 *   (from chase/circle/approach) you start a swing in front of it, sometimes ──▶ block
 *   hit ──▶ hitstun (short)  or, when its poise breaks ──▶ stagger (long)      hp 0 ──▶ dead
 *
 * Fairness rules built in:
 *   - Only one grunt attacks at a time: it needs the attack token
 *     (`requestToken`), which the others wait for while circling.
 *   - Every attack starts with a wind-up (the attack's startup frames). The
 *     grunt tracks you slowly during it and stops tracking `commitFrames`
 *     before the hit, so a well-timed roll always works.
 *   - After attacking it recovers for a while: that's your opening.
 */

/** @typedef {'idle' | 'chase' | 'circle' | 'approach' | 'windup' | 'attack' | 'recover' | 'block' | 'hitstun' | 'stagger' | 'dead'} GruntState */

/** @type {Record<GruntState, GruntState[]>} */
export const GRUNT_TRANSITIONS = {
  idle: ['chase', 'hitstun', 'stagger', 'dead'],
  chase: ['idle', 'circle', 'approach', 'block', 'hitstun', 'stagger', 'dead'],
  circle: ['idle', 'chase', 'approach', 'block', 'hitstun', 'stagger', 'dead'],
  approach: ['circle', 'chase', 'windup', 'block', 'hitstun', 'stagger', 'dead'],
  windup: ['attack', 'hitstun', 'stagger', 'dead'],
  attack: ['recover', 'hitstun', 'stagger', 'dead'],
  recover: ['circle', 'chase', 'hitstun', 'stagger', 'dead'],
  block: ['circle', 'chase', 'hitstun', 'stagger', 'dead'],
  hitstun: ['hitstun', 'chase', 'circle', 'stagger', 'dead'],
  stagger: ['chase', 'circle', 'hitstun', 'dead'],
  dead: [],
};

/**
 * @typedef {object} Perception
 * @property {number} distance  to the player, metres (on the ground)
 * @property {number} bearing  yaw from the grunt towards the player
 * @property {boolean} playerAlive
 * @property {number} playerSwingId  increases each time the player starts an attack
 * @property {boolean} playerAttacking  the player is in an attack's startup
 */

/**
 * @typedef {object} BrainContext
 * @property {Perception} see
 * @property {number} facing  the grunt's current yaw
 * @property {() => number} random  0..1 (a seeded Rng in the game)
 * @property {(id: string) => boolean} requestToken
 * @property {(id: string) => void} releaseToken
 * @property {(name: string, data?: any) => void} emit
 * @property {number} [slow]  1 normally; above 1 stretches wind-ups (the "slower enemies" assist)
 * @property {(projectile: string, yaw: number, spread?: number[]) => void} [shoot]  throw projectiles (casters, the boss)
 * @property {(type: string, marker: string) => void} [summon]  call an enemy to a marker (the boss)
 */

/**
 * @typedef {object} Intent
 * @property {'none' | 'toward' | 'circle' | 'away'} move
 * @property {number} speed  m/s
 * @property {number | null} face  yaw to turn towards
 * @property {number} turnRate  degrees per second
 */

export class GruntBrain {
  /**
   * @param {string} id
   * @param {any} [def]  the enemy's numbers (ENEMIES.grunt, ENEMIES.mite...)
   */
  constructor(id, def = ENEMIES.grunt) {
    this.id = id;
    this.def = def;
    /** Damage multiplier for hits it takes (bosses use this for weak points). */
    this.damageTaken = 1;
    /** Can't be hurt right now (a boss's roar). */
    this.invulnerable = false;
    /** Showing a wind-up the player should react to (the view draws the telegraph). */
    this.telegraph = false;
    /** 0..1 through the current wind-up (the telegraph ring closes as it goes). */
    this.windupProgress = 0;
    /** Set when a new swing starts (the body clears what it has already hit). */
    this.newSwing = false;
    this.attack = ATTACKS[this.def.attack];
    this.aware = false;
    this.cooldown = 30;
    this.circleDir = 1;
    this.circleTimer = 0;
    this.lastSwingSeen = 0;
    /**
     * The attack frame executed this update, counting wind-up, active and
     * recovery as one timeline (what the hitbox check uses), or -1.
     */
    this.frameNow = -1;
    /** @type {Intent} */
    this.intent = { move: 'none', speed: 0, face: null, turnRate: 360 };
    /** @type {BrainContext | null} */
    this.ctx = null;
    /** @type {StateMachine<GruntState>} */
    this.fsm = new StateMachine({ states: this.states(), transitions: GRUNT_TRANSITIONS, initial: 'idle' });
  }

  get state() {
    return this.fsm.current;
  }


  /** @param {BrainContext} ctx */
  update(ctx) {
    this.ctx = ctx;
    this.frameNow = -1;
    this.telegraph = this.fsm.is('windup');
    if (this.cooldown > 0) this.cooldown--;
    const see = ctx.see;
    // Noticing and forgetting the player.
    if (!this.aware && see.playerAlive) {
      const inView = Math.abs(angleDelta(ctx.facing, see.bearing)) <= (this.def.sightFov / 2) * DEG;
      if ((see.distance <= this.def.sightRange && inView) || see.distance <= this.def.hearRange) {
        this.aware = true;
        ctx.emit('noticed', { id: this.id });
      }
    } else if (this.aware && (see.distance > this.def.loseRange || !see.playerAlive)) {
      this.aware = false;
    }
    this.fsm.update(1 / 60);
  }

  /** @returns {Record<GruntState, import('../../engine/core/StateMachine.js').StateDef<GruntState>>} */
  states() {
    const set = (/** @type {Intent['move']} */ move, speed = 0, turnRate = 360) => {
      const see = this.ctx?.see;
      this.intent = { move, speed, face: see ? see.bearing : null, turnRate };
    };
    const stop = (/** @type {number | null} */ face = null) => {
      this.intent = { move: 'none', speed: 0, face, turnRate: 0 };
    };
    const ctx = () => /** @type {BrainContext} */ (this.ctx);

    return {
      idle: {
        enter: () => stop(),
        update: () => {
          stop();
          if (this.aware) this.fsm.go('chase');
        },
      },
      chase: {
        update: () => {
          if (!this.aware) return void this.fsm.go('idle');
          if (this.tryBlock()) return;
          set('toward', this.def.runSpeed);
          if (ctx().see.distance <= this.def.circleDistance + 0.4) this.fsm.go('circle');
        },
      },
      circle: {
        enter: () => {
          this.circleTimer = 40 + Math.floor(ctx().random() * 60);
        },
        update: () => {
          if (!this.aware) return void this.fsm.go('idle');
          if (this.tryBlock()) return;
          const d = ctx().see.distance;
          if (d > this.def.circleDistance + 1.6) return void this.fsm.go('chase');
          if (--this.circleTimer <= 0) {
            this.circleDir = ctx().random() < 0.5 ? -1 : 1;
            this.circleTimer = 40 + Math.floor(ctx().random() * 60);
          }
          // Keep the circling distance: step in or out while strafing round.
          set(d < this.def.circleDistance - 0.6 ? 'away' : 'circle', this.def.walkSpeed);
          if (this.cooldown <= 0 && ctx().requestToken(this.id)) this.fsm.go('approach');
        },
      },
      approach: {
        update: () => {
          if (this.tryBlock()) return;
          if (!this.aware) {
            ctx().releaseToken(this.id);
            return void this.fsm.go('chase');
          }
          set('toward', this.def.runSpeed * 0.8);
          if (ctx().see.distance <= this.def.attackRange) this.fsm.go('windup');
          else if (this.fsm.frames > 150) {
            // Couldn't reach the player (they kept backing off): give someone else a turn.
            ctx().releaseToken(this.id);
            this.cooldown = 40;
            this.fsm.go('circle');
          }
        },
      },
      windup: {
        enter: () => {
          this.windupProgress = 0;
          ctx().emit('windup', { id: this.id, attack: this.attack });
        },
        update: () => {
          // The "slower enemies" assist stretches the wind-up; frame data stays as written.
          const f = this.fsm.frames / (ctx().slow ?? 1);
          this.frameNow = Math.floor(f);
          this.windupProgress = Math.min(1, f / this.attack.startup);
          const committed = f >= this.attack.startup - this.def.commitFrames;
          if (committed) stop();
          else set('none', 0, this.def.windupTurn);
          if (f >= this.attack.startup - 1) this.fsm.go('attack');
        },
      },
      attack: {
        enter: () => ctx().emit('swing', { id: this.id, attack: this.attack }),
        update: () => {
          this.frameNow = this.attack.startup + this.fsm.frames;
          stop();
          if (this.fsm.frames >= this.attack.active - 1) this.fsm.go('recover');
        },
      },
      recover: {
        update: () => {
          this.frameNow = this.attack.startup + this.attack.active + this.fsm.frames;
          stop();
          if (this.fsm.frames >= this.attack.recovery - 1) this.finishTurn();
        },
      },
      block: {
        update: () => {
          set('none', 0, 540);
          if (this.fsm.frames >= this.def.blockFrames) this.fsm.go(this.aware ? 'circle' : 'chase');
        },
      },
      hitstun: {
        enter: () => this.ctx?.releaseToken(this.id),
        update: () => {
          stop();
          if (this.fsm.frames >= this.def.hitstunFrames) this.finishTurn();
        },
      },
      stagger: {
        enter: () => this.ctx?.releaseToken(this.id),
        update: () => {
          stop();
          if (this.fsm.frames >= this.def.staggerFrames) this.finishTurn();
        },
      },
      dead: {
        enter: () => {
          // (Possibly before its first update: beaten the moment it appeared.)
          this.ctx?.releaseToken(this.id);
          stop();
        },
      },
    };
  }

  /** After attacking or being hit: give up the token and go back to circling. */
  finishTurn() {
    const ctx = /** @type {BrainContext} */ (this.ctx);
    ctx.releaseToken(this.id);
    const [min, max] = this.def.cooldown;
    this.cooldown = Math.round(min + ctx.random() * (max - min));
    this.fsm.go(ctx.see.distance > this.def.circleDistance + 1.6 ? 'chase' : 'circle');
  }

  /** Raise the shield, sometimes, when the player starts a swing nearby. */
  tryBlock() {
    const ctx = /** @type {BrainContext} */ (this.ctx);
    const see = ctx.see;
    if (!see.playerAttacking || see.playerSwingId === this.lastSwingSeen) return false;
    this.lastSwingSeen = see.playerSwingId;
    if (see.distance > 3.5) return false;
    if (ctx.random() >= this.def.blockChance) return false;
    ctx.releaseToken(this.id);
    return this.fsm.go('block');
  }

  /**
   * React to a hit that landed.
   * @param {boolean} poiseBroken
   * @param {number} [_hpFraction]  (bosses use it to change phase)
   */
  onHit(poiseBroken, _hpFraction) {
    this.aware = true;
    this.fsm.go(poiseBroken ? 'stagger' : 'hitstun');
  }

  onDeath() {
    this.fsm.go('dead');
  }

  /** Back to the start (respawn). */
  reset() {
    this.aware = false;
    this.cooldown = 30;
    this.fsm.force('idle');
  }
}
