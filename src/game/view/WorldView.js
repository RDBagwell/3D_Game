import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Fog, CanvasTexture, SRGBColorSpace,
  ACESFilmicToneMapping, PCFShadowMap, RepeatWrapping, MeshStandardMaterial, Vector3, Mesh,
} from 'three';
import { Gizmos, CameraShake } from '../../engine/index.js';
import { CharacterView } from './CharacterView.js';
import { Particles, Floaters } from './Effects.js';
import { makeKnight, makeGrunt, makeDummy, makeProp } from './models.js';
import { PROPS } from '../scenes/trainingGrounds.js';
import { SURFACES } from '../data/sounds.js';
import { hitSpheresAt } from '../combat/hitboxes.js';
import { Sandbox } from '../sim/Sandbox.js';

/**
 * Everything the player sees and hears of the sandbox: the renderer, lights
 * and sky, the level's meshes, a CharacterView per actor, particles, floating
 * text, the debug gizmos, and the feedback that turns simulation events into
 * flashes, sparks, shake, sound and rumble.
 *
 * Every feedback technique checks its game-feel switch at the moment it
 * fires, so changing a setting mid-fight takes effect on the next hit and can
 * never leave anything half-applied.
 */
export class WorldView {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {HTMLElement} o.overlay  container for DOM overlays (floating text)
   * @param {Sandbox} o.sandbox
   * @param {Record<string, any>} o.models  loaded glTFs (null when missing)
   * @param {import('../../engine/index.js').AudioManager} o.audio
   * @param {import('../../engine/index.js').Input} o.input
   * @param {() => import('../feel/feelSettings.js').FeelValues} o.feel
   * @param {() => import('../feel/feelSettings.js').ShowValues} o.show
   * @param {() => { reducedMotion: boolean }} o.prefs
   */
  constructor({ canvas, overlay, sandbox, models, audio, input, feel, show, prefs }) {
    this.sandbox = sandbox;
    this.audio = audio;
    this.input = input;
    this.feel = feel;
    this.show = show;
    this.prefs = prefs;
    this.models = models;

    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    this.scene = new Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new Fog(0xbfd9f2, 38, 95);
    this.camera = new PerspectiveCamera(60, 1, 0.1, 200);
    this.shake = new CameraShake();

    const hemi = new HemisphereLight(0xdcefff, 0x8a7a5c, 1.4);
    this.sun = new DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(hemi, this.sun, this.sun.target);

    this.scene.add(sandbox.level.root);
    texture(sandbox.level.root);

    for (const prop of PROPS) {
      const model = makeProp(models[prop.kind], prop.kind === 'barrel' ? 0x3d7bd9 : 0xc9a46a);
      model.position.set(prop.position[0], prop.position[1], prop.position[2]);
      model.rotation.y = prop.yaw;
      this.scene.add(model);
    }

    /** @type {Map<string, CharacterView>} */
    this.views = new Map();
    this.addView(new CharacterView(makeKnight(models.knight), sandbox.player, 'player'));
    for (const g of sandbox.grunts) this.addView(new CharacterView(makeGrunt(models.grunt, models.gruntBlade, models.gruntShield), g, 'grunt'));
    for (const d of sandbox.dummies) this.addView(new CharacterView(makeDummy(models.dummy), d, 'dummy'));

    this.particles = new Particles();
    this.scene.add(this.particles.object);
    this.floaters = new Floaters(overlay);
    this.gizmos = new Gizmos();
    this.scene.add(this.gizmos.object);

    this.width = 1;
    this.height = 1;
    this.lookAt = new Vector3();
    this.listen();
  }

  /** @param {CharacterView} view */
  addView(view) {
    this.views.set(view.actor.id, view);
    this.scene.add(view.root);
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep a sensible horizontal view on tall phone screens.
    this.camera.fov = width / height < 1 ? 72 : 60;
    this.camera.updateProjectionMatrix();
  }

