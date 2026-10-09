/**
 * Sound effects on the Web Audio API, positional or flat.
 *
 *   master ─┬─ music gain ── MusicManager's tracks
 *           └─ sfx gain ──── each sound ── (panner, if positional) ──┘
 *
 * Sounds are recipes registered by the game (`register(recipes)`), played by
 * name: `audio.play('hit', { position })`. With a position and `positional`
 * on, the sound goes through an HRTF panner, so a grunt's wind-up behind you
 * sounds behind you and gets quieter with distance; the listener follows the
 * camera (`setListener`). With `positional` off (a game-feel lab switch),
 * every sound plays flat in the middle.
 *
 * Sounds can carry a caption (the game's subtitles for important cues);
 * `onCaption` is called with it whenever one plays.
 *
 * Browsers block audio until the player interacts with the page:
 * `autoUnlock(window)` resumes it on the first key, click or touch. If Web
 * Audio isn't available, every method quietly does nothing.
 */

/** @typedef {'master' | 'music' | 'sfx'} Channel */
/** @typedef {(ctx: BaseAudioContext, out: AudioNode, t: number, rng: () => number) => void} Recipe */
/** @typedef {{ recipe: Recipe, caption?: string, volume?: number }} SoundDef */

export class AudioManager {
  /** @param {{ createContext?: () => AudioContext | null }} [options] */
  constructor(options = {}) {
    const create =
      options.createContext ??
      (() => {
        const Ctx = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
        return Ctx ? new Ctx() : null;
      });
    /** @type {AudioContext | null} */
    this.context = null;
    try {
      this.context = create();
    } catch {
      this.context = null;
    }
    /** @type {Record<Channel, number>} */
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
    /** @type {Map<string, SoundDef>} */
    this.sounds = new Map();
    this.positional = true;
    /** @type {(caption: string) => void} */
    this.onCaption = () => {};
    /** How many sounds started recently (to stop a burst of hits clipping). */
    this.recent = 0;
    this.recentAt = 0;

    const ctx = this.context;
    if (ctx) {
      this.masterGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      // A gentle limiter so a pile-up of hits never clips.
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.ratio.value = 8;
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.limiter).connect(ctx.destination);
      this.applyVolumes();
    }
  }

  get unlocked() {
    return this.context?.state === 'running';
  }

  /**
   * Resume the audio context on the first user gesture.
   * @param {EventTarget} target
   */
  autoUnlock(target) {
    const unlock = () => {
      this.context?.resume().catch(() => {});
      if (this.unlocked) {
        for (const type of ['keydown', 'pointerdown', 'touchend']) target.removeEventListener(type, unlock);
      }
    };
    for (const type of ['keydown', 'pointerdown', 'touchend']) target.addEventListener(type, unlock);
  }

  /** @param {Record<string, SoundDef>} defs */
  register(defs) {
    for (const [name, def] of Object.entries(defs)) this.sounds.set(name, def);
  }

  /**
   * @param {Channel} channel
   * @param {number} value  0..1
   */
  setVolume(channel, value) {
    this.volumes[channel] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }

  /** @private */
  applyVolumes() {
    if (!this.context) return;
    this.masterGain.gain.value = this.volumes.master;
    this.musicGain.gain.value = this.volumes.music;
    this.sfxGain.gain.value = this.volumes.sfx;
  }

  /**
   * Move the listener (the camera).
   * @param {{ x: number, y: number, z: number }} position
   * @param {{ x: number, y: number, z: number }} forward
   */
  setListener(position, forward) {
    const ctx = this.context;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(position.x, t);
      l.positionY.setValueAtTime(position.y, t);
      l.positionZ.setValueAtTime(position.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /**
   * @param {string} name
   * @param {{ position?: { x: number, y: number, z: number }, volume?: number }} [options]
   */
  play(name, options = {}) {
    const def = this.sounds.get(name);
    if (!def) return;
    if (def.caption) this.onCaption(def.caption);
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    if (now - this.recentAt > 0.05) {
      this.recent = 0;
      this.recentAt = now;
    }
    if (++this.recent > 8) return; // more than 8 sounds in 50 ms: drop the rest

    const gain = ctx.createGain();
    gain.gain.value = (def.volume ?? 1) * (options.volume ?? 1);
    /** @type {AudioNode} */
    let out = gain;
    if (this.positional && options.position) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.5;
      panner.rolloffFactor = 1;
      panner.maxDistance = 60;
      if (panner.positionX) {
        panner.positionX.value = options.position.x;
        panner.positionY.value = options.position.y;
        panner.positionZ.value = options.position.z;
      } else {
        panner.setPosition(options.position.x, options.position.y, options.position.z);
      }
      gain.connect(panner).connect(this.sfxGain);
    } else {
      gain.connect(this.sfxGain);
    }
    try {
      def.recipe(ctx, out, now + 0.005, Math.random);
    } catch (error) {
      console.warn(`Sound "${name}" failed`, error);
    }
    // Disconnect when done so nodes are collected.
    setTimeout(() => gain.disconnect(), 2000);
  }
}
