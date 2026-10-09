/**
 * The training grounds: session 1's combat sandbox, kept as the game-feel
 * lab's playground (Title → Game-feel lab). Its ground, walls and spawns are
 * built in code (src/game/scenes/trainingGrounds.js); the props are here.
 * @type {import('../../world/buildArea.js').AreaDef}
 */
export const training = {
  id: 'training',
  name: 'Training grounds',
  music: 'village',
  ambience: 'meadow',
  look: 'day',
  defaultSurface: 'grass',
  respawnEnemies: true,
  scene: 'trainingGrounds',
  spawns: {},
  props: [
    { model: 'barrel', at: [-5.5, 0, -1.5], yaw: 0.3, solid: [0.76, 1, 0.76] },
    { model: 'barrel', at: [-6.3, 0, -0.8], yaw: 1.2, solid: [0.76, 1, 0.76] },
    { model: 'crate', at: [5.6, 0, -1.2], yaw: 0.4, solid: [0.84, 0.84, 0.84] },
    { model: 'crate', at: [5.2, 0, -2.4], yaw: -0.2, solid: [0.84, 0.84, 0.84] },
    { model: 'target', at: [-3.5, 0, -9.5], yaw: 0.6, solid: [1.2, 1.8, 0.4] },
    { model: 'target', at: [3.5, 0, -9.5], yaw: -0.6, solid: [1.2, 1.8, 0.4] },
    { model: 'barrel', at: [11, 1.5, -10], yaw: 0, solid: [0.76, 1, 0.76] },
    { model: 'crate', at: [-11, 1.5, -8.5], yaw: 0.8, solid: [0.84, 0.84, 0.84] },
  ],
};
