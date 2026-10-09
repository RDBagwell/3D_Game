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

  // A wall 0.6 m behind the hero (the camera's side is +Z), as tall as the probe can see.
  const wallBehind = (/** @type {any} */ o, /** @type {any} */ d, /** @type {number} */ max, /** @type {number} */ r) => {
    if (d.z <= 0) return null;
    const t = (0.6 - r - o.z) / d.z;
    return t < max ? Math.max(0, t) : null;
  };

  it("a wall at the hero's back: the camera swings round to the side with room", () => {
    const cam = new FollowCamera({ probe: wallBehind });
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    const yaw = cam.yaw;
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 } }, 120);
    expect(Math.abs(angleDelta(cam.yaw, yaw))).toBeGreaterThan(0.5);
    expect(cam.clearance).toBeGreaterThan(1.6);
  });

  it("locked on with a wall at the hero's back: the camera rises to look down rather than pressing into their head", () => {
    const cam = new FollowCamera({ probe: wallBehind });
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 }, lockTarget: { x: 0, y: 0, z: -4 } }, 90);
    const head = cam.probeInfo.from;
    expect(cam.lift).toBeGreaterThan(0.9);
    expect(cam.position.y).toBeGreaterThan(head.y + 1.2);
    expect(cam.clearance).toBeGreaterThan(1.4);
    expect(cam.pitch).toBeCloseTo(-0.32); // the camera's own pitch is untouched
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
    // It turns until the target is inside the framing dead-zone (0.3 rad), then stops.
    const off = Math.abs(angleDelta(cam.yaw, Math.atan2(-6, 0)));
    expect(off).toBeLessThan(0.32);
    expect(cam.position.x).toBeLessThan(0);
    // ...and stays put while the target stays framed.
    const yaw = cam.yaw;
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 }, lockTarget: { x: 6, y: 0, z: 0 } }, 60);
    expect(Math.abs(angleDelta(cam.yaw, yaw))).toBeLessThan(1e-6);
  });

  it('locked on to a tall enemy, the camera aims higher and steps back', () => {
    const small = new FollowCamera();
    const tall = new FollowCamera();
    for (const [cam, lockHeight] of /** @type {const} */ ([[small, 1.7], [tall, 2.6]])) {
      cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
      run(cam, { ...still, target: { x: 0, y: 0, z: 0 }, lockTarget: { x: 0, y: 0, z: -4 }, lockHeight }, 120);
    }
    expect(tall.pivot.y).toBeGreaterThan(small.pivot.y);
    expect(tall.distance).toBeGreaterThan(small.distance);
  });

  it('auto-follow: left alone, it drifts round behind a player running sideways; turning it by hand wins', () => {
    const cam = new FollowCamera();
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI); // behind a hero facing -Z: yaw 0
    const right = { ...still, target: { x: 0, y: 0, z: 0 }, lead: { x: 1, z: 0 } }; // running towards +X
    run(cam, right, 30); // within the follow delay: nothing yet
    expect(Math.abs(angleDelta(cam.yaw, 0))).toBeLessThan(1e-6);
    run(cam, right, 360);
    // Behind a hero running towards +X is yaw atan2(1, 0) + PI = -PI/2.
    expect(Math.abs(angleDelta(cam.yaw, -Math.PI / 2))).toBeLessThan(0.15);
    // A touch of manual look restarts the delay.
    const before = cam.yaw;
    run(cam, { ...right, lead: { x: 0, z: 1 }, look: { x: 0.01, y: 0 } }, 1);
    run(cam, { ...right, lead: { x: 0, z: 1 } }, 20);
    expect(Math.abs(angleDelta(cam.yaw, before - 0.01))).toBeLessThan(1e-6);
    // Running straight at the camera doesn't whip it round.
    const at = new FollowCamera();
    at.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    run(at, { ...still, target: { x: 0, y: 0, z: 0 }, lead: { x: 0, z: 1 } }, 240);
    expect(Math.abs(angleDelta(at.yaw, 0))).toBeLessThan(1e-6);
  });

  it('auto-follow off: the camera stays where it was put', () => {
    const cam = new FollowCamera();
    cam.settings.follow = 0;
    cam.reset({ x: 0, y: 0, z: 0 }, Math.PI);
    run(cam, { ...still, target: { x: 0, y: 0, z: 0 }, lead: { x: 1, z: 0 } }, 240);
    expect(Math.abs(angleDelta(cam.yaw, 0))).toBeLessThan(1e-6);
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
