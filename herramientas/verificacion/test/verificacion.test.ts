import { describe, expect, it } from 'vitest'
import { ERROR_ADMITIDO, todosLosCasos } from '../src/casos'

// HU0004: el módulo de cálculo, contra tres fuentes independientes, con error menor que una centésima de
// por ciento. Corre en la integración continua cada vez que cambia el código.

describe('verificación del módulo de cálculo contra tres fuentes', async () => {
  const { comparaciones, redesDescartadas } = await todosLosCasos({ redes: 100, semilla: 1 })

  it('compara contra las tres fuentes', () => {
    const fuentes = new Set(comparaciones.map((c) => c.fuente))
    expect([...fuentes].sort()).toEqual(['EPANET 2.2', 'FAO 56', 'Método de diseño normalizado'])
  })

  it('compara contra EPANET la mayoría de las redes generadas', () => {
    // Si el generador o la traducción a EPANET se rompieran, la prueba pasaría sin comparar nada.
    expect(100 - redesDescartadas.length).toBeGreaterThanOrEqual(70)
  })

  it('el error de cada comparación es menor que una centésima de por ciento', () => {
    const fallan = comparaciones.filter((c) => !(c.error < ERROR_ADMITIDO))
    expect(fallan).toEqual([])
  })
})
