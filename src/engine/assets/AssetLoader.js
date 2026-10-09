import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Loads the game's models with real progress.
 *
 * Every model is listed with its size in bytes (the game's manifest), so the
 * progress bar is "bytes downloaded / bytes needed" from the first frame,
 * not a guess, and it doesn't jump back when a new file starts. Files load in
 * parallel. Models are meshopt-compressed glTF (`npm run assets`), decoded by
 * three's MeshoptDecoder.
 *
 * A model that fails to load resolves to `null` with a warning instead of
 * rejecting: the game draws a placeholder for it, so it always starts.
 *
 *   const loader = new AssetLoader({ baseUrl: import.meta.env.BASE_URL });
 *   const models = await loader.loadAll(MODELS, (p) => bar.style.width = `${p * 100}%`);
 */

/** @typedef {{ url: string, bytes: number }} ModelEntry */

export class AssetLoader {
  /** @param {{ baseUrl?: string }} [options] */
  constructor({ baseUrl = './' } = {}) {
    this.baseUrl = baseUrl;
    this.gltf = new GLTFLoader();
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  /**
   * @template {string} K
   * @param {Record<K, ModelEntry>} manifest
   * @param {(progress: number) => void} [onProgress]  0..1
   * @returns {Promise<Record<K, import('three/examples/jsm/loaders/GLTFLoader.js').GLTF | null>>}
   */
  async loadAll(manifest, onProgress = () => {}) {
    const entries = /** @type {[K, ModelEntry][]} */ (Object.entries(manifest));
    const total = entries.reduce((sum, [, e]) => sum + e.bytes, 0) || 1;
    /** @type {Map<K, number>} */
    const loaded = new Map();
    const report = () => {
      let sum = 0;
      for (const v of loaded.values()) sum += v;
      onProgress(Math.min(1, sum / total));
    };
    report();
    const results = await Promise.all(
      entries.map(async ([key, entry]) => {
        try {
          const gltf = await this.gltf.loadAsync(this.baseUrl + entry.url, (event) => {
            // Never count more than the manifest says (a gzipped response can report odd totals).
            loaded.set(key, Math.min(entry.bytes, event.loaded));
            report();
          });
          loaded.set(key, entry.bytes);
          report();
          return /** @type {const} */ ([key, gltf]);
        } catch (error) {
          console.warn(`Could not load ${entry.url}; using a placeholder.`, error);
          loaded.set(key, entry.bytes);
          report();
          return /** @type {const} */ ([key, null]);
        }
      }),
    );
    return /** @type {any} */ (Object.fromEntries(results));
  }
}