  /** Simulation events → feedback. Each checks its switch when it fires. */
  listen() {
    const ev = this.sandbox.events;
    const f = () => this.feel();
    const play = (/** @type {string} */ name, /** @type {any} */ pos, volume = 1) => this.audio.play(name, { position: pos, volume });

    ev.on('swing', (d) => {
      if (!f().hitSounds) return;
      const heavy = d.attack.hitstop >= 6;
      play(heavy ? 'swing_heavy' : 'swing', d.attacker?.position ?? d.grunt?.position);
    });
    ev.on('hit', (d) => {
      const feel = f();
      const view = this.views.get(d.target.id);
      if (feel.hitFlash && view) view.hitFlash();
      if (feel.particles) {
        this.particles.burst(d.point, d.direction, d.attack.hitstop >= 6 ? 26 : 16, { speed: 7 });
      }
      if (feel.hitSounds) {
        const isDummy = d.target.kind === 'dummy';
        play(isDummy ? 'hit_wood' : d.attack.hitstop >= 6 ? 'hit_heavy' : 'hit', d.point);
        if (d.target.team === 'player') play('hurt', d.point, 0.8);
        if (d.killed) play('death', d.point);
      }
      const playerInvolved = d.target.team === 'player' || d.attacker.team === 'player';
      this.shake.addTrauma(d.attack.shake * (d.target.team === 'player' ? 1.3 : 1));
      if (feel.cameraNudge && playerInvolved) this.shake.nudge(d.direction, d.target.team === 'player' ? 0.18 : 0.1);
      if (feel.rumble && playerInvolved) {
        const heavy = d.target.team === 'player' ? 0.8 : d.attack.hitstop >= 6 ? 0.6 : 0.35;
        this.input.rumble(heavy, heavy * 0.6, 90 + d.attack.hitstop * 12);
      }
      if (this.show().damage && d.target.kind === 'dummy') this.floaters.add(String(d.damage), d.point, d.attack.hitstop >= 6 ? 'big' : '');
      else if (d.target.team === 'player' && this.show().damage) this.floaters.add(`-${d.damage}`, d.point, 'hurt');
    });
    ev.on('block', (d) => {
      if (f().hitSounds) play('block', d.point);
      if (f().particles) this.particles.burst(d.point, d.direction, 10, { color: [0.6, 0.85, 1], speed: 5 });
      this.floaters.add('Blocked', { ...d.point, y: d.point.y + 0.4 }, 'note');
      this.shake.addTrauma(0.12);
    });
    ev.on('dodge', (d) => {
      play('dodge', d.point, 0.7);
      this.floaters.add('Dodged', { ...d.point, y: d.point.y + 0.4 }, 'note good');
    });
    ev.on('roll', (d) => {
      if (f().hitSounds) play('roll', d.position);
      if (f().particles) this.particles.burst({ ...d.position, y: 0.15 }, { x: 0, y: 0, z: 0 }, 10, { speed: 2, life: 0.5, gravity: 1, color: [0.55, 0.45, 0.32], spread: 1.4 });
    });
    ev.on('footstep', (d) => {
      const surface = f().surfaceFootsteps && SURFACES.includes(d.surface) ? d.surface : 'plain';
      play(`step_${surface}`, d.position, d.who?.team === 'player' ? 1 : 0.7);
    });
    ev.on('windup', (d) => {
      if (f().telegraph) play('windup', d.grunt.position);
    });
    ev.on('noticed', (d) => play('noticed', d.grunt.position));
    ev.on('lockOn', () => play('lock_on', null));
    ev.on('lockOff', () => play('lock_off', null));
    ev.on('shieldUp', (d) => {
      if (f().hitSounds) play('shield_up', d.position, 0.8);
    });
  }

