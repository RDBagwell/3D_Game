import {
  FixedStepLoop, Input, AudioManager, MusicManager, AssetLoader, TouchControls, isTouchDevice, PerfHud,
  browserStorage, readJson, writeJson, button,
} from '../engine/index.js';
import { TICK, STORAGE } from './config.js';
import { loadSettings, settings, bindingsFor } from './settings.js';
import { MODELS, MUSIC_TRACKS, MUSIC } from './data/assets.js';
import { SOUNDS } from './data/sounds.js';
import { FEEL_PRESETS } from './data/feel.js';
import { sanitizeFeel, sanitizeShow, readLabQuery, matchingPreset } from './feel/feelSettings.js';
import { Sandbox } from './sim/Sandbox.js';
import { WorldView } from './view/WorldView.js';
import { Hud } from './ui/Hud.js';
import { Menus } from './ui/Menus.js';
import { LabPanel } from './lab/LabPanel.js';
import { buildTrainingGrounds } from './scenes/trainingGrounds.js';

/**
 * Boots the game and runs it: loading screen, title, play, pause, the lab.
 *
 *   loading ──▶ title ──Play──▶ play ⇄ paused (pause menu)
 *                  └──Game-feel lab──▶ play with the lab open
 *   `?lab` in the address skips the title and opens the lab.
 *
 * One FixedStepLoop drives everything. Each update samples input once; in
 * play it becomes the simulation's InputFrame (Sandbox.step), in menus it
 * drives gamepad navigation. Each render draws the world interpolated and
 * updates the HUD and the lab.
 */
export class Game {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.storage = browserStorage();
    loadSettings(this.storage);

    const fromUrl = readLabQuery(location.search);
    this.feel = fromUrl.feel ?? sanitizeFeel(readJson(this.storage, STORAGE.feel));
    this.show = fromUrl.show ?? sanitizeShow(readJson(this.storage, STORAGE.show));
    this.openLabAtStart = fromUrl.open;

