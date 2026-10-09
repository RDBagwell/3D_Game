/**
 * Every attack, as frame data. Balancing an attack is a change here, not in
 * code.
 *
 * Frames are simulation updates at 60 per second, counted from 0 when the
 * attack starts:
 *
 *   frame:  0 ........ startup ........ startup+active ........ total
 *           |  startup (wind-up)  |  active  |      recovery      |
 *                                  hitbox on
 *
 *   startup      frames before the hitbox appears (the wind-up you can react to)
 *   active       frames the hitbox exists; each target is hit at most once
 *   recovery     frames after, when the attacker is open to punishment
 *   damage       hit points taken from the target
 *   poise        how much it wears down a target's poise (break it to stagger)
 *   knockback    m/s pushed away from the attacker (scaled by the lab's slider)
 *   hitstun      frames the target can't act after being hit
 *   hitstop      frames the whole fight freezes on impact (scaled by the lab)
 *   knockdown    true: the target falls over instead of flinching
 *   windupSound  the sound its wind-up makes, when it isn't the enemy's usual
 *                one (the Warden's two attacks sound different)
 *   counterHit   true: if it lands while the hero is still winding up a swing
 *                (the swing's startup frames), the hero is knocked down (a
 *                "counter hit", Sandbox.applyHit). Only heavy blows have it:
 *                a swing that's already cutting, or a light bite, just flinches
 *   shake        camera trauma, 0..1
 *   lunge        m/s the attacker steps forward during startup and active frames
 *   hitbox       a sphere that sweeps through an arc during the active frames:
 *                reach (m in front), radius (m), height (m above the feet),
 *                arcFrom / arcTo (degrees from straight ahead; negative = left)
 *   next         the attack a buffered press chains into (a combo), if any
 *   chainFrom    first frame the next attack may start (presses up to the
 *                lab's "combo buffer" frames earlier still count)
 *   pauseNext    the attack a press chains into after a pause instead (a press
 *                late in this attack's recovery, or just after it ends:
 *                PLAYER.combo.pauseWindow)
 *   guardBreak   true: a blocked hit still lands and breaks the target's guard
 *                (the shield bash)
 *   rollCancelFrom  first frame a roll may interrupt the attack, when the lab's
 *                "attack-cancel windows" is on; otherwise only after `total`
 *   anim         the animation clip
 *   animImpact   (the hero's attacks) how far through the clip, 0..1, its
 *                blade moves fastest: the clip is timed so that moment lands
 *                in the middle of the active frames, when the hit is dealt.
 *                Measured from the knight's clips (the sword tip's speed,
 *                sampled at 120 points; Phase 2 of docs/ROADMAP.md).
 *                Without it, the clip is stretched over the whole attack
 *
 * docs/GAME-FEEL.md has a diagram of slash1 with its buffer window.
 */

/**
 * @typedef {object} Attack
 * @property {string} name
 * @property {string} anim
 * @property {number} [animImpact]
 * @property {number} startup
 * @property {number} active
 * @property {number} recovery
 * @property {number} damage
 * @property {number} poise
 * @property {number} knockback
 * @property {number} hitstun
 * @property {number} hitstop
 * @property {boolean} [knockdown]
 * @property {boolean} [counterHit]
 * @property {string} [windupSound]  a sound (data/sounds.js) for its wind-up, if not the enemy's usual
 * @property {number} shake
 * @property {number} lunge
 * @property {{ reach: number, radius: number, height: number, arcFrom: number, arcTo: number }} hitbox
 * @property {string | null} next
 * @property {string} [pauseNext]
 * @property {boolean} [guardBreak]
 * @property {number} chainFrom
 * @property {number} rollCancelFrom
 */

