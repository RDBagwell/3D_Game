// Island RPG's tests for its SaveSystem (RDBagwell/rpg, tests/save.test.js), ported unchanged with the engine module.
import { describe, it, expect } from 'vitest';
import { SaveSystem, MemoryStorage } from '../src/engine/save/SaveSystem.js';
import { validateShape } from '../src/engine/save/validateShape.js';

const schema = { map: 'string', x: 'number', y: 'number', gold: 'integer' };

function makeSaves(storage = new MemoryStorage(), version = 2) {
  return new SaveSystem({
    key: 'test',
    version,
    storage,
    migrations: {
      1: (data) => ({ ...data, gold: 0 }), // v1 had no gold
    },
    validate: (data) => validateShape(data, schema),
  });
}

describe('SaveSystem', () => {
  it('round-trips data', () => {
    const saves = makeSaves();
    expect(saves.save('slot1', { map: 'start', x: 10, y: 20, gold: 5 })).toEqual({ ok: true });
    const result = saves.load('slot1');
    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ map: 'start', x: 10, y: 20, gold: 5 });
    expect(result.migratedFrom).toBeUndefined();
    expect(saves.has('slot1')).toBe(true);
  });

  it('reports an empty slot', () => {
    expect(makeSaves().load('nothing')).toEqual({ status: 'empty', data: null });
  });

  it('migrates old saves forward', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:slot1', JSON.stringify({ format: 'save', version: 1, data: { map: 'start', x: 1, y: 2 } }));
    const result = makeSaves(storage).load('slot1');
    expect(result.status).toBe('ok');
    expect(result.migratedFrom).toBe(1);
    expect(result.data).toEqual({ map: 'start', x: 1, y: 2, gold: 0 });
  });

  it('treats a missing migration as corrupt instead of crashing', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:slot1', JSON.stringify({ format: 'save', version: 1, data: { map: 'a', x: 1, y: 2 } }));
    const saves = new SaveSystem({ key: 'test', version: 3, storage, migrations: { 1: (d) => d } });
    const result = saves.load('slot1');
    expect(result.status).toBe('corrupt');
    expect(result.warning).toMatch(/no migration from save version 2/);
  });

  it('falls back with a warning on a corrupted save, keeping a backup', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:slot1', '{"format":"save","version":2,"data":{"map":"st');
    const result = makeSaves(storage).load('slot1');
    expect(result.status).toBe('corrupt');
    expect(result.data).toBeNull();
    expect(result.warning).toMatch(/not valid JSON.*new game/);
    expect(storage.getItem('test:slot1:corrupt')).toContain('"map":"st');
  });

  it('rejects saves that parse but have the wrong shape', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:slot1', JSON.stringify({ format: 'save', version: 2, data: { map: 'start', x: 'ten', y: null, gold: 1.5 } }));
    const result = makeSaves(storage).load('slot1');
    expect(result.status).toBe('corrupt');
    expect(result.warning).toContain('data.x should be number');
    expect(result.warning).toContain('data.y is missing');
    expect(result.warning).toContain('data.gold should be integer');
  });

  it('rejects unrelated JSON and bad versions', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:a', JSON.stringify([1, 2, 3]));
    storage.setItem('test:b', JSON.stringify({ format: 'save', version: 'two', data: {} }));
    const saves = makeSaves(storage);
    expect(saves.load('a').status).toBe('corrupt');
    expect(saves.load('b').status).toBe('corrupt');
  });

  it('refuses saves from a newer game version', () => {
    const storage = new MemoryStorage();
    storage.setItem('test:slot1', JSON.stringify({ format: 'save', version: 9, data: {} }));
    expect(makeSaves(storage).load('slot1').status).toBe('too-new');
  });

  it('survives storage that throws on every access', () => {
    const broken = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    const saves = makeSaves(/** @type {any} */ (broken));
    expect(saves.save('slot1', { map: 'a', x: 1, y: 1, gold: 0 }).ok).toBe(false);
    expect(saves.load('slot1').status).toBe('unavailable');
    expect(saves.has('slot1')).toBe(false);
    expect(() => saves.delete('slot1')).not.toThrow();
  });

  it('falls back to memory when localStorage is missing', () => {
    // In the node test environment there is no localStorage at all.
    const saves = new SaveSystem({ key: 'test', version: 1 });
    expect(saves.persistent).toBe(false);
    saves.save('slot1', { hello: 'world' });
    expect(saves.load('slot1').data).toEqual({ hello: 'world' });
  });

  it('refuses to save invalid data', () => {
    const result = makeSaves().save('slot1', { map: 'start' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('data.x is missing');
  });
});

describe('validateShape', () => {
  it('checks nested objects, arrays and optional fields', () => {
    const shape = { name: 'string', nickname: 'string?', party: [{ level: 'integer' }], flags: 'object' };
    expect(validateShape({ name: 'Rob', party: [{ level: 1 }], flags: {} }, shape)).toEqual([]);
    expect(validateShape({ name: 'Rob', party: [{ level: 'x' }], flags: [] }, shape)).toEqual([
      'data.party[0].level should be integer, got string "x"',
      'data.flags should be object, got an array',
    ]);
    expect(validateShape({ x: NaN }, { x: 'number' })).toEqual(['data.x should be number, got NaN']);
  });
});
