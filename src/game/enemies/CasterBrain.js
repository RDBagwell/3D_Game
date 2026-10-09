import { StateMachine, angleDelta, DEG } from '../../engine/index.js';

/**
 * The ash adept's decisions: a ranged caster that keeps its distance.
 *
 *   idle ──sees you──▶ chase ──in range──▶ keep (strafe at range) ──its turn──▶ cast ──▶ recover ─┐
 *                        ▲                  │ ▲ you close in                                       │
 *                        └──────────────────┘ └── flee (backs away fast) ◀──────────────────────────┘
 *   hit ──▶ hitstun (short), or stagger when its poise breaks      hp 0 ──▶ dead
 *
 * Fairness, as with the grunt:
 *   - one adept casts at a time (the attack token);
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

/** @typedef {'idle' | 'chase' | 'keep' | 'flee' | 'cast' | 'recover' | 'hitstun' | 'stagger' | 'dead'} CasterState */

/** @type {Record<CasterState, CasterState[]>} */
export const CASTER_TRANSITIONS = {
  idle: ['chase', 'hitstun', 'stagger', 'dead'],
  chase: ['idle', 'keep', 'flee', 'hitstun', 'stagger', 'dead'],
  keep: ['idle', 'chase', 'flee', 'cast', 'hitstun', 'stagger', 'dead'],
  flee: ['idle', 'chase', 'keep', 'cast', 'hitstun', 'stagger', 'dead'],
  cast: ['recover', 'hitstun', 'stagger', 'dead'],
  recover: ['keep', 'chase', 'flee', 'hitstun', 'stagger', 'dead'],
  hitstun: ['hitstun', 'keep', 'flee', 'chase', 'stagger', 'dead'],
  stagger: ['keep', 'flee', 'chase', 'hitstun', 'dead'],
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
    const see = ctx.see;
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
      if (this.cooldown > 0 || d < 2.5 || d > far + 3) return false;
      if (!ctx().requestToken(this.id)) return false;
      return this.fsm.go('cast');
    };

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
          set('toward', this.def.runSpeed);
          if (ctx().see.distance <= far) this.fsm.go('keep');
        },
      },
      keep: {
        enter: () => {
          this.circleTimer = 50 + Math.floor((this.ctx?.random() ?? 0.5) * 60);
        },
        update: () => {
          if (!this.aware) return void this.fsm.go('idle');
          if (position() || tryCast()) return;
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
          if (!this.aware) return void this.fsm.go('idle');
          set('away', this.def.runSpeed);
          // Cornered for a while? Turn and cast anyway (still telegraphed).
          if (this.fsm.frames > 90 && tryCast()) return;
          if (ctx().see.distance >= near) this.fsm.go('keep');
        },
      },
      cast: {
        enter: () => {
          this.windupProgress = 0;
          ctx().emit('windup', { id: this.id, cast: this.def.cast });
        },
        update: () => {
          const f = this.fsm.frames / (ctx().slow ?? 1);
          const total = this.def.castFrames;
          this.windupProgress = Math.min(1, f / total);
          if (f >= total - this.def.commitFrames) stop(ctx().facing);
          else set('none', 0, this.def.windupTurn);
          if (f >= total) {
            ctx().shoot?.(this.def.cast, ctx().facing);
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
    this.fsm.go(ctx.see.distance < this.def.fleeRange ? 'flee' : 'keep');
  }

  /** @param {boolean} poiseBroken */
  onHit(poiseBroken) {
    this.aware = true;
    this.fsm.go(poiseBroken ? 'stagger' : 'hitstun');
  }

  onDeath() {
    this.fsm.go('dead');
  }

  reset() {
    this.aware = false;
    this.cooldown = 60;
    this.fsm.force('idle');
  }
}