    this.canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
    this.overlay = /** @type {HTMLElement} */ (root.querySelector('.overlay'));
    this.input = new Input({ bindings: bindingsFor(settings.values.keys), pointerElement: this.canvas });
    /**
     * Whether the player is using a touchscreen right now. It starts true on
     * phones and tablets, and follows the last pointer used, so a laptop with
     * a touchscreen gets touch controls only while fingers are used and the
     * mouse scheme otherwise.
     */
    this.usingTouch = isTouchDevice();
    if (this.usingTouch) this.input.lastDevice = 'touch';
    this.audio = new AudioManager();
    this.audio.register(SOUNDS);
    this.audio.autoUnlock(window);
    this.music = new MusicManager(this.audio, { baseUrl: import.meta.env.BASE_URL, tracks: MUSIC_TRACKS });
    /** @type {'loading' | 'title' | 'play' | 'paused'} */
    this.mode = 'loading';
    this.seenArena = false;
    /** The first-play hint has been shown. */
    this.greeted = false;
    /** Set when the game itself releases the mouse (opening the lab), so it doesn't pause. */
    this.releasingPointer = false;
  }

  async start() {
    const bar = /** @type {HTMLElement} */ (this.root.querySelector('.loading-bar span'));
    const label = /** @type {HTMLElement} */ (this.root.querySelector('.loading-label'));
    const total = Object.values(MODELS).reduce((s, m) => s + m.bytes, 0);
    const loader = new AssetLoader({ baseUrl: import.meta.env.BASE_URL });
    const models = await loader.loadAll(MODELS, (p) => {
      bar.style.width = `${(p * 100).toFixed(1)}%`;
      label.textContent = `Loading ${((p * total) / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
    });

    this.sandbox = await Sandbox.create({ levelRoot: buildTrainingGrounds(), feel: this.feel });
    this.view = new WorldView({
      canvas: this.canvas,
      overlay: this.overlay,
      sandbox: this.sandbox,
      models,
      audio: this.audio,
      input: this.input,
      feel: () => this.feel,
      show: () => this.show,
      prefs: () => settings.values,
    });
    this.hud = new Hud(this.overlay);
    this.hud.setVisible(false);
    this.perf = new PerfHud(this.overlay);
    this.lab = new LabPanel(this.root, {
      getFeel: () => this.feel,
      setFeel: (v) => this.setFeel(v),
      getShow: () => this.show,
      setShow: (v) => this.setShow(v),
      onClose: () => {},
    });
    this.menus = new Menus(this.root, {
      play: () => this.play(),
      resume: () => this.resume(),
      openLab: () => {
        this.play();
        this.lab.open();
      },
      quit: () => this.toTitle(),
      applySettings: (s) => this.applySettings(s),
      sound: (name) => this.audio.play(name),
    });
    this.touch = new TouchControls(this.input, this.overlay, {
      surface: this.canvas,
      buttons: [
        { action: 'attack', label: 'Attack', className: 'touch-attack' },
        { action: 'roll', label: 'Roll', className: 'touch-roll' },
        { action: 'shield', label: 'Shield', className: 'touch-shield' },
        { action: 'lockOn', label: 'Lock', className: 'touch-lock' },
        { action: 'lab', label: 'Lab', className: 'touch-lab' },
        { action: 'pause', label: 'II', className: 'touch-pause' },
      ],
    });
    this.audio.onCaption = (text) => {
      if (settings.values.captions && this.mode === 'play') this.hud.caption(text);
    };
    this.listen();
    this.applySettings(settings.values);
    this.setShow(this.show);

    const onResize = () => this.view.resize(this.root.clientWidth, this.root.clientHeight);
    window.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(this.root);
    onResize();

    this.loop = new FixedStepLoop({ update: (dt) => this.update(dt), render: (alpha, ft) => this.render(alpha, ft) });
    this.loop.pauseWhenHidden(document);
    this.loop.start();

    /** @type {HTMLElement} */ (this.root.querySelector('.loading')).remove();
    if (this.openLabAtStart) {
      this.play();
      this.lab.open();
    } else {
      this.toTitle();
    }
  }

  // ------------------------------------------------------------------ modes

  toTitle() {
    if (this.mode === 'play' || this.mode === 'paused') {
      const s = this.sandbox.playerSpawn;
      this.sandbox.player.respawn(s.position, s.yaw, (p) => this.sandbox.player.body.teleport?.(p));
      this.sandbox.setLock(null);
    }
    this.mode = 'title';
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.hud.setVisible(false);
    this.lab.close();
    this.touch.hide();
    this.menus.showTitle();
    this.music.play(MUSIC.title);
  }

  play() {
    this.mode = 'play';
    this.input.enabled = true;
    this.hud.setVisible(true);
    this.updateTouch();
    this.music.play(MUSIC.sandbox);
    if (!this.greeted) {
      this.greeted = true;
      const touch = this.touch.visible;
      this.hud.showBanner(touch ? 'Hit the training dummy. Lab: the Lab button.' : 'Click the game to steer the camera with the mouse. Tab opens the game-feel lab.', 4);
    }
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.menus.showPause();
  }

  resume() {
    this.mode = 'play';
    this.input.enabled = true;
    this.updateTouch();
  }

  // ------------------------------------------------------------------ settings

  /** @param {import('./feel/feelSettings.js').FeelValues} v */
  setFeel(v) {
    this.feel = v;
    this.sandbox?.setFeel(v);
    writeJson(this.storage, STORAGE.feel, v);
    const preset = matchingPreset(v);
    this.hud?.setPreset(preset ? FEEL_PRESETS[/** @type {keyof typeof FEEL_PRESETS} */ (preset)].label : 'Custom');
  }

  /** @param {import('./feel/feelSettings.js').ShowValues} v */
  setShow(v) {
    this.show = v;
    writeJson(this.storage, STORAGE.show, v);
    this.perf?.setVisible(Boolean(v.perf));
    if (this.loop) this.loop.timeScale = v.speed ?? 1;
    this.setFeel(this.feel);
  }

  /** @param {import('./settings.js').Settings} s */
  applySettings(s) {
    this.input.setBindings(bindingsFor(s.keys));
    this.input.look.sensitivity = s.sensitivity;
    this.input.look.invertX = s.invertX;
    this.input.look.invertY = s.invertY;
    this.audio.setVolume('master', s.masterVolume / 10);
    this.audio.setVolume('music', s.musicVolume / 10);
    this.audio.setVolume('sfx', s.sfxVolume / 10);
    this.updateTouch();
  }

  updateTouch() {
    if (!this.touch) return;
    const mode = settings.values.touch;
    const on = this.mode === 'play' && (mode === 'on' || (mode === 'auto' && this.usingTouch));
    if (on) this.touch.show();
    else this.touch.hide();
  }

  // ------------------------------------------------------------------ events

  listen() {
    const ev = this.sandbox.events;
    ev.on('died', (d) => {
      if (d.who === this.sandbox.player) this.hud.showBanner('You fell. Back on your feet in a moment…', 2.4);
    });
    ev.on('triggerEnter', (d) => {
      if (d.id !== 'arena') return;
      if (!this.seenArena) this.hud.showBanner('The arena: three grunts. Watch for the wind-up.', 3);
      this.seenArena = true;
      this.music.play(MUSIC.combat);
    });
    ev.on('triggerExit', (d) => {
      if (d.id === 'arena' && this.sandbox.player.position.z > -18) this.music.play(MUSIC.sandbox);
    });

    // Follow the pointer actually in use (capture phase: before anything else sees it).
    window.addEventListener(
      'pointerdown',
      (e) => {
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
        if (touch === this.usingTouch) return;
        this.usingTouch = touch;
        if (touch) this.input.lastDevice = 'touch';
        this.updateTouch();
      },
      true,
    );
    // A mouse press on the game captures the mouse for the camera (the same
    // press also counts as an attack).
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'play' && e.pointerType === 'mouse') this.input.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'play' && !this.releasingPointer) this.pause();
      this.releasingPointer = false;
    });
  }

  // ------------------------------------------------------------------ loop

  /** @param {number} dt */
  update(dt) {
    const frame = this.input.sample(dt);
    if (this.mode !== 'play') {
      this.menus.handlePad(frame, this.input.lastDevice === 'gamepad');
      if (this.mode === 'title') {
        // A slow orbit behind the title screen.
        const cam = this.sandbox.camera;
        cam.snapshot();
        cam.update(dt, { target: this.sandbox.player.position, lead: { x: 0, z: 0 }, look: { x: dt * 0.12, y: 0 }, lockTarget: null, recenter: null });
      }
      return;
    }
    if (button(frame, 'pause').pressed) return void this.pause();
    if (button(frame, 'lab').pressed) this.toggleLab();
    if (button(frame, 'debug').pressed) this.setShow({ ...this.show, perf: !this.show.perf, colliders: !this.show.perf });
    this.sandbox.step(frame);
  }

  toggleLab() {
    if (!this.lab.isOpen && this.input.pointerLocked) {
      this.releasingPointer = true;
      this.input.exitPointerLock();
    }
    this.lab.toggle();
  }

  /**
   * @param {number} alpha
   * @param {number} frameTime
   */
  render(alpha, frameTime) {
    const dt = Math.min(frameTime, 0.1);
    this.view.render(alpha, dt * (this.show.speed ?? 1));
    const sb = this.sandbox;
    this.hud.tick(dt);
    this.hud.updateHealth(dt, sb.player);
    const t = sb.lockTarget;
    this.hud.updateReticle(t ? this.view.project({ x: t.position.x, y: t.position.y + t.height * 0.6, z: t.position.z }) : null, t);
    this.hud.updateHints({
      device: this.input.lastDevice,
      padStyle: this.input.gamepadStyle,
      keys: settings.values.keys,
      bindings: this.input.bindings,
      enabled: settings.values.hints,
    });
    this.lab.update(sb);
    const info = this.view.renderer.info;
    this.perf.addPhysicsSample(sb.physics.lastStepMs);
    this.perf.frame(frameTime, info, `sim ${1 / TICK} Hz, ${this.loop.lastSteps} step(s) this frame`);
  }
}
