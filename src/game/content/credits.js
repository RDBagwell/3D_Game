/**
 * The credits, read from the "Credits" table in ASSETS.md, so the credits
 * screen always matches the asset record (tests/credits.test.js checks that
 * every pack the game ships is in that table).
 */

/** @typedef {{ work: string, by: string, licence: string, links: { text: string, url: string }[] }} Credit */

/**
 * @param {string} markdown  the text of ASSETS.md
 * @returns {Credit[]}
 */
export function parseCredits(markdown) {
  const start = markdown.indexOf('\n## Credits');
  if (start < 0) return [];
  const end = markdown.indexOf('\n## ', start + 5);
  const section = markdown.slice(start, end < 0 ? undefined : end);
  /** @type {Credit[]} */
  const out = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| ---') || line.startsWith('| Work |')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    const [work, by, licence, link] = cells;
    const links = [...link.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => ({ text: m[1], url: m[2] }));
    out.push({ work: plain(work), by: plain(by), licence: plain(licence), links });
  }
  return out;
}

/** Strip Markdown code marks and links down to text. @param {string} text */
function plain(text) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '');
}
