import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';

/**
 * One AnimationMixer per character, with cross-fades between named clips.
 *
 *   const anim = new Animator(model, gltf.animations);
 *   anim.play('Running_A');                          // loops, cross-fades from whatever was playing
 *   anim.play('1H_Melee_Attack_Chop', { loop: false, duration: 0.45 });
 *   anim.update(dt);                                 // every rendered frame
 *
 * Cross-fading blends the outgoing pose into the incoming one over `fade`
 * seconds, so a character turning from a run into an attack doesn't pop. The
 * game-feel lab sets `defaultFade` to 0 to show what snapping looks like.
 *
 * `duration` stretches a clip to a length in seconds, so an attack's
 * animation always lines up with its frame data (data/attacks.js), whatever
 * the clip's own length. `paused` freezes the pose (hit-stop).
 *
 * Unknown clip names are ignored with one warning, so a missing animation in
 * a replacement model doesn't crash the game.
 */
export class Animator {
  /**
   * @param {import('three').Object3D} root
   * @param {import('three').AnimationClip[]} clips
   */
  constructor(root, clips) {
    this.mixer = new AnimationMixer(root);
    /** @type {Map<string, import('three').AnimationClip>} */
    this.clips = new Map(clips.map((c) => [c.name, c]));
    /** @type {import('three').AnimationAction | null} */
    this.current = null;
    this.currentName = '';
    /** Cross-fade time in seconds when play() isn't given one. */
    this.defaultFade = 0.12;
    this.paused = false;
    /** Multiplies every update (slow motion in the lab). */
    this.timeScale = 1;
    /** @type {Set<string>} */
    this.warned = new Set();
  }

  /** @param {string} name */
  has(name) {
    return this.clips.has(name);
  }

  /**
   * @param {string} name
   * @param {object} [options]
   * @param {boolean} [options.loop=true]
   * @param {number} [options.fade]  seconds (default: defaultFade)
   * @param {number} [options.duration]  stretch the clip to this many seconds
   * @param {number} [options.speed=1]  playback rate (ignored if duration is given)
   * @param {boolean} [options.restart=false]  play from the start even if it's already playing
   */
  play(name, { loop = true, fade, duration, speed = 1, restart = false } = {}) {
    const clip = this.clips.get(name);
    if (!clip) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`Animator: no clip named "${name}"`);
      }
      return null;
    }
    const action = this.mixer.clipAction(clip);
    const fadeTime = fade ?? this.defaultFade;
    if (this.current === action && !restart) {
      action.timeScale = duration ? clip.duration / duration : speed;
      return action;
    }
    action.reset();
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.timeScale = duration ? clip.duration / duration : speed;
    action.enabled = true;
    action.setEffectiveWeight(1);
    const previous = this.current;
    if (previous && previous !== action && fadeTime > 0) {
      action.play();
      action.crossFadeFrom(previous, fadeTime, false);
    } else {
      if (previous && previous !== action) previous.stop();
      action.play();
    }
    this.current = action;
    this.currentName = name;
    return action;
  }

  /** @param {number} dt  seconds */
  update(dt) {
    if (this.paused) return;
    this.mixer.update(dt * this.timeScale);
  }
}
