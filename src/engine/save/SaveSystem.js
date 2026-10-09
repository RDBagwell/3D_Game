/**
 * Versioned save games in localStorage. Ported unchanged from Island RPG
 * (RDBagwell/rpg, src/engine/save/SaveSystem.js).
 *
 * Each save is stored as JSON: { format: 'save', version, savedAt, data }.
 * `data` is whatever the game passes in. When the game's save format
 * changes, bump `version` and add a migration that upgrades old saves:
 *
 *   const saves = new SaveSystem({
 *     key: 'my-game',
 *     version: 2,
 *     migrations: {
 *       1: (data) => ({ ...data, gold: 0 }),   // v1 -> v2: gold was added
 *     },
 *     validate: (data) => validateShape(data, { map: 'string', x: 'number', y: 'number', gold: 'integer' }),
 *   });
 *
 * load() never throws. It returns a status the game can act on:
 *   'ok'           data is valid (maybe migrated; see `migratedFrom`)
 *   'empty'        no save in this slot
 *   'corrupt'      the save could not be read or failed validation; the raw
 *                  text is copied to "<key>:<slot>:corrupt" so it isn't lost
 *   'too-new'      saved by a newer version of the game
 *   'unavailable'  storage is blocked (private mode, disabled cookies...)
 * For anything but 'ok', start a new game and show `warning` to the player.
 *
 * If localStorage is blocked, saves are kept in memory for the session so the
 * game still works (they just don't survive a reload); `persistent` is false.
 */

/**
 * @typedef {object} LoadResult
 * @property {'ok' | 'empty' | 'corrupt' | 'too-new' | 'unavailable'} status
 * @property {any} data  The save data when status is 'ok', otherwise null.
 * @property {string} [warning]  Human-readable explanation when not 'ok'.
 * @property {number} [migratedFrom]  Original version if migrations ran.
 * @property {string} [savedAt]  ISO timestamp.
 */

/**
 * @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} StorageLike
 */

export class SaveSystem {
  /**
   * @param {object} options
   * @param {string} options.key  Prefix for storage keys (use the game's name).
   * @param {number} options.version  Current save format version (integer >= 1).
   * @param {Record<number, (data: any) => any>} [options.migrations]  from-version -> upgrade function
   * @param {(data: any) => string[] | true} [options.validate]  Returns true or a list of problems.
   * @param {StorageLike | null} [options.storage]  Default: localStorage, or memory if blocked.
   */
  constructor({ key, version, migrations = {}, validate = () => true, storage }) {
    if (!Number.isInteger(version) || version < 1) throw new Error('SaveSystem version must be an integer >= 1');
    this.key = key;
    this.version = version;
    this.migrations = migrations;
    this.validate = validate;
    const resolved = storage === undefined ? browserStorage() : storage;
    this.persistent = resolved !== null;
    /** @type {StorageLike} */
    this.storage = resolved ?? new MemoryStorage();
  }

  /**
   * @param {string} slot
   * @param {any} data  Must be JSON-serialisable.
   * @returns {{ ok: boolean, error?: string }}
   */
  save(slot, data) {
    const problems = this.check(data);
    if (problems.length > 0) return { ok: false, error: `Refusing to save invalid data: ${problems.join('; ')}` };
    const envelope = { format: 'save', version: this.version, savedAt: new Date().toISOString(), data };
    try {
      this.storage.setItem(this.slotKey(slot), JSON.stringify(envelope));
      return { ok: true };
    } catch (error) {
      // Quota exceeded, storage disabled mid-session, or data not serialisable.
      return { ok: false, error: `Could not save: ${error?.message ?? error}` };
    }
  }

