/**
 * Building blocks for synthesised sound effects (Web Audio).
 *
 * The game has no recorded sound files: every effect is a short "recipe" that
 * builds a few oscillators and filtered noise when it plays (see
 * src/game/data/sounds.js). That keeps the download tiny and every sound
 * the project's own. A recipe gets the context, the node to connect to, the
 * start time and a random source for variation:
 *
 *   swing: (ctx, out, t, rng) => {
 *     noise(ctx, out, t, { duration: 0.18, filter: 'bandpass', from: 900, to: 3200, volume: 0.5 });
 *   }
 */

/** @type {WeakMap<BaseAudioContext, AudioBuffer>} */
const noiseBuffers = new WeakMap();

/** One second of white noise per context, reused by every noise() call. */
function noiseBuffer(/** @type {BaseAudioContext} */ ctx) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/**
 * An attack/decay envelope on a new gain node.
 * @param {BaseAudioContext} ctx
 * @param {number} t  start time
 * @param {number} attack  seconds
 * @param {number} decay  seconds
 * @param {number} peak  0..1
 */
export function envelope(ctx, t, attack, decay, peak) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.002, attack));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return gain;
}

/**
 * Filtered noise burst, optionally sweeping the filter.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {object} o
 * @param {number} o.duration
 * @param {BiquadFilterType} [o.filter='bandpass']
 * @param {number} o.from  filter frequency at the start (Hz)
 * @param {number} [o.to]  filter frequency at the end
 * @param {number} [o.q=1]
 * @param {number} [o.volume=0.5]
 * @param {number} [o.attack=0.005]
 */
export function noise(ctx, out, t, { duration, filter = 'bandpass', from, to = from, q = 1, volume = 0.5, attack = 0.005 }) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.playbackRate.value = 0.9 + ((t * 1000) % 7) / 35;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(from, t);
  biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
  const env = envelope(ctx, t, attack, duration, volume);
  source.connect(biquad).connect(env).connect(out);
  source.start(t, Math.random() * 0.5);
  source.stop(t + attack + duration + 0.05);
}

/**
 * A tone with a pitch glide.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {number} t
 * @param {object} o
 * @param {OscillatorType} [o.type='sine']
 * @param {number} o.from  Hz
 * @param {number} [o.to]  Hz
 * @param {number} o.duration
 * @param {number} [o.volume=0.4]
 * @param {number} [o.attack=0.004]
 */
export function tone(ctx, out, t, { type = 'sine', from, to = from, duration, volume = 0.4, attack = 0.004 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
  const env = envelope(ctx, t, attack, duration, volume);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + attack + duration + 0.05);
}
