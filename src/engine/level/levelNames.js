/**
 * The Blender naming convention: what an object's name in Blender means to
 * the game. Levels are built in Blender and exported as glTF; no code changes
 * are needed to add walls, floors, surfaces, spawns or triggers.
 * docs/BLENDER.md is the guide for level builders; this is the parser.
 *
 *   name                          kind        meaning
 *   ─────────────────────────────────────────────────────────────────────────
 *   collider…                     collider    invisible static triangle mesh
 *   collider_box…                 colliderBox invisible static box (its bounds; cheaper)
 *   area_<surface>_…              area        surface zone: footsteps (grass, stone…)
 *   spawn_player[_<name>]         spawn       where the player starts (an Empty works)
 *   spawn_enemy_<type>[_<name>]   spawn       an enemy of <type> (grunt, dummy…)
 *   trigger_<id>[_…]              trigger     invisible box that fires "<id>" on enter/exit
 *   anything else                 visual      drawn, no collision
 *
 * Blender adds ".001", ".002"... to duplicated names; that suffix is ignored,
 * so `collider.003` is a collider and `area_stone_.004` is stone. Names are
 * case-insensitive. The 2024 prototype's names (`collider1`, `area_dirt_`,
 * `area_wood_end`) keep working.
 *
 * Pure functions: no Three.js here, so it's easy to test against real exports
 * (tests/blenderNames.test.js reads Robert's world0.glb).
 */

/**
 * @typedef {(
 *   | { kind: 'collider' }
 *   | { kind: 'colliderBox' }
 *   | { kind: 'area', surface: string }
 *   | { kind: 'spawn', role: 'player', name: string }
 *   | { kind: 'spawn', role: 'enemy', enemyType: string, name: string }
 *   | { kind: 'trigger', id: string }
 *   | { kind: 'visual' }
 * )} NodeMeaning
 */

/**
 * Strip Blender's duplicate suffix (".001") and lower-case.
 * @param {string} name
 */
export function baseName(name) {
  return name.toLowerCase().replace(/\.\d+$/, '');
}

/**
 * @param {string} rawName  the object's name as exported
 * @returns {NodeMeaning}
 */
export function parseNodeName(rawName) {
  const name = baseName(rawName ?? '');

  if (name.startsWith('collider_box')) return { kind: 'colliderBox' };
  if (name.startsWith('collider')) return { kind: 'collider' };

  if (name.startsWith('area_')) {
    const surface = name.slice(5).split('_')[0];
    if (surface) return { kind: 'area', surface };
    return { kind: 'visual' };
  }

  if (name === 'spawn_player' || name.startsWith('spawn_player_')) {
    return { kind: 'spawn', role: 'player', name: name.slice('spawn_player_'.length) || 'start' };
  }
  if (name.startsWith('spawn_enemy_')) {
    const [enemyType, ...rest] = name.slice('spawn_enemy_'.length).split('_');
    if (enemyType) return { kind: 'spawn', role: 'enemy', enemyType, name: rest.join('_') || enemyType };
  }

  if (name.startsWith('trigger_')) {
    const id = name.slice('trigger_'.length).split('_')[0];
    if (id) return { kind: 'trigger', id };
  }
  return { kind: 'visual' };
}
