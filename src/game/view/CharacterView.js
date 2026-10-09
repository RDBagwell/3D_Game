import {
  Group, Mesh, RingGeometry, PlaneGeometry, MeshBasicMaterial, Sprite, SpriteMaterial, CanvasTexture, DoubleSide, Color,
} from 'three';
import { Animator, lerp, lerpAngle } from '../../engine/index.js';
import { ANIMATIONS } from '../player/Player.js';
import { PLAYER, ENEMIES } from '../data/actors.js';
import { totalFrames } from '../data/attacks.js';

/**
 * Draws one simulated character: places its model between the previous and
 * current simulated positions (interpolation), picks its animation from its
 * state, and shows hit flashes and, for grunts, the attack telegraph.
 *
 * The simulation never knows this exists. A view reads the actor each
 * rendered frame and changes nothing in it.
 *
 * Telegraph (grunts, while winding up), designed not to rely on colour:
 *   - a ring on the ground that shrinks to the grunt's feet: when it closes, the blow lands;
 *   - a "!" warning sign above its head that grows;
 *   - its weapon glows;
 *   - a rising sound with a caption (data/sounds.js).
 */

const WHITE = new Color(1, 1, 1);
const ORANGE = new Color(1, 0.45, 0.1);

export class CharacterView {
  /**
   * @param {import('./models.js').CharacterModel} model
   * @param {any} actor  Player, Grunt or Dummy
   * @param {'player' | 'foe' | 'dummy' | 'npc'} kind
   */
  constructor(model, actor, kind) {
    this.model = model;
    this.actor = actor;
    this.kind = kind;
    this.root = new Group();
    this.root.add(model.root);
    this.animator = new Animator(model.root, model.clips);
    this.flash = 0;
    /** True while materials carry flash emissive that must be cleared. */
    this.flashed = false;
    /** Softer flashes with reduced motion. */
    this.flashStrength = 1;
    this.lastKey = '';
    this.telegraphOn = true;
    this.crossFade = 0.12;

    if (kind === 'foe') {
      this.ring = new Mesh(
        new RingGeometry(0.86, 1, 40),
        new MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.85, side: DoubleSide, depthWrite: false }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.03;
      this.ring.visible = false;
      this.root.add(this.ring);
      // Narrow attacks (the Warden's slam) show their real shape instead: a
      // lane along the ground ahead, its outline faint and a fill that runs
      // out to the tip as the wind-up ends.
      const lane = new PlaneGeometry(1, 1);
      lane.rotateX(-Math.PI / 2);
      lane.translate(0, 0, 0.5); // from the feet forward (+z is where it faces)
      const laneMaterial = (/** @type {number} */ opacity) => new MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity, side: DoubleSide, depthWrite: false });
      this.lane = new Mesh(lane, laneMaterial(0.25));
      this.laneFill = new Mesh(lane, laneMaterial(0.6));
      for (const m of [this.lane, this.laneFill]) {
        m.position.y = 0.035;
        m.visible = false;
        this.root.add(m);
      }
      this.warning = new Sprite(new SpriteMaterial({ map: warningTexture(), depthTest: false, transparent: true }));
      this.warning.position.y = actor.height + 0.6;
      if (actor.def?.brain === 'warden') this.warning.scale.setScalar(1.6);
      this.warning.visible = false;
      this.warning.renderOrder = 10;
      this.root.add(this.warning);
    }
  }

  /**
   * See-through, for when the camera is squeezed up against the hero.
   * @param {number} opacity  1 = solid
   */
  setOpacity(opacity) {
    const see = opacity < 0.99;
    for (const m of this.model.materials) {
      if (m.transparent !== see) {
        m.transparent = see;
        m.depthWrite = !see;
        m.needsUpdate = true;
      }
      m.opacity = see ? opacity : 1;
    }
  }

  /** Flash white for an instant (a hit). */
  hitFlash() {
    this.flash = 1;
  }

  /**
   * @param {number} alpha  interpolation 0..1
   * @param {{ x: number, y: number, z: number, facing: number } | undefined} prev
   * @param {number} dt  real seconds since the last frame (animation)
   * @param {boolean} frozen  hit-stop: hold the pose
   */
  update(alpha, prev, dt, frozen) {
    const a = this.actor;
    const p = a.position;
    if (prev) {
      this.root.position.set(lerp(prev.x, p.x, alpha), lerp(prev.y, p.y, alpha), lerp(prev.z, p.z, alpha));
      this.root.rotation.y = lerpAngle(prev.facing, a.facing, alpha);
    } else {
      this.root.position.set(p.x, p.y, p.z);
      this.root.rotation.y = a.facing;
    }

    if (this.kind === 'player') this.animatePlayer();
    else if (this.kind === 'foe') this.animateFoe();
    else if (this.kind === 'npc') this.setClip('idle', 'Idle');
    else this.animateDummy(dt);

    this.animator.defaultFade = this.crossFade;
    this.animator.paused = frozen;
    this.animator.update(dt);

    // Hit flash: emissive white, fading over ~0.12 s.
    if (this.flash > 0 || this.flashed) {
      const k = Math.max(0, this.flash) * this.flashStrength;
      for (const m of this.model.materials) m.emissive.copy(WHITE).multiplyScalar(k * 0.9);
      this.flashed = this.flash > 0;
      if (!frozen) this.flash -= dt / 0.12;
    }
  }

  /**
   * Play a clip if the state changed (or restarted).
   * @param {string} key  changes whenever the clip should restart
   * @param {string} clip
   * @param {Parameters<Animator['play']>[1]} [options]
   */
  setClip(key, clip, options = {}) {
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.animator.play(clip, { restart: true, ...options });
  }

  animatePlayer() {
    const pl = this.actor;
    const fsm = pl.fsm;
    const entry = fsm.history[fsm.history.length - 1]?.tick ?? 0;
    const state = fsm.current;
    const speed = Math.hypot(pl.velocity.x, pl.velocity.z);
    switch (state) {
      case 'attack':
        this.setClip(`attack:${pl.swingId}`, pl.attack.anim, { loop: false, duration: totalFrames(pl.attack) / 60 });
        break;
      case 'roll':
        this.setClip(`roll:${entry}`, ANIMATIONS.roll, { loop: false, duration: PLAYER.roll.frames / 60 });
        break;
      case 'hitstun':
        this.setClip(`hit:${entry}`, ANIMATIONS.hitstun, { loop: false, duration: Math.max(0.3, pl.hitstunFrames / 60) });
        break;
      case 'knockdown':
        if (fsm.frames < 34) this.setClip(`down:${entry}`, ANIMATIONS.knockdown, { loop: false, duration: 0.55 });
        else this.setClip(`up:${entry}`, ANIMATIONS.getUp, { loop: false, duration: (PLAYER.knockdownFrames - 34) / 60 });
        break;
      case 'dead':
        this.setClip(`dead:${entry}`, ANIMATIONS.dead, { loop: false, duration: 1.2 });
        break;
      case 'shield':
        this.setClip('shield', ANIMATIONS.shield);
        break;
      case 'drink':
        this.setClip(`drink:${entry}`, ANIMATIONS.drink, { loop: false, duration: PLAYER.drink.frames / 60 });
        break;
      case 'strafe': {
        const m = pl.localMove;
        let clip = 'Idle';
        if (Math.hypot(m.x, m.y) > 0.15) {
          if (Math.abs(m.x) > Math.abs(m.y)) clip = m.x > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
          else clip = m.y > 0 ? 'Running_A' : 'Walking_Backwards';
        }
        this.setClip(`strafe:${clip}`, clip, { speed: clip === 'Idle' ? 1 : Math.max(0.6, speed / PLAYER.strafeSpeed) });
        break;
      }
      case 'run':
        this.setClip('run', ANIMATIONS.run);
        // Match the legs to the ground speed so feet don't slide.
        if (this.animator.current) this.animator.current.timeScale = Math.max(0.35, speed / PLAYER.runSpeed);
        break;
      default:
        this.setClip('idle', ANIMATIONS.idle);
    }
  }

  /** Any enemy: its brain's state picks the clip; wind-ups show the telegraph. */
  animateFoe() {
    const g = this.actor;
    const brain = g.brain;
    const state = brain.state;
    const def = g.def;
    const entry = brain.fsm.history[brain.fsm.history.length - 1]?.tick ?? 0;
    const atk = g.attack;
    const boss = def.brain === 'warden';
    const glow = (/** @type {number} */ k) => {
      for (const mesh of this.model.weapon) {
        const m = /** @type {any} */ (mesh.material);
        if (m?.emissive) m.emissive.copy(ORANGE).multiplyScalar(k);
      }
    };

    // Telegraph: a ring that closes on the enemy as the wind-up runs out, a
    // warning sign, a glowing weapon. The ring shows the attack's reach.
    const winding = brain.telegraph && this.telegraphOn && g.alive;
    if (this.ring && this.warning && this.lane && this.laneFill) {
      const narrow = Boolean(atk && state === 'windup' && atk.hitbox.arcTo - atk.hitbox.arcFrom < 40);
      this.ring.visible = winding && !narrow;
      this.lane.visible = this.laneFill.visible = winding && narrow;
      this.warning.visible = winding;
      if (winding) {
        const t = brain.windupProgress ?? 0;
        const reach = atk && state === 'windup' ? atk.hitbox.reach + atk.hitbox.radius : g.radius + 0.6;
        if (narrow && atk) {
          const length = reach; // to the far edge of the blow
          const width = atk.hitbox.radius * 2;
          this.lane.scale.set(width, 1, length);
          this.laneFill.scale.set(width, 1, Math.max(0.01, length * t));
        }
        const s = reach * (1.6 - 0.9 * t);
        this.ring.scale.set(s, s, s);
        /** @type {MeshBasicMaterial} */ (this.ring.material).opacity = 0.5 + 0.45 * t;
        const w = (boss ? 0.8 : 0.45) + 0.35 * t;
        this.warning.scale.set(w, w, w);
      }
    }
    if (def.brain !== 'warden' || !this.flashed) glow(winding ? 0.4 + 0.6 * Math.abs(Math.sin(brain.fsm.frames * 0.35)) : 0);
    if (this.model.core) {
      const m = /** @type {any} */ (this.model.core.material);
      const open = state === 'stuck';
      m.emissiveIntensity = open ? 3 + Math.sin(brain.fsm.frames * 0.4) * 1.2 : state === 'roar' ? 2 : 0.4;
      this.model.core.scale.setScalar(open ? 1.6 : 1);
    }

    switch (state) {
      case 'windup':
      case 'attack':
      case 'recover':
      case 'stuck': {
        if (!atk) {
          this.setClip(`rec:${entry}`, 'Idle');
          break;
        }
        // One clip across wind-up, strike and recovery, stretched so the
        // strike in the animation lands on the first active frame. A stuck
        // axe holds the clip's last pose.
        const IMPACT = 0.42;
        const key = `atk:${state === 'windup' ? entry : this.lastKey}`;
        if (state === 'windup') this.setClip(key, atk.anim, { loop: false, duration: (atk.startup * (brain.ctx?.slow ?? 1)) / 60 / IMPACT, fade: 0.15 });
        break;
      }
      case 'cast':
        this.setClip(`cast:${entry}`, boss ? 'Spellcast_Raise' : 'Spellcast_Shoot', { loop: false, duration: ((def.castFrames ?? 42) / 60) * 1.25, fade: 0.12 });
        break;
      case 'roar':
        this.setClip(`roar:${entry}`, 'Taunt', { loop: false, duration: def.roarFrames / 60 });
        break;
      case 'chase':
      case 'approach': {
        const moving = brain.intent.move !== 'none';
        this.setClip(`run:${moving}`, moving ? 'Running_A' : 'Idle_Combat', { speed: boss ? 0.65 : state === 'chase' ? 0.9 : 0.75 });
        break;
      }
      case 'flee':
        this.setClip('flee', 'Walking_Backwards', { speed: 1.4 });
        break;
      case 'circle':
      case 'keep':
        if (brain.intent.move === 'away') this.setClip('back', 'Walking_Backwards');
        else this.setClip(`circle:${brain.circleDir}`, brain.circleDir > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right', { speed: 0.6 });
        break;
      case 'block':
        this.setClip('block', 'Blocking');
        break;
      case 'hitstun':
        this.setClip(`hit:${entry}`, 'Hit_A', { loop: false, duration: Math.max(0.3, def.hitstunFrames / 60) });
        break;
      case 'stagger':
        this.setClip(`stagger:${entry}`, 'Hit_B', { loop: false, duration: def.staggerFrames / 60 });
        break;
      case 'dead':
        this.setClip(`dead:${entry}`, 'Death_A', { loop: false, duration: boss ? 2.2 : 1.1 });
        break;
      default:
        this.setClip('idle', 'Idle');
    }
  }

  /** @param {number} dt */
  animateDummy(dt) {
    const d = this.actor;
    // Lean away from the hit with the spring offset, and a quick wobble.
    const wobble = d.sinceHit < 40 ? Math.sin(d.sinceHit * 0.6) * Math.exp(-d.sinceHit * 0.08) * 0.25 : 0;
    this.model.root.rotation.x = d.offset.z * 0.6 + wobble;
    this.model.root.rotation.z = -d.offset.x * 0.6;
    void dt;
  }
}

/** @type {CanvasTexture | null} */
let warning = null;

/** A warning sign: "!" in a triangle (a shape, so it reads without colour). Drawn once, shared. */
function warningTexture() {
  warning ??= drawWarning();
  return warning;
}

function drawWarning() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.beginPath();
  g.moveTo(64, 8);
  g.lineTo(122, 116);
  g.lineTo(6, 116);
  g.closePath();
  g.fillStyle = '#ffd23f';
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#2b1d4a';
  g.stroke();
  g.fillStyle = '#2b1d4a';
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('!', 64, 104);
  return new CanvasTexture(c);
}
