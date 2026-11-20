import { describe, expect, it } from 'vitest'
import { generadorConSemilla } from '../src/azar'

describe('generador con semilla', () => {
  it('reproduce la secuencia de Mulberry32 calculada aparte', () => {
    // Valores de una implementación independiente en Python.
    const g = generadorConSemilla(2027)
    expect([g.siguiente(), g.siguiente(), g.siguiente(), g.siguiente()]).toEqual([
      0.98798907129094, 0.5169636213686317, 0.19619796960614622, 0.41229676525108516,
    ])
    expect(generadorConSemilla(0).siguiente()).toBe(0.26642920868471265)
  })

  it('la misma semilla da la misma secuencia', () => {
    const a = generadorConSemilla(42)
    const b = generadorConSemilla(42)
    for (let i = 0; i < 100; i++) expect(a.siguiente()).toBe(b.siguiente())
  })

  it('reparte los enteros de un rango sin salirse', () => {
    const g = generadorConSemilla(7)
    const cuenta = new Map<number, number>()
    for (let i = 0; i < 6000; i++) {
      const v = g.entero(1, 6)
      cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
    }
    expect([...cuenta.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6])
    for (const n of cuenta.values()) expect(Math.abs(n - 1000)).toBeLessThan(150)
  })

  it('elige un elemento de una lista y da reales en un rango', () => {
    const g = generadorConSemilla(3)
    const lista = ['a', 'b', 'c'] as const
    for (let i = 0; i < 50; i++) {
      expect(lista).toContain(g.elegir(lista))
      const r = g.real(2, 5)
      expect(r).toBeGreaterThanOrEqual(2)
      expect(r).toBeLessThan(5)
    }
  })
})
