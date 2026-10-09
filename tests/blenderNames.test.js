import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseNodeName, baseName, createPhysics, Level } from '../src/engine/index.js';
import { buildTrainingGrounds } from '../src/game/scenes/trainingGrounds.js';

/** Node names from a .glb file's JSON chunk. */
function glbNodeNames(file) {
  const data = fs.readFileSync(fileURLToPath(new URL(file, import.meta.url)));
  const length = data.readUInt32LE(12);
  return JSON.parse(data.subarray(20, 20 + length).toString('utf8')).nodes.map((/** @type {any} */ n) => n.name);
}

describe('Blender naming convention', () => {
  it('strips Blender\'s duplicate suffixes', () => {
    expect(baseName('collider.003')).toBe('collider');
    expect(baseName('Area_Stone_.012')).toBe('area_stone_');
  });

  it('recognises every kind of object', () => {
    expect(parseNodeName('collider1')).toEqual({ kind: 'collider' });
    expect(parseNodeName('collider_box_wall.002')).toEqual({ kind: 'colliderBox' });
    expect(parseNodeName('area_stone_.004')).toEqual({ kind: 'area', surface: 'stone' });
    expect(parseNodeName('area_wood_end')).toEqual({ kind: 'area', surface: 'wood' });
    expect(parseNodeName('spawn_player')).toEqual({ kind: 'spawn', role: 'player', name: 'start' });
    expect(parseNodeName('spawn_player_dock')).toEqual({ kind: 'spawn', role: 'player', name: 'dock' });
    expect(parseNodeName('spawn_enemy_grunt_a.001')).toEqual({ kind: 'spawn', role: 'enemy', enemyType: 'grunt', name: 'a' });
    expect(parseNodeName('spawn_enemy_dummy')).toEqual({ kind: 'spawn', role: 'enemy', enemyType: 'dummy', name: 'dummy' });
    expect(parseNodeName('trigger_arena_gate')).toEqual({ kind: 'trigger', id: 'arena' });
    expect(parseNodeName('exit_halls')).toEqual({ kind: 'exit', area: 'halls', spawn: 'start' });
    expect(parseNodeName('exit_village_gate.002')).toEqual({ kind: 'exit', area: 'village', spawn: 'gate' });
    expect(parseNodeName('npc_ina')).toEqual({ kind: 'npc', id: 'ina' });
    expect(parseNodeName('object_vault_chest')).toEqual({ kind: 'object', id: 'vault_chest' });
    expect(parseNodeName('marker_ring_a')).toEqual({ kind: 'marker', name: 'ring_a' });
    expect(parseNodeName('npc_')).toEqual({ kind: 'visual' });
    expect(parseNodeName('rock_cast_receive.001')).toEqual({ kind: 'visual' });
    expect(parseNodeName('area_')).toEqual({ kind: 'visual' });
    expect(parseNodeName('')).toEqual({ kind: 'visual' });
  });

  it('reads Robert\'s 2024 level export (world0.glb) the way the old game did', () => {
    const names = glbNodeNames('../art/blender/exports/world0.glb');
    const kinds = names.map(parseNodeName);
    expect(kinds.filter((k) => k.kind === 'collider')).toHaveLength(2); // collider1, collider2
    const surfaces = new Set(kinds.filter((k) => k.kind === 'area').map((k) => /** @type {any} */ (k).surface));
    // The old surfaces, plus "trigger" from its area_trigger object.
    expect([...surfaces].sort()).toEqual(['dirt', 'stone', 'trigger', 'wood']);
    expect(kinds.filter((k) => k.kind === 'visual').length).toBeGreaterThan(3);
  });

  it('builds the training grounds through the same path as a Blender export', async () => {
    const physics = await createPhysics();
    const level = Level.fromScene(buildTrainingGrounds(), physics);
    expect(level.colliderCount).toBeGreaterThan(10);
    expect(level.spawns.player.start).toBeDefined();
    expect(level.spawns.enemies.map((e) => e.type).sort()).toEqual(['dummy', 'grunt', 'grunt', 'grunt']);
    expect(level.surfaceAt({ x: 0, y: 0, z: -4 })).toBe('stone'); // the plaza
    expect(level.surfaceAt({ x: 9.5, y: 1.5, z: -8.5 })).toBe('wood'); // the deck
    expect(level.surfaceAt({ x: 0, y: 0, z: -28 })).toBe('dirt'); // the arena
    expect(level.surfaceAt({ x: 15, y: 0, z: 5 })).toBe('grass'); // the default
    expect(level.triggers.map((t) => t.id)).toEqual(['arena']);
    // Hidden helpers: no collider, area, spawn or trigger is drawn.
    level.root.traverse((o) => {
      if (parseNodeName(o.name).kind !== 'visual') expect(o.visible, o.name).toBe(false);
    });
    physics.dispose();
  });

  it('reports trigger enters and exits once each', async () => {
    const physics = await createPhysics();
    const level = Level.fromScene(buildTrainingGrounds(), physics);
    const log = [];
    for (const z of [-15, -18, -18.2, -21, -18]) level.updateTriggers('p', { x: 0, y: 0, z }, (id) => log.push(`in:${id}`), (id) => log.push(`out:${id}`));
    expect(log).toEqual(['in:arena', 'out:arena', 'in:arena']);
    physics.dispose();
  });
});
