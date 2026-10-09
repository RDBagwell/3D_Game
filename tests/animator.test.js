import { describe, it, expect } from 'vitest';
import { Object3D, AnimationClip, NumberKeyframeTrack } from 'three';
import { Animator } from '../src/engine/index.js';

/** A one-second clip that moves `.position.x` from 0 to 1 (a stand-in for a run cycle). */
const clip = (/** @type {string} */ name) => new AnimationClip(name, 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);

describe('Animator', () => {
  it('syncPhase: switching loops keeps the point in the cycle (no restarting on the same foot)', () => {
    const root = new Object3D();
    const anim = new Animator(root, [clip('Run'), clip('Strafe')]);
    anim.play('Run');
    anim.update(0.3);
    anim.play('Strafe', { restart: true, syncPhase: true, fade: 0 });
    expect(anim.current?.time).toBeCloseTo(0.3, 5);
    // Without it, the new clip starts from the beginning.
    anim.play('Run', { restart: true, fade: 0 });
    expect(anim.current?.time).toBe(0);
  });

  it('a duration stretches the clip to fit it', () => {
    const anim = new Animator(new Object3D(), [clip('Swing')]);
    const action = anim.play('Swing', { loop: false, duration: 0.5 });
    expect(action?.timeScale).toBeCloseTo(2);
  });
});
