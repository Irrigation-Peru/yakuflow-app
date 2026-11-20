// Evapotranspiración de referencia por la ecuación de Penman-Monteith del Estudio FAO Riego y Drenaje N.º 56
// (Allen et al., 1998), capítulo 3. El número de cada ecuación es el del libro.

import type { ClimaMensual } from './demanda'

const RADIANES_POR_GRADO = Math.PI / 180
/** Constante solar, MJ/(m²·min). */
const CONSTANTE_SOLAR = 0.082
/** Constante de Stefan-Boltzmann, MJ/(K⁴·m²·día). */
const STEFAN_BOLTZMANN = 4.903e-9
/** Coeficientes de Ångström por omisión, cuando no hay calibración local (ecuación 35). */
const ANGSTROM_A = 0.25
const ANGSTROM_B = 0.5
/** Albedo del cultivo de referencia (ecuación 38). */
const ALBEDO = 0.23

/** Presión de vapor de saturación a la temperatura T, kPa (ecuación 11). */
const presionDeSaturacion = (temperaturaC: number) => 0.6108 * Math.exp((17.27 * temperaturaC) / (temperaturaC + 237.3))

/** Día del año que representa al mes, de 1 a 12: la mitad del mes (nota de la ecuación 21). */
export function diaDelAnioDelMes(mes: number) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error(`El mes va de 1 a 12: ${mes}`)
  return Math.trunc(30.4 * mes - 15)
}

/** Flujo de calor del suelo en un mes, MJ/(m²·día), con la temperatura media de ese mes y la del anterior (ecuación 44). */
export function flujoDeCalorDelSueloMensual(temperaturaDelMesC: number, temperaturaDelMesAnteriorC: number) {
  return 0.14 * (temperaturaDelMesC - temperaturaDelMesAnteriorC)
}

/** Radiación extraterrestre, MJ/(m²·día), y horas de sol posibles en el día (ecuaciones 21 a 25 y 34). */
export function radiacionExtraterrestre({ latitudGrados, diaDelAnio }: { latitudGrados: number; diaDelAnio: number }) {
  const latitud = latitudGrados * RADIANES_POR_GRADO
  const distanciaRelativa = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * diaDelAnio)
  const declinacion = 0.409 * Math.sin(((2 * Math.PI) / 365) * diaDelAnio - 1.39)
  const anguloDePuesta = Math.acos(-Math.tan(latitud) * Math.tan(declinacion))
  const radiacionMJm2Dia =
    ((24 * 60) / Math.PI) *
    CONSTANTE_SOLAR *
    distanciaRelativa *
    (anguloDePuesta * Math.sin(latitud) * Math.sin(declinacion) +
      Math.cos(latitud) * Math.cos(declinacion) * Math.sin(anguloDePuesta))
  return { radiacionMJm2Dia, horasDeSolMaximas: (24 / Math.PI) * anguloDePuesta }
}

/** La humedad del aire, en la forma en que llegue: medida, con la relativa máxima y mínima, o con la media. */
export type Humedad =
  | { presionDeVaporRealKPa: number }
  | { relativaMaximaPct: number; relativaMinimaPct: number }
  | { relativaMediaPct: number }

/** La radiación solar medida, o las horas de sol con las que se estima (ecuación 35). */
export type Radiacion = { solarMJm2Dia: number } | { horasDeSol: number }

export interface DatosDeEt0 {
  latitudGrados: number
  altitudM: number
  diaDelAnio: number
  temperaturaMaximaC: number
  temperaturaMinimaC: number
  humedad: Humedad
  /** Velocidad del viento a 2 m de altura, m/s. */
  vientoA2mMs: number
  radiacion: Radiacion
  /** Flujo de calor del suelo, MJ/(m²·día). En un día es despreciable (ecuación 42); en un mes, ecuación 44. */
  flujoDeCalorDelSueloMJm2Dia?: number
}

