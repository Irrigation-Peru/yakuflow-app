import { describe, expect, it } from 'vitest'
import type { LugarDelCultivo } from '../src/agronomia/aptitud'
import { CATALOGO_FAO56 } from '../src/agronomia/catalogo-fao56'
import { climaDeLosDoceMeses, type NormalDelMes } from '../src/agronomia/clima'
import { mejorFechaDeSiembra, RASGOS_DEL_LUGAR, rasgosDelLugar, resumenDelClima, VALOR_SIN_DATO } from '../src/agronomia/rasgos'

// HU0011: el modelo de cultivos mira el suelo, el clima, la altitud y el agua. Los rasgos salen siempre de la misma
// función, al entrenar y en la aplicación: si cambian, cambian en los dos lados a la vez.

const mes = (temperaturaMaximaC: number, temperaturaMinimaC: number, lluviaMm: number): NormalDelMes => ({
  temperaturaMaximaC,
  temperaturaMinimaC,
  humedadRelativaMediaPct: 70,
  vientoA2mMs: 2,
  radiacionSolarMJm2Dia: 18,
  lluviaMm,
})
const normales = Array.from({ length: 12 }, (_, i) => mes(18, i === 6 ? -4 : 2, i < 3 ? 120 : 30))
const lugar: LugarDelCultivo = {
  altitudM: 3400,
  normales,
  clima: climaDeLosDoceMeses({ latitudGrados: -10.6, altitudM: 3400, meses: normales }),
  suelo: { clase: 'franco arcilloso', ph: 6.1 },
  fuente: { caudalLps: 2, horasDisponiblesDia: 12, conductividadDsM: 0.8 },
  areaHa: 1.5,
}

describe('rasgos del lugar para el modelo de cultivos', () => {
  it('son nueve, en un orden fijo', () => {
    expect(RASGOS_DEL_LUGAR).toEqual([
      'altitudM',
      'temperaturaMediaAnualC',
      'minimaDelMesMasFrioC',
      'et0MediaMmDia',
      'lluviaAnualMm',
      'ofertaDeAguaMmDia',
      'conductividadDelAguaDsM',
      'phDelSuelo',
      'texturaGruesa',
    ])
  })

  it('salen del lugar', () => {
    const r = rasgosDelLugar(lugar)
    expect(r).toHaveLength(9)
    const [altitud, media, minima, et0, lluvia, oferta, conductividad, ph, textura] = r
    expect(altitud).toBe(3400)
    // Once meses de 10 °C y julio de 7 °C.
    expect(media).toBeCloseTo((11 * 10 + 7) / 12, 12)
    expect(minima).toBe(-4)
    expect(et0).toBeCloseTo(lugar.clima.reduce((s, c) => s + c.et0MmDia, 0) / 12, 12)
    expect(lluvia).toBe(3 * 120 + 9 * 30)
    // 2 l/s · 3.6 · 12 h = 86.4 m³ al día sobre 1.5 ha → 5.76 mm al día.
    expect(oferta).toBeCloseTo(5.76, 12)
    expect(conductividad).toBe(0.8)
    expect(ph).toBe(6.1)
    // Ligera 0, media 1, pesada 2: el franco arcilloso es media.
    expect(textura).toBe(1)
  })

  it('el resumen del clima del año dice también cuál es el mes más frío', () => {
    const resumen = resumenDelClima(lugar)
    const r = rasgosDelLugar(lugar)
    expect(resumen).toEqual({
      temperaturaMediaAnualC: r[1],
      minimaDelMesMasFrioC: r[2],
      mesMasFrio: 7,
      et0MediaMmDia: r[3],
      lluviaAnualMm: r[4],
    })
  })

  it('completa con un valor declarado lo que no se midió', () => {
    const r = rasgosDelLugar({ ...lugar, suelo: { clase: 'arcilla', ph: null }, fuente: { ...lugar.fuente, conductividadDsM: null } })
    expect(r[6]).toBe(VALOR_SIN_DATO.conductividadDelAguaDsM)
    expect(r[7]).toBe(VALOR_SIN_DATO.phDelSuelo)
    expect(r[8]).toBe(2)
  })
})

describe('la mejor fecha de siembra del año', () => {
  it('es la del mes con mayor aptitud: la papa evita sembrar en la helada de julio', () => {
    const papa = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!
    const { fechaSiembra, indice } = mejorFechaDeSiembra({ cultivo: papa, lugar })
    expect(indice).toBeGreaterThan(0)
    // Cualquier siembra cuyo ciclo de 193 días toque julio corre un riesgo alto de helada: la de enero ya se cosecha el
    // 12 de julio, y la de diciembre, el 11 de junio.
    const mesDeSiembra = Number(fechaSiembra.slice(5, 7))
    expect([8, 9, 10, 11, 12]).toContain(mesDeSiembra)
  })
})
