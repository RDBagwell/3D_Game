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
 *   knockdown    true: the target falls over instead of flinching. The hero is
 *                also knocked down by any hit that lands mid-swing (a
 *                "counter hit", Sandbox.applyHit)
 *   shake        camera trauma, 0..1
 *   lunge        m/s the attacker steps forward during startup and active frames
 *   hitbox       a sphere that sweeps through an arc during the active frames:
 *                reach (m in front), radius (m), height (m above the feet),
 *                arcFrom / arcTo (degrees from straight ahead; negative = left)
 *   next         the attack a buffered press chains into (a combo), if any
 *   chainFrom    first frame the next attack may start (presses up to the
 *                lab's "combo buffer" frames earlier still count)
 *   rollCancelFrom  first frame a roll may interrupt the attack, when the lab's
 *                "attack-cancel windows" is on; otherwise only after `total`
 *   anim         the animation clip, stretched to the attack's length
 *
 * docs/GAME-FEEL.md has a diagram of slash1 with its buffer window.
 */

/**
 * @typedef {object} Attack
 * @property {string} name
 * @property {string} anim
 * @property {number} startup
 * @property {number} active
 * @property {number} recovery
 * @property {number} damage
 * @property {number} poise
 * @property {number} knockback
 * @property {number} hitstun
 * @property {number} hitstop
 * @property {boolean} [knockdown]
 * @property {number} shake
 * @property {number} lunge
 * @property {{ reach: number, radius: number, height: number, arcFrom: number, arcTo: number }} hitbox
 * @property {string | null} next
 * @property {number} chainFrom
 * @property {number} rollCancelFrom
 */

/** @type {Record<string, Attack>} */
export const ATTACKS = {
  slash1: {
    name: 'Slash',
    anim: '1H_Melee_Attack_Slice_Diagonal',
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
    chainFrom: 12,
    rollCancelFrom: 11,
  },
  slash3: {
    name: 'Overhead chop',
    anim: '1H_Melee_Attack_Chop',
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
    shake: 0.5,
    lunge: 3.2,
    hitbox: { reach: 1.15, radius: 0.55, height: 0.95, arcFrom: -20, arcTo: 20 },
    next: null,
    chainFrom: 999,
    rollCancelFrom: 999,
  },
};

/** The player's combo, in order. */
export const PLAYER_COMBO = ['slash1', 'slash2', 'slash3'];

/** @param {Attack} attack */
export function totalFrames(attack) {
  return attack.startup + attack.active + attack.recovery;
}
