import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for real-backend browser E2E tests.
 *
 * Prerequisites:
 *   - Backend API running (default: http://localhost:3000)
 *   - Backend worker running (for upload finalization)
 *   - Admin user seeded (npm run db:seed:first-admin in backend)
 *   - Playwright browsers installed (npm run e2e:install)
 *
 * Environment variables:
 *   E2E_API_URL   — Backend API base URL (default: http://localhost:3000/api)
 *   E2E_WEB_URL   — Angular dev server URL (default: http://localhost:4200)
 *   E2E_ADMIN_EMAIL    — Seeded admin email (default: admin@example.com)
 *   E2E_ADMIN_PASSWORD — Seeded admin password (required; no default — provide via env/CI secret)
 */

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: process.env['E2E_WEB_URL'] || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx ng serve --proxy-config proxy.conf.json --host 0.0.0.0',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
