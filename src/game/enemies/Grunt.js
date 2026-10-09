import { approachAngle, yawFromDirection, DEG } from '../../engine/index.js';
import { ENEMIES } from '../data/actors.js';
import { isInFront } from '../combat/hitboxes.js';
import { GruntBrain } from './GruntBrain.js';

/**
 * A sword-and-shield grunt: the body that carries out GruntBrain's
 * decisions. It moves with the character controller, takes hits, blocks from
 * the front only, and has poise: hits wear it down, and when it breaks the
 * grunt staggers for a long time.
 */
export class Grunt {
  /**
   * @param {string} id
   * @param {import('../player/Player.js').Body} body
   * @param {{ x: number, y: number, z: number }} spawn
   * @param {number} yaw
   */
  constructor(id, body, spawn, yaw) {
    this.id = id;
    /** @type {'enemy'} */
    this.team = 'enemy';
    this.kind = 'grunt';
    this.def = ENEMIES.grunt;
    this.body = body;
    this.spawn = { position: { ...spawn }, yaw };
    this.radius = this.def.radius;
    this.height = this.def.height;
    this.maxHp = this.def.maxHp;
    this.hp = this.maxHp;
    this.poise = this.def.poise;
    this.facing = yaw;
    this.velocity = { x: 0, z: 0 };
    this.push = { x: 0, z: 0 };
    this.brain = new GruntBrain(id);
    this.swingHits = new Set();
    /** Seconds until it respawns, once dead. */
    this.respawnTimer = 0;
    /** The spawn point's name in its area (spawn_enemy_<type>_<name>), for defeat effects. */
    this.spawnName = '';
  }

  get position() {
    return this.body.position;
  }

  get alive() {
    return this.hp > 0;
  }

  get state() {
    return this.brain.state;
  }

  get attack() {
    return this.brain.attack;
  }

  /** Frame in the attack timeline (wind-up + active + recovery) executed this update, or -1. */
  get attackFrame() {
    return this.brain.frameNow;
  }

  isInvulnerable() {
    return !this.alive;
  }

  /** @param {{ x: number, z: number }} from */
  blocks(from) {
    return this.brain.state === 'block' && isInFront(this.position, this.facing, from, this.def.blockHalfAngle);
  }

  /**
   * @param {import('./GruntBrain.js').BrainContext} brainCtx
   * @param {number} dt
   */
  update(brainCtx, dt) {
    if (this.brain.state === 'windup' && this.brain.fsm.frames === 0) this.swingHits = new Set();
    this.brain.update(brainCtx);
    const intent = this.brain.intent;
    const see = brainCtx.see;

    if (intent.face !== null && intent.turnRate > 0) {
      this.facing = approachAngle(this.facing, intent.face, intent.turnRate * DEG * dt);
    }
    // Where to go, on the ground plane.
    const toward = { x: Math.sin(see.bearing), z: Math.cos(see.bearing) };
    let tx = 0;
    let tz = 0;
    if (intent.move === 'toward') {
      tx = toward.x;
      tz = toward.z;
    } else if (intent.move === 'away') {
      tx = -toward.x;
      tz = -toward.z;
    } else if (intent.move === 'circle') {
      tx = toward.z * this.brain.circleDir;
      tz = -toward.x * this.brain.circleDir;
    }
    if (intent.move === 'toward' || intent.move === 'away') {
      // Face where it walks unless it's also told to face the player.
      if (intent.face === null) this.facing = approachAngle(this.facing, yawFromDirection(tx, tz), 6 * dt);
    }
    // Lunge during the attack's active frames.
    let lunge = 0;
    if (this.brain.state === 'attack') lunge = this.attack.lunge;
    const speed = intent.speed;
    const k = 1 - Math.exp(-dt * 10);
    this.velocity.x += (tx * speed + Math.sin(this.facing) * lunge - this.velocity.x) * k;
    this.velocity.z += (tz * speed + Math.cos(this.facing) * lunge - this.velocity.z) * k;

    const decay = Math.exp(-dt * 6);
    this.push.x *= decay;
    this.push.z *= decay;
    if (this.alive) this.body.move((this.velocity.x + this.push.x) * dt, (this.velocity.z + this.push.z) * dt, dt);
  }

  /**
   * @param {{ damage: number, poise: number, knockback: { x: number, z: number } }} hit
   */
  takeHit(hit) {
    this.hp = Math.max(0, this.hp - hit.damage);
    this.push.x += hit.knockback.x;
    this.push.z += hit.knockback.z;
    this.velocity.x = this.velocity.z = 0;
    if (this.hp <= 0) {
      this.brain.onDeath();
      this.respawnTimer = this.def.respawnSeconds;
      return;
    }
    this.poise -= hit.poise;
    const broken = this.poise <= 0;
    if (broken) this.poise = this.def.poise;
    this.brain.onHit(broken);
  }

  /** @param {{ knockback: { x: number, z: number } }} hit */
  blockHit(hit) {
    this.push.x += hit.knockback.x * 0.5;
    this.push.z += hit.knockback.z * 0.5;
  }

  /** @param {(p: { x: number, y: number, z: number }) => void} teleport */
  respawn(teleport) {
    teleport(this.spawn.position);
    this.hp = this.maxHp;
    this.poise = this.def.poise;
    this.facing = this.spawn.yaw;
    this.velocity = { x: 0, z: 0 };
    this.push = { x: 0, z: 0 };
    this.brain.reset();
  }
}