export function evapotranspiracionDeReferencia({
  latitudGrados,
  altitudM,
  diaDelAnio,
  temperaturaMaximaC,
  temperaturaMinimaC,
  humedad,
  vientoA2mMs,
  radiacion,
  flujoDeCalorDelSueloMJm2Dia = 0,
}: DatosDeEt0) {
  if (temperaturaMinimaC > temperaturaMaximaC) {
    throw new Error(`La temperatura mínima (${temperaturaMinimaC} °C) es mayor que la máxima (${temperaturaMaximaC} °C)`)
  }
  const temperaturaMediaC = (temperaturaMaximaC + temperaturaMinimaC) / 2

  // Ecuaciones 7, 8 y 13: presión atmosférica, constante psicrométrica y pendiente de la curva de saturación.
  const presionAtmosfericaKPa = 101.3 * ((293 - 0.0065 * altitudM) / 293) ** 5.26
  const constantePsicrometricaKPaC = 0.000665 * presionAtmosfericaKPa
  const pendienteKPaC = (4098 * presionDeSaturacion(temperaturaMediaC)) / (temperaturaMediaC + 237.3) ** 2

  // Ecuaciones 12, 17 y 19: la de saturación es el promedio de la de la máxima y la de la mínima.
  const saturacionMaxima = presionDeSaturacion(temperaturaMaximaC)
  const saturacionMinima = presionDeSaturacion(temperaturaMinimaC)
  const presionDeSaturacionKPa = (saturacionMaxima + saturacionMinima) / 2
  const presionDeVaporRealKPa =
    'presionDeVaporRealKPa' in humedad
      ? humedad.presionDeVaporRealKPa
      : 'relativaMediaPct' in humedad
        ? (humedad.relativaMediaPct / 100) * presionDeSaturacionKPa
        : (saturacionMinima * (humedad.relativaMaximaPct / 100) + saturacionMaxima * (humedad.relativaMinimaPct / 100)) / 2

  // Ecuaciones 35 a 40: radiación neta, la de onda corta que absorbe el pasto menos la de onda larga que emite.
  const { radiacionMJm2Dia: radiacionExtraterrestreMJm2Dia, horasDeSolMaximas } = radiacionExtraterrestre({
    latitudGrados,
    diaDelAnio,
  })
  const radiacionSolarMJm2Dia =
    'solarMJm2Dia' in radiacion
      ? radiacion.solarMJm2Dia
      : (ANGSTROM_A + (ANGSTROM_B * radiacion.horasDeSol) / horasDeSolMaximas) * radiacionExtraterrestreMJm2Dia
  const radiacionDeCieloDespejadoMJm2Dia = (0.75 + 2e-5 * altitudM) * radiacionExtraterrestreMJm2Dia
  const radiacionNetaDeOndaCortaMJm2Dia = (1 - ALBEDO) * radiacionSolarMJm2Dia
  const nubosidad = Math.min(1, radiacionSolarMJm2Dia / radiacionDeCieloDespejadoMJm2Dia)
  const radiacionNetaDeOndaLargaMJm2Dia =
    STEFAN_BOLTZMANN *
    (((temperaturaMaximaC + 273.16) ** 4 + (temperaturaMinimaC + 273.16) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(presionDeVaporRealKPa)) *
    (1.35 * nubosidad - 0.35)
  const radiacionNetaMJm2Dia = radiacionNetaDeOndaCortaMJm2Dia - radiacionNetaDeOndaLargaMJm2Dia

  // Ecuación 6.
  const et0MmDia =
    (0.408 * pendienteKPaC * (radiacionNetaMJm2Dia - flujoDeCalorDelSueloMJm2Dia) +
      ((constantePsicrometricaKPaC * 900) / (temperaturaMediaC + 273)) *
        vientoA2mMs *
        (presionDeSaturacionKPa - presionDeVaporRealKPa)) /
    (pendienteKPaC + constantePsicrometricaKPaC * (1 + 0.34 * vientoA2mMs))

  return {
    et0MmDia: Math.max(0, et0MmDia),
    presionAtmosfericaKPa,
    constantePsicrometricaKPaC,
    pendienteKPaC,
    presionDeSaturacionKPa,
    presionDeVaporRealKPa,
    radiacionExtraterrestreMJm2Dia,
    horasDeSolMaximas,
    radiacionSolarMJm2Dia,
    radiacionDeCieloDespejadoMJm2Dia,
    radiacionNetaDeOndaLargaMJm2Dia,
    radiacionNetaMJm2Dia,
  }
}

/** Normales climáticas de un mes en el lugar: lo que entregan los servicios de clima. */
export interface NormalDelMes {
  temperaturaMaximaC: number
  temperaturaMinimaC: number
  humedadRelativaMediaPct: number
  vientoA2mMs: number
  radiacionSolarMJm2Dia: number
  lluviaMm: number
}

/**
 * ET0 media diaria y lluvia de cada mes, de enero a diciembre. Cada mes se calcula en su día central, y el
 * flujo de calor del suelo se toma contra el mes anterior; el de enero, contra diciembre del mismo año medio.
 */
export function climaDeLosDoceMeses({
  latitudGrados,
  altitudM,
  meses,
}: {
  latitudGrados: number
  altitudM: number
  meses: readonly NormalDelMes[]
}): ClimaMensual[] {
  if (meses.length !== 12) throw new Error(`Se necesitan las normales de los doce meses y llegaron ${meses.length}`)
  const media = (m: NormalDelMes) => (m.temperaturaMaximaC + m.temperaturaMinimaC) / 2
  return meses.map((m, i) => ({
    et0MmDia: evapotranspiracionDeReferencia({
      latitudGrados,
      altitudM,
      diaDelAnio: diaDelAnioDelMes(i + 1),
      temperaturaMaximaC: m.temperaturaMaximaC,
      temperaturaMinimaC: m.temperaturaMinimaC,
      humedad: { relativaMediaPct: m.humedadRelativaMediaPct },
      vientoA2mMs: m.vientoA2mMs,
      radiacion: { solarMJm2Dia: m.radiacionSolarMJm2Dia },
      flujoDeCalorDelSueloMJm2Dia: flujoDeCalorDelSueloMensual(media(m), media(meses[(i + 11) % 12]!)),
    }).et0MmDia,
    lluviaMm: m.lluviaMm,
  }))
}
