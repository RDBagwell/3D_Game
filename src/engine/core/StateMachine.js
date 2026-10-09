/**
 * An explicit finite state machine.
 *
 * Each state is an object with optional `enter(prev)`, `update(dt)` and
 * `exit(next)` hooks, and the machine is given the full table of allowed
 * transitions up front:
 *
 *   const fsm = new StateMachine({
 *     states: { idle: {...}, run: {...}, roll: {...} },
 *     transitions: { idle: ['run', 'roll'], run: ['idle', 'roll'], roll: ['idle'] },
 *     initial: 'idle',
 *   });
 *   fsm.go('run');   // true
 *   fsm.go('jump');  // false: not allowed from 'run'; nothing changes
 *
 * Why list the transitions? A character controller grows by adding "if
 * rolling and not attacking and..." checks until nobody knows what can follow
 * what. A table answers "can I attack out of a roll?" in one place, the game-
 * feel lab can draw it, and tests can check it. `go()` refuses anything not in
 * the table and counts the refusal, which makes bugs visible in the overlay.
 *
 * `frames` counts updates since the current state was entered: that's what
 * frame data (startup, active, recovery) is measured against.
 */

/**
 * @template {string} S
 * @typedef {object} StateDef
 * @property {(prev: S | null) => void} [enter]
 * @property {(dt: number) => void} [update]
 * @property {(next: S) => void} [exit]
 */

/** @template {string} S */
export class StateMachine {
  /**
   * @param {object} options
   * @param {Record<S, StateDef<S>>} options.states
   * @param {Record<S, S[]>} options.transitions
   * @param {S} options.initial
   * @param {number} [options.historySize=12]
   */
  constructor({ states, transitions, initial, historySize = 12 }) {
    this.states = states;
    this.transitions = transitions;
    /** @type {S} */
    this.current = initial;
    /** @type {S | null} */
    this.previous = null;
    /** Updates since the current state was entered (0 during the first update). */
    this.frames = 0;
    /** Recent changes, newest last, for the debug view. @type {{ from: S | null, to: S, tick: number }[]} */
    this.history = [{ from: null, to: initial, tick: 0 }];
    this.historySize = historySize;
    /** Transitions asked for but not allowed. */
    this.refused = 0;
    /** Ticks since the machine was created (for the history). */
    this.tick = 0;
    this.states[initial].enter?.(null);
  }

  /**
   * @param {S} to
   * @returns {boolean}
   */
  can(to) {
    return this.transitions[this.current]?.includes(to) ?? false;
  }

  /**
   * Change state if the table allows it. Going to the current state again is
   * allowed only if the table lists it (a combo's attack → attack).
   * @param {S} to
   * @returns {boolean} whether the state changed
   */
  go(to) {
    if (!this.can(to)) {
      this.refused++;
      return false;
    }
    this.force(to);
    return true;
  }

  /**
   * Change state without checking the table. Only for resets (respawning).
   * @param {S} to
   */
  force(to) {
    const from = this.current;
    this.states[from].exit?.(to);
    this.previous = from;
    this.current = to;
    this.frames = 0;
    this.history.push({ from, to, tick: this.tick });
    if (this.history.length > this.historySize) this.history.shift();
    this.states[to].enter?.(from);
  }

  /** @param {number} dt */
  update(dt) {
    this.tick++;
    const state = this.current;
    this.states[state].update?.(dt);
    // Only count frames if update() didn't switch state (a new state starts at 0).
    if (this.current === state) this.frames++;
  }

  /** @param {S} state */
  is(state) {
    return this.current === state;
  }
}
