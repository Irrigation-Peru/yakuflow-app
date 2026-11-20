import { defineConfig, devices } from '@playwright/test'

// Pruebas de punta a punta: la web con Vite y la API de prueba (base en memoria, relieve sintético, sin
// internet). `pnpm --filter @riego/web e2e`

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:5174', locale: 'es-PE', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'corepack pnpm --filter @riego/api servidor-de-prueba',
      cwd: '../..',
      url: 'http://localhost:3100/api/salud',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'corepack pnpm exec vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { API_DESARROLLO: 'http://localhost:3100' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
