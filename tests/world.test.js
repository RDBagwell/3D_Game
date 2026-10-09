import { describe, it, expect } from 'vitest';
import { Sandbox } from '../src/game/sim/Sandbox.js';
import { AREAS } from '../src/game/data/areas/index.js';

/**
 * The areas, simulated headless: everyone stands on solid ground, exits lead
 * somewhere real, and the dungeon can be walked end to end once its gates are
 * open (doorways wide enough, no stray colliders).
 */

const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
/** Walk "forward" relative to the camera, which starts behind the player. */
const forward = { move: { x: 0, y: 1 }, look: { x: 0, y: 0 }, buttons: {} };

describe('areas', () => {
  for (const id of Object.keys(AREAS)) {
    it(`${id}: every spawn stands on the ground`, async () => {
      const area = AREAS[/** @type {keyof typeof AREAS} */ (id)];
      const names = Object.keys(area.spawns).length ? Object.keys(area.spawns) : ['start'];
      for (const spawn of names) {
        const sb = await Sandbox.create({ area: id, spawn, grunts: false });
        for (let i = 0; i < 30; i++) sb.step(idle);
        expect(sb.player.body.grounded, `${id}/${spawn}`).toBe(true);
        expect(sb.player.position.y, `${id}/${spawn}`).toBeGreaterThan(-0.1);
        sb.dispose();
      }
    });
  }

  it('every exit leads to an area and spawn that exist', async () => {
    for (const area of Object.values(AREAS)) {
      for (const exit of area.exits ?? []) {
        const target = AREAS[/** @type {keyof typeof AREAS} */ (exit.to)];
        expect(target, `${area.id} → ${exit.to}`).toBeTruthy();
        expect(Object.keys(target.spawns), `${area.id} → ${exit.to}:${exit.spawn}`).toContain(exit.spawn ?? 'start');
      }
    }
  });

  it('the Hearth Halls can be walked from the entrance to the Hearth once the gates are open', async () => {
    const sb = await Sandbox.create({ area: 'halls', grunts: false });
    for (const o of sb.objects) sb.setObject(o.id, { open: o.type !== 'hearth' });
    const start = sb.player.position.z;
    let steps = 0;
    while (sb.player.position.z > -90 && steps < 60 * 30) {
      // Keep to the middle of the corridors.
      const x = sb.player.position.x;
      sb.step({ ...forward, move: { x: Math.max(-1, Math.min(1, -x * 2)), y: 1 } });
      steps++;
    }
    expect(start).toBeGreaterThan(0);
    expect(sb.player.position.z).toBeLessThanOrEqual(-90);
    sb.dispose();
  });

  it('the village can be walked from the dock to the Hearth gate', async () => {
    const sb = await Sandbox.create({ area: 'village', grunts: false });
    // Up the dock, along the path, round the well, to the closed gate.
    const waypoints = [[0, 12], [3, 6.5], [3, 1.5], [0, -2], [0, -29]];
    let next = 0;
    for (let i = 0; i < 60 * 20 && next < waypoints.length; i++) {
      const p = sb.player.position;
      const [wx, wz] = waypoints[next];
      const dx = wx - p.x;
      const dz = wz - p.z;
      if (Math.hypot(dx, dz) < 0.6) {
        next++;
        continue;
      }
      const { forward: f, right: r } = sb.camera.groundAxes();
      const len = Math.hypot(dx, dz);
      sb.step({ ...idle, move: { x: (dx * r.x + dz * r.z) / len, y: (dx * f.x + dz * f.z) / len } });
    }
    expect(next).toBe(waypoints.length);
    sb.dispose();
  });

  it('closed gates block the way', async () => {
    const sb = await Sandbox.create({ area: 'halls', grunts: false });
    for (let i = 0; i < 60 * 12; i++) sb.step({ ...forward, move: { x: Math.max(-1, Math.min(1, -sb.player.position.x * 2)), y: 1 } });
    // Stopped at the Switch Hall's portcullis (z = -28.5).
    expect(sb.player.position.z).toBeGreaterThan(-28.5);
    expect(sb.player.position.z).toBeLessThan(-25);
    sb.dispose();
  });

  it('walking into an exit reports it once', async () => {
    const sb = await Sandbox.create({ area: 'halls', spawn: 'entrance', grunts: false });
    /** @type {any[]} */
    const exits = [];
    sb.events.on('exit', (e) => exits.push(e));
    sb.player.facing = 0;
    sb.camera.reset(sb.player.position, 0);
    for (let i = 0; i < 120; i++) sb.step(forward);
    expect(exits).toEqual([{ area: 'village', spawn: 'gate' }]);
    sb.dispose();
  });

  it('falling out of the world puts the hero back on the last solid ground, a little hurt', async () => {
    const sb = await Sandbox.create({ area: AREAS.village });
    const idle = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, buttons: {} };
    for (let i = 0; i < 30; i++) sb.step(idle); // stand on the dock long enough to be remembered
    const safe = { ...sb.player.position };
    let fell = 0;
    sb.events.on('fellOut', () => fell++);
    const hp = sb.player.hp;
    sb.player.body.teleport({ x: safe.x + 300, y: -50, z: safe.z }); // somewhere far below the world
    sb.step(idle);
    expect(fell).toBe(1);
    expect(Math.hypot(sb.player.position.x - safe.x, sb.player.position.z - safe.z)).toBeLessThan(0.5);
    expect(sb.player.hp).toBeLessThan(hp);
    expect(sb.player.alive).toBe(true);
    sb.dispose();
  });
});
