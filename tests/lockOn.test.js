import { describe, it, expect } from 'vitest';
import { selectTarget, switchTarget, shouldBreakLock, LOCK } from '../src/game/combat/lockOn.js';

const t = (id, x, z, alive = true) => ({ id, position: { x, y: 0, z }, alive });
const forward = { x: 0, z: -1 }; // the camera looks along -Z
const right = { x: 1, z: 0 };
const me = { x: 0, z: 0 };

describe('lock-on target selection', () => {
  it('prefers what is in front of the camera over what is merely closer', () => {
    const ahead = t('ahead', 0, -8);
    const edge = t('edge', 3, -1.5); // closer, but far off-centre
    expect(selectTarget([edge, ahead], me, forward)?.id).toBe('ahead');
  });

  it('among targets straight ahead, picks the nearer', () => {
    expect(selectTarget([t('far', 0, -10), t('near', 0, -3)], me, forward)?.id).toBe('near');
  });

  it('ignores the dead, the distant and what is behind', () => {
    expect(selectTarget([t('dead', 0, -3, false)], me, forward)).toBeNull();
    expect(selectTarget([t('far', 0, -(LOCK.maxDistance + 1))], me, forward)).toBeNull();
    expect(selectTarget([t('behind', 0, 4)], me, forward)).toBeNull();
  });

  it('switches to the next target on the side the stick is flicked', () => {
    const left = t('left', -3, -5);
    const mid = t('mid', 0, -5);
    const r1 = t('right1', 2, -5);
    const r2 = t('right2', 5, -5);
    const all = [left, mid, r1, r2];
    expect(switchTarget(mid, all, me, right, 1).id).toBe('right1');
    expect(switchTarget(mid, all, me, right, -1).id).toBe('left');
    expect(switchTarget(r2, all, me, right, 1).id).toBe('right2'); // nothing further right: stay
    expect(switchTarget(mid, [mid, t('deadR', 2, -5, false)], me, right, 1).id).toBe('mid');
  });

  it('breaks the lock when the target dies or gets too far away', () => {
    expect(shouldBreakLock(t('a', 0, -5), me)).toBe(false);
    expect(shouldBreakLock(t('a', 0, -5, false), me)).toBe(true);
    expect(shouldBreakLock(t('a', 0, -(LOCK.breakDistance + 0.5)), me)).toBe(true);
  });
});
