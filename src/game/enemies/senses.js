import { angleDelta, DEG } from '../../engine/index.js';

/**
 * Noticing and forgetting the player, shared by the grunt and caster brains.
 *
 * An enemy notices you by sight (within `sightRange`, inside its field of
 * view, and nothing solid in between: `see.visible`) or by hearing (within
 * `hearRange`, any direction, walls or not). Seen from afar it hesitates
 * first (`brain.hesitate`, the brain's "suspicious" state); heard close by,
 * it comes at once. Noticing you, it calls its allies (`ctx.alert`).
 *
 * It forgets you beyond `loseRange`, when you die, or after
 * `loseSightFrames` without seeing you, and then walks home.
 *
 * @param {{ id: string, def: any, aware: boolean, hesitate: boolean, unseen: number }} brain
 * @param {import('./GruntBrain.js').BrainContext} ctx
 */
export function perceive(brain, ctx) {
  const see = ctx.see;
  const def = brain.def;
  const visible = see.visible !== false;
  brain.unseen = visible ? 0 : brain.unseen + 1;
  if (!brain.aware) {
    if (!see.playerAlive) return;
    const inView = Math.abs(angleDelta(ctx.facing, see.bearing)) <= (def.sightFov / 2) * DEG;
    const heard = see.distance <= def.hearRange;
    const seen = visible && inView && see.distance <= def.sightRange;
    if (!heard && !seen) return;
    brain.aware = true;
    brain.hesitate = !heard;
    ctx.emit('noticed', { id: brain.id, how: heard ? 'heard' : 'seen' });
    ctx.alert?.();
  } else if (see.distance > def.loseRange || !see.playerAlive || brain.unseen > (def.loseSightFrames ?? Infinity)) {
    brain.aware = false;
    brain.hesitate = false;
  }
}