/** @type {Record<string, Attack>} */
export const ATTACKS = {
  slash1: {
    name: 'Slash',
    anim: '1H_Melee_Attack_Slice_Diagonal',
    animImpact: 0.375,
    startup: 7,
    active: 4,
    recovery: 17,
    damage: 8,
    poise: 9,
    knockback: 2.5,
    hitstun: 16,
    hitstop: 4,
    shake: 0.22,
    lunge: 2.6,
    hitbox: { reach: 1.05, radius: 0.5, height: 1.0, arcFrom: -55, arcTo: 45 },
    next: 'slash2',
    chainFrom: 13,
    rollCancelFrom: 12,
  },
  slash2: {
    name: 'Return slash',
    anim: '1H_Melee_Attack_Slice_Horizontal',
    animImpact: 0.233,
    startup: 6,
    active: 4,
    recovery: 18,
    damage: 9,
    poise: 9,
    knockback: 2.5,
    hitstun: 16,
    hitstop: 4,
    shake: 0.24,
    lunge: 2.6,
    hitbox: { reach: 1.1, radius: 0.5, height: 1.0, arcFrom: 55, arcTo: -50 },
    next: 'slash3',
    // Pause before the third press and it's a thrust instead of the chop.
    pauseNext: 'thrust',
    chainFrom: 12,
    rollCancelFrom: 11,
  },
  slash3: {
    name: 'Overhead chop',
    anim: '1H_Melee_Attack_Chop',
    animImpact: 0.508,
    startup: 13,
    active: 5,
    recovery: 26,
    damage: 16,
    poise: 20,
    knockback: 6.5,
    hitstun: 26,
    hitstop: 9,
    knockdown: false,
    shake: 0.45,
    lunge: 3.4,
    hitbox: { reach: 1.2, radius: 0.6, height: 0.9, arcFrom: -8, arcTo: 8 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 19,
  },

  // The hero's other openers and finishers (Phase 3 of docs/ROADMAP.md).
  // Which one starts depends on what the hero was doing: Player.opener.

  // Attacking out of a full run: a lunging thrust that keeps your momentum.
  dashSlash: {
    name: 'Running thrust',
    anim: '1H_Melee_Attack_Stab',
    animImpact: 0.242,
    startup: 8,
    active: 5,
    recovery: 20,
    damage: 11,
    poise: 14,
    knockback: 4,
    hitstun: 20,
    hitstop: 6,
    shake: 0.3,
    lunge: 6,
    hitbox: { reach: 1.3, radius: 0.45, height: 1.0, arcFrom: -10, arcTo: 10 },
    next: 'slash2',
    chainFrom: 15,
    rollCancelFrom: 13,
  },
  // Attacking out of the end of a roll: a quick, wide sweep.
  rollSlash: {
    name: 'Rolling sweep',
    anim: '1H_Melee_Attack_Slice_Horizontal',
    animImpact: 0.233,
    startup: 5,
    active: 4,
    recovery: 18,
    damage: 9,
    poise: 10,
    knockback: 3,
    hitstun: 16,
    hitstop: 5,
    shake: 0.24,
    lunge: 3.2,
    hitbox: { reach: 1.1, radius: 0.5, height: 1.0, arcFrom: 70, arcTo: -60 },
    next: 'slash2',
    chainFrom: 11,
    rollCancelFrom: 11,
  },
  // Pausing before the third hit: a long thrust instead of the chop.
  thrust: {
    name: 'Thrust',
    anim: '1H_Melee_Attack_Stab',
    animImpact: 0.242,
    startup: 10,
    active: 5,
    recovery: 22,
    damage: 14,
    poise: 24,
    knockback: 7,
    hitstun: 24,
    hitstop: 8,
    shake: 0.35,
    lunge: 4.5,
    hitbox: { reach: 1.45, radius: 0.45, height: 1.0, arcFrom: -8, arcTo: 8 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 16,
  },
  // Holding attack through a swing charges the sword; letting go swings it.
  chargeChop: {
    name: 'Charged chop',
    anim: '1H_Melee_Attack_Chop',
    animImpact: 0.508,
    startup: 6,
    active: 6,
    recovery: 26,
    damage: 26,
    poise: 40,
    knockback: 8,
    hitstun: 30,
    hitstop: 10,
    shake: 0.5,
    lunge: 3.5,
    hitbox: { reach: 1.3, radius: 0.65, height: 1.0, arcFrom: -40, arcTo: 40 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 18,
  },
  // Attack with the shield up: a shove that breaks a blocking enemy's guard.
  bash: {
    name: 'Shield bash',
    anim: 'Block_Attack',
    // Measured from the shield's far edge, not the sword.
    animImpact: 0.325,
    startup: 6,
    active: 4,
    recovery: 18,
    damage: 4,
    poise: 30,
    knockback: 5,
    hitstun: 18,
    hitstop: 6,
    shake: 0.3,
    lunge: 3,
    guardBreak: true,
    hitbox: { reach: 0.9, radius: 0.55, height: 1.0, arcFrom: -30, arcTo: 30 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 14,
  },

  // The grunt's only attack. Its long startup is the telegraph: a clear
  // wind-up (glow, ground ring, sound) before every hit.
  gruntChop: {
    name: 'Grunt chop',
    anim: '1H_Melee_Attack_Chop',
    startup: 34,
    active: 6,
    recovery: 32,
    damage: 18,
    poise: 0,
    knockback: 5.5,
    hitstun: 22,
    hitstop: 6,
    counterHit: true,
    shake: 0.5,
    lunge: 3.2,
    hitbox: { reach: 1.15, radius: 0.55, height: 0.95, arcFrom: -20, arcTo: 20 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 999,
  },

  // A cindermite's lunge: weak, quick, with a short but visible wind-up.
  miteBite: {
    name: 'Bite',
    anim: 'Unarmed_Melee_Attack_Punch_A',
    startup: 20,
    active: 4,
    recovery: 26,
    damage: 7,
    poise: 0,
    knockback: 2.5,
    hitstun: 14,
    hitstop: 3,
    shake: 0.2,
    lunge: 4.2,
    hitbox: { reach: 0.85, radius: 0.45, height: 0.6, arcFrom: -15, arcTo: 15 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 999,
  },

  // The Cinder Warden. Every attack has a long, loud wind-up; the slam leaves
  // its axe stuck in the floor (the opening).
  wardenSweep: {
    name: 'Sweep',
    anim: '2H_Melee_Attack_Spin',
    startup: 34,
    active: 9,
    recovery: 34,
    damage: 22,
    poise: 0,
    knockback: 7.5,
    hitstun: 26,
    hitstop: 7,
    counterHit: true,
    windupSound: 'boss_windup',
    shake: 0.55,
    lunge: 1.2,
    hitbox: { reach: 2.5, radius: 0.85, height: 1.0, arcFrom: -100, arcTo: 100 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 999,
  },
  wardenSlam: {
    name: 'Slam',
    anim: '2H_Melee_Attack_Chop',
    startup: 48,
    active: 5,
    // After the axe comes free: the stuck time before it is ENEMIES.warden.stuckFrames.
    recovery: 22,
    damage: 32,
    poise: 0,
    knockback: 9,
    hitstun: 30,
    hitstop: 10,
    knockdown: true,
    windupSound: 'boss_slam_windup',
    shake: 0.8,
    lunge: 2.2,
    hitbox: { reach: 2.3, radius: 1.05, height: 0.7, arcFrom: -6, arcTo: 6 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 999,
  },
};

/**
 * Projectiles: thrown by ash adepts and the Warden. They fly straight at
 * `speed`, so a roll through them (i-frames), a raised shield (from the
 * front) or a sword swing (cuts them out of the air) all work.
 *
 *   speed    m/s       radius  m       life  seconds before it fizzles
 *   damage, knockback, hitstun, hitstop, shake: as for attacks
 */

/** @typedef {{ name: string, speed: number, radius: number, life: number, damage: number, knockback: number, hitstun: number, hitstop: number, shake: number, height: number }} ProjectileDef */

/** @type {Record<string, ProjectileDef>} */
export const PROJECTILES = {
  cinderBolt: { name: 'Cinder bolt', speed: 8.5, radius: 0.32, life: 2.6, damage: 12, knockback: 4.5, hitstun: 18, hitstop: 4, shake: 0.25, height: 1.15 },
  ember: { name: 'Ember', speed: 9.5, radius: 0.36, life: 2.4, damage: 14, knockback: 5, hitstun: 20, hitstop: 4, shake: 0.3, height: 1.1 },
};

/** The player's combo, in order: a fresh swing starts with the first. */
export const PLAYER_COMBO = ['slash1', 'slash2', 'slash3'];

/** @param {Attack} attack */
export function totalFrames(attack) {
  return attack.startup + attack.active + attack.recovery;
}
