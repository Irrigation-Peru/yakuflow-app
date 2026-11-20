// Datos reales de cinco lugares de Pasco y Junín, tal como la aplicación los trajo y guardó el 7 de noviembre de 2026
// en la base local (apps/api/.bd-local). Clima: lluvia del SENAMHI (IDESEP, punto medio del rango) y temperatura,
// humedad, viento y radiación de NASA POWER (2001-2025), llevadas a la altitud de la parcela. Suelo: SoilGrids 2.0
// (ISRIC), 0 a 30 cm. Altitud y pendiente media: el relieve del paso 1. La fuente es la que se declaró en cada
// proyecto de prueba (caudal, cota y horas), no una medición de campo.

import type { NormalDelMes } from '../../src/index'

export interface LugarReal {
  nombre: string
  centroide: { lat: number; lon: number }
  altitudM: number
  pendienteMediaPct: number
  areaHa: number
  normales: NormalDelMes[]
  /** ET0 de cada mes como la guardó la aplicación, mm/día: para comprobar que el cálculo da lo mismo. */
  et0MmDia: number[]
  suelo: { arenaPct: number; arcillaPct: number; ph: number }
  fuente: { lat: number; lon: number; cotaMsnm: number; caudalLps: number; horasDisponiblesDia: number; conductividadDsM: number | null }
}

