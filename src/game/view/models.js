import {
  Group, Mesh, CapsuleGeometry, BoxGeometry, CylinderGeometry, SphereGeometry, MeshStandardMaterial, Color,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { KNIGHT_HIDDEN } from '../data/assets.js';

/**
 * Turns loaded glTFs into ready-to-place character models, or builds a
 * placeholder when a model is missing, so the game is always playable.
 *
 * Each returned model has:
 *   root       the Object3D to add to the scene (front faces +Z)
 *   clips      its animation clips ([] for placeholders: they just don't animate)
 *   materials  its own materials (cloned), so hit flashes affect one character only
 *   weapon     the weapon's meshes (for the grunt's glowing telegraph)
 */

/**
 * @typedef {object} CharacterModel
 * @property {import('three').Object3D} root
 * @property {import('three').AnimationClip[]} clips
 * @property {MeshStandardMaterial[]} materials
 * @property {import('three').Mesh[]} weapon
 * @property {boolean} placeholder
 * @property {import('three').Mesh | null} [core]  the boss's weak point (glows while open)
 */

/** @typedef {import('three/examples/jsm/loaders/GLTFLoader.js').GLTF | null} MaybeGltf */

/**
 * KayKit's characters are about 2.5 units tall. These scales make them
 * match the physics capsules (data/actors.js): the hero about 1.75 m.
 */
const SCALE = { knight: 0.72, grunt: 0.7, dummy: 0.8, npc: 0.7, mite: 0.42, adept: 0.7, warden: 1.05 };

/**
 * @param {MaybeGltf} gltf
 * @returns {CharacterModel}
 */
export function makeKnight(gltf) {
  if (!gltf) return placeholderCharacter(0x4f7fe0, 0xf2c14e);
  const root = cloneSkinned(gltf.scene);
  root.traverse((o) => {
    if (KNIGHT_HIDDEN.includes(o.name)) o.visible = false;
  });
  const weapon = /** @type {import('three').Mesh[]} */ ([]);
  root.traverse((o) => {
    if (o.name === '1H_Sword') o.traverse((m) => /** @type {any} */ (m).isMesh && weapon.push(/** @type {any} */ (m)));
  });
  root.scale.setScalar(SCALE.knight);
  return finish(root, gltf.animations, weapon);
}

/**
 * The grunt: a skeleton warrior with a blade in its right hand and a shield
 * in its left (the pack ships them as separate models).
 * @param {MaybeGltf} gltf
 * @param {MaybeGltf} blade
 * @param {MaybeGltf} shield
 * @returns {CharacterModel}
 */
export function makeGrunt(gltf, blade, shield) {
  if (!gltf) return placeholderCharacter(0xd9d4c4, 0x7a3b3b);
  const root = cloneSkinned(gltf.scene);
  const weapon = /** @type {import('three').Mesh[]} */ ([]);
  const right = root.getObjectByName('handslot.r');
  const left = root.getObjectByName('handslot.l');
  if (right) {
    const b = blade ? blade.scene.clone(true) : new Mesh(new BoxGeometry(0.08, 0.9, 0.04), new MeshStandardMaterial({ color: 0xcfd6e0 }));
    right.add(b);
    b.traverse((m) => /** @type {any} */ (m).isMesh && weapon.push(/** @type {any} */ (m)));
  }
  if (left && shield) left.add(shield.scene.clone(true));
  root.scale.setScalar(SCALE.grunt);
  return finish(root, gltf.animations, weapon);
}

/**
 * Any enemy by type: a grunt, a cindermite, an ash adept or the Warden.
 * @param {string} type
 * @param {Record<string, MaybeGltf>} models
 * @returns {CharacterModel}
 */
export function makeFoe(type, models) {
  switch (type) {
    case 'mite':
      return makeMite(models.mite);
    case 'adept':
      return makeArmed(models.adept, models.adeptStaff, SCALE.adept, 0x6a5a8a);
    case 'warden':
      return makeWarden(models.grunt, models.wardenAxe);
    default:
      return makeGrunt(models.grunt, models.gruntBlade, models.gruntShield);
  }
}

/**
 * A cindermite: a small, fast skeleton minion with glowing ember eyes.
 * @param {MaybeGltf} gltf
 */
function makeMite(gltf) {
  if (!gltf) {
    const m = placeholderCharacter(0xc9a26b, 0xff7a2a);
    m.root.scale.setScalar(0.6);
    return m;
  }
  const root = cloneSkinned(gltf.scene);
  root.scale.setScalar(SCALE.mite);
  const model = finish(root, gltf.animations, []);
  for (const m of model.materials) if (m.name.toLowerCase().includes('eye')) m.emissive = new Color(0xff6a00);
  // The whole body is its weapon: it glows when it's about to bite.
  model.weapon = /** @type {any[]} */ ([]);
  root.traverse((o) => /** @type {any} */ (o).isMesh && model.weapon.push(/** @type {any} */ (o)));
  return model;
}

/**
 * A skeleton holding something in its right hand (the adept's staff).
 * @param {MaybeGltf} gltf
 * @param {MaybeGltf} held
 * @param {number} scale
 * @param {number} placeholderColor
 */
function makeArmed(gltf, held, scale, placeholderColor) {
  if (!gltf) return placeholderCharacter(placeholderColor, 0xff7a2a);
  const root = cloneSkinned(gltf.scene);
  const weapon = /** @type {import('three').Mesh[]} */ ([]);
  const right = root.getObjectByName('handslot.r');
  if (right && held) {
    const h = held.scene.clone(true);
    right.add(h);
    h.traverse((m) => /** @type {any} */ (m).isMesh && weapon.push(/** @type {any} */ (m)));
  }
  root.scale.setScalar(scale);
  return finish(root, gltf.animations, weapon);
}

/**
 * The Cinder Warden: a huge skeleton warrior with a great axe, and an ember
 * core in its chest that glows when its axe is stuck (the weak point).
 * @param {MaybeGltf} gltf
 * @param {MaybeGltf} axe
 */
function makeWarden(gltf, axe) {
  const model = makeArmed(gltf, axe, SCALE.warden, 0x8a7a6a);
  if (model.placeholder) model.root.scale.setScalar(1.5);
  // Ash-grey bones.
  for (const m of model.materials) m.color.multiplyScalar(0.72);
  const core = new Mesh(new SphereGeometry(0.16, 16, 10), new MeshStandardMaterial({ color: 0x3a2018, emissive: new Color(0xff5a10), emissiveIntensity: 0.4 }));
  const chest = model.root.getObjectByName('chest');
  if (chest) {
    core.position.set(0, 0.35, 0.28);
    chest.add(core);
  } else {
    core.position.set(0, 1.9, 0.3);
    model.root.add(core);
  }
  model.core = core;
  return model;
}

/**
 * A villager: a KayKit adventurer with most of its gear hidden.
 * @param {MaybeGltf} gltf
 * @param {string[]} hide  mesh names to hide
 * @returns {CharacterModel}
 */
export function makeNpc(gltf, hide) {
  if (!gltf) return placeholderCharacter(0x9a6fd0, 0xf2e3c4);
  const root = cloneSkinned(gltf.scene);
  root.traverse((o) => {
    if (hide.includes(o.name)) o.visible = false;
  });
  root.scale.setScalar(SCALE.npc);
  return finish(root, gltf.animations, []);
}

/**
 * @param {MaybeGltf} gltf
 * @returns {CharacterModel}
 */
export function makeDummy(gltf) {
  if (gltf) {
    const root = gltf.scene.clone(true);
    root.scale.setScalar(SCALE.dummy);
    return finish(root, [], []);
  }
  const root = new Group();
  const straw = new MeshStandardMaterial({ color: 0xe8c26a, roughness: 1 });
  const post = new Mesh(new CylinderGeometry(0.07, 0.07, 1.2), new MeshStandardMaterial({ color: 0x8a5a36 }));
  post.position.y = 0.6;
  const body = new Mesh(new CapsuleGeometry(0.3, 0.6, 4, 12), straw);
  body.position.y = 1.15;
  const head = new Mesh(new SphereGeometry(0.2, 16, 12), straw);
  head.position.y = 1.75;
  root.add(post, body, head);
  return finish(root, [], []);
}

/**
 * A prop (barrel, crate, target), or a simple box if it's missing.
 * @param {MaybeGltf} gltf
 * @param {number} color
 */
export function makeProp(gltf, color) {
  if (gltf) {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return root;
  }
  const box = new Mesh(new BoxGeometry(0.8, 0.9, 0.8), new MeshStandardMaterial({ color }));
  box.position.y = 0.45;
  box.castShadow = true;
  const group = new Group();
  group.add(box);
  return group;
}

/**
 * A capsule with a nose (so you can see which way it faces) and a sword.
 * @param {number} bodyColor
 * @param {number} accent
 * @returns {CharacterModel}
 */
export function placeholderCharacter(bodyColor, accent) {
  const root = new Group();
  const body = new Mesh(new CapsuleGeometry(0.35, 1.0, 4, 12), new MeshStandardMaterial({ color: bodyColor, roughness: 0.7 }));
  body.position.y = 0.85;
  const nose = new Mesh(new BoxGeometry(0.2, 0.15, 0.25), new MeshStandardMaterial({ color: accent }));
  nose.position.set(0, 1.35, 0.35);
  const sword = new Mesh(new BoxGeometry(0.06, 0.06, 0.9), new MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.4, roughness: 0.3 }));
  sword.position.set(-0.4, 1.0, 0.45);
  root.add(body, nose, sword);
  const model = finish(root, [], [sword]);
  model.placeholder = true;
  return model;
}

/**
 * Shadows on, materials cloned per instance.
 * @param {import('three').Object3D} root
 * @param {import('three').AnimationClip[]} clips
 * @param {import('three').Mesh[]} weapon
 * @returns {CharacterModel}
 */
function finish(root, clips, weapon) {
  /** @type {MeshStandardMaterial[]} */
  const materials = [];
  root.traverse((o) => {
    const mesh = /** @type {import('three').Mesh} */ (o);
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned meshes are animated on the GPU; their bounds don't follow, so don't cull them.
    mesh.frustumCulled = false;
    const cloneOne = (/** @type {any} */ m) => {
      const c = m.clone();
      if (c.isMeshStandardMaterial) materials.push(c);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneOne) : cloneOne(mesh.material);
  });
  return { root, clips, materials, weapon, placeholder: false };
}
