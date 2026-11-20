import { describe, expect, it } from 'vitest'
import { bandaDePresion, colorDePresion, LEYENDA_DE_PRESION } from '../src/presion.ts'

// La presión nominal del gotero de botón del catálogo.
const NOMINAL = 10

describe('bandaDePresion', () => {
  it('pone la presión nominal en la banda adecuada', () => {
    expect(bandaDePresion(NOMINAL, NOMINAL).banda).toBe('adecuada')
    expect(bandaDePresion(NOMINAL * 0.8, NOMINAL).banda).toBe('adecuada')
    expect(bandaDePresion(NOMINAL * 1.25, NOMINAL).banda).toBe('adecuada')
  })

  it('separa lo que riega de menos de lo que riega de más', () => {
    expect(bandaDePresion(NOMINAL * 0.49, NOMINAL).banda).toBe('insuficiente')
    expect(bandaDePresion(NOMINAL * 0.6, NOMINAL).banda).toBe('baja')
    expect(bandaDePresion(NOMINAL * 1.6, NOMINAL).banda).toBe('alta')
    expect(bandaDePresion(NOMINAL * 2.1, NOMINAL).banda).toBe('excesiva')
  })

  it('las bandas cubren todo el rango sin huecos ni solapes', () => {
    const limites = [0, 0.49, 0.5, 0.79, 0.8, 1.25, 1.26, 2, 2.01, 50]
    const bandas = limites.map((r) => bandaDePresion(r * NOMINAL, NOMINAL).banda)
    expect(bandas).toEqual([
      'insuficiente', 'insuficiente', 'baja', 'baja', 'adecuada', 'adecuada', 'alta', 'alta', 'excesiva', 'excesiva',
    ])
  })

  it('cada banda trae nombre, color y lectura, y la leyenda las lista una vez', () => {
    expect(LEYENDA_DE_PRESION.length).toBe(5)
    expect(new Set(LEYENDA_DE_PRESION.map((b) => b.color)).size).toBe(5)
    for (const banda of LEYENDA_DE_PRESION) {
      expect(banda.nombre.length).toBeGreaterThan(3)
      expect(banda.lectura.length).toBeGreaterThan(20)
      expect(banda.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('exige una presión nominal positiva: sin ella la banda no significa nada', () => {
    expect(() => bandaDePresion(5, 0)).toThrow(/positiva/)
    expect(() => colorDePresion(5, -1)).toThrow(/positiva/)
  })
})
