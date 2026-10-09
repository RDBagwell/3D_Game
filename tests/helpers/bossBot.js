import { Sandbox } from '../../src/game/sim/Sandbox.js';
import { presetValues } from '../../src/game/feel/feelSettings.js';
import { ITEMS } from '../../src/game/data/items.js';

/**
 * A scripted player for the Cinder Warden fight: what a careful first-time
 * player does after reading the telegraphs. It locks on, keeps a few metres
 * away, rolls when a wind-up is nearly done (back from a sweep, sideways from
 * a slam), raises the shield against embers, deals with cindermites first,
 * drinks a tonic when low and the Warden isn't swinging, and attacks when the
 * axe is stuck (the weak point) or a sweep has just whiffed.
 *
 * It sees only what a player sees (states, distances, the telegraph's
 * progress), and only presses buttons. It rolls `reactFrames` before the
 * blow lands: about when the Warden stops turning to follow you, which the
 * telegraph ring shows (it has nearly closed).
 *
 * @param {object} options
 * @param {'polished' | 'raw'} options.preset
 * @param {number} [options.tonics=1]  the tonic you start with; buy more from Bram
 * @param {number} [options.maxHp=100]
 * @param {number} [options.seconds=240]
 * @param {number} [options.reactFrames=8]  how many frames before the blow it rolls
 * @param {(info: any) => void} [options.trace]  called every frame (for tuning)
 */
