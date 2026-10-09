/**
 * Every dialogue in this folder, by id (the file name without .json).
 * Just add a .json file here; nothing else to register. (The same loader as
 * Island RPG's data/dialogues/index.js.)
 */

/** @type {Record<string, { default: import('../../dialogue/DialogueRunner.js').Dialogue }>} */
const modules = import.meta.glob('./*.json', { eager: true });

/** @type {Record<string, import('../../dialogue/DialogueRunner.js').Dialogue>} */
export const DIALOGUES = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.replace(/^\.\/(.*)\.json$/, '$1'), mod.default]),
);
