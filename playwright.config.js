/* Playwright config for the start.lqh2011.com UI smoke tests.
   The page is served by scripts/static-server.js (index.html only) on
   127.0.0.1, which makes the sync module take its same-origin fallback
   (API_BASE='') and hit a 404 for /api/data — the local-first path, no real
   API, no CORS, no auth overlay. Tests seed a fake token + state via
   addInitScript before the page scripts run. */
'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8123',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/static-server.js 8123',
    port: 8123,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
