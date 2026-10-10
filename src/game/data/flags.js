/**
 * Every story flag the game uses, with what it means.
 *
 * Flags are on/off switches saved with the game. Dialogues and objects set
 * and check them ({ "setFlag": "gate_open" }, { "flag": "warden_defeated" }).
 * The content validator (npm test) rejects any flag not listed here, which
 * catches typos. Add a line here before using a new flag.
 */
export const FLAGS = {
  ina_met: 'Talked to Elder Ina at least once.',
  gate_open: 'Ina opened the Hearth gate (the main quest has begun).',
  hall_gate_open: 'The crystal switch in the Switch Hall was struck: its portcullis is up.',
  vault_chest_opened: 'The chest in the Key Vault was opened (it held the Hearth Key).',
  switch_chest_opened: 'The optional chest in the Switch Hall was opened.',
  ante_chest_opened: 'The optional chest in the antechamber was opened.',
  vault_door_open: 'The Hearth Key opened the door out of the Key Vault.',
  warden_defeated: 'The Cinder Warden was beaten (set by its defeat).',
  hearth_lit: 'The Hearth Ember was set in the Hearth: the ending has played.',
  bram_met: 'Talked to Bram at least once.',
  wren_met: 'Talked to Wren at least once.',
  wren_asked: 'Wren asked the player to find her satchel.',
  satchel_returned: 'The player gave Wren her satchel (and got the Vigor Charm).',
  dorran_met: 'Talked to Dorran at least once.',
  trial_won: 'The player won Dorran\'s ring trial (set by the encounter).',
  blade_given: 'Dorran gave the player the Tempered Blade.',
  ring_seen: 'The player has walked into the training ring once.',
  halls_seen: 'The player has entered the Hearth Halls once.',
  warden_seen: 'The player has walked into the Warden\'s chamber once.',
};
