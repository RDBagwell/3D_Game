import { BufferGeometry, BufferAttribute, Points, PointsMaterial, AdditiveBlending, CanvasTexture, Vector3 } from 'three';

/**
 * Hit sparks and dust (one particle system, one draw call), and floating
 * text over the 3D view (damage numbers, "Blocked", "Dodged").
 *
 * Particles are purely visual: they use real time, their own random numbers
 * and never touch the simulation.
 */
export class Particles {
  /** @param {number} [max=600] */
  constructor(max = 600) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    /** Per particle: velocity xyz, life, maxLife, gravity, base r g b. */
    this.state = new Float32Array(max * 9);
    this.next = 0;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.object = new Points(
      geometry,
      new PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, map: dotTexture() }),
    );
    this.object.frustumCulled = false;
    for (let i = 0; i < max; i++) this.positions[i * 3 + 1] = -1000;
  }

  /**
   * @param {{ x: number, y: number, z: number }} at
   * @param {{ x: number, y: number, z: number }} direction  the blow's direction
   * @param {number} count
   * @param {{ speed?: number, life?: number, gravity?: number, color?: [number, number, number], spread?: number }} [o]
   */
  burst(at, direction, count, { speed = 6, life = 0.35, gravity = 14, color = [1, 0.85, 0.45], spread = 0.9 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const s = speed * (0.4 + Math.random() * 0.8);
      const v = new Vector3(
        direction.x + (Math.random() - 0.5) * 2 * spread,
        direction.y + 0.4 + Math.random() * spread,
        direction.z + (Math.random() - 0.5) * 2 * spread,
      ).normalize().multiplyScalar(s);
      this.positions.set([at.x, at.y, at.z], i * 3);
      const l = life * (0.6 + Math.random() * 0.6);
      this.state.set([v.x, v.y, v.z, l, l, gravity, color[0], color[1], color[2]], i * 9);
    }
  }

  /** @param {number} dt */
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const s = i * 9;
      if (this.state[s + 3] <= 0) continue;
      this.state[s + 3] -= dt;
      const p = i * 3;
      if (this.state[s + 3] <= 0) {
        this.positions[p + 1] = -1000;
        continue;
      }
      this.state[s + 1] -= this.state[s + 5] * dt;
      this.positions[p] += this.state[s] * dt;
      this.positions[p + 1] += this.state[s + 1] * dt;
      this.positions[p + 2] += this.state[s + 2] * dt;
      if (this.positions[p + 1] < 0.02) {
        this.positions[p + 1] = 0.02;
        this.state[s + 1] *= -0.3;
      }
      const k = this.state[s + 3] / this.state[s + 4];
      this.colors[p] = this.state[s + 6] * k;
      this.colors[p + 1] = this.state[s + 7] * k;
      this.colors[p + 2] = this.state[s + 8] * k;
    }
    this.object.geometry.attributes.position.needsUpdate = true;
    this.object.geometry.attributes.color.needsUpdate = true;
  }
}

/**
 * Text that floats up from a point in the world and fades: damage numbers,
 * "Blocked", "Dodged". DOM elements, positioned by projecting the point each
 * frame.
 */
export class Floaters {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.layer = document.createElement('div');
    this.layer.className = 'floaters';
    container.append(this.layer);
    /** @type {{ el: HTMLElement, pos: Vector3, age: number, life: number }[]} */
    this.items = [];
  }

  /**
   * @param {string} text
   * @param {{ x: number, y: number, z: number }} at
   * @param {string} [className]
   */
  add(text, at, className = '') {
    const el = document.createElement('div');
    el.className = `floater ${className}`;
    el.textContent = text;
    this.layer.append(el);
    this.items.push({ el, pos: new Vector3(at.x + (Math.random() - 0.5) * 0.3, at.y, at.z), age: 0, life: 0.9 });
    if (this.items.length > 30) this.items.shift()?.el.remove();
  }

  /**
   * @param {number} dt
   * @param {import('three').Camera} camera
   * @param {number} width
   * @param {number} height
   */
  update(dt, camera, width, height) {
    const v = new Vector3();
    this.items = this.items.filter((item) => {
      item.age += dt;
      if (item.age >= item.life) {
        item.el.remove();
        return false;
      }
      v.copy(item.pos);
      v.y += item.age * 1.2;
      v.project(camera);
      const visible = v.z < 1;
      item.el.style.display = visible ? '' : 'none';
      item.el.style.transform = `translate(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px) translate(-50%, -50%)`;
      item.el.style.opacity = String(1 - Math.max(0, (item.age - item.life * 0.6) / (item.life * 0.4)));
      return true;
    });
  }
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}
