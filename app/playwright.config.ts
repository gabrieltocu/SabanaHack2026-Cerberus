import { defineConfig, devices } from '@playwright/test';

// Dos modos de datos, dos servidores locales (scripts/serve.ts con la API real):
// - mock: `dist` (la API corre en el navegador, localStorage), puerto 4173.
// - api:  `dist-api` (EXPO_PUBLIC_DATA_MODE=api, HTTP a /api/v1), puerto 4174, sin límite de tasa
//   porque todas las pruebas comparten IP. Comparten el estado del servidor: un solo worker.
const ports = { mock: 4173, api: 4174 } as const;
const base = (mode: keyof typeof ports) =>
  process.env.E2E_BASE_URL ?? `http://localhost:${ports[mode]}`;

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mock',
      testDir: 'tests/e2e',
      use: { ...devices['Desktop Chrome'], baseURL: base('mock') },
    },
    {
      name: 'api',
      testDir: 'tests/e2e-api',
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'], baseURL: base('api') },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'npm run serve',
          url: `http://localhost:${ports.mock}`,
          reuseExistingServer: !process.env.CI,
          env: { PORT: String(ports.mock) },
        },
        {
          command: 'npm run serve',
          url: `http://localhost:${ports.api}`,
          reuseExistingServer: !process.env.CI,
          env: { PORT: String(ports.api), DIST: 'dist-api', CERBERUS_RATE_LIMIT: 'off' },
        },
      ],
});
