import { defineConfig } from 'vitest/config'

// Cada archivo de pruebas levanta su propia base PGlite en memoria; con varios en paralelo, arrancar tarda más
// que el límite por defecto de diez segundos.
export default defineConfig({
  test: { hookTimeout: 60_000, testTimeout: 30_000 },
})
