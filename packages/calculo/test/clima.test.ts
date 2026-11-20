import { describe, expect, it } from 'vitest'
import {
  climaDeLosDoceMeses,
  diaDelAnioDelMes,
  evapotranspiracionDeReferencia,
  flujoDeCalorDelSueloMensual,
  radiacionExtraterrestre,
} from '../src/agronomia/clima'

// HU0009: el clima del lugar sale de los servicios por coordenadas, no del enunciado. La ET0 se calcula con la
// ecuación de Penman-Monteith del Estudio FAO Riego y Drenaje N.º 56 (Allen et al., 1998), capítulo 3, y se
// comprueba con los dos ejemplos resueltos del capítulo 4: el 17 (mensual, Bangkok, abril) y el 18 (diario,
// Uccle, 6 de julio). El libro redondea cada paso intermedio; aquí no se redondea, y la diferencia queda dentro
// de la última cifra que el libro imprime.

describe('radiación extraterrestre (FAO 56, ecuaciones 21 a 25)', () => {
  it('reproduce el ejemplo 8: 20° S el 3 de septiembre', () => {
    const { radiacionMJm2Dia, horasDeSolMaximas } = radiacionExtraterrestre({ latitudGrados: -20, diaDelAnio: 246 })
    expect(radiacionMJm2Dia).toBeCloseTo(32.2, 1)
    expect(horasDeSolMaximas).toBeCloseTo(11.7, 1)
  })
})

describe('día del año que representa a cada mes (FAO 56, nota de la ecuación 21)', () => {
  it('es el de la mitad del mes: J = entero(30.4 · mes − 15)', () => {
    expect(diaDelAnioDelMes(1)).toBe(15)
    expect(diaDelAnioDelMes(4)).toBe(106)
    expect(diaDelAnioDelMes(12)).toBe(349)
  })
})

describe('flujo de calor del suelo en un mes (FAO 56, ecuación 44)', () => {
  it('G = 0.14 · (T del mes − T del mes anterior)', () => {
    expect(flujoDeCalorDelSueloMensual(30.2, 29.2)).toBeCloseTo(0.14, 12)
    expect(flujoDeCalorDelSueloMensual(5.6, 7.3)).toBeCloseTo(-0.238, 12)
  })
})

