/**
 * Quests, as shown in the quest log (pause menu → Quests). Same format as
 * Island RPG's data/quests.js.
 *
 * A quest only *describes* progress: dialogues, objects and fights set
 * flags; the log reads them. So every quest lives in one place without
 * touching the dialogues.
 *
 *   name       title in the log
 *   main       the main quest (listed first)
 *   stages     [{ when, text }]: the log shows the text of the LAST stage
 *              whose `when` condition is true. If none is, the quest isn't
 *              shown yet. A new stage shows a "Quest updated" notice.
 *   done       condition: when true, the quest is complete...
 *   doneText   ...and this text is shown instead.
 */
export const QUESTS = {
  hearth: {
    name: 'The Cold Hearth',
    main: true,
    stages: [
      { when: { hasItem: 'lamp_crate' }, text: 'Your crate of lamp-stones won\'t light. Ask in the village: Elder Ina keeps the Hearth, by the gate north of the square.' },
      { when: { flag: 'ina_met' }, text: 'The Hearth under the hill has gone out. Elder Ina is by the gate, waiting to see if you\'ll go down.' },
      { when: { flag: 'gate_open' }, text: 'Ina opened the Hearth gate. Go down into the Hearth Halls and find out why the fire went out.' },
      { when: { flag: 'hall_gate_open' }, text: 'The Switch Hall\'s portcullis is up. Keep going down.' },
      { when: { hasItem: 'hearth_key' }, text: 'You found the Hearth Key. It opens the door out of the Key Vault.' },
      { when: { flag: 'vault_door_open' }, text: 'Past the Key Vault, the halls lead down to the Hearth itself. Rest at the hearthstone first.' },
      { when: { flag: 'warden_defeated' }, text: 'The Cinder Warden is beaten. Set the Hearth Ember in the cold Hearth.' },
    ],
    done: { flag: 'hearth_lit' },
    doneText: 'The Hearth burns again, and the wisps are coming home.',
  },
  satchel: {
    name: 'Wren\'s Satchel',
    stages: [
      { when: { flag: 'wren_asked' }, text: 'Wren lost her satchel of notes on the rocks behind the houses, north-east of the square.' },
      { when: { hasItem: 'satchel' }, text: 'You found Wren\'s satchel. Take it back to her on the shore.' },
    ],
    done: { flag: 'satchel_returned' },
    doneText: 'Wren has her notes back, and gave you her Vigor Charm.',
  },
  trial: {
    name: 'Dorran\'s Ring Trial',
    stages: [
      { when: { flag: 'dorran_met' }, text: 'Dorran runs a trial in the training ring: beat everything he lets loose. Talk to him when you\'re ready.' },
      { when: { flag: 'trial_won' }, text: 'You won the ring trial. Dorran owes you a sword.' },
    ],
    done: { flag: 'blade_given' },
    doneText: 'You won Dorran\'s ring trial. His Tempered Blade is yours.',
  },
};
