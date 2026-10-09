import {
  FixedStepLoop, Input, AudioManager, MusicManager, AssetLoader, TouchControls, isTouchDevice, PerfHud,
  browserStorage, readJson, writeJson, button, Ambience,
} from '../engine/index.js';
import { TICK, STORAGE } from './config.js';
import { loadSettings, settings, bindingsFor, updateSettings } from './settings.js';
import { MODELS, MUSIC_TRACKS, MUSIC } from './data/assets.js';
import { SOUNDS, AMBIENCE } from './data/sounds.js';
import { ControlAssists } from './input/controlAssists.js';
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
import { DialogueBox } from './ui/DialogueBox.js';
import { glyphFor } from './ui/Hud.js';
import { NPCS } from './data/npcs.js';
import { ITEMS } from './data/items.js';
import { QUESTS } from './data/quests.js';
import { SHOPS } from './data/shops.js';
import { conditionContext, evaluateCondition } from './adventure/conditions.js';
import { createSaves, slotSummaries, mostRecentSlot, loadGame } from './saves.js';
import { parseCredits } from './content/credits.js';
import { DIALOGUES } from './data/dialogues/index.js';
import { DialogueRunner } from './dialogue/DialogueRunner.js';
import assetsMarkdown from '../../ASSETS.md?raw';

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
    /** Settles once the current area's neighbours are preloaded (prepareNeighbours). @type {Promise<unknown>} */
    this.neighboursReady = Promise.resolve();
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
    this.ambience = new Ambience(this.audio);
    this.ambience.register(AMBIENCE);
    /** Hold or toggle for the shield and lock-on. */
    this.assists = new ControlAssists();
    /** @type {'loading' | 'title' | 'play' | 'paused' | 'travel' | 'talk' | 'shop' | 'ending'} */
    this.mode = 'loading';
    /** The adventure in progress (null on the title screen and in the lab). @type {Adventure | null} */
    this.adventure = null;
    /** What is simulated and drawn right now. @type {Sandbox} */
    this.sandbox = /** @type {any} */ (null);
    /** Seconds until the fallen player is brought back (0: not waiting). */
    this.reviveTimer = 0;
    /** Save slots (localStorage; memory only if the browser blocks it). */
    this.saves = createSaves();
    /** The slot this playthrough saves to. */
    this.slot = 'slot1';
    /** The ending's camera and timing. */
    this.endingTime = 0;
    /** The first-play hint has been shown. */
    this.greeted = false;
    /** A new game's first quest is still to be announced. */
    this.announcePending = false;
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
      quests: () => this.questLog(),
      inventory: () => this.inventoryView(),
      buy: (shop, item) => this.buy(shop, item),
      closeShop: () => this.closeShop(),
      slots: () => slotSummaries(this.saves),
      newGame: (slot) => {
        this.menus.closeAll();
        void this.newGame(slot).then(() => this.play());
      },
      loadGame: (slot) => void this.loadSlot(slot),
      continueGame: () => {
        const slot = mostRecentSlot(this.saves);
        if (slot) void this.loadSlot(slot);
      },
      saveAndQuit: () => {
        this.save(true);
        this.toTitle();
      },
      credits: () => parseCredits(assetsMarkdown),
      keepPlaying: () => void this.keepPlaying(),
      device: () => ({ device: this.usingTouch ? 'touch' : this.input.lastDevice, padStyle: this.input.gamepadStyle }),
    });
    this.dialogue = new DialogueBox(this.overlay, { sound: (name) => this.audio.play(name) });
    this.dialogue.onClose = () => (this.mode === 'ending' ? this.afterEndingTalk() : this.endTalk());
    this.touch = new TouchControls(this.input, this.overlay, {
      surface: this.canvas,
      buttons: [
        { action: 'attack', label: 'Attack', className: 'touch-attack' },
        { action: 'roll', label: 'Roll', className: 'touch-roll' },
        { action: 'shield', label: 'Shield', className: 'touch-shield' },
        { action: 'lockOn', label: 'Lock', className: 'touch-lock' },
        { action: 'interact', label: 'Use', className: 'touch-use' },
        { action: 'useItem', label: 'Tonic', className: 'touch-tonic' },
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
    this.updateFeelBadge();
    this.applyAssists();
    this.assists.reset();
    this.view.setSandbox(sandbox);
    this.ambience.play(sandbox.area.ambience);
    this.listenSandbox(sandbox);
  }

  /** The current settings (for tools/measure.mjs and the console). */
  settingsValues() {
    return settings.values;
  }

  /** The difficulty and assist settings, on the current simulation. */
  applyAssists() {
    const s = settings.values;
    if (this.adventure) this.adventure.damageTaken = s.damageTaken;
    const sb = this.sandbox;
    if (!sb) return;
    // The lab's training grounds stay as session 1 tuned them.
    const adventure = Boolean(this.adventure);
    sb.damageTaken = adventure ? s.damageTaken : 1;
    sb.setSlowEnemies(adventure && s.slowEnemies);
    sb.autoLock = s.autoLock;
  }

  // ------------------------------------------------------------------ the adventure

  /**
   * Start a new adventure in the village, saving to a slot.
   * @param {string} [slot]
   */
  async newGame(slot = 'slot1') {
    this.slot = slot;
    const state = GameState.newGame();
    await this.startAdventure(state, START.area, START.spawn);
    this.hud.showBanner(AREAS[/** @type {keyof typeof AREAS} */ (START.area)].name, 2.5);
    // A new game announces the quest you start with (a loaded one doesn't
    // again), once the greeting banner has gone so the two don't overlap
    // (render() checks).
    this.announcePending = true;
    this.save();
  }

  /**
   * Load a slot and carry on where it was saved.
   * @param {string} slot
   */
  async loadSlot(slot) {
    const result = loadGame(this.saves, slot);
    if (!result.state) {
      this.hud.toast('Could not load', result.warning ?? '', 'notice');
      return;
    }
    this.slot = slot;
    this.menus.closeAll();
    // This playthrough's difficulty and assists come back with it.
    if (result.settings) this.applySettings(updateSettings(result.settings));
    await this.startAdventure(result.state, result.state.area, result.state.spawn, { resume: true });
    this.play();
    this.hud.showBanner(this.adventure?.area.name ?? '', 2.2);
    if (result.migratedFrom) this.hud.toast('Save updated', `This save was made by an older version (v${result.migratedFrom}) and has been brought up to date.`, 'notice');
  }

  /**
   * Save the adventure to its slot (autosaves, and Save and quit).
   * @param {boolean} [here]  also where the player stands (Save and quit)
   */
  save(here = false) {
    if (!this.adventure) return false;
    const result = this.saves.save(this.slot, { ...this.adventure.saveData(here), settings: { ...settings.values, keys: undefined } });
    if (!result.ok) this.hud.toast('Not saved', result.error ?? '', 'notice');
    else this.hud.flashSaved();
    return result.ok;
  }

  /**
   * @param {GameState} state
   * @param {string} area
   * @param {string} spawn
   * @param {{ resume?: boolean }} [options]  resume: a loaded game (its saved position)
   */
  async startAdventure(state, area, spawn, { resume = false } = {}) {
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
      this.save();
    });
    adventure.events.on('notice', (e) => this.hud.toast('', e.text, 'notice'));
    adventure.events.on('banner', (e) => this.hud.showBanner(e.text, 3));
    adventure.events.on('switched', () => this.hud.showBanner('Somewhere ahead, a gate grinds open.', 2.5));
    adventure.events.on('dialogue', (e) => this.startTalk(e.id, e.npc));
    adventure.events.on('quest', (q) => {
      const title = q.status === 'done' ? 'Quest complete' : q.status === 'new' ? 'New quest' : 'Quest updated';
      this.hud.toast(`${title}: ${q.name}`, q.text, q.status);
      this.audio.play(q.status === 'done' ? 'quest_done' : 'quest');
    });
    adventure.events.on('shells', (e) => this.view.floaters.add(`+${e.amount} shells`, { ...e.position, y: e.position.y + 1.6 }, 'note good'));
    adventure.events.on('healed', () => this.audio.play('drink'));
    if (resume) await adventure.resume();
    else await adventure.enter(area, spawn);
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
    this.save();
    this.prepareNeighbours();
  }

  /** Build and compile the areas this one's exits lead to, so stepping through is quick. */
  prepareNeighbours() {
    const adventure = this.adventure;
    if (!adventure) return;
    const next = new Set((adventure.area.exits ?? []).map((e) => e.to));
    const idle = window.requestIdleCallback ?? ((/** @type {() => void} */ fn) => setTimeout(fn, 200));
    this.neighboursReady = Promise.all(
      [...next].map(
        (id) =>
          new Promise((resolve) => {
            idle(() => {
              if (this.adventure !== adventure || adventure.prepared.has(id)) return resolve(undefined);
              const root = adventure.prepare(id, (areaId) => buildArea(AREAS[/** @type {keyof typeof AREAS} */ (areaId)], this.models));
              void this.view.precompile(root).finally(() => resolve(undefined));
            });
          }),
      ),
    );
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

  // ------------------------------------------------------------------ talking and shops

  /**
   * Open a conversation: the fight pauses, the camera frames the speaker.
   * @param {string} id
   * @param {string | null} npc
   */
  startTalk(id, npc) {
    if (!this.adventure || this.mode !== 'play') return;
    const runner = this.adventure.talk(id, npc);
    this.mode = 'talk';
    if (this.input.pointerLocked) {
      this.releasingPointer = true;
      this.input.exitPointerLock();
    }
    this.touch.hide();
    this.hud.updatePrompt(null, '');
    this.audio.play('talk');
    this.dialogue.open(runner, settings.values.textSpeed);
  }

  /** The conversation closed: shop, travel, the ending, or back to play. */
  endTalk() {
    if (!this.adventure) return;
    const after = this.adventure.finish();
    this.mode = 'play';
    this.updateTouch();
    if (after.shop) this.openShop(after.shop);
    else if (after.travel) void this.travel(after.travel.area, after.travel.spawn);
    else if (after.ending) this.startEnding();
  }

  // ------------------------------------------------------------------ the ending

  /** The Hearth is lit: wisps rise, Ina speaks, then the credits. */
  startEnding() {
    this.mode = 'ending';
    this.endingTime = 0;
    this.endingTalked = false;
    this.input.exitPointerLock();
    this.touch.hide();
    this.hud.setVisible(false);
    this.music.play(MUSIC.victory);
    this.save();
  }

  /** @param {number} dt */
  updateEnding(dt) {
    this.endingTime += dt;
    const sb = this.sandbox;
    const hearth = sb.objects.find((o) => o.type === 'hearth');
    const at = hearth ? hearth.position : sb.player.position;
    sb.frameShot({ pivot: { x: at.x, y: at.y + 1.6, z: at.z }, yaw: 0.6 + this.endingTime * 0.12, pitch: -0.3, distance: 9 });
    this.view.wisps(at, dt);
    if (this.endingTime > 3 && !this.endingTalked && !this.dialogue.isOpen) {
      this.endingTalked = true;
      const runner = new DialogueRunner(DIALOGUES.ending, /** @type {Adventure} */ (this.adventure).state, 'ending', { player: 'Ren' }).start();
      this.dialogue.open(runner, settings.values.textSpeed);
    }
  }

  /** The ending's conversation is over: the credits. */
  afterEndingTalk() {
    this.menus.showEnding();
  }

  /** After the credits: back to the village, where everyone has something new to say. */
  async keepPlaying() {
    this.mode = 'play';
    this.hud.setVisible(true);
    await this.travel('village', 'gate');
  }

  /** @param {string} id */
  openShop(id) {
    this.mode = 'shop';
    this.input.exitPointerLock();
    this.touch.hide();
    this.menus.showShop(id, this.shopView(id));
  }

  closeShop() {
    if (this.mode !== 'shop') return;
    this.mode = 'play';
    this.updateTouch();
  }

  /** @param {string} id */
  shopView(id) {
    const shop = SHOPS[/** @type {keyof typeof SHOPS} */ (id)];
    const state = /** @type {Adventure} */ (this.adventure).state;
    return {
      name: shop.name,
      shells: state.shells,
      rows: shop.items.map((itemId) => {
        const item = ITEMS[itemId];
        return { id: itemId, name: item.name, description: item.description, price: /** @type {Record<string, number>} */ (shop.prices)[itemId] ?? item.price ?? 0, have: state.itemCount(itemId), max: item.stack };
      }),
    };
  }

  /**
   * @param {string} shopId
   * @param {string} itemId
   */
  buy(shopId, itemId) {
    const state = /** @type {Adventure} */ (this.adventure).state;
    const row = this.shopView(shopId).rows.find((r) => r.id === itemId);
    let message = '';
    if (!row) message = 'Not for sale.';
    else if (row.have >= row.max) message = `You can't carry more than ${row.max}.`;
    else if (state.shells < row.price) message = `Not enough shells: ${row.price} needed.`;
    else {
      state.shells -= row.price;
      state.addItem(itemId, 1, row.max);
      message = `Bought ${row.name}. ${state.shells} shells left.`;
      this.audio.play('buy');
    }
    return { message, view: this.shopView(shopId) };
  }

  /** The quest log: started quests, main first. */
  questLog() {
    const state = this.adventure?.state;
    if (!state) return [];
    const ctx = conditionContext(state);
    const out = [];
    for (const quest of Object.values(QUESTS)) {
      const done = evaluateCondition(quest.done, ctx);
      let text = null;
      for (const stage of quest.stages) if (evaluateCondition(stage.when, ctx)) text = stage.text;
      if (done) text = quest.doneText;
      if (text) out.push({ name: quest.name, text, done, main: Boolean(/** @type {any} */ (quest).main) });
    }
    return out.sort((a, b) => Number(b.main) - Number(a.main) || Number(a.done) - Number(b.done));
  }

  inventoryView() {
    const state = this.adventure?.state;
    if (!state) return null;
    const order = { consumable: 0, upgrade: 1, key: 2 };
    const items = [...state.items]
      .filter(([id, n]) => n > 0 && ITEMS[id])
      .map(([id, count]) => ({ id, count, ...ITEMS[id] }))
      .sort((a, b) => order[a.type] - order[b.type]);
    return { shells: state.shells, items };
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
    this.announcePending = false;
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
      else if (lab) this.hud.showBanner('Click the game to steer the camera with the mouse. Tab opens the game-feel lab.', 4);
      else this.hud.showBanner('Click the game to steer the camera with the mouse. Esc pauses: your quests are there.', 4);
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
    this.updateFeelBadge();
  }

  /**
   * The "Feel: …" badge: always in the lab's training grounds; in the
   * adventure only when the feel isn't the default (Polished), so a player
   * who changed it knows, and nobody else sees a developer label.
   */
  updateFeelBadge() {
    const preset = matchingPreset(this.feel);
    const label = preset ? FEEL_PRESETS[/** @type {keyof typeof FEEL_PRESETS} */ (preset)].label : 'Custom';
    this.hud?.setPreset(this.adventure && preset === 'polished' ? null : label);
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
    this.view?.setQuality(s.quality);
    this.applyAssists();
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
    sandbox.events.on('noticed', (d) => {
      if (d.boss) this.music.play(MUSIC.boss);
    });
    sandbox.events.on('roar', () => this.hud.showBanner('The Warden roars! Cindermites crawl out of the ash.', 3));
    sandbox.events.on('hit', (d) => {
      if (!d.killed || d.target.def?.brain !== 'warden') return;
      this.music.play(MUSIC.victory, { loop: false, then: sandbox.area.music });
      this.hud.showBanner('The Cinder Warden crumbles. Something glows in the ash.', 4);
    });
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
    if (this.mode === 'talk') {
      this.dialogue.update(dt, frame);
      this.adventure?.talkStep();
      return;
    }
    if (this.mode === 'ending') {
      if (this.dialogue.isOpen) this.dialogue.update(dt, frame);
      else this.menus.handlePad(frame, this.input.lastDevice === 'gamepad');
      this.updateEnding(dt);
      return;
    }
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
    const played = this.assists.apply(frame, settings.values, Boolean(this.sandbox.lockTarget));
    if (this.adventure) {
      this.adventure.step(played, dt);
      if (this.reviveTimer > 0) {
        this.reviveTimer -= dt;
        if (this.reviveTimer <= 0) void this.travel('', '', { respawn: true });
      }
    } else {
      this.sandbox.step(played);
    }
  }

  /** "Talk · Elder Ina", "Open · the chest": what Interact does right now. */
  promptLabel() {
    const focus = this.sandbox?.focus;
    if (!focus) return null;
    if (focus.kind === 'npc') return `${focus.label} · ${NPCS[/** @type {keyof typeof NPCS} */ (focus.id)]?.name ?? ''}`;
    return `${focus.label} · ${OBJECTS[focus.id]?.name ?? ''}`;
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
    if (this.announcePending && this.mode === 'play' && this.hud.banner.hidden) {
      this.announcePending = false;
      this.adventure?.announceQuests();
    }
    this.hud.updateHealth(dt, sb.player);
    const t = sb.lockTarget;
    this.hud.updateReticle(t ? this.view.project({ x: t.position.x, y: t.position.y + t.height * 0.6, z: t.position.z }) : null, t);
    const boss = sb.boss;
    this.hud.updateBoss(boss && boss.brain.aware ? /** @type {any} */ (boss) : null);
    const device = { device: this.input.lastDevice, padStyle: this.input.gamepadStyle, keys: settings.values.keys, bindings: this.input.bindings };
    this.hud.updateHints({ ...device, enabled: settings.values.hints && this.mode !== 'talk' });
    const state = this.adventure?.state;
    this.hud.updateInventory(state ? { shells: state.shells, tonics: state.itemCount('tonic') } : null, glyphFor('useItem', device));
    this.hud.updatePrompt(this.mode === 'play' ? this.promptLabel() : null, glyphFor('interact', device));
    this.lab.update(sb);
    const info = this.view.renderer.info;
    this.perf.addPhysicsSample(sb.physics.lastStepMs);
    this.perf.frame(frameTime, info, `sim ${1 / TICK} Hz, ${this.loop.lastSteps} step(s) this frame`);
  }
}
