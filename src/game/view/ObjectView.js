import {
  Group, Mesh, OctahedronGeometry, CylinderGeometry, MeshStandardMaterial, PointLight, Color, SphereGeometry,
} from 'three';
import { lerp } from '../../engine/index.js';
import { OBJECTS } from '../data/objects.js';

/**
 * Draws one interactive object from the simulation's state (open, hidden):
 *
 *   gate        a portcullis; an empty archway once raised
 *   door        a wooden door that swings open
 *   chest       its lid swings up when opened
 *   switch      a floating crystal: cool blue, warm orange once struck
 *   hearthstone a standing stone whose ember glows while it's your checkpoint
 *   hearth      a cold stone bowl; a fire and a light once lit
 *   breakable   a pillar; rubble once a slam has smashed it
 *
 * Shapes, not only colours, say what changed: a gate disappears, a lid lifts,
 * the crystal stops spinning and drops, a flame appears.
 */
export class ObjectView {
  /**
   * @param {import('../sim/Sandbox.js').SimObject} object
   * @param {Record<string, any>} models
   */
  constructor(object, models) {
    this.object = object;
    const def = OBJECTS[object.id];
    this.def = def;
    this.root = new Group();
    this.root.position.set(object.position.x, object.position.y, object.position.z);
    this.root.rotation.y = object.facing;
    this.time = Math.random() * 10;
    /** Shown while closed / open. */
    this.closed = new Group();
    this.opened = new Group();
    this.root.add(this.closed, this.opened);
    /** @type {import('three').Object3D | null} */
    this.lid = null;
    /** @type {Mesh | null} */
    this.crystal = null;
    /** @type {Mesh | null} */
    this.flame = null;
    /** @type {PointLight | null} */
    this.light = null;
    this.checkpoint = false;
    /** Open last frame (gates and doors sound when they open). */
    this.wasOpen = object.open;

    const model = (/** @type {string | undefined} */ key, scale = def.scale ?? 1) => {
      const gltf = key ? models[key] : null;
      if (!gltf) return null;
      const m = gltf.scene.clone(true);
      m.scale.setScalar(scale);
      m.traverse((/** @type {any} */ o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      return m;
    };

    switch (def.type) {
      case 'gate': {
        // A portcullis while closed; an empty archway once raised.
        const closed = model(def.model);
        const open = model(def.openModel);
        if (closed) this.closed.add(closed);
        if (open) {
          open.traverse((o) => {
            if (o.name.endsWith('_door')) o.visible = false;
          });
          this.opened.add(open);
        }
        break;
      }
      case 'door': {
        // A doorway whose door swings open.
        const door = model(def.model);
        if (door) {
          this.closed.add(door);
          door.traverse((o) => {
            if (o.name.endsWith('_door')) this.lid = o;
          });
        }
        break;
      }
      case 'chest': {
        const chest = model(def.model);
        if (chest) {
          this.closed.add(chest);
          chest.traverse((o) => {
            if (o.name.endsWith('_lid')) this.lid = o;
          });
        }
        break;
      }
      case 'switch': {
        const base = new Mesh(new CylinderGeometry(0.45, 0.6, 0.5, 8), new MeshStandardMaterial({ color: 0x5f5a70, roughness: 0.9 }));
        base.position.y = 0.25;
        base.userData.own = true;
        this.crystal = new Mesh(new OctahedronGeometry(0.42), new MeshStandardMaterial({ color: 0x8fd8ff, emissive: new Color(0x2a8cff), emissiveIntensity: 1.2, roughness: 0.25 }));
        this.crystal.position.y = 1.15;
        this.crystal.castShadow = true;
        this.root.add(base, this.crystal);
        break;
      }
      case 'pickup': {
        const thing = model(def.model);
        if (thing) this.closed.add(thing);
        // A glint, so it can be found.
        this.flame = new Mesh(new SphereGeometry(0.1, 8, 6), new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0xfff1c0), emissiveIntensity: 2 }));
        this.flame.position.y = 0.7;
        this.root.add(this.flame);
        break;
      }
      case 'hearthstone': {
        const stone = new Mesh(new CylinderGeometry(0.35, 0.55, 1.3, 6), new MeshStandardMaterial({ color: 0x8c8496, roughness: 0.95 }));
        stone.position.y = 0.65;
        stone.userData.own = true;
        stone.castShadow = true;
        this.flame = new Mesh(new SphereGeometry(0.18, 12, 8), new MeshStandardMaterial({ color: 0x3b2a22, emissive: new Color(0xff7a2a), emissiveIntensity: 0 }));
        this.flame.position.y = 1.45;
        this.root.add(stone, this.flame);
        break;
      }
      case 'hearth': {
        const bowl = new Mesh(new CylinderGeometry(1.4, 1.0, 0.7, 12, 1, true), new MeshStandardMaterial({ color: 0x585266, roughness: 0.9, side: 2 }));
        bowl.position.y = 0.35;
        bowl.userData.own = true;
        const ash = new Mesh(new CylinderGeometry(1.3, 1.3, 0.1, 12), new MeshStandardMaterial({ color: 0x3a3540, roughness: 1 }));
        ash.position.y = 0.45;
        ash.userData.own = true;
        this.flame = new Mesh(new SphereGeometry(0.9, 16, 10), new MeshStandardMaterial({ color: 0xffb347, emissive: new Color(0xff6a1a), emissiveIntensity: 2.2, transparent: true, opacity: 0.9 }));
        this.flame.position.y = 1.1;
        this.flame.scale.set(1, 1.4, 1);
        this.light = new PointLight(0xff8a3a, 0, 22, 1.4);
        this.light.position.y = 2;
        this.root.add(bowl, ash, this.flame, this.light);
        break;
      }
      case 'breakable': {
        const whole = model(def.model);
        const rubble = model(def.openModel, def.openScale ?? def.scale);
        if (whole) this.closed.add(whole);
        if (rubble) this.opened.add(rubble);
        break;
      }
      default:
        break;
    }
  }

  /**
   * @param {number} dt
   * @param {boolean} checkpoint  this hearthstone is the current checkpoint
   * @returns {void}
   */
  update(dt, checkpoint) {
    const o = this.object;
    this.time += dt;
    /** The object opened this frame. */
    this.opening = o.open && !this.wasOpen;
    this.wasOpen = o.open;
    this.root.visible = !o.hidden;
    const hasOpen = this.opened.children.length > 0;
    this.closed.visible = !o.open || !hasOpen;
    this.opened.visible = o.open && hasOpen;
    if (this.def.type === 'gate') this.closed.visible = !o.open;
    if (this.lid && this.def.type === 'chest') this.lid.rotation.x = lerp(this.lid.rotation.x, o.open ? -1.6 : 0, Math.min(1, dt * 6));
    if (this.lid && this.def.type === 'door') this.lid.rotation.y = lerp(this.lid.rotation.y, o.open ? -1.75 : 0, Math.min(1, dt * 3));
    if (this.crystal) {
      const m = /** @type {MeshStandardMaterial} */ (this.crystal.material);
      if (o.open) {
        m.color.setHex(0xffc27a);
        m.emissive.setHex(0xff7a1a);
        this.crystal.position.y = lerp(this.crystal.position.y, 0.8, Math.min(1, dt * 4));
      } else {
        this.crystal.rotation.y += dt * 1.6;
        this.crystal.position.y = 1.15 + Math.sin(this.time * 2) * 0.08;
      }
    }
    if (this.flame && this.def.type === 'hearthstone') {
      const m = /** @type {MeshStandardMaterial} */ (this.flame.material);
      m.emissiveIntensity = lerp(m.emissiveIntensity, checkpoint ? 2.5 + Math.sin(this.time * 7) * 0.4 : 0, Math.min(1, dt * 4));
      this.flame.scale.setScalar(checkpoint ? 1.3 : 1);
    }
    if (this.flame && this.def.type === 'pickup') {
      this.flame.position.y = 0.7 + Math.sin(this.time * 3) * 0.1;
      this.flame.scale.setScalar(0.6 + Math.abs(Math.sin(this.time * 4)) * 0.8);
    }
    if (this.flame && this.def.type === 'hearth') {
      this.flame.visible = o.open;
      const flicker = 1 + Math.sin(this.time * 11) * 0.06 + Math.sin(this.time * 17) * 0.04;
      this.flame.scale.set(flicker, 1.4 * flicker, flicker);
      if (this.light) this.light.intensity = o.open ? 40 * flicker : 0;
    }
  }

  /** Free the shapes made for this object (its models are shared and stay). */
  dispose() {
    for (const part of [this.crystal, this.flame]) {
      part?.geometry.dispose();
      /** @type {any} */ (part?.material)?.dispose();
    }
    this.root.traverse((o) => {
      const mesh = /** @type {any} */ (o);
      if (mesh.isMesh && mesh.userData.own) mesh.geometry.dispose();
    });
  }

  /** Where to show a "struck" spark, for switches. */
  get top() {
    return { x: this.object.position.x, y: this.object.position.y + 1.15, z: this.object.position.z };
  }
}
