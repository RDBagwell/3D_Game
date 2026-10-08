/**
 * Plays music tracks by name, cross-fading between them.
 *
 *   const music = new MusicManager(audio, { baseUrl, tracks: ['title', 'sandbox'] });
 *   music.play('sandbox');          // fades the current track out and this one in
 *   music.play(null);               // fade to silence
 *
 * A track is `music/<name>.ogg`. Only names listed in `tracks` are ever
 * requested (so a game with no music yet makes no failing requests), and a
 * file that is listed but missing or undecodable just means silence: the
 * game never waits for or depends on music. Decoded tracks are cached.
 */
export class MusicManager {
  /**
   * @param {import('./AudioManager.js').AudioManager} audio
   * @param {{ baseUrl?: string, tracks?: string[], fade?: number, fetchImpl?: typeof fetch }} [options]
   */
  constructor(audio, { baseUrl = './', tracks = [], fade = 1.5, fetchImpl } = {}) {
    this.audio = audio;
    this.baseUrl = baseUrl;
    this.tracks = new Set(tracks);
    this.fade = fade;
    this.fetch = fetchImpl ?? ((url) => fetch(url));
    /** @type {Map<string, Promise<AudioBuffer | null>>} */
    this.cache = new Map();
    /** @type {{ name: string, source: AudioBufferSourceNode, gain: GainNode } | null} */
    this.current = null;
    /** The track asked for most recently (it may still be loading). @type {string | null} */
    this.wanted = null;
  }

  /** @param {string} name */
  url(name) {
    return `${this.baseUrl}music/${name}.ogg`;
  }

  /**
   * @param {string} name
   * @returns {Promise<AudioBuffer | null>}
   */
  load(name) {
    let promise = this.cache.get(name);
    if (!promise) {
      const ctx = this.audio.context;
      promise =
        !ctx || !this.tracks.has(name)
          ? Promise.resolve(null)
          : this.fetch(this.url(name))
              .then((r) => (r.ok ? r.arrayBuffer() : null))
              .then((data) => (data ? ctx.decodeAudioData(data) : null))
              .catch(() => null);
      this.cache.set(name, promise);
    }
    return promise;
  }

  /**
   * Cross-fade to a track, or to silence with null.
   * @param {string | null} name
   */
  async play(name) {
    if (name === this.wanted) return;
    this.wanted = name;
    const buffer = name ? await this.load(name) : null;
    if (this.wanted !== name) return; // something else was asked for while loading
    const ctx = this.audio.context;
    if (!ctx || !this.audio.musicGain) return;
    const t = ctx.currentTime;

    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + this.fade);
      old.source.stop(t + this.fade + 0.05);
      this.current = null;
    }
    if (!buffer || !name) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + this.fade);
    source.connect(gain).connect(this.audio.musicGain);
    source.start(t);
    this.current = { name, source, gain };
  }
}
