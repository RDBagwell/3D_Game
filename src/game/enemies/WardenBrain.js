import { StateMachine } from '../../engine/index.js';
import { ATTACKS } from '../data/attacks.js';

/**
 * The Cinder Warden: the boss. Two phases, every attack telegraphed, and one
 * clear opening.
 *
 *   dormant ──you come close──▶ approach ──in range──▶ windup ──▶ attack ──▶ recover ──▶ approach
 *                                  │                    (sweep or slam)        │
 *                                  │                    slam ──▶ stuck (the opening) ──▶ recover
 *                                  ├──phase two, far away──▶ cast (ember volley) ──▶ recover
 *                                  └──below half health, once──▶ roar (calls cindermites) ──▶ approach
 *
 *   Sweep  a wide spin around it (most of a circle in front). Wind-up 34
 *          frames: back off or roll through it.
 *   Slam   an overhead chop straight ahead that knocks you down. Wind-up 48
 *          frames, the longest and most obvious. Its axe sticks in the floor
 *          for about two seconds: its glowing core is exposed and takes double
 *          damage (the weak point). Outside that, its ash armour softens hits.
 *   Volley (phase two) three embers in a fan when you keep your distance.
 *   Charge if you keep out of reach for a few seconds it runs at you (faster
 *          than you can back away while locked on) and attacks.
 *   Roar   (phase two begins) it's invulnerable for a moment and calls three
 *          cindermites; then it rests less between attacks and pulls its axe
 *          free sooner.
 *
 * It never flinches (it's `heavy`), so the rhythm is: dodge, punish the
 * opening, back off. It never attacks twice without a rest.
 */

/** @typedef {'dormant' | 'approach' | 'windup' | 'attack' | 'recover' | 'stuck' | 'cast' | 'roar' | 'dead'} WardenState */

/** @type {Record<WardenState, WardenState[]>} */
export const WARDEN_TRANSITIONS = {
  dormant: ['approach', 'dead'],
  approach: ['windup', 'cast', 'roar', 'dead'],
  windup: ['attack', 'dead'],
  attack: ['recover', 'stuck', 'dead'],
  stuck: ['recover', 'dead'],
  recover: ['approach', 'roar', 'dead'],
  cast: ['recover', 'dead'],
  roar: ['approach', 'dead'],
  dead: [],
};

export class WardenBrain {
  /**
   * @param {string} id
   * @param {any} def  ENEMIES.warden
   */
  constructor(id, def) {
    this.id = id;
    this.def = def;
    /** @type {import('../data/attacks.js').Attack} */
    this.attack = ATTACKS.wardenSweep;
    this.frameNow = -1;
    this.aware = false;
    this.phase = 1;
    this.phaseTwoPending = false;
    this.rest = 60;
    this.volleyCooldown = 120;
    this.lastAttacks = /** @type {string[]} */ ([]);
    /** Frames spent approaching without getting an attack in (it charges when this runs out). */
    this.waiting = 0;
    this.circleDir = 1;
    this.damageTaken = def.armour;
    this.invulnerable = false;
    this.telegraph = false;
    this.windupProgress = 0;
    /** Set when a new swing starts (the body clears what it has already hit). */
    this.newSwing = false;
    /** @type {import('./GruntBrain.js').Intent} */
    this.intent = { move: 'none', speed: 0, face: null, turnRate: 0 };
    /** @type {import('./GruntBrain.js').BrainContext | null} */
    this.ctx = null;
    /** @type {StateMachine<WardenState>} */
    this.fsm = new StateMachine({ states: this.states(), transitions: WARDEN_TRANSITIONS, initial: 'dormant' });
  }

  get state() {
    return this.fsm.current;
  }

  /** The axe is stuck: the weak point is open. */
  get open() {
    return this.fsm.is('stuck');
  }

  /** @param {import('./GruntBrain.js').BrainContext} ctx */
  update(ctx) {
    this.ctx = ctx;
    this.frameNow = -1;
    if (this.rest > 0) this.rest--;
    if (this.volleyCooldown > 0) this.volleyCooldown--;
    if (!this.aware && ctx.see.playerAlive && ctx.see.distance <= this.def.sightRange) {
      this.aware = true;
      ctx.emit('noticed', { id: this.id, boss: true });
    }
    this.fsm.update(1 / 60);
    this.telegraph = this.fsm.is('windup') || this.fsm.is('cast');
    this.damageTaken = this.open ? this.def.weakPoint : this.def.armour;
    this.invulnerable = this.fsm.is('roar');
  }

