/**
 * Events: what happens when the player walks into a trigger_<id> box (the
 * same format as Island RPG's data/events.js).
 *
 *   if        condition; the event only runs when it's true
 *   once      a flag: set when the event runs, and the event never runs again
 *   effects   effects to apply
 *   banner    a line shown across the screen
 *
 * Every trigger placed in an area must have an event here, and every event
 * is checked by the content validator (npm test).
 */
export const EVENTS = {
  ring: { once: 'ring_seen', banner: 'The training ring. Dorran keeps an eye on it.' },
  arena: { if: { notFlag: 'warden_defeated' }, once: 'warden_seen', banner: 'The Hearth. Something huge stands guard over the cold ash.' },
  steps: { once: 'halls_seen', banner: 'The Hearth Halls. The air smells of cold ash.' },
};
