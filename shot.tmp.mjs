// Usage: node shot.mjs <out.png> <js to run after load (async, g = game)> [w] [h]
import { chromium } from '@playwright/test';
const [out, script, w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199/');
try {
  await page.waitForFunction(() => window.game?.mode && window.game.mode !== 'loading', null, { timeout: 150000 });
} catch (e) {
  console.log('TIMEOUT', await page.evaluate(() => document.querySelector('.loading-label')?.textContent));
  console.log(errors.join(' | '));
  await page.screenshot({ path: out });
  await browser.close();
  process.exit(1);
}
const result = await page.evaluate(new Function('return (async () => { const g = window.game; ' + (script || '') + ' })()'));
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log('result', JSON.stringify(result));
console.log(errors.slice(0, 10).join(' | '));
await browser.close();