  /**
   * Draw one frame.
   * @param {number} alpha  interpolation 0..1
   * @param {number} dt  real seconds since the last frame
   */
  render(alpha, dt) {
    const sb = this.sandbox;
    const feel = this.feel();
    const prefs = this.prefs();
    const frozen = sb.hitstop > 0;

    for (const view of this.views.values()) {
      view.crossFade = Number(feel.crossFade);
      view.telegraphOn = Boolean(feel.telegraph);
      view.flashStrength = prefs.reducedMotion ? 0.45 : 1;
      view.update(alpha, sb.prev.get(view.actor.id), dt, frozen);
    }
    this.particles.update(dt);

    // Camera: interpolated simulated camera + shake (visual only).
    this.shake.scale = Number(feel.shake);
    this.shake.reducedMotion = prefs.reducedMotion;
    sb.camera.interpolate(alpha, this.camera.position, this.lookAt);
    const { offset, roll } = this.shake.sample(dt);
    this.camera.position.add(offset);
    this.camera.lookAt(this.lookAt.x + offset.x * 0.5, this.lookAt.y + offset.y * 0.5, this.lookAt.z + offset.z * 0.5);
    this.camera.rotateZ(roll);

    // The sun's shadow box follows the player.
    const p = this.views.get('player')?.root.position ?? new Vector3();
    this.sun.position.set(p.x + 8, p.y + 18, p.z + 6);
    this.sun.target.position.set(p.x, p.y, p.z);

    const forward = new Vector3();
    this.camera.getWorldDirection(forward);
    this.audio.positional = Boolean(feel.positionalSound);
    this.audio.setListener(this.camera.position, forward);

    this.drawGizmos();
    this.renderer.render(this.scene, this.camera);
    this.floaters.update(dt, this.camera, this.width, this.height);
  }

  /** The lab's "show the invisible" views. */
  drawGizmos() {
    const show = this.show();
    const sb = this.sandbox;
    const g = this.gizmos;
    g.begin();
    if (show.colliders) g.lines(sb.physics.debugLines(), 0x66ff99);
    if (show.boxes) {
      for (const a of sb.actors) {
        if (!a.alive) continue;
        const base = a.position;
        const color = a.isInvulnerable() ? 0x8a8a8a : a.team === 'player' ? 0x33e0ff : 0x4fa8ff;
        g.capsule({ x: base.x, y: base.y + a.radius, z: base.z }, { x: base.x, y: base.y + a.height - a.radius, z: base.z }, a.radius, color);
      }
      const swingers = [sb.player, ...sb.grunts];
      for (const s of swingers) {
        if (!Sandbox.isActive(s)) continue;
        const frame = s === sb.player ? sb.player.attackFrameNow : /** @type {any} */ (s).brain.frameNow;
        for (const sphere of hitSpheresAt(s.attack, frame, s.position, s.facing)) g.sphere(sphere, sphere.r, 0xff3355);
      }
    }
    if (show.camera) {
      const info = sb.camera.probeInfo;
      g.sphere(sb.camera.pivot, 0.12, 0xffe066);
      g.line(info.from, info.to, info.hit ? 0xff8a3d : 0xffffff);
      const dir = new Vector3().subVectors(info.to, info.from).normalize();
      g.sphere(new Vector3().copy(info.from).addScaledVector(dir, info.allowed), sb.camera.probeRadius, info.hit ? 0xff8a3d : 0xffffff);
    }
    g.end();
  }

  /**
   * Screen position of a world point, or null if behind the camera.
   * @param {{ x: number, y: number, z: number }} p
   */
  project(p) {
    const v = new Vector3(p.x, p.y, p.z).project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }
}

/** A vertical gradient: deep blue overhead to a warm horizon. */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5aa0e8');
  grad.addColorStop(0.55, '#a9d2f5');
  grad.addColorStop(0.8, '#ffe2bd');
  grad.addColorStop(1, '#ffc79a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * A soft 1 m grid on the flat floors: it makes speed and distance readable,
 * which matters when you're comparing acceleration settings.
 * @param {import('three').Object3D} root
 */
function texture(root) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.13)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  const grid = new CanvasTexture(c);
  grid.wrapS = grid.wrapT = RepeatWrapping;
  grid.colorSpace = SRGBColorSpace;
  grid.anisotropy = 4;
  for (const name of ['ground', 'plaza', 'path', 'arena_floor']) {
    const mesh = /** @type {Mesh | undefined} */ (root.getObjectByName(name));
    if (!mesh) continue;
    const old = /** @type {MeshStandardMaterial} */ (mesh.material);
    const geometry = mesh.geometry.clone();
    // Box UVs are 0..1 per face: scale the top face's to metres.
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new Vector3());
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size.x, uv.getY(i) * size.z);
    mesh.geometry = geometry;
    mesh.material = new MeshStandardMaterial({ color: old.color, roughness: 0.95, map: grid });
  }
}
