/**
 * localStorage that never throws. Private browsing, a full quota or a blocked
 * site all make `localStorage` throw; settings then live in memory for the
 * session instead of breaking the game.
 */

/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} SimpleStorage */

/** @returns {SimpleStorage | null} */
export function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    storage.setItem('__probe__', '1');
    storage.removeItem('__probe__');
    return storage;
  } catch {
    return null;
  }
}

/**
 * @param {SimpleStorage | null} storage
 * @param {string} key
 * @returns {any} parsed JSON, or null
 */
export function readJson(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * @param {SimpleStorage | null} storage
 * @param {string} key
 * @param {any} value
 */
export function writeJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
