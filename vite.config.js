// Vite configuration.
//
// The base path comes from site.config.js. It is relative ('./') so the
// same build works at https://rdbagwell.github.io/3D_Game/, on any other
// static host, and after the repository is renamed.

import { defineConfig } from 'vite';
import { site } from './site.config.js';

export default defineConfig({
  base: site.base,
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
