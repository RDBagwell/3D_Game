import { describe, it, expect } from 'vitest';
import { AudioManager } from '../src/engine/index.js';

/** Just enough of an AudioContext for AudioManager, already unlocked. */
function fakeContext() {
  const node = () => {
    const n = {
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} },
      threshold: { value: 0 },
      ratio: { value: 0 },
      connect: (/** @type {any} */ to) => to,
      disconnect() {},
    };
    return n;
  };
  return /** @type {any} */ ({
    state: 'running',
    currentTime: 0,
    destination: node(),
    createGain: node,
    createDynamicsCompressor: node,
    createPanner: node,
    resume: () => Promise.resolve(),
  });
}

describe('AudioManager', () => {
  it('plays with no options, null options or a null position (drinking a tonic, lock-on)', () => {
    const audio = new AudioManager({ createContext: fakeContext });
    const played = [];
    audio.register({ drink: { recipe: () => played.push('drink') } });
    expect(() => audio.play('drink')).not.toThrow();
    expect(() => audio.play('drink', null)).not.toThrow();
    expect(() => audio.play('drink', { position: null, volume: 1 })).not.toThrow();
    expect(played).toHaveLength(3);
  });
});
