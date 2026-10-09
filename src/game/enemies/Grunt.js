import { Enemy } from './Enemy.js';

/**
 * A sword-and-shield grunt: an Enemy with the grunt's numbers and the melee
 * brain (GruntBrain). Kept as its own name because session 1's tests and
 * docs talk about grunts; every other type is just `new Enemy(id, type, ...)`.
 */
export class Grunt extends Enemy {
  /**
   * @param {string} id
   * @param {import('../player/Player.js').Body} body
   * @param {{ x: number, y: number, z: number }} spawn
   * @param {number} yaw
   */
  constructor(id, body, spawn, yaw) {
    super(id, 'grunt', body, spawn, yaw);
  }
}
