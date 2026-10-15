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
    timeout: 120000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test',
      JWT_SECRET: process.env.JWT_SECRET || '01234567890123456789012345678901',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '01234567890123456789012345678901',
      TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '01234567890123456789012345678901'
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
