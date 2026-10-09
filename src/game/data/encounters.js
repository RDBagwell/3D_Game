/**
 * Encounters: fights that start from dialogue ({ "encounter": "ring_trial" })
 * and end with effects when every wave is beaten.
 *
 *   area     where it happens (the player must be there)
 *   waves    each a list of { type, at }: an enemy type (actors.js ENEMIES)
 *            and a marker_<name> in the area; the next wave comes when the
 *            last one is down
 *   win      effects when the last wave falls
 *   intro    banner when it starts; outro when it's won
 *
 * Losing (falling) just ends it; you can try again.
 */
export const ENCOUNTERS = {
  ring_trial: {
    area: 'village',
    intro: 'Dorran opens the pens. Wave one!',
    waves: [
      [{ type: 'mite', at: 'ring_a' }, { type: 'mite', at: 'ring_b' }, { type: 'mite', at: 'ring_c' }],
      [{ type: 'grunt', at: 'ring_a' }, { type: 'adept', at: 'ring_d' }],
    ],
    win: [{ setFlag: 'trial_won' }],
    outro: 'The ring falls quiet. Dorran is clapping, slowly.',
  },
};