export const LUGARES_REALES = {
  cerroDePasco: {
    nombre: 'Cerro de Pasco, ladera a 4108 m',
    centroide: { lat: -10.68000, lon: -76.26000 },
    altitudM: 4107.6,
    pendienteMediaPct: 60.27,
    areaHa: 1.2150,
    normales: [
      { temperaturaMaximaC: 19.1125, temperaturaMinimaC: -1.8975, humedadRelativaMediaPct: 76.7, vientoA2mMs: 2.16, radiacionSolarMJm2Dia: 17.5, lluviaMm: 100 },
      { temperaturaMaximaC: 17.8925, temperaturaMinimaC: -0.8575, humedadRelativaMediaPct: 78.04, vientoA2mMs: 2.07, radiacionSolarMJm2Dia: 16.38, lluviaMm: 140 },
      { temperaturaMaximaC: 17.9825, temperaturaMinimaC: -3.2075, humedadRelativaMediaPct: 79.23, vientoA2mMs: 2.07, radiacionSolarMJm2Dia: 15.92, lluviaMm: 140 },
      { temperaturaMaximaC: 18.9425, temperaturaMinimaC: -3.2475, humedadRelativaMediaPct: 78.1, vientoA2mMs: 2.02, radiacionSolarMJm2Dia: 17.13, lluviaMm: 65 },
      { temperaturaMaximaC: 17.0825, temperaturaMinimaC: -4.7175, humedadRelativaMediaPct: 76.69, vientoA2mMs: 1.84, radiacionSolarMJm2Dia: 18.1, lluviaMm: 35 },
      { temperaturaMaximaC: 16.9625, temperaturaMinimaC: -5.0375, humedadRelativaMediaPct: 75.67, vientoA2mMs: 1.96, radiacionSolarMJm2Dia: 18.19, lluviaMm: 12.5 },
      { temperaturaMaximaC: 16.8125, temperaturaMinimaC: -6.6975, humedadRelativaMediaPct: 74.33, vientoA2mMs: 2.07, radiacionSolarMJm2Dia: 19.05, lluviaMm: 12.5 },
      { temperaturaMaximaC: 17.2725, temperaturaMinimaC: -6.0075, humedadRelativaMediaPct: 73.05, vientoA2mMs: 2.39, radiacionSolarMJm2Dia: 19.55, lluviaMm: 17.5 },
      { temperaturaMaximaC: 17.2725, temperaturaMinimaC: -4.1675, humedadRelativaMediaPct: 73.76, vientoA2mMs: 2.63, radiacionSolarMJm2Dia: 17.9, lluviaMm: 35 },
      { temperaturaMaximaC: 19.8325, temperaturaMinimaC: -2.0875, humedadRelativaMediaPct: 73.26, vientoA2mMs: 2.45, radiacionSolarMJm2Dia: 18.41, lluviaMm: 100 },
      { temperaturaMaximaC: 19.5525, temperaturaMinimaC: -1.9675, humedadRelativaMediaPct: 73.65, vientoA2mMs: 2.19, radiacionSolarMJm2Dia: 19.19, lluviaMm: 100 },
      { temperaturaMaximaC: 19.5325, temperaturaMinimaC: -0.9375, humedadRelativaMediaPct: 76.09, vientoA2mMs: 2.1, radiacionSolarMJm2Dia: 17.09, lluviaMm: 100 },
    ],
    et0MmDia: [3.0075, 2.7932, 2.6394, 2.7062, 2.6131, 2.5080, 2.6067, 2.8140, 2.8082, 3.1244, 3.2673, 2.9921],
    suelo: { arenaPct: 40.12, arcillaPct: 19.90, ph: 6.25 },
    fuente: { lat: -10.67400, lon: -76.26000, cotaMsnm: 4197, caudalLps: 4, horasDisponiblesDia: 12, conductividadDsM: 0.4 },
  },
  pascoLadera: {
    nombre: 'Pasco, ladera a 3413 m',
    centroide: { lat: -10.37277, lon: -76.43234 },
    altitudM: 3413.2,
    pendienteMediaPct: 41.80,
    areaHa: 0.9851,
    normales: [
      { temperaturaMaximaC: 23.6262, temperaturaMinimaC: 2.6162, humedadRelativaMediaPct: 76.7, vientoA2mMs: 2.16, radiacionSolarMJm2Dia: 17.5, lluviaMm: 100 },
      { temperaturaMaximaC: 22.4062, temperaturaMinimaC: 3.6562, humedadRelativaMediaPct: 78.04, vientoA2mMs: 2.07, radiacionSolarMJm2Dia: 16.38, lluviaMm: 100 },
      { temperaturaMaximaC: 22.4962, temperaturaMinimaC: 1.3062, humedadRelativaMediaPct: 79.23, vientoA2mMs: 2.07, radiacionSolarMJm2Dia: 15.92, lluviaMm: 140 },
      { temperaturaMaximaC: 23.4562, temperaturaMinimaC: 1.2662, humedadRelativaMediaPct: 78.1, vientoA2mMs: 2.02, radiacionSolarMJm2Dia: 17.13, lluviaMm: 65 },
      { temperaturaMaximaC: 21.5962, temperaturaMinimaC: -0.2038, humedadRelativaMediaPct: 76.69, vientoA2mMs: 1.84, radiacionSolarMJm2Dia: 18.1, lluviaMm: 35 },
      { temperaturaMaximaC: 21.4762, temperaturaMinimaC: -0.5238, humedadRelativaMediaPct: 75.67, vientoA2mMs: 1.96, radiacionSolarMJm2Dia: 18.19, lluviaMm: 7.5 },
      { temperaturaMaximaC: 21.3262, temperaturaMinimaC: -2.1838, humedadRelativaMediaPct: 74.33, vientoA2mMs: 2.07, radiacionSolarMJm2Dia: 19.05, lluviaMm: 7.5 },
      { temperaturaMaximaC: 21.7862, temperaturaMinimaC: -1.4938, humedadRelativaMediaPct: 73.05, vientoA2mMs: 2.39, radiacionSolarMJm2Dia: 19.55, lluviaMm: 12.5 },
      { temperaturaMaximaC: 21.7862, temperaturaMinimaC: 0.3462, humedadRelativaMediaPct: 73.76, vientoA2mMs: 2.63, radiacionSolarMJm2Dia: 17.9, lluviaMm: 35 },
      { temperaturaMaximaC: 24.3462, temperaturaMinimaC: 2.4262, humedadRelativaMediaPct: 73.26, vientoA2mMs: 2.45, radiacionSolarMJm2Dia: 18.41, lluviaMm: 65 },
      { temperaturaMaximaC: 24.0662, temperaturaMinimaC: 2.5462, humedadRelativaMediaPct: 73.65, vientoA2mMs: 2.19, radiacionSolarMJm2Dia: 19.19, lluviaMm: 65 },
      { temperaturaMaximaC: 24.0462, temperaturaMinimaC: 3.5762, humedadRelativaMediaPct: 76.09, vientoA2mMs: 2.1, radiacionSolarMJm2Dia: 17.09, lluviaMm: 100 },
    ],
    et0MmDia: [3.3372, 3.0949, 2.9367, 3.0160, 2.9248, 2.8222, 2.9436, 3.1822, 3.1708, 3.4913, 3.6304, 3.3127],
    suelo: { arenaPct: 37.20, arcillaPct: 23.11, ph: 6.35 },
    fuente: { lat: -10.37849, lon: -76.43815, cotaMsnm: 3516, caudalLps: 1.5, horasDisponiblesDia: 12, conductividadDsM: 0.3 },
  },
  pascoValle: {
    nombre: 'Pasco, valle a 2936 m',
    centroide: { lat: -10.27499, lon: -75.81969 },
    altitudM: 2935.7,
    pendienteMediaPct: 30.70,
    areaHa: 0.9855,
    normales: [
      { temperaturaMaximaC: 20.8749, temperaturaMinimaC: 5.3349, humedadRelativaMediaPct: 83.14, vientoA2mMs: 1.04, radiacionSolarMJm2Dia: 14.28, lluviaMm: 180 },
      { temperaturaMaximaC: 20.5349, temperaturaMinimaC: 6.2549, humedadRelativaMediaPct: 84.45, vientoA2mMs: 1.01, radiacionSolarMJm2Dia: 13.26, lluviaMm: 180 },
      { temperaturaMaximaC: 20.6249, temperaturaMinimaC: 5.1549, humedadRelativaMediaPct: 84.17, vientoA2mMs: 0.97, radiacionSolarMJm2Dia: 13.98, lluviaMm: 180 },
      { temperaturaMaximaC: 20.4049, temperaturaMinimaC: 4.2149, humedadRelativaMediaPct: 82, vientoA2mMs: 0.94, radiacionSolarMJm2Dia: 14.92, lluviaMm: 100 },
      { temperaturaMaximaC: 20.1949, temperaturaMinimaC: 3.4649, humedadRelativaMediaPct: 81.07, vientoA2mMs: 0.93, radiacionSolarMJm2Dia: 14.51, lluviaMm: 35 },
      { temperaturaMaximaC: 20.3549, temperaturaMinimaC: 3.4649, humedadRelativaMediaPct: 79.03, vientoA2mMs: 0.93, radiacionSolarMJm2Dia: 14.47, lluviaMm: 12.5 },
      { temperaturaMaximaC: 19.9249, temperaturaMinimaC: 1.2949, humedadRelativaMediaPct: 76.57, vientoA2mMs: 0.96, radiacionSolarMJm2Dia: 15.21, lluviaMm: 12.5 },
      { temperaturaMaximaC: 21.0549, temperaturaMinimaC: 1.6049, humedadRelativaMediaPct: 73.88, vientoA2mMs: 1.02, radiacionSolarMJm2Dia: 16.12, lluviaMm: 17.5 },
      { temperaturaMaximaC: 22.1149, temperaturaMinimaC: 3.9849, humedadRelativaMediaPct: 74.86, vientoA2mMs: 1.09, radiacionSolarMJm2Dia: 15.7, lluviaMm: 35 },
      { temperaturaMaximaC: 22.4749, temperaturaMinimaC: 5.9449, humedadRelativaMediaPct: 77.03, vientoA2mMs: 1.09, radiacionSolarMJm2Dia: 16.04, lluviaMm: 140 },
      { temperaturaMaximaC: 22.3749, temperaturaMinimaC: 5.4749, humedadRelativaMediaPct: 79.8, vientoA2mMs: 1.04, radiacionSolarMJm2Dia: 15.96, lluviaMm: 100 },
      { temperaturaMaximaC: 20.9749, temperaturaMinimaC: 6.5549, humedadRelativaMediaPct: 82.56, vientoA2mMs: 1.03, radiacionSolarMJm2Dia: 14.28, lluviaMm: 180 },
    ],
    et0MmDia: [2.6528, 2.4753, 2.5367, 2.5602, 2.3716, 2.3050, 2.4181, 2.6621, 2.8000, 2.9673, 2.9674, 2.6775],
    suelo: { arenaPct: 38.13, arcillaPct: 31.23, ph: 5.5 },
    fuente: { lat: -10.28071, lon: -75.81388, cotaMsnm: 3052, caudalLps: 2, horasDisponiblesDia: 12, conductividadDsM: 0.3 },
  },
  mantaroOeste: {
    nombre: 'Valle del Mantaro, 3175 m',
    centroide: { lat: -12.12154, lon: -75.24893 },
    altitudM: 3174.6,
    pendienteMediaPct: 5.59,
    areaHa: 0.5923,
    normales: [
      { temperaturaMaximaC: 23.5472, temperaturaMinimaC: 4.9372, humedadRelativaMediaPct: 78.04, vientoA2mMs: 2.18, radiacionSolarMJm2Dia: 18.94, lluviaMm: 100 },
      { temperaturaMaximaC: 22.8472, temperaturaMinimaC: 5.0972, humedadRelativaMediaPct: 79.93, vientoA2mMs: 2.14, radiacionSolarMJm2Dia: 17.41, lluviaMm: 140 },
      { temperaturaMaximaC: 22.9872, temperaturaMinimaC: 3.8572, humedadRelativaMediaPct: 80.93, vientoA2mMs: 2.1, radiacionSolarMJm2Dia: 17.11, lluviaMm: 100 },
      { temperaturaMaximaC: 24.3872, temperaturaMinimaC: 3.7172, humedadRelativaMediaPct: 78.97, vientoA2mMs: 2.01, radiacionSolarMJm2Dia: 18.76, lluviaMm: 35 },
      { temperaturaMaximaC: 23.3772, temperaturaMinimaC: 0.8572, humedadRelativaMediaPct: 76.36, vientoA2mMs: 1.9, radiacionSolarMJm2Dia: 19.69, lluviaMm: 12.5 },
      { temperaturaMaximaC: 22.9072, temperaturaMinimaC: 0.4772, humedadRelativaMediaPct: 74.94, vientoA2mMs: 1.91, radiacionSolarMJm2Dia: 19.4, lluviaMm: 7.5 },
      { temperaturaMaximaC: 23.9772, temperaturaMinimaC: -0.6028, humedadRelativaMediaPct: 73.2, vientoA2mMs: 2, radiacionSolarMJm2Dia: 20.08, lluviaMm: 7.5 },
      { temperaturaMaximaC: 23.6972, temperaturaMinimaC: -0.1628, humedadRelativaMediaPct: 71.43, vientoA2mMs: 2.21, radiacionSolarMJm2Dia: 21.04, lluviaMm: 12.5 },
      { temperaturaMaximaC: 23.7472, temperaturaMinimaC: 2.0472, humedadRelativaMediaPct: 72.26, vientoA2mMs: 2.43, radiacionSolarMJm2Dia: 20.2, lluviaMm: 35 },
      { temperaturaMaximaC: 25.6872, temperaturaMinimaC: 4.2672, humedadRelativaMediaPct: 72.85, vientoA2mMs: 2.39, radiacionSolarMJm2Dia: 21.23, lluviaMm: 65 },
      { temperaturaMaximaC: 24.8872, temperaturaMinimaC: 4.6572, humedadRelativaMediaPct: 73.96, vientoA2mMs: 2.27, radiacionSolarMJm2Dia: 22.05, lluviaMm: 65 },
      { temperaturaMaximaC: 25.8572, temperaturaMinimaC: 5.0972, humedadRelativaMediaPct: 77.04, vientoA2mMs: 2.18, radiacionSolarMJm2Dia: 18.98, lluviaMm: 100 },
    ],
    et0MmDia: [3.5471, 3.2239, 3.0836, 3.2562, 3.1852, 3.0030, 3.1960, 3.5028, 3.5979, 3.9758, 4.0933, 3.6714],
    suelo: { arenaPct: 40.20, arcillaPct: 30.20, ph: 6.7 },
    fuente: { lat: -12.12070, lon: -75.25537, cotaMsnm: 3223, caudalLps: 2, horasDisponiblesDia: 12, conductividadDsM: 0.3 },
  },
  mantaroEste: {
    nombre: 'Valle del Mantaro, 3258 m',
    centroide: { lat: -12.13132, lon: -75.17564 },
    altitudM: 3257.7,
    pendienteMediaPct: 5.84,
    areaHa: 0.5923,
    normales: [
      { temperaturaMaximaC: 23.0075, temperaturaMinimaC: 4.3975, humedadRelativaMediaPct: 78.04, vientoA2mMs: 2.18, radiacionSolarMJm2Dia: 18.94, lluviaMm: 140 },
      { temperaturaMaximaC: 22.3075, temperaturaMinimaC: 4.5575, humedadRelativaMediaPct: 79.93, vientoA2mMs: 2.14, radiacionSolarMJm2Dia: 17.41, lluviaMm: 140 },
      { temperaturaMaximaC: 22.4475, temperaturaMinimaC: 3.3175, humedadRelativaMediaPct: 80.93, vientoA2mMs: 2.1, radiacionSolarMJm2Dia: 17.11, lluviaMm: 100 },
      { temperaturaMaximaC: 23.8475, temperaturaMinimaC: 3.1775, humedadRelativaMediaPct: 78.97, vientoA2mMs: 2.01, radiacionSolarMJm2Dia: 18.76, lluviaMm: 35 },
      { temperaturaMaximaC: 22.8375, temperaturaMinimaC: 0.3175, humedadRelativaMediaPct: 76.36, vientoA2mMs: 1.9, radiacionSolarMJm2Dia: 19.69, lluviaMm: 12.5 },
      { temperaturaMaximaC: 22.3675, temperaturaMinimaC: -0.0625, humedadRelativaMediaPct: 74.94, vientoA2mMs: 1.91, radiacionSolarMJm2Dia: 19.4, lluviaMm: 7.5 },
      { temperaturaMaximaC: 23.4375, temperaturaMinimaC: -1.1425, humedadRelativaMediaPct: 73.2, vientoA2mMs: 2, radiacionSolarMJm2Dia: 20.08, lluviaMm: 7.5 },
      { temperaturaMaximaC: 23.1575, temperaturaMinimaC: -0.7025, humedadRelativaMediaPct: 71.43, vientoA2mMs: 2.21, radiacionSolarMJm2Dia: 21.04, lluviaMm: 12.5 },
      { temperaturaMaximaC: 23.2075, temperaturaMinimaC: 1.5075, humedadRelativaMediaPct: 72.26, vientoA2mMs: 2.43, radiacionSolarMJm2Dia: 20.2, lluviaMm: 35 },
      { temperaturaMaximaC: 25.1475, temperaturaMinimaC: 3.7275, humedadRelativaMediaPct: 72.85, vientoA2mMs: 2.39, radiacionSolarMJm2Dia: 21.23, lluviaMm: 65 },
      { temperaturaMaximaC: 24.3475, temperaturaMinimaC: 4.1175, humedadRelativaMediaPct: 73.96, vientoA2mMs: 2.27, radiacionSolarMJm2Dia: 22.05, lluviaMm: 65 },
      { temperaturaMaximaC: 25.3175, temperaturaMinimaC: 4.5575, humedadRelativaMediaPct: 77.04, vientoA2mMs: 2.18, radiacionSolarMJm2Dia: 18.98, lluviaMm: 100 },
    ],
    et0MmDia: [3.5049, 3.1858, 3.0464, 3.2159, 3.1433, 2.9621, 3.1518, 3.4547, 3.5496, 3.9259, 4.0436, 3.6283],
    suelo: { arenaPct: 39.53, arcillaPct: 33.12, ph: 6.65 },
    fuente: { lat: -12.12560, lon: -75.16979, cotaMsnm: 3292, caudalLps: 1.5, horasDisponiblesDia: 12, conductividadDsM: 0.3 },
  },
} satisfies Record<string, LugarReal>
