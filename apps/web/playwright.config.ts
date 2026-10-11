import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: 'http://localhost:3005',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run start',
    port: 3005,
    reuseExistingServer: true,
    timeout: 120000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
