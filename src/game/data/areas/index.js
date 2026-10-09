import { training } from './training.js';
import { village } from './village.js';
import { halls } from './halls.js';

/**
 * Every area in the game, by id. An area is plain data
 * (src/game/world/buildArea.js documents the format); `exit_` boxes and
 * `travel` effects name these ids. The content validator (npm test) checks
 * that every exit and travel leads to an area and spawn that exist, and that
 * every NPC and object placed in an area is defined in data.
 */
export const AREAS = { village, halls, training };

/** Where a new game starts. */
export const START = { area: 'village', spawn: 'start' };
