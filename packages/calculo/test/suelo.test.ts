import { describe, expect, it } from 'vitest'
import { aguaDisponibleDeLaFuente, areaMaximaRegable } from '../src/agronomia/fuente'
import {
  aguaFacilmenteAprovechable,
  aguaUtilTotal,
  fraccionDeAgotamientoAjustada,
  humedadVolumetrica,
} from '../src/agronomia/suelo'

describe('agua útil del suelo (FAO 56, ecuaciones 82 y 83)', () => {
  // Ejemplo 36 del FAO 56: cebolla, tomate y maíz en arena franca, limo y arcilla limosa.
  const suelos = {
    arenaFranca: { capacidadDeCampo: 0.15, puntoDeMarchitez: 0.06 },
    limo: { capacidadDeCampo: 0.32, puntoDeMarchitez: 0.15 },
    arcillaLimosa: { capacidadDeCampo: 0.35, puntoDeMarchitez: 0.23 },
  }
  const cultivos = {
    cebolla: { profundidadRadicularM: 0.4, p: 0.3 },
    tomate: { profundidadRadicularM: 0.8, p: 0.4 },
    maiz: { profundidadRadicularM: 1.2, p: 0.55 },
  }
  // [AT, AFA] del libro, en mm. El libro redondea la AFA a milímetros enteros.
  const libro = {
    cebolla: { arenaFranca: [36, 11], limo: [68, 20], arcillaLimosa: [48, 14] },
    tomate: { arenaFranca: [72, 29], limo: [136, 54], arcillaLimosa: [96, 38] },
    maiz: { arenaFranca: [108, 59], limo: [204, 112], arcillaLimosa: [144, 79] },
  } as const

  for (const [nombreCultivo, cultivo] of Object.entries(cultivos)) {
    for (const [nombreSuelo, suelo] of Object.entries(suelos)) {
      it(`reproduce el ejemplo 36: ${nombreCultivo} en ${nombreSuelo}`, () => {
        const [at, afa] = libro[nombreCultivo as keyof typeof libro][nombreSuelo as keyof typeof suelos]
        const total = aguaUtilTotal({ ...suelo, profundidadRadicularM: cultivo.profundidadRadicularM })
        expect(total).toBeCloseTo(at, 10)
        expect(Math.round(aguaFacilmenteAprovechable(total, cultivo.p))).toBe(afa)
      })
    }
  }

  it('rechaza un suelo cuya capacidad de campo no supera el punto de marchitez', () => {
    expect(() => aguaUtilTotal({ capacidadDeCampo: 0.1, puntoDeMarchitez: 0.1, profundidadRadicularM: 1 })).toThrow(
      /capacidad de campo/,
    )
  })

  it('pasa la humedad gravimétrica a volumétrica con la densidad aparente', () => {
    // 22 % en peso con 1.35 g/cm³ son 0.297 m³/m³
    expect(humedadVolumetrica(0.22, 1.35)).toBeCloseTo(0.297, 14)
  })
})

describe('fracción de agotamiento ajustada a la demanda (FAO 56, nota de la tabla 22)', () => {
  it('sube cuando el cultivo evapora menos de 5 mm al día', () => {
    expect(fraccionDeAgotamientoAjustada(0.35, 3)).toBeCloseTo(0.43, 14)
    expect(fraccionDeAgotamientoAjustada(0.35, 5)).toBeCloseTo(0.35, 14)
  })

  it('queda entre 0.1 y 0.8', () => {
    expect(fraccionDeAgotamientoAjustada(0.7, 0.5)).toBe(0.8)
    expect(fraccionDeAgotamientoAjustada(0.2, 12)).toBe(0.1)
  })
})

describe('agua disponible de la fuente y área máxima regable', () => {
  it('convierte el caudal medido en volumen por día y por semana', () => {
    // 5 l/s · 3.6 m³/h por l/s · 12 h
    const agua = aguaDisponibleDeLaFuente({ caudalLps: 5, horasDeRiegoPorDia: 12 })
    expect(agua.m3PorDia).toBeCloseTo(216, 12)
    expect(agua.m3PorSemana).toBeCloseTo(1512, 12)
  })

  it('el área máxima es la que la fuente cubre en la semana de mayor demanda', () => {
    // 216 m³/día / (4 mm/día / 0.9 · 10 m³/ha por mm) = 4.86 ha
    const area = areaMaximaRegable({ caudalLps: 5, horasDeRiegoPorDia: 12, demandaNetaPicoMmDia: 4, eficiencia: 0.9 })
    expect(area).toBeCloseTo(4.86, 12)
  })

  it('sin demanda no hay límite de área', () => {
    expect(areaMaximaRegable({ caudalLps: 5, horasDeRiegoPorDia: 12, demandaNetaPicoMmDia: 0, eficiencia: 0.9 })).toBe(
      Infinity,
    )
  })
})
