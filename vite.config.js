// Vite configuration.
//
// The base path comes from site.config.js. It is relative ('./') so the
// same build works at https://rdbagwell.github.io/3D_Game/, on any other
// static host, and after the repository is renamed.

import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { site } from './site.config.js';

/**
 * `import tracks from 'virtual:music-tracks'` lists the .ogg files in
 * public/music/ (names without the extension). The game only ever requests
 * listed tracks, so dropping a file in is all it takes to add music, and a
 * missing file is silence, never a failed request (docs/AUDIO.md).
 */
function musicTracks() {
  const id = 'virtual:music-tracks';
  const resolved = `\0${id}`;
  const dir = path.resolve('public/music');
  const list = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.ogg')).map((f) => f.slice(0, -4)).sort() : []);
  return {
    name: 'music-tracks',
    resolveId(/** @type {string} */ source) {
      return source === id ? resolved : null;
    },
    load(/** @type {string} */ source) {
      return source === resolved ? `export default ${JSON.stringify(list())};` : null;
    },
    configureServer(/** @type {any} */ server) {
      // In `npm run dev`, adding or removing a track reloads the list.
      server.watcher.add(dir);
      const refresh = (/** @type {string} */ file) => {
        if (!file.startsWith(dir)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

export default defineConfig({
  base: site.base,
  plugins: [musicTracks()],
  build: {
    target: 'es2022',
    // Three.js is one big module; that's expected, not a problem to warn about.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
  },
});