  /**
   * @param {string} slot
   * @returns {LoadResult}
   */
  load(slot) {
    let raw;
    try {
      raw = this.storage.getItem(this.slotKey(slot));
    } catch (error) {
      return { status: 'unavailable', data: null, warning: `Save storage is unavailable (${error?.message ?? error}).` };
    }
    if (raw === null || raw === undefined) return { status: 'empty', data: null };

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return this.corrupt(slot, raw, 'the save file is not valid JSON');
    }
    if (!envelope || typeof envelope !== 'object' || envelope.format !== 'save' || !('data' in envelope)) {
      return this.corrupt(slot, raw, 'the save file is not in the expected format');
    }
    const savedVersion = envelope.version;
    if (!Number.isInteger(savedVersion) || savedVersion < 1) {
      return this.corrupt(slot, raw, `the save has an invalid version (${JSON.stringify(savedVersion)})`);
    }
    if (savedVersion > this.version) {
      return {
        status: 'too-new',
        data: null,
        warning: `This save was made by a newer version of the game (save v${savedVersion}, game v${this.version}).`,
      };
    }

    let data = envelope.data;
    for (let v = savedVersion; v < this.version; v++) {
      const migrate = this.migrations[v];
      if (!migrate) return this.corrupt(slot, raw, `there is no migration from save version ${v} to ${v + 1}`);
      try {
        data = migrate(structuredClone(data));
      } catch (error) {
        return this.corrupt(slot, raw, `upgrading from version ${v} failed (${error?.message ?? error})`);
      }
    }

    const problems = this.check(data);
    if (problems.length > 0) return this.corrupt(slot, raw, `the save data is invalid: ${problems.join('; ')}`);

    /** @type {LoadResult} */
    const result = { status: 'ok', data, savedAt: typeof envelope.savedAt === 'string' ? envelope.savedAt : undefined };
    if (savedVersion !== this.version) result.migratedFrom = savedVersion;
    return result;
  }

  /** @param {string} slot */
  has(slot) {
    try {
      return this.storage.getItem(this.slotKey(slot)) !== null;
    } catch {
      return false;
    }
  }

  /** @param {string} slot */
  delete(slot) {
    try {
      this.storage.removeItem(this.slotKey(slot));
    } catch {
      // Nothing to do: storage is unavailable.
    }
  }

  /**
   * Move a save to another slot, as stored (no migration or validation).
   * Does nothing if `from` is empty or `to` is already taken. Handy for
   * renaming slots between game versions.
   * @param {string} from
   * @param {string} to
   * @returns {boolean} whether anything moved
   */
  move(from, to) {
    try {
      const raw = this.storage.getItem(this.slotKey(from));
      if (raw === null || raw === undefined || this.storage.getItem(this.slotKey(to)) !== null) return false;
      this.storage.setItem(this.slotKey(to), raw);
      this.storage.removeItem(this.slotKey(from));
      return true;
    } catch {
      return false;
    }
  }

  /** @param {string} slot */
  slotKey(slot) {
    return `${this.key}:${slot}`;
  }

  /**
   * @private
   * @param {any} data
   * @returns {string[]}
   */
  check(data) {
    try {
      const result = this.validate(data);
      return result === true || result === undefined ? [] : result;
    } catch (error) {
      return [`validator crashed: ${error?.message ?? error}`];
    }
  }

  /**
   * @private
   * @param {string} slot
   * @param {string} raw
   * @param {string} reason
   * @returns {LoadResult}
   */
  corrupt(slot, raw, reason) {
    try {
      this.storage.setItem(`${this.slotKey(slot)}:corrupt`, raw);
    } catch {
      // Best effort only.
    }
    return { status: 'corrupt', data: null, warning: `The save could not be loaded: ${reason}. Starting a new game.` };
  }
}

/** A Storage stand-in that keeps everything in memory. */
export class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.items = new Map();
  }

  /** @param {string} key */
  getItem(key) {
    return this.items.has(key) ? /** @type {string} */ (this.items.get(key)) : null;
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  setItem(key, value) {
    this.items.set(key, String(value));
  }

  /** @param {string} key */
  removeItem(key) {
    this.items.delete(key);
  }
}

/**
 * localStorage if it works, otherwise null. Merely *reading*
 * window.localStorage throws in some privacy modes, so everything is guarded.
 * @returns {StorageLike | null}
 */
export function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = '__storage_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
