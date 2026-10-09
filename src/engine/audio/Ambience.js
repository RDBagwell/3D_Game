/**
 * Ambient sound beds: a looping background for each place (waves on a
 * shore, wind over a meadow, the hum of a cave), cross-faded when the place
 * changes.
 *
 *   const ambience = new Ambience(audio);
 *   ambience.register({ shore: (ctx, out) => { ...; return () => stop(); } });
 *   ambience.play('shore');   // fades in; ambience.play(null) fades out
 *
 * A bed is a function that builds Web Audio nodes into `out` (a gain the
 * Ambience fades) and returns a function that stops them. Beds go through
 * the effects volume. If Web Audio is missing, nothing happens.
 */

/** @typedef {(ctx: AudioContext, out: AudioNode) => () => void} Bed */

export class Ambience {
  /**
   * @param {import('./AudioManager.js').AudioManager} audio
   * @param {{ fade?: number, volume?: number }} [options]
   */
  constructor(audio, { fade = 2, volume = 0.5 } = {}) {
    this.audio = audio;
    this.fade = fade;
    this.volume = volume;
    /** @type {Map<string, Bed>} */
    this.beds = new Map();
    /** @type {{ name: string, gain: GainNode, stop: () => void } | null} */
    this.current = null;
    /** The bed asked for (playing, or waiting for audio to unlock). @type {string | null} */
    this.wanted = null;
  }

  /** @param {Record<string, Bed>} beds */
  register(beds) {
    for (const [name, bed] of Object.entries(beds)) this.beds.set(name, bed);
  }

  /** @param {string | null} name */
  play(name) {
    if (name === this.current?.name) return;
    this.wanted = name;
    const ctx = this.audio.context;
    if (!ctx || !this.audio.sfxGain) return;
    const t = ctx.currentTime;
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + this.fade);
      setTimeout(() => old.stop(), (this.fade + 0.2) * 1000);
      this.current = null;
    }
    const bed = name ? this.beds.get(name) : null;
    if (!bed || !name) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.volume, t + this.fade);
    gain.connect(this.audio.sfxGain);
    const stop = bed(ctx, gain);
    this.current = { name, gain, stop: () => {
      stop();
      gain.disconnect();
    } };
  }
}

/**
 * A few seconds of white noise to loop (beds filter it into wind and waves).
 * @param {BaseAudioContext} ctx
 * @param {number} [seconds=3]
 */
export function noiseBuffer(ctx, seconds = 3) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buffer;
}
