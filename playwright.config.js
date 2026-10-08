// Playwright: smoke tests and screenshots against the production build.
//
//   npm run build && npm run test:e2e     smoke tests
//   npm run build && npm run screenshots  regenerate docs/screenshots/
//
// Headless Chromium renders WebGL in software (SwiftShader), so the game runs
// slowly here; tests wait on game state, never on wall-clock time, and no
// performance number from these runs means anything for real hardware.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
