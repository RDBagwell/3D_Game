import { ENEMIES } from '../data/actors.js';

/**
 * The training dummy: it never fights back and never dies. It counts the
 * damage it takes and keeps a short history of hits, so the HUD can show
 * damage numbers and the lab can show how far knockback pushed it (it slides
 * back and returns to its post).
 */
export class Dummy {
  /**
   * @param {string} id
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} yaw
   */
  constructor(id, position, yaw) {
    this.id = id;
    /** @type {'enemy'} */
    this.team = 'enemy';
    this.kind = 'dummy';
    this.def = ENEMIES.dummy;
    this.home = { ...position };
    this.position = { ...position };
    this.facing = yaw;
    this.radius = this.def.radius;
    this.height = this.def.height;
    this.maxHp = this.def.maxHp;
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'idle';
    /** Displacement from its post, metres (knockback slides it back, a spring returns it). */
    this.offset = { x: 0, z: 0 };
    this.offsetVel = { x: 0, z: 0 };
    this.totalDamage = 0;
    this.hits = 0;
    /** Frames since the last hit (for its wobble). */
    this.sinceHit = 999;
  }

  isInvulnerable() {
    return false;
  }

  blocks() {
    return false;
  }

  /** @param {number} dt */
  update(dt) {
    this.sinceHit++;
    // A stiff spring back to the post.
    const k = 30;
    const c = 9;
    for (const axis of /** @type {const} */ (['x', 'z'])) {
      const a = -k * this.offset[axis] - c * this.offsetVel[axis];
      this.offsetVel[axis] += a * dt;
      this.offset[axis] += this.offsetVel[axis] * dt;
    }
    this.position.x = this.home.x + this.offset.x;
    this.position.z = this.home.z + this.offset.z;
  }

  /** @param {{ damage: number, knockback: { x: number, z: number } }} hit */
  takeHit(hit) {
    this.totalDamage += hit.damage;
    this.hits++;
    this.sinceHit = 0;
    this.offsetVel.x += hit.knockback.x * 0.6;
    this.offsetVel.z += hit.knockback.z * 0.6;
    if (this.hp - hit.damage <= 0) this.hp = this.maxHp;
    else this.hp -= hit.damage;
  }

  blockHit() {}
}
