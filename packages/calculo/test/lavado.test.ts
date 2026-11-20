import { describe, expect, it } from 'vitest'
import { CATALOGO_FAO56, eficienciaDelBalance, eficienciaDeRiego, EFICIENCIA_APLICACION, requerimientoDeLavado } from '../src/index'

// El agua salina pide regar de más para lavar la raíz (Ayers y Westcot, 1985, FAO 29). Con el agua de la sierra no
// cambia nada; con agua salina, como la de algunos valles de la costa, la necesidad bruta sube.
const papa = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!
const salinidad = papa.requisitos!.salinidad

describe('requerimiento de lavado', () => {
  it('sin dato de calidad del agua no se supone sal', () => {
    expect(requerimientoDeLavado({ metodo: 'goteo', conductividadDelAguaDsM: null, salinidad })).toBe(0)
    expect(eficienciaDelBalance(papa)).toBe(EFICIENCIA_APLICACION.goteo)
  })

  it('goteo: LR = CEa / (2 · CEe máx), con CEe máx = umbral + 100 / pendiente', () => {
    // Papa: 1.7 dS/m de umbral y 12 % por dS/m: CEe máx = 1.7 + 8.33 = 10.03 dS/m.
    expect(requerimientoDeLavado({ metodo: 'goteo', conductividadDelAguaDsM: 2, salinidad })).toBeCloseTo(2 / (2 * (1.7 + 100 / 12)), 12)
  })

  it('aspersión: LR = CEa / (5 · CEe umbral − CEa)', () => {
    expect(requerimientoDeLavado({ metodo: 'aspersion', conductividadDelAguaDsM: 2, salinidad })).toBeCloseTo(2 / (5 * 1.7 - 2), 12)
  })

  it('con el agua de la sierra (0.4 dS/m) el lavado cabe en las pérdidas del riego: la eficiencia no cambia', () => {
    for (const metodo of ['goteo', 'aspersion'] as const) {
      const e = eficienciaDeRiego({ metodo, conductividadDelAguaDsM: 0.4, salinidad })
      expect(e.mandaElLavado).toBe(false)
      expect(e.eficiencia).toBe(EFICIENCIA_APLICACION[metodo])
    }
  })

  it('con agua salina (3 dS/m) en aspersión manda el lavado: se riega más que con la eficiencia sola', () => {
    const e = eficienciaDeRiego({ metodo: 'aspersion', conductividadDelAguaDsM: 3, salinidad })
    expect(e.lavado).toBeCloseTo(3 / (8.5 - 3), 12)
    expect(e.mandaElLavado).toBe(true)
    expect(e.eficiencia).toBeCloseTo(1 - e.lavado, 12)
    expect(e.eficiencia).toBeLessThan(EFICIENCIA_APLICACION.aspersion)
  })

  it('un agua que el cultivo no tolera no da una eficiencia negativa', () => {
    const e = eficienciaDeRiego({ metodo: 'aspersion', conductividadDelAguaDsM: 20, salinidad })
    expect(e.eficiencia).toBeGreaterThan(0)
  })
})