describe('ET0 por Penman-Monteith (FAO 56, ecuación 6)', () => {
  it('reproduce el ejemplo 17: Bangkok, abril, 5.72 mm/día', () => {
    const r = evapotranspiracionDeReferencia({
      latitudGrados: 13.73,
      altitudM: 2,
      diaDelAnio: diaDelAnioDelMes(4),
      temperaturaMaximaC: 34.8,
      temperaturaMinimaC: 25.6,
      humedad: { presionDeVaporRealKPa: 2.85 },
      vientoA2mMs: 2,
      radiacion: { horasDeSol: 8.5 },
      flujoDeCalorDelSueloMJm2Dia: flujoDeCalorDelSueloMensual(30.2, 29.2),
    })
    expect(r.pendienteKPaC).toBeCloseTo(0.246, 3)
    expect(r.presionAtmosfericaKPa).toBeCloseTo(101.3, 1)
    // El libro calcula γ con la presión ya redondeada a 101.3 kPa; sin redondear da 0.06735.
    expect(r.constantePsicrometricaKPaC).toBeCloseTo(0.0674, 3)
    expect(r.presionDeSaturacionKPa).toBeCloseTo(4.42, 2)
    // El libro toma Ra y N interpolando entre 12° y 14° N en las tablas 2.6 y 2.7 del anexo 2.
    expect(r.radiacionExtraterrestreMJm2Dia).toBeCloseTo(38.06, 1)
    expect(r.horasDeSolMaximas).toBeCloseTo(12.31, 1)
    expect(r.radiacionSolarMJm2Dia).toBeCloseTo(22.65, 1)
    expect(r.radiacionDeCieloDespejadoMJm2Dia).toBeCloseTo(28.54, 1)
    expect(r.radiacionNetaDeOndaLargaMJm2Dia).toBeCloseTo(3.11, 2)
    expect(r.radiacionNetaMJm2Dia).toBeCloseTo(14.33, 1)
    expect(r.et0MmDia).toBeCloseTo(5.72, 2)
  })

  it('reproduce el ejemplo 18: Uccle, 6 de julio, 3.9 mm/día', () => {
    const r = evapotranspiracionDeReferencia({
      latitudGrados: 50.8,
      altitudM: 100,
      diaDelAnio: 187,
      temperaturaMaximaC: 21.5,
      temperaturaMinimaC: 12.3,
      humedad: { relativaMaximaPct: 84, relativaMinimaPct: 63 },
      vientoA2mMs: 2.078,
      radiacion: { horasDeSol: 9.25 },
    })
    expect(r.presionAtmosfericaKPa).toBeCloseTo(100.1, 1)
    expect(r.pendienteKPaC).toBeCloseTo(0.122, 3)
    expect(r.constantePsicrometricaKPaC).toBeCloseTo(0.0666, 4)
    expect(r.presionDeSaturacionKPa).toBeCloseTo(1.997, 3)
    expect(r.presionDeVaporRealKPa).toBeCloseTo(1.409, 3)
    expect(r.radiacionExtraterrestreMJm2Dia).toBeCloseTo(41.09, 1)
    expect(r.horasDeSolMaximas).toBeCloseTo(16.1, 1)
    expect(r.radiacionSolarMJm2Dia).toBeCloseTo(22.07, 1)
    expect(r.radiacionDeCieloDespejadoMJm2Dia).toBeCloseTo(30.9, 1)
    expect(r.radiacionNetaDeOndaLargaMJm2Dia).toBeCloseTo(3.71, 2)
    expect(r.radiacionNetaMJm2Dia).toBeCloseTo(13.28, 1)
    expect(r.et0MmDia).toBeCloseTo(3.88, 2)
  })

  it('con la radiación solar medida da lo mismo que con las horas de sol que la producen', () => {
    const comun = {
      latitudGrados: 13.73,
      altitudM: 2,
      diaDelAnio: diaDelAnioDelMes(4),
      temperaturaMaximaC: 34.8,
      temperaturaMinimaC: 25.6,
      humedad: { presionDeVaporRealKPa: 2.85 },
      vientoA2mMs: 2,
    }
    const conHoras = evapotranspiracionDeReferencia({ ...comun, radiacion: { horasDeSol: 8.5 } })
    const conRadiacion = evapotranspiracionDeReferencia({
      ...comun,
      radiacion: { solarMJm2Dia: conHoras.radiacionSolarMJm2Dia },
    })
    expect(conRadiacion.et0MmDia).toBeCloseTo(conHoras.et0MmDia, 12)
  })

  it('con la humedad relativa media usa la ecuación 19', () => {
    // Ejemplo 5 del FAO 56: Tmax 25 °C, Tmin 18 °C, HR media 68 % → ea 1.78 kPa.
    const r = evapotranspiracionDeReferencia({
      latitudGrados: 0,
      altitudM: 0,
      diaDelAnio: 100,
      temperaturaMaximaC: 25,
      temperaturaMinimaC: 18,
      humedad: { relativaMediaPct: 68 },
      vientoA2mMs: 2,
      radiacion: { solarMJm2Dia: 20 },
    })
    expect(r.presionDeVaporRealKPa).toBeCloseTo(1.78, 2)
  })

  it('rechaza una mínima mayor que la máxima', () => {
    expect(() =>
      evapotranspiracionDeReferencia({
        latitudGrados: 0,
        altitudM: 0,
        diaDelAnio: 100,
        temperaturaMaximaC: 10,
        temperaturaMinimaC: 12,
        humedad: { relativaMediaPct: 70 },
        vientoA2mMs: 2,
        radiacion: { solarMJm2Dia: 18 },
      }),
    ).toThrow(/mínima/)
  })
})

describe('ET0 de los doce meses a partir de las normales climáticas', () => {
  const mes = { temperaturaMaximaC: 14, temperaturaMinimaC: 1, humedadRelativaMediaPct: 75, vientoA2mMs: 2.1, radiacionSolarMJm2Dia: 18, lluviaMm: 80 }
  const lugar = { latitudGrados: -10.68, altitudM: 4300 }

  it('cada mes es la ET0 de su día central, y la lluvia pasa tal cual', () => {
    const clima = climaDeLosDoceMeses({ ...lugar, meses: Array.from({ length: 12 }, () => mes) })
    expect(clima).toHaveLength(12)
    const abril = evapotranspiracionDeReferencia({
      ...lugar,
      diaDelAnio: diaDelAnioDelMes(4),
      temperaturaMaximaC: 14,
      temperaturaMinimaC: 1,
      humedad: { relativaMediaPct: 75 },
      vientoA2mMs: 2.1,
      radiacion: { solarMJm2Dia: 18 },
    })
    expect(clima[3]!.et0MmDia).toBeCloseTo(abril.et0MmDia, 12)
    expect(clima.every((c) => c.lluviaMm === 80)).toBe(true)
  })

  it('el flujo de calor de enero se toma contra diciembre', () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({ ...mes, temperaturaMaximaC: i === 11 ? 20 : 14 }))
    const clima = climaDeLosDoceMeses({ ...lugar, meses })
    const sinFlujo = climaDeLosDoceMeses({ ...lugar, meses: Array.from({ length: 12 }, () => mes) })
    // Diciembre más cálido: en enero el suelo cede calor (G < 0) y la ET0 sube.
    expect(clima[0]!.et0MmDia).toBeGreaterThan(sinFlujo[0]!.et0MmDia)
  })

  it('pide los doce meses', () => {
    expect(() => climaDeLosDoceMeses({ ...lugar, meses: [mes] })).toThrow(/doce/)
  })
})
