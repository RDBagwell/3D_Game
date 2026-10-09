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
import { Adventure } from './adventure/Adventure.js';
import { GameState } from './adventure/GameState.js';
import { AREAS, START } from './data/areas/index.js';
import { OBJECTS } from './data/objects.js';
import { buildArea } from './world/buildArea.js';

/**
 * Boots the game and runs it: loading screen, title, play, pause, the lab.
 *
 *   loading ──▶ title ──Play──▶ play ⇄ paused (pause menu)
 *                  │              ⇅ travel (fade out, next area, fade in)
 *                  └──Game-feel lab──▶ the training grounds with the lab open
 *   `?lab` in the address skips the title and opens the lab.
 *
 * Play runs an Adventure (src/game/adventure/): the game state and the
 * current area's simulation. The lab runs a bare Sandbox in the training
 * grounds. Either way `this.sandbox` is what's simulated and drawn.
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
    /** @type {'loading' | 'title' | 'play' | 'paused' | 'travel'} */
    this.mode = 'loading';
    /** The adventure in progress (null on the title screen and in the lab). @type {Adventure | null} */
    this.adventure = null;
    /** What is simulated and drawn right now. @type {Sandbox} */
    this.sandbox = /** @type {any} */ (null);
    /** Seconds until the fallen player is brought back (0: not waiting). */
    this.reviveTimer = 0;
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

    this.models = models;
    this.view = new WorldView({
      canvas: this.canvas,
      overlay: this.overlay,
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
      play: () => void this.newGame().then(() => this.play()),
      resume: () => this.resume(),
      openLab: () => {
        if (this.mode === 'title') void this.openLab();
        else {
          this.resume();
          this.lab.open();
        }
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
    this.fade = document.createElement('div');
    this.fade.className = 'fade';
    this.root.append(this.fade);
    // The title screen looks out over the village.
    await this.useSandbox(await Sandbox.create({ area: 'village', models, feel: this.feel, grunts: false }));
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
      await this.openLab();
    } else {
      this.toTitle();
    }
  }

  /**
   * Simulate and draw a sandbox (an area of the adventure, or the lab's).
   * @param {Sandbox} sandbox
   */
  async useSandbox(sandbox) {
    if (this.sandbox && this.sandbox !== sandbox && this.sandbox !== this.adventure?.sandbox) this.sandbox.dispose();
    this.sandbox = sandbox;
    sandbox.setFeel(this.feel);
    this.view.setSandbox(sandbox);
    this.listenSandbox(sandbox);
  }

  // ------------------------------------------------------------------ the adventure

  /** Start a new adventure in the village. */
  async newGame() {
    const state = new GameState();
    await this.startAdventure(state, START.area, START.spawn);
    this.hud.showBanner(AREAS[/** @type {keyof typeof AREAS} */ (START.area)].name, 2.5);
  }

  /**
   * @param {GameState} state
   * @param {string} area
   * @param {string} spawn
   */
  async startAdventure(state, area, spawn) {
    this.adventure?.dispose();
    const adventure = new Adventure(state, { feel: () => this.feel, models: this.models });
    this.adventure = adventure;
    this.view.checkpointObject = () => this.checkpointObject();
    adventure.events.on('travel', (e) => void this.travel(e.area, e.spawn));
    adventure.events.on('died', () => {
      this.reviveTimer = 2.6;
      this.hud.showBanner('You fell. The hearthstone will bring you back…', 2.4);
    });
    adventure.events.on('checkpoint', (e) => {
      if (e.fresh) this.hud.showBanner('The hearthstone glows: you\'ll come back here if you fall.', 3);
      this.audio.play('checkpoint');
    });
    adventure.events.on('notice', (e) => this.hud.showBanner(e.text, 2.5));
    adventure.events.on('switched', () => this.hud.showBanner('Somewhere ahead, a gate grinds open.', 2.5));
    await adventure.enter(area, spawn);
    await this.useSandbox(/** @type {Sandbox} */ (adventure.sandbox));
    this.prepareNeighbours();
  }

  /** The hearthstone that is the current checkpoint, if it's in this area. */
  checkpointObject() {
    const state = this.adventure?.state;
    if (!state || state.checkpoint.area !== state.area) return null;
    const entry = Object.entries(OBJECTS).find(([, def]) => def.type === 'hearthstone' && def.checkpoint === state.checkpoint.spawn);
    return entry ? entry[0] : null;
  }

  /**
   * Fade out, move to another area, fade in.
   * @param {string} area
   * @param {string} spawn
   * @param {{ respawn?: boolean }} [options]
   */
  async travel(area, spawn, { respawn = false } = {}) {
    if (!this.adventure || this.mode === 'travel') return;
    const previous = this.mode;
    this.mode = 'travel';
    this.input.enabled = false;
    await this.fadeTo(1);
    if (respawn) await this.adventure.respawn();
    else await this.adventure.enter(area, spawn);
    await this.useSandbox(/** @type {Sandbox} */ (this.adventure.sandbox));
    this.music.play(this.adventure.area.music);
    this.mode = previous === 'paused' ? 'play' : 'play';
    this.input.enabled = true;
    this.updateTouch();
    void this.fadeTo(0);
    if (!respawn) this.hud.showBanner(this.adventure.area.name, 2.2);
    this.prepareNeighbours();
  }

  /** Build and compile the areas this one's exits lead to, so stepping through is quick. */
  prepareNeighbours() {
    const adventure = this.adventure;
    if (!adventure) return;
    const next = new Set((adventure.area.exits ?? []).map((e) => e.to));
    const idle = window.requestIdleCallback ?? ((/** @type {() => void} */ fn) => setTimeout(fn, 200));
    for (const id of next) {
      idle(() => {
        if (this.adventure !== adventure || adventure.prepared.has(id)) return;
        const root = adventure.prepare(id, (areaId) => buildArea(AREAS[/** @type {keyof typeof AREAS} */ (areaId)], this.models));
        void this.view.precompile(root);
      });
    }
  }

  /**
   * @param {number} to  0 clear, 1 black
   * @param {number} [seconds=0.35]
   */
  fadeTo(to, seconds = 0.35) {
    this.fade.style.transitionDuration = `${seconds}s`;
    this.fade.classList.toggle('on', to > 0);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 30));
  }

  /** The training grounds with the game-feel lab open. */
  async openLab() {
    this.adventure?.dispose();
    this.adventure = null;
    this.view.checkpointObject = () => null;
    await this.useSandbox(await Sandbox.create({ area: 'training', models: this.models, feel: this.feel }));
    this.play();
    this.lab.open();
  }

  // ------------------------------------------------------------------ modes

  toTitle() {
    if (this.mode === 'play' || this.mode === 'paused') {
      this.adventure?.dispose();
      this.adventure = null;
      this.view.checkpointObject = () => null;
      void Sandbox.create({ area: 'village', models: this.models, feel: this.feel, grunts: false }).then((sb) => this.useSandbox(sb));
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
    this.music.play(this.sandbox.area.music);
    if (!this.greeted) {
      this.greeted = true;
      const touch = this.touch.visible;
      const lab = !this.adventure;
      if (touch) this.hud.showBanner(lab ? 'Hit the training dummy. Lab: the Lab button.' : 'Left thumb moves, drag on the right to look.', 4);
      else this.hud.showBanner('Click the game to steer the camera with the mouse. Tab opens the game-feel lab.', 4);
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

  /**
   * Messages for the lab's training grounds.
   * @param {Sandbox} sandbox
   */
  listenSandbox(sandbox) {
    if (sandbox.area.id !== 'training') return;
    let seenArena = false;
    sandbox.events.on('died', (d) => {
      if (d.who === sandbox.player) this.hud.showBanner('You fell. Back on your feet in a moment…', 2.4);
    });
    sandbox.events.on('triggerEnter', (d) => {
      if (d.id !== 'arena' || seenArena) return;
      seenArena = true;
      this.hud.showBanner('The arena: three grunts. Watch for the wind-up.', 3);
    });
  }

  listen() {

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
    if (this.mode === 'travel') return;
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
    if (this.adventure) {
      this.adventure.step(frame, dt);
      if (this.reviveTimer > 0) {
        this.reviveTimer -= dt;
        if (this.reviveTimer <= 0) void this.travel('', '', { respawn: true });
      }
    } else {
      this.sandbox.step(frame);
    }
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
