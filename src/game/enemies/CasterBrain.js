import { StateMachine } from '../../engine/index.js';
import { perceive } from './senses.js';

/**
 * The ash adept's decisions: a ranged caster that keeps its distance.
 *
 *   idle ──sees you──▶ suspicious ──▶ chase ──in range──▶ keep (strafe at range) ──its turn──▶ cast ──▶ recover ─┐
 *                                       ▲                  │ ▲ you close in                                       │
 *                                       └──────────────────┘ └── flee (backs away fast) ◀──────────────────────────┘
 *   lost you ──▶ return (walks home)     you swing at it up close, sometimes ──▶ dodge (a quick sidestep)
 *   hit ──▶ hitstun (short), or stagger when its poise breaks      hp 0 ──▶ dead
 *
 * Its cast is a bolt, or (sometimes, when you're within `flareRange`) a
 * flare: a ring on the ground where you stand that bursts a moment later.
 *
 * Fairness, as with the grunt:
 *   - casting takes a turn from the room's attack budget, like a melee swing;
 *   - every bolt is telegraphed: a wind-up of `castFrames` with its staff
 *     glowing and the warning sign showing, and it stops turning to follow
 *     you `commitFrames` before it lets go, so a sidestep works;
 *   - the bolt is slow enough to see and react to (data/attacks.js
 *     PROJECTILES), and can be rolled through, blocked, or cut down;
 *   - it's fragile up close: catch it and it can't fight back, only run.
 *
 * Same interface as GruntBrain (intent, fsm, telegraph, onHit, onDeath,
 * reset), so the Enemy body and the view treat both alike.
 */

/** @typedef {'idle' | 'suspicious' | 'chase' | 'keep' | 'flee' | 'dodge' | 'cast' | 'recover' | 'hitstun' | 'stagger' | 'return' | 'dead'} CasterState */

/** @type {Record<CasterState, CasterState[]>} */
export const CASTER_TRANSITIONS = {
  idle: ['suspicious', 'chase', 'hitstun', 'stagger', 'dead'],
  suspicious: ['chase', 'idle', 'hitstun', 'stagger', 'dead'],
  chase: ['return', 'keep', 'flee', 'dodge', 'hitstun', 'stagger', 'dead'],
  keep: ['return', 'chase', 'flee', 'dodge', 'cast', 'hitstun', 'stagger', 'dead'],
  flee: ['return', 'chase', 'keep', 'dodge', 'cast', 'hitstun', 'stagger', 'dead'],
  dodge: ['keep', 'flee', 'chase', 'return', 'hitstun', 'stagger', 'dead'],
  cast: ['recover', 'hitstun', 'stagger', 'dead'],
  recover: ['keep', 'chase', 'flee', 'return', 'hitstun', 'stagger', 'dead'],
  hitstun: ['hitstun', 'keep', 'flee', 'chase', 'return', 'stagger', 'dead'],
  stagger: ['keep', 'flee', 'chase', 'return', 'hitstun', 'dead'],
  return: ['idle', 'suspicious', 'chase', 'hitstun', 'stagger', 'dead'],
  dead: [],
};

export class CasterBrain {
  /**
   * @param {string} id
   * @param {any} def  ENEMIES.adept
   */
  constructor(id, def) {
    this.id = id;
    this.def = def;
    /** Casters have no melee swing. @type {any} */
    this.attack = null;
    this.frameNow = -1;
    this.aware = false;
    this.hesitate = false;
    this.unseen = 0;
    /** What the current cast throws: a bolt, or a flare on the ground. @type {'bolt' | 'flare'} */
    this.casting = 'bolt';
    this.lastSwingSeen = 0;
    this.cooldown = 60;
    this.circleDir = 1;
    this.circleTimer = 0;
    this.damageTaken = 1;
    this.invulnerable = false;
    this.telegraph = false;
    this.windupProgress = 0;
    this.newSwing = false;
    /** @type {import('./GruntBrain.js').Intent} */
    this.intent = { move: 'none', speed: 0, face: null, turnRate: 360 };
    /** @type {import('./GruntBrain.js').BrainContext | null} */
    this.ctx = null;
    /** @type {StateMachine<CasterState>} */
    this.fsm = new StateMachine({ states: this.states(), transitions: CASTER_TRANSITIONS, initial: 'idle' });
  }

  get state() {
    return this.fsm.current;
  }

  /** @param {import('./GruntBrain.js').BrainContext} ctx */
  update(ctx) {
    this.ctx = ctx;
    if (this.cooldown > 0) this.cooldown--;
    perceive(this, ctx);
    if (ctx.see.crowdSide && !this.fsm.is('dodge')) this.circleDir = ctx.see.crowdSide;
    this.fsm.update(1 / 60);
    this.telegraph = this.fsm.is('cast');
  }

