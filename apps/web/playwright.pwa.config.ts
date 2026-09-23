import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'offline-pwa.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env['CI'],
  timeout: 180000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4200',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'pwa-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'node e2e/pwa-server.mjs',
    url: 'http://localhost:4200',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
