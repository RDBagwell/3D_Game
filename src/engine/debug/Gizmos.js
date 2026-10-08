import { BufferGeometry, BufferAttribute, LineSegments, LineBasicMaterial, Color } from 'three';

/**
 * Immediate-mode debug lines: call `begin()`, draw shapes, call `end()`,
 * once per rendered frame. Used by the game-feel lab to show the invisible:
 * colliders, hitboxes, hurtboxes, the camera probe.
 *
 *   gizmos.begin();
 *   gizmos.sphere(center, 0.4, 0xff3355);
 *   gizmos.capsule(a, b, 0.35, 0x33ddff);
 *   gizmos.lines(physics.debugLines(), 0x88ff88);
 *   gizmos.end();
 *
 * Everything goes into one LineSegments with vertex colours, so it is one
 * draw call however much is shown. It draws on top of the scene.
 */
export class Gizmos {
  /** @param {number} [maxSegments=60000] */
  constructor(maxSegments = 60000) {
    this.max = maxSegments;
    this.positions = new Float32Array(maxSegments * 6);
    this.colors = new Float32Array(maxSegments * 6);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.object = new LineSegments(this.geometry, new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
    this.object.frustumCulled = false;
    this.object.renderOrder = 999;
    this.count = 0;
    this.color = new Color();
  }

  begin() {
    this.count = 0;
  }

  end() {
    this.geometry.setDrawRange(0, this.count * 2);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.object.visible = this.count > 0;
  }

  /**
   * @param {number} ax @param {number} ay @param {number} az
   * @param {number} bx @param {number} by @param {number} bz
   * @param {number} color
   */
  segment(ax, ay, az, bx, by, bz, color) {
    if (this.count >= this.max) return;
    const i = this.count * 6;
    this.positions.set([ax, ay, az, bx, by, bz], i);
    this.color.setHex(color);
    this.colors.set([this.color.r, this.color.g, this.color.b, this.color.r, this.color.g, this.color.b], i);
    this.count++;
  }

  /**
   * @param {{ x: number, y: number, z: number }} a
   * @param {{ x: number, y: number, z: number }} b
   * @param {number} color
   */
  line(a, b, color) {
    this.segment(a.x, a.y, a.z, b.x, b.y, b.z, color);
  }

  /**
   * Flat list of segment endpoints (x, y, z, x, y, z...), e.g. Rapier's debugRender.
   * @param {Float32Array} vertices
   * @param {number} color
   */
  lines(vertices, color) {
    for (let i = 0; i + 5 < vertices.length; i += 6) {
      this.segment(vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3], vertices[i + 4], vertices[i + 5], color);
    }
  }

  /**
   * A horizontal circle.
   * @param {{ x: number, y: number, z: number }} c
   * @param {number} r
   * @param {number} color
   * @param {number} [steps=20]
   */
  circle(c, r, color, steps = 20) {
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      this.segment(c.x + Math.cos(a0) * r, c.y, c.z + Math.sin(a0) * r, c.x + Math.cos(a1) * r, c.y, c.z + Math.sin(a1) * r, color);
    }
  }

  /**
   * Three great circles.
   * @param {{ x: number, y: number, z: number }} c
   * @param {number} r
   * @param {number} color
   */
  sphere(c, r, color) {
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      const [c0, s0, c1, s1] = [Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r];
      this.segment(c.x + c0, c.y + s0, c.z, c.x + c1, c.y + s1, c.z, color);
      this.segment(c.x + c0, c.y, c.z + s0, c.x + c1, c.y, c.z + s1, color);
      this.segment(c.x, c.y + c0, c.z + s0, c.x, c.y + c1, c.z + s1, color);
    }
  }

  /**
   * A vertical capsule from a (bottom centre of the lower sphere) to b.
   * @param {{ x: number, y: number, z: number }} a  lower segment end
   * @param {{ x: number, y: number, z: number }} b  upper segment end
   * @param {number} r
   * @param {number} color
   */
  capsule(a, b, r, color) {
    this.circle(a, r, color);
    this.circle(b, r, color);
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      this.segment(a.x + dx, a.y, a.z + dz, b.x + dx, b.y, b.z + dz, color);
    }
    // Hemispheres as arcs.
    const steps = 8;
    for (const [end, dir] of /** @type {[{ x: number, y: number, z: number }, number][]} */ ([[b, 1], [a, -1]])) {
      for (const [ux, uz] of [[1, 0], [0, 1]]) {
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * Math.PI;
          const a1 = ((i + 1) / steps) * Math.PI;
          this.segment(
            end.x + Math.cos(a0) * r * ux, end.y + Math.sin(a0) * r * dir, end.z + Math.cos(a0) * r * uz,
            end.x + Math.cos(a1) * r * ux, end.y + Math.sin(a1) * r * dir, end.z + Math.cos(a1) * r * uz,
            color,
          );
        }
      }
    }
  }
}