  /** @returns {Record<CasterState, import('../../engine/core/StateMachine.js').StateDef<CasterState>>} */
  states() {
    const ctx = () => /** @type {import('./GruntBrain.js').BrainContext} */ (this.ctx);
    const set = (/** @type {import('./GruntBrain.js').Intent['move']} */ move, speed = 0, turnRate = 360) => {
      this.intent = { move, speed, face: ctx().see.bearing, turnRate };
    };
    const stop = (/** @type {number | null} */ face = null) => {
      this.intent = { move: 'none', speed: 0, face, turnRate: 0 };
    };
    const [near, far] = this.def.keepAway;
    /** Choose how to hold its distance; true if it changed state. */
    const position = () => {
      const d = ctx().see.distance;
      if (d < this.def.fleeRange) return this.fsm.is('flee') ? false : this.fsm.go('flee');
      if (d > far + 2) return this.fsm.is('chase') ? false : this.fsm.go('chase');
      return false;
    };
    const tryCast = () => {
      const d = ctx().see.distance;
      if (this.cooldown > 0 || d < 2.5 || d > far + 3 || ctx().see.visible === false) return false;
      if (!ctx().requestToken(this.id)) return false;
      const [fmin, fmax] = this.def.flareRange ?? [0, 0];
      this.casting = this.def.flare && d >= fmin && d <= fmax && ctx().random() < (this.def.flareChance ?? 0) ? 'flare' : 'bolt';
      return this.fsm.go('cast');
    };
    /** You start a swing up close: sometimes it sidesteps. */
    const tryDodge = () => {
      const see = ctx().see;
      if (!see.playerAttacking || see.playerSwingId === this.lastSwingSeen) return false;
      this.lastSwingSeen = see.playerSwingId;
      if (see.distance > (this.def.dodgeRange ?? 0) || ctx().random() >= (this.def.dodgeChance ?? 0)) return false;
      this.circleDir = see.crowdSide || (ctx().random() < 0.5 ? -1 : 1);
      return this.fsm.go('dodge');
    };

    return {
      idle: {
        enter: () => stop(),
        update: () => {
          stop();
          if (this.aware) this.fsm.go(this.hesitate ? 'suspicious' : 'chase');
        },
      },
      suspicious: {
        enter: () => ctx().emit('suspicious', { id: this.id }),
        update: () => {
          if (!this.aware) return void this.fsm.go('idle');
          set('none', 0, 300);
          if (this.fsm.frames >= (this.def.suspiciousFrames ?? 0)) this.fsm.go('chase');
        },
      },
      return: {
        update: () => {
          if (this.aware) return void this.fsm.go(this.hesitate ? 'suspicious' : 'chase');
          this.intent = { move: 'home', speed: this.def.walkSpeed, face: null, turnRate: 0 };
          if ((ctx().see.homeDistance ?? 0) < 0.6) this.fsm.go('idle');
        },
      },
      dodge: {
        update: () => {
          set('circle', this.def.dodgeSpeed ?? this.def.runSpeed, 720);
          if (this.fsm.frames >= (this.def.dodgeFrames ?? 1)) this.fsm.go(this.aware ? 'keep' : 'return');
        },
      },
      chase: {
        update: () => {
          if (!this.aware) return void this.fsm.go('return');
          if (tryDodge()) return;
          set('toward', this.def.runSpeed);
          if (ctx().see.distance <= far) this.fsm.go('keep');
        },
      },
      keep: {
        enter: () => {
          this.circleTimer = 50 + Math.floor((this.ctx?.random() ?? 0.5) * 60);
        },
        update: () => {
          if (!this.aware) return void this.fsm.go('return');
          if (tryDodge() || position() || tryCast()) return;
          const d = ctx().see.distance;
          if (--this.circleTimer <= 0) {
            this.circleDir = ctx().random() < 0.5 ? -1 : 1;
            this.circleTimer = 50 + Math.floor(ctx().random() * 60);
          }
          if (d < near) set('away', this.def.walkSpeed);
          else set('circle', this.def.walkSpeed * 0.7);
        },
      },
      flee: {
        update: () => {
          if (!this.aware) return void this.fsm.go('return');
          if (tryDodge()) return;
          set('away', this.def.runSpeed);
          // Cornered for a while? Turn and cast anyway (still telegraphed).
          if (this.fsm.frames > 90 && tryCast()) return;
          if (ctx().see.distance >= near) this.fsm.go('keep');
        },
      },
      cast: {
        enter: () => {
          this.windupProgress = 0;
          ctx().emit('windup', { id: this.id, cast: this.casting === 'flare' ? this.def.flare : this.def.cast });
        },
        update: () => {
          const f = this.fsm.frames / (ctx().slow ?? 1);
          const total = this.def.castFrames;
          this.windupProgress = Math.min(1, f / total);
          if (f >= total - this.def.commitFrames) stop(ctx().facing);
          else set('none', 0, this.def.windupTurn);
          if (f >= total) {
            if (this.casting === 'flare') ctx().flare?.(this.def.flare);
            else ctx().shoot?.(this.def.cast, ctx().facing);
            this.fsm.go('recover');
          }
        },
      },
      recover: {
        update: () => {
          stop();
          if (this.fsm.frames >= this.def.castRecovery) this.finishTurn();
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
          this.ctx?.releaseToken(this.id);
          this.intent = { move: 'none', speed: 0, face: null, turnRate: 0 };
        },
      },
    };
  }

  /** @private */
  finishTurn() {
    const ctx = /** @type {import('./GruntBrain.js').BrainContext} */ (this.ctx);
    ctx.releaseToken(this.id);
    const [min, max] = this.def.cooldown;
    this.cooldown = Math.round(min + ctx.random() * (max - min));
    if (!this.aware) return void this.fsm.go('return');
    this.fsm.go(ctx.see.distance < this.def.fleeRange ? 'flee' : 'keep');
  }

  /** Told by an ally that the player is here: come at once. */
  alert() {
    if (this.aware || this.fsm.is('dead')) return false;
    this.aware = true;
    this.hesitate = false;
    return true;
  }

  /** @param {boolean} poiseBroken */
  onHit(poiseBroken) {
    this.aware = true;
    this.hesitate = false;
    this.fsm.go(poiseBroken ? 'stagger' : 'hitstun');
  }

  onDeath() {
    this.fsm.go('dead');
  }

  reset() {
    this.aware = false;
    this.hesitate = false;
    this.unseen = 0;
    this.cooldown = 60;
    this.fsm.force('idle');
  }
}
