/**
 * The engine's public surface. Game code imports from here:
 *
 *   import { FixedStepLoop, Input, FollowCamera } from '../engine/index.js';
 *
 * src/engine/ never imports from src/game/ (tests/boundary.test.js checks
 * it). See docs/ENGINE.md.
 */
export { FixedStepLoop } from './loop/FixedStepLoop.js';
export { StateMachine } from './core/StateMachine.js';
export { EventBus } from './core/EventBus.js';
export { Rng } from './core/Rng.js';
export * from './core/math.js';
export { browserStorage, readJson, writeJson } from './core/storage.js';
export { createPhysics, Physics } from './physics/Physics.js';
export { CharacterBody } from './physics/CharacterBody.js';
export { Level } from './level/Level.js';
export { parseNodeName, baseName } from './level/levelNames.js';
export { Input, emptyFrame, button, radialDeadzone } from './input/Input.js';
export { InputBuffer } from './input/InputBuffer.js';
export { TouchControls, isTouchDevice } from './input/TouchControls.js';
export { FollowCamera } from './camera/FollowCamera.js';
export { CameraShake } from './camera/CameraShake.js';
export { Animator } from './assets/Animator.js';
export { AssetLoader } from './assets/AssetLoader.js';
export { AudioManager } from './audio/AudioManager.js';
export { MusicManager } from './audio/MusicManager.js';
export { envelope, noise, tone } from './audio/synth.js';
export { Gizmos } from './debug/Gizmos.js';
export { PerfHud } from './debug/PerfHud.js';