  /** @returns {Record<WardenState, import('../../engine/core/StateMachine.js').StateDef<WardenState>>} */
  states() {
    const ctx = () => /** @type {import('./GruntBrain.js').BrainContext} */ (this.ctx);
    const slow = () => ctx().slow ?? 1;
    const face = (/** @type {import('./GruntBrain.js').Intent['move']} */ move, speed, turnRate) => {
      this.intent = { move, speed, face: ctx().see.bearing, turnRate };
    };
    const still = () => {
      this.intent = { move: 'none', speed: 0, face: null, turnRate: 0 };
    };
    const p = () => this.phase - 1;

    return {
      dormant: {
        update: () => {
          still();
          if (this.aware) this.fsm.go('approach');
        },
      },
      approach: {
        enter: () => {
          this.waiting = 0;
        },
        update: () => {
          const d = ctx().see.distance;
          if (!ctx().see.playerAlive) return void face('none', 0, 90);
          if (this.phaseTwoPending) return void this.fsm.go('roar');
          if (this.rest > 0) {
            // Between attacks it closes in slowly, always facing you.
            return void face(d > this.def.attackRange - 0.4 ? 'toward' : 'none', this.def.walkSpeed * 0.7, 120);
          }
          if (this.phase === 2 && d > 5.5 && this.volleyCooldown <= 0) return void this.fsm.go('cast');
          if (d <= this.def.attackRange) return void this.choose();
          // Kept at bay too long: charge.
          const charging = ++this.waiting > this.def.patience;
          face('toward', charging ? this.def.chargeSpeed : d > this.def.attackRange + 0.5 ? this.def.runSpeed : this.def.walkSpeed, charging ? 220 : 150);
        },
      },
      windup: {
        enter: () => {
          this.newSwing = true;
          this.windupProgress = 0;
          ctx().emit('windup', { id: this.id, attack: this.attack, boss: true });
        },
        update: () => {
          const f = this.fsm.frames / slow();
          this.frameNow = Math.floor(f);
          this.windupProgress = Math.min(1, f / this.attack.startup);
          // It steps in as it winds up, then plants its feet and commits.
          if (f >= this.attack.startup - this.def.commitFrames) this.intent = { move: 'none', speed: 0, face: null, turnRate: 0 };
          else face(ctx().see.distance > 2.2 ? 'toward' : 'none', this.def.walkSpeed, this.def.windupTurn);
          if (f >= this.attack.startup - 1) this.fsm.go('attack');
        },
      },
      attack: {
        enter: () => ctx().emit('swing', { id: this.id, attack: this.attack }),
        update: () => {
          this.frameNow = this.attack.startup + this.fsm.frames;
          still();
          if (this.fsm.frames >= this.attack.active - 1) this.fsm.go(this.attack === ATTACKS.wardenSlam ? 'stuck' : 'recover');
        },
      },
      stuck: {
        enter: () => ctx().emit('opening', { id: this.id }),
        update: () => {
          still();
          if (this.fsm.frames >= this.def.stuckFrames[p()] * slow()) this.fsm.go('recover');
        },
      },
      recover: {
        update: () => {
          still();
          const frames = this.attack === ATTACKS.wardenSlam ? 22 : this.attack.recovery - (this.phase === 2 ? 8 : 0);
          if (this.fsm.frames >= frames) {
            this.rest = this.def.rest[p()];
            this.fsm.go(this.phaseTwoPending ? 'roar' : 'approach');
          }
        },
      },
      cast: {
        enter: () => {
          this.windupProgress = 0;
          ctx().emit('windup', { id: this.id, cast: 'ember', boss: true });
        },
        update: () => {
          const f = this.fsm.frames / slow();
          this.windupProgress = Math.min(1, f / 42);
          if (f < 42 - this.def.commitFrames) face('none', 0, this.def.windupTurn);
          else this.intent = { move: 'none', speed: 0, face: null, turnRate: 0 };
          if (f >= 42) {
            ctx().shoot?.('ember', ctx().facing, [-0.34, 0, 0.34]);
            this.volleyCooldown = 300;
            this.attack = ATTACKS.wardenSweep; // recover like after a sweep
            this.fsm.go('recover');
          }
        },
      },
      roar: {
        enter: () => {
          this.phaseTwoPending = false;
          this.phase = 2;
          ctx().emit('roar', { id: this.id });
        },
        update: () => {
          still();
          if (this.fsm.frames === 30) {
            const s = this.def.summon;
            for (const at of s.at) ctx().summon?.(s.type, at);
          }
          if (this.fsm.frames >= this.def.roarFrames) {
            this.rest = 40;
            this.volleyCooldown = 120;
            this.fsm.go('approach');
          }
        },
      },
      dead: {
        enter: () => still(),
      },
    };
  }

  /** @private Pick the next attack: mostly alternating, never the same three times. */
  choose() {
    const ctx = /** @type {import('./GruntBrain.js').BrainContext} */ (this.ctx);
    let key = ctx.random() < 0.55 ? 'wardenSweep' : 'wardenSlam';
    if (this.lastAttacks.length >= 2 && this.lastAttacks.every((k) => k === key)) key = key === 'wardenSweep' ? 'wardenSlam' : 'wardenSweep';
    this.lastAttacks = [...this.lastAttacks.slice(-1), key];
    this.attack = ATTACKS[key];
    this.fsm.go('windup');
  }

  /**
   * Hits don't interrupt it; they can start phase two.
   * @param {boolean} _poiseBroken
   * @param {number} hpFraction
   */
  onHit(_poiseBroken, hpFraction) {
    this.aware = true;
    if (this.phase === 1 && hpFraction <= this.def.phaseTwoAt) this.phaseTwoPending = true;
  }

  onDeath() {
    this.fsm.go('dead');
  }

  reset() {
    this.aware = false;
    this.phase = 1;
    this.phaseTwoPending = false;
    this.rest = 60;
    this.fsm.force('dormant');
  }
}
