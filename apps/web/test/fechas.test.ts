import { describe, expect, it } from 'vitest'
import { proximaFecha } from '../src/fechas.ts'

// La mejor fecha de siembra se busca sobre un año de referencia (el del entrenamiento del modelo). Al estudiante se le
// propone la próxima vez que llega ese día, no una fecha de un año que no es el suyo.

describe('próxima fecha', () => {
  const hoy = new Date('2026-10-29T15:00:00Z')

  it('si el día todavía no llega este año, es de este año', () => {
    expect(proximaFecha('2027-11-01', hoy)).toBe('2026-11-01')
  })

  it('si ya pasó, es del año que viene', () => {
    expect(proximaFecha('2027-10-01', hoy)).toBe('2027-10-01')
    expect(proximaFecha('2027-01-01', hoy)).toBe('2027-01-01')
  })

  it('si es hoy, es hoy', () => {
    expect(proximaFecha('2027-10-29', hoy)).toBe('2026-10-29')
  })
})