export async function fightWarden({ preset, tonics = 1, maxHp = 100, seconds = 240, reactFrames = 8, trace }) {
  const sb = await Sandbox.create({ area: 'halls', spawn: 'ante', feel: presetValues(preset), spawnEnemy: (s) => s.name === 'warden', seed: 'warden' });
  const player = sb.player;
  player.maxHp = maxHp;
  player.hp = maxHp;
  player.body.teleport({ x: 0, y: 0, z: -76 });
  player.facing = Math.PI;
  sb.camera.reset(player.position, Math.PI);
  let left = tonics;
  sb.canUseItem = () => left > 0 && player.hp < player.maxHp;
  sb.events.on('useItem', () => {
    left--;
    player.hp = Math.min(player.maxHp, player.hp + (ITEMS.tonic.heal ?? 0));
  });
  const boss = /** @type {any} */ (sb.foes.find((f) => f.def.brain === 'warden'));
  const stats = /** @type {any} */ ({ won: false, frames: 0, hpLeft: 0, tonicsUsed: 0, hitsTaken: 0, phaseTwo: false });
  sb.events.on('drinkStart', () => stats.tonicsUsed++);
  /** What hit the player, for tuning. */
  stats.log = [];
  sb.events.on('hit', (d) => {
    if (d.target === player) {
      stats.hitsTaken++;
      stats.log.push(`${stats.frames}: ${d.attack.name} for ${d.damage} (player ${player.state}, dist ${Math.hypot(boss.position.x - player.position.x, boss.position.z - player.position.z).toFixed(1)})`);
    }
  });
  let rolledFor = -1;

  let attackTimer = 0;
  let wasLocked = false;
  const press = (/** @type {Record<string, boolean>} */ held, /** @type {Record<string, boolean>} */ pressed) => {
    /** @type {Record<string, { down: boolean, pressed: boolean, released: boolean }>} */
    const buttons = {};
    for (const k of new Set([...Object.keys(held), ...Object.keys(pressed)])) buttons[k] = { down: Boolean(held[k] || pressed[k]), pressed: Boolean(pressed[k]), released: false };
    return buttons;
  };

  /** The arena's middle: keep away from the walls. */
  const centre = { x: 0, z: -85.5 };
  /** A world direction as stick input (relative to the camera). */
  const stick = (/** @type {number} */ dx, /** @type {number} */ dz, scale = 1) => {
    const len = Math.hypot(dx, dz) || 1;
    const { forward, right } = sb.camera.groundAxes();
    return { x: ((dx * right.x + dz * right.z) / len) * scale, y: ((dx * forward.x + dz * forward.z) / len) * scale };
  };
  /** Away from the Warden, bent towards the middle of the arena when near a wall. */
  const escape = () => {
    const p = player.position;
    let ax = p.x - boss.position.x;
    let az = p.z - boss.position.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    const cx = centre.x - p.x;
    const cz = centre.z - p.z;
    const fromCentre = Math.hypot(cx, cz);
    const bend = Math.min(1, Math.max(0, (fromCentre - 7) / 5));
    return { x: ax * (1 - bend) + (cx / (fromCentre || 1)) * bend, z: az * (1 - bend) + (cz / (fromCentre || 1)) * bend };
  };

  let windups = 0;
  /** Which way to sidestep this slam (chosen once, when it starts). */
  let side = 1;
  sb.events.on('windup', (d) => {
    if (d.foe !== boss) return;
    windups++;
    const p = player.position;
    const e = escape();
    const perp = { x: -(boss.position.z - p.z), z: boss.position.x - p.x };
    side = perp.x * e.x + perp.z * e.z >= 0 ? 1 : -1;
  });
  for (let frame = 0; frame < seconds * 60; frame++) {
    stats.frames = frame;
    if (!player.alive) break;
    if (!boss.alive) {
      stats.won = true;
      break;
    }
    if (boss.brain.phase === 2) stats.phaseTwo = true;
    const p = player.position;
    const d = Math.hypot(boss.position.x - p.x, boss.position.z - p.z);
    const st = boss.brain.state;
    const mites = sb.foes.filter((f) => f.kind === 'mite' && f.alive);
    const dist = (/** @type {any} */ f) => Math.hypot(f.position.x - p.x, f.position.z - p.z);
    const nearMite = mites.sort((a, b) => dist(a) - dist(b))[0];
    let move = { x: 0, y: 0 };
    /** @type {Record<string, boolean>} */
    const held = {};
    /** @type {Record<string, boolean>} */
    const pressed = {};

    // Lock on to the Warden, or to a cindermite that's close while the Warden isn't swinging.
    const winding = st === 'windup' || st === 'attack' || st === 'cast';
    const target = nearMite && dist(nearMite) < 4 && !winding ? nearMite : boss;
    if (sb.lockTarget !== target && (boss.brain.aware || target !== boss)) sb.setLock(target);

    const reach = boss.attack ? boss.attack.hitbox.reach + boss.attack.hitbox.radius + 0.6 : 4;
    if (st === 'windup' && d < reach + 1) {
      const e = escape();
      if (boss.attack.name === 'Slam') {
        // Step out of the column: sideways, then roll as it comes down.
        move = stick(-(boss.position.z - p.z) * side, (boss.position.x - p.x) * side);
      } else {
        move = stick(e.x, e.z); // run out of the sweep's reach
      }
      const startup = boss.attack.startup;
      if (boss.brain.windupProgress >= (startup - reactFrames) / startup && rolledFor !== windups) {
        rolledFor = windups;
        pressed.roll = true;
      }
    } else if (st === 'cast' || sb.projectiles.length > 0) {
      held.shield = true;
    } else if (player.hp < maxHp * 0.42 && left > 0 && (d > 4.5 || st === 'stuck') && !mites.some((m) => dist(m) < 3)) {
      pressed.useItem = true;
    } else if (target !== boss) {
      // Clear a cindermite.
      if (dist(target) > 1.6) move = stick(target.position.x - p.x, target.position.z - p.z);
      else if (attackTimer <= 0) {
        pressed.attack = true;
        attackTimer = 12;
      }
    } else if (st === 'stuck' || (st === 'recover' && boss.attack.name === 'Sweep')) {
      // The opening: close in and strike.
      if (d > 2.2) move = stick(boss.position.x - p.x, boss.position.z - p.z);
      else if (attackTimer <= 0) {
        pressed.attack = true;
        attackTimer = 12;
      }
    } else if (d < 4.6) {
      const e = escape();
      move = stick(e.x, e.z); // keep out of reach while it lines up
    } else if (d > 6.5) {
      move = stick(boss.position.x - p.x, boss.position.z - p.z);
    } else {
      // Circle at a safe distance.
      const s = Math.sin(frame / 120) > 0 ? 1 : -1;
      move = stick(-(boss.position.z - p.z) * s, (boss.position.x - p.x) * s, 0.6);
    }
    attackTimer--;
    sb.step({ move, look: { x: 0, y: 0 }, buttons: press(held, pressed) });
    trace?.({ x: player.position.x.toFixed(2), z: player.position.z.toFixed(2), frame, st, wp: boss.brain.windupProgress, d, ps: player.state, move, pressed: Object.keys(pressed), held: Object.keys(held), hp: player.hp, lock: sb.lockTarget?.id });
  }
  stats.hpLeft = player.hp;
  stats.bossHpLeft = boss.hp;
  sb.dispose();
  return stats;
}
