import { describe, it, expect } from 'vitest';
import { FollowCamera, CameraShake, angleDelta } from '../src/engine/index.js';

const still = { lead: { x: 0, z: 0 }, look: { x: 0, y: 0 }, lockTarget: null, recenter: null };
const run = (/** @type {FollowCamera} */ cam, /** @type {any} */ input, n = 1) => {
  for (let i = 0; i < n; i++) {
    cam.snapshot();
    cam.update(1 / 60, input);
  }
};

describe('follow camera', () => {
  it('sits behind the character after a reset', () => {
    const cam = new FollowCamera();
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI); // facing -Z
    expect(cam.position.z).toBeGreaterThan(3); // behind = +Z
    expect(cam.position.y).toBeGreaterThan(1);
  });

  it('smoothing: lags behind a moving target; 0 = rigidly attached', () => {
    const soft = new FollowCamera();
    soft.reset({ x: 0, y: 0, z: 0 }, 0);
    run(soft, { ...still, target: { x: 2, y: 0, z: 0 } });
    expect(soft.pivot.x).toBeGreaterThan(0);
    expect(soft.pivot.x).toBeLessThan(1);
    const rigid = new FollowCamera();
    rigid.settings.smoothing = 0;
    rigid.reset({ x: 0, y: 0, z: 0 }, 0);
    run(rigid, { ...still, target: { x: 2, y: 0, z: 0 } });
    expect(rigid.pivot.x).toBeCloseTo(2);
  });

  it('collision: never sits beyond a wall, and moves out again once clear', () => {
    let wall = 1.5;
    const cam = new FollowCamera({ probe: (_o, _d, max) => (wall < max ? wall : null) });
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 } });
    expect(cam.probeInfo.hit).toBe(true);
    const head = cam.probeInfo.from;
    expect(cam.position.distanceTo(head)).toBeLessThanOrEqual(1.5);
    wall = 100;
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 } }, 120);
    expect(cam.position.distanceTo(head)).toBeGreaterThan(4);
  });

  it('collision off: it goes straight through', () => {
    const cam = new FollowCamera({ probe: () => 1 });
    cam.settings.collision = false;
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 } });
    expect(cam.probeInfo.hit).toBe(false);
  });

  it('lock-on framing swings round so player and target are both in view', () => {
    const cam = new FollowCamera();
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    // Target off to the right (+X): the camera should end up on the left (-X side), looking across.
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 }, lockTarget: { x: 6, y: 0, z: 0 } }, 120);
    expect(Math.abs(angleDelta(cam.yaw, Math.atan2(-6, 0)))).toBeLessThan(0.05);
    expect(cam.position.x).toBeLessThan(0);
  });

  it('recentres behind the character on request', () => {
    const cam = new FollowCamera();
    cam.reset({ x: 0, y: 0, z: 0 }, 0);
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 }, recenter: Math.PI / 2 });
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 } }, 60);
    expect(Math.abs(angleDelta(cam.yaw, Math.PI / 2 + Math.PI))).toBeLessThan(0.01);
  });
});

describe('camera shake', () => {
  it('is capped, and off with reduced motion', () => {
    const shake = new CameraShake();
    shake.scale = 2;
    for (let i = 0; i < 10; i++) shake.addTrauma(1);
    let max = 0;
    for (let i = 0; i < 60; i++) max = Math.max(max, shake.sample(1 / 60).offset.length());
    expect(max).toBeLessThanOrEqual(shake.maxOffset * Math.sqrt(3) + 1e-9);
    expect(max).toBeGreaterThan(0);

    const calm = new CameraShake();
    calm.reducedMotion = true;
    calm.addTrauma(1);
    calm.nudge({ x: 1, y: 0, z: 0 }, 0.3);
    expect(calm.sample(1 / 60).offset.length()).toBe(0);
  });
});
