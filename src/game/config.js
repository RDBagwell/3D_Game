/**
 * Game-wide constants: the default controls and the actions they drive.
 *
 * Bindings use the engine's strings (see src/engine/input/Input.js):
 * 'key:<KeyboardEvent.code>', 'mouse:<button>', 'btn:<standard gamepad
 * button>'. Gamepad buttons follow the browser's standard mapping, so the
 * same numbers work on Xbox, PlayStation, Switch Pro and most other pads:
 *
 *   0 bottom (A / ✕ / B)     1 right (B / ○ / A)     2 left (X / □ / Y)     3 top (Y / △ / X)
 *   4 LB / L1   5 RB / R1   6 LT / L2   7 RT / R2   8 View / Share / −   9 Menu / Options / +
 *   10 left stick click   11 right stick click   12-15 d-pad up, down, left, right
 *
 * Players can change the keyboard keys in Settings → Controls (src/game/settings.js).
 */

/** @type {Record<string, string[]>} */
export const DEFAULT_BINDINGS = {
  move_forward: ['key:KeyW', 'btn:12'],
  move_back: ['key:KeyS', 'btn:13'],
  move_left: ['key:KeyA', 'btn:14'],
  move_right: ['key:KeyD', 'btn:15'],
  look_left: ['key:ArrowLeft'],
  look_right: ['key:ArrowRight'],
  look_up: ['key:ArrowUp'],
  look_down: ['key:ArrowDown'],
  attack: ['key:KeyJ', 'mouse:0', 'btn:2', 'btn:5'],
  roll: ['key:Space', 'key:KeyK', 'btn:1'],
  shield: ['key:KeyL', 'mouse:2', 'btn:4', 'btn:6'],
  lockOn: ['key:KeyQ', 'mouse:1', 'btn:7', 'btn:11'],
  interact: ['key:KeyE', 'btn:0'],
  pause: ['key:Escape', 'key:KeyP', 'btn:9'],
  lab: ['key:Tab', 'btn:8'],
  debug: ['key:F3', 'key:Backquote'],
};

/**
 * The actions players can rebind, in the order the Controls screen lists
 * them, with what each does.
 */
export const REBINDABLE = [
  { action: 'move_forward', label: 'Move forward' },
  { action: 'move_back', label: 'Move back' },
  { action: 'move_left', label: 'Move left' },
  { action: 'move_right', label: 'Move right' },
  { action: 'look_left', label: 'Camera left' },
  { action: 'look_right', label: 'Camera right' },
  { action: 'look_up', label: 'Camera up' },
  { action: 'look_down', label: 'Camera down' },
  { action: 'attack', label: 'Attack (press again to combo)' },
  { action: 'roll', label: 'Roll' },
  { action: 'shield', label: 'Shield (hold)' },
  { action: 'lockOn', label: 'Lock on / recentre camera' },
  { action: 'interact', label: 'Interact' },
  { action: 'pause', label: 'Pause' },
  { action: 'lab', label: 'Game-feel lab' },
];

/** Simulation rate. Frame data in data/attacks.js counts these frames. */
export const TICK_RATE = 60;
export const TICK = 1 / TICK_RATE;

/** The URL parameter that opens the lab, and the storage keys. */
export const LAB_PARAM = 'lab';
export const STORAGE = {
  settings: '3d:settings',
  feel: '3d:feel',
  show: '3d:show',
};
