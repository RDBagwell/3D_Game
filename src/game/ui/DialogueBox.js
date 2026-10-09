import { button } from '../../engine/index.js';

/**
 * The dialogue box: shows a DialogueRunner's pages and takes the player's
 * answers. It knows nothing about the story; the runner does
 * (src/game/dialogue/DialogueRunner.js).
 *
 *   - text types out at the chosen speed (Settings: slow, normal, fast,
 *     instant); pressing Continue while it types shows the whole line;
 *   - Continue: Interact or Attack (E, J, click, A / ✕, a tap anywhere on the box);
 *   - choices: up / down (W / S, arrows, d-pad, stick) and Continue, a click or
 *     tap on the choice, or its number key; a choice that isn't available yet
 *     is shown greyed out with "(not yet)" and can't be picked;
 *   - notices from effects ("Received Hearth Key.") are shown as their own
 *     pages, styled differently, with no speaker.
 *
 * It reads the same InputFrame as the game each update (update()), so the
 * keyboard, gamepads and touch all work the same way.
 */

/** Characters per second for each text speed. */
export const TEXT_SPEEDS = { slow: 28, normal: 55, fast: 110, instant: Infinity };

export class DialogueBox {
  /**
   * @param {HTMLElement} container
   * @param {{ sound: (name: string) => void }} options
   */
  constructor(container, { sound }) {
    this.sound = sound;
    this.root = document.createElement('section');
    this.root.className = 'dialogue';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `
      <div class="dialogue-speaker"></div>
      <p class="dialogue-text"></p>
      <ol class="dialogue-choices"></ol>
      <div class="dialogue-next" aria-hidden="true">▼</div>`;
    container.append(this.root);
    this.speakerEl = /** @type {HTMLElement} */ (this.root.querySelector('.dialogue-speaker'));
    this.textEl = /** @type {HTMLElement} */ (this.root.querySelector('.dialogue-text'));
    this.choicesEl = /** @type {HTMLElement} */ (this.root.querySelector('.dialogue-choices'));
    this.nextEl = /** @type {HTMLElement} */ (this.root.querySelector('.dialogue-next'));
    /** @type {import('../dialogue/DialogueRunner.js').DialogueRunner | null} */
    this.runner = null;
    /** @type {import('../dialogue/DialogueRunner.js').DialoguePage | null} */
    this.page = null;
    this.shown = 0;
    this.speed = TEXT_SPEEDS.normal;
    this.selected = 0;
    this.stickHeld = false;
    /** Called when the conversation ends. @type {() => void} */
    this.onClose = () => {};
    // Clicks and taps: on a choice picks it; anywhere else on the box continues.
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const li = /** @type {HTMLElement} */ (e.target).closest('li');
      if (li && this.page?.choices && this.typed) {
        const i = Number(li.dataset.i);
        this.select(i);
        this.confirm();
      } else {
        this.confirm();
      }
    });
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (this.root.hidden) return;
      if (e.code === 'Enter') {
        e.preventDefault();
        this.confirm();
      } else if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && this.page?.choices && this.typed) {
        e.preventDefault();
        this.step(e.code === 'ArrowUp' ? -1 : 1);
      } else if (/^Digit[1-9]$/.test(e.code) && this.page?.choices && this.typed) {
        const i = Number(e.code.slice(5)) - 1;
        if (i < this.page.choices.length) {
          this.select(i);
          this.confirm();
        }
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** The whole line is showing. */
  get typed() {
    return !this.page || this.shown >= this.page.text.length;
  }

  /**
   * @param {import('../dialogue/DialogueRunner.js').DialogueRunner} runner
   * @param {keyof typeof TEXT_SPEEDS} speed
   */
  open(runner, speed) {
    this.runner = runner;
    this.speed = TEXT_SPEEDS[speed] ?? TEXT_SPEEDS.normal;
    this.root.hidden = false;
    this.stickHeld = true; // ignore the stick until it's let go
    this.show(runner.current);
  }

  close() {
    this.root.hidden = true;
    this.runner = null;
    this.page = null;
    this.onClose();
  }

  /**
   * @private
   * @param {import('../dialogue/DialogueRunner.js').DialoguePage | null} page
   */
  show(page) {
    if (!page) return void this.close();
    this.page = page;
    this.shown = this.speed === Infinity ? page.text.length : 0;
    this.root.classList.toggle('notice', page.notice);
    this.speakerEl.textContent = page.speaker ?? '';
    this.speakerEl.hidden = !page.speaker;
    this.selected = page.choices ? Math.max(0, page.choices.findIndex((c) => c.enabled)) : 0;
    this.render();
  }

  /** @private */
  render() {
    const page = this.page;
    if (!page) return;
    this.textEl.textContent = page.text.slice(0, Math.floor(this.shown));
    const typed = this.typed;
    this.nextEl.hidden = !typed || Boolean(page.choices);
    this.choicesEl.hidden = !typed || !page.choices;
    if (typed && page.choices) {
      this.choicesEl.replaceChildren(
        ...page.choices.map((c, i) => {
          const li = document.createElement('li');
          li.dataset.i = String(i);
          li.textContent = c.enabled ? c.text : `${c.text} (not yet)`;
          li.className = `${c.enabled ? '' : 'unavailable'} ${i === this.selected ? 'selected' : ''}`;
          li.setAttribute('aria-disabled', String(!c.enabled));
          return li;
        }),
      );
    }
  }

  /** @param {number} i */
  select(i) {
    const choices = this.page?.choices;
    if (!choices || !choices[i]?.enabled) return;
    if (i !== this.selected) this.sound('ui_move');
    this.selected = i;
    this.render();
  }

  /** Continue: finish the line, or move on, or pick the selected choice. */
  confirm() {
    const runner = this.runner;
    const page = this.page;
    if (!runner || !page) return;
    if (!this.typed) {
      this.shown = page.text.length;
      this.render();
      return;
    }
    if (page.choices) {
      const choice = page.choices[this.selected];
      if (!choice?.enabled) return;
      this.sound('ui_confirm');
      runner.choose(choice.index);
    } else {
      this.sound('ui_move');
      runner.advance();
    }
    this.show(runner.current);
  }

  /**
   * Once per update while open.
   * @param {number} dt
   * @param {import('../../engine/input/Input.js').InputFrame} frame
   */
  update(dt, frame) {
    if (!this.isOpen || !this.page) return;
    if (!this.typed) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.page.text.length, this.shown + this.speed * dt);
      if (Math.floor(this.shown) !== before) this.render();
    }
    if (button(frame, 'interact').pressed || button(frame, 'attack').pressed) {
      this.confirm();
      return;
    }
    const choices = this.page.choices;
    if (!choices || !this.typed) return;
    const y = frame.move.y;
    if (Math.abs(y) < 0.4) {
      this.stickHeld = false;
      return;
    }
    if (this.stickHeld) return;
    this.stickHeld = true;
    this.step(y > 0 ? -1 : 1); // stick up = the choice above
  }

  /**
   * Move the selection to the next available choice up (-1) or down (1).
   * @param {number} dir
   */
  step(dir) {
    const choices = this.page?.choices;
    if (!choices) return;
    for (let k = 1; k <= choices.length; k++) {
      const i = (this.selected + dir * k + choices.length * 2) % choices.length;
      if (choices[i].enabled) {
        this.select(i);
        break;
      }
    }
  }
}
