import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // En desarrollo la API va por el mismo origen: la cookie de sesión funciona sin CORS. Las pruebas de punta a
  // punta apuntan a su propia API con API_DESARROLLO.
  server: { port: 5173, proxy: { '/api': process.env.API_DESARROLLO ?? 'http://localhost:3000' } },
  worker: { format: 'es' },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
})
