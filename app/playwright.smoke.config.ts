import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) {
  throw new Error('Falta SMOKE_BASE_URL (por ejemplo https://n-club-five.vercel.app).');
}

// Smoke contra un despliegue real: sin webServer, solo lectura salvo SMOKE_WRITE=1.
export default defineConfig({
  testDir: 'tests/smoke',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-smoke' }]],
  outputDir: 'test-results/smoke',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
