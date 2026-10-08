import { describe, it, expect } from 'vitest';
import { FEEL_SETTINGS, FEEL_PRESETS, SHOW_SETTINGS } from '../src/game/data/feel.js';
import {
  defaultFeel, sanitizeFeel, presetValues, matchingPreset, encodeFeel, decodeFeel, labQuery, readLabQuery, defaultShow,
} from '../src/game/feel/feelSettings.js';

describe('game-feel lab settings', () => {
  it('every setting has a label, a "what this does" sentence and a valid default', () => {
    const ids = new Set();
    for (const d of FEEL_SETTINGS) {
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
      expect(d.label.length).toBeGreaterThan(2);
      expect(d.what.length, d.id).toBeGreaterThan(30);
      expect(d.what.trim().endsWith('.'), d.id).toBe(true);
      if (d.type === 'range') {
        expect(d.default).toBeGreaterThanOrEqual(/** @type {number} */ (d.min));
        expect(d.default).toBeLessThanOrEqual(/** @type {number} */ (d.max));
      } else {
        expect(typeof d.default).toBe('boolean');
      }
    }
    for (const s of SHOW_SETTINGS) expect(s.what.length).toBeGreaterThan(20);
  });

  it('presets only use known settings, and survive validation unchanged', () => {
    for (const [name, preset] of Object.entries(FEEL_PRESETS)) {
      for (const id of Object.keys(preset.values)) expect(FEEL_SETTINGS.map((d) => d.id), `${name}.${id}`).toContain(id);
      const values = presetValues(/** @type {any} */ (name));
      expect(sanitizeFeel(values)).toEqual(values);
      expect(matchingPreset(values)).toBe(name);
    }
  });

  it('"Raw" really switches every technique off', () => {
    const raw = presetValues('raw');
    for (const d of FEEL_SETTINGS) {
      const v = raw[d.id];
      if (d.type === 'bool') expect(v, d.id).toBe(false);
      else if (d.id === 'turnSpeed') expect(v).toBe(d.max); // instant turning = no turn smoothing
      else expect(v, d.id).toBe(0);
    }
  });

  it('validation clamps, snaps to the step and defaults garbage', () => {
    const v = sanitizeFeel({ hitstopScale: 99, accelTime: 0.111, cancelWindows: 'yes', turnSpeed: 'fast', comboBuffer: -3, nonsense: 1 });
    expect(v.hitstopScale).toBe(3);
    expect(v.accelTime).toBe(0.12);
    expect(v.cancelWindows).toBe(true); // default kept
    expect(v.turnSpeed).toBe(defaultFeel().turnSpeed);
    expect(v.comboBuffer).toBe(0);
    expect(v).not.toHaveProperty('nonsense');
    expect(sanitizeFeel(null)).toEqual(defaultFeel());
  });

  it('round-trips through a share URL', () => {
    const custom = sanitizeFeel({ ...defaultFeel(), hitstopScale: 0, cancelWindows: false, turnSpeed: 420 });
    expect(encodeFeel(defaultFeel())).toBe('');
    expect(decodeFeel(encodeFeel(custom))).toEqual(custom);
    const show = { ...defaultShow(), boxes: true, states: true, speed: 0.25 };
    const parsed = readLabQuery(labQuery(custom, show));
    expect(parsed.open).toBe(true);
    expect(parsed.feel).toEqual(custom);
    expect(parsed.show).toEqual(show);
  });

  it('a preset is shared by name', () => {
    const q = labQuery(presetValues('floaty'), defaultShow());
    expect(q).toBe('?lab&preset=floaty');
    expect(readLabQuery(q).feel).toEqual(presetValues('floaty'));
  });

  it('a bad link can\'t break anything', () => {
    const r = readLabQuery('?lab&feel=hitstopScale:abc,unknown:5,,:,rollIframes:999&preset=nope&speed=7');
    expect(r.feel?.hitstopScale).toBe(defaultFeel().hitstopScale);
    expect(r.feel?.rollIframes).toBe(26);
    expect(r.show?.speed).toBe(1);
    expect(readLabQuery('').open).toBe(false);
  });
});
