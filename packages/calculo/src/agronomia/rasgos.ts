// Lo que el modelo de cultivos mira del lugar (HU0011): suelo, clima, altitud y agua. La aplicación y el
// entrenamiento sacan los rasgos de esta misma función, para que el modelo reciba siempre lo mismo que aprendió.

import { aptitudDelCultivo, TEXTURA_GRUESA, type LugarDelCultivo } from './aptitud'
import type { Cultivo, TexturaGruesa } from './cultivo'
import { demandaDeLaCampana } from './demanda'
import { aguaDisponibleDeLaFuente } from './fuente'

export const RASGOS_DEL_LUGAR = [
  'altitudM',
  'temperaturaMediaAnualC',
  'minimaDelMesMasFrioC',
  'et0MediaMmDia',
  'lluviaAnualMm',
  'ofertaDeAguaMmDia',
  'conductividadDelAguaDsM',
  'phDelSuelo',
  'texturaGruesa',
] as const

export type RasgoDelLugar = (typeof RASGOS_DEL_LUGAR)[number]

/**
 * Con qué se completa lo que el estudiante no midió: el agua sin conductividad medida se toma como agua sin sales, y
 * el suelo sin pH, como neutro. La aptitud, en cambio, no evalúa esas condiciones.
 */
export const VALOR_SIN_DATO = { conductividadDelAguaDsM: 0, phDelSuelo: 6.5 } as const

const ORDEN_DE_TEXTURA: Readonly<Record<TexturaGruesa, number>> = { ligera: 0, media: 1, pesada: 2 }
const M3_HA_POR_MM = 10

/** El clima del año en cinco cifras: lo que el modelo de cultivos mira y lo que el estudiante ve del lugar. */
export function resumenDelClima({ normales, clima }: Pick<LugarDelCultivo, 'normales' | 'clima'>) {
  const minimas = normales.map((m) => m.temperaturaMinimaC)
  const minimaDelMesMasFrioC = Math.min(...minimas)
  return {
    temperaturaMediaAnualC: normales.reduce((s, m) => s + (m.temperaturaMaximaC + m.temperaturaMinimaC) / 2, 0) / 12,
    minimaDelMesMasFrioC,
    /** De 1 (enero) a 12. */
    mesMasFrio: minimas.indexOf(minimaDelMesMasFrioC) + 1,
    et0MediaMmDia: clima.reduce((s, c) => s + c.et0MmDia, 0) / 12,
    lluviaAnualMm: clima.reduce((s, c) => s + c.lluviaMm, 0),
  }
}

export function rasgosDelLugar({ altitudM, normales, clima, suelo, fuente, areaHa }: LugarDelCultivo): number[] {
  const resumen = resumenDelClima({ normales, clima })
  const { m3PorDia } = aguaDisponibleDeLaFuente({ caudalLps: fuente.caudalLps, horasDeRiegoPorDia: fuente.horasDisponiblesDia })
  return [
    altitudM,
    resumen.temperaturaMediaAnualC,
    resumen.minimaDelMesMasFrioC,
    resumen.et0MediaMmDia,
    resumen.lluviaAnualMm,
    m3PorDia / (areaHa * M3_HA_POR_MM),
    fuente.conductividadDsM ?? VALOR_SIN_DATO.conductividadDelAguaDsM,
    suelo.ph ?? VALOR_SIN_DATO.phDelSuelo,
    ORDEN_DE_TEXTURA[TEXTURA_GRUESA[suelo.clase]],
  ]
}

/** Año de referencia para probar las fechas de siembra: no bisiesto, como el año medio de las normales. */
const ANIO_DE_REFERENCIA = 2027

/**
 * La siembra del día 1 de cada mes con mayor aptitud para el cultivo. A igual aptitud, la que pide menos riego en la
 * campaña. Es la fecha que se propone para un cultivo del catálogo; la de un cultivo sugerido es el mes que sugiere el
 * modelo, que aprende de lo que se siembra en la ENA 2024.
 */
export function mejorFechaDeSiembra({ cultivo, lugar }: { cultivo: Cultivo; lugar: LugarDelCultivo }) {
  // Entre los meses igual de aptos gana el que pide menos riego en la campaña: el que acompaña a las lluvias, como el
  // calendario agrícola de la sierra. Sin este desempate ganaba siempre el primero, enero.
  let mejor = { fechaSiembra: '', indice: -1, riegoMm: Infinity }
  for (let mes = 1; mes <= 12; mes++) {
    const fechaSiembra = `${ANIO_DE_REFERENCIA}-${String(mes).padStart(2, '0')}-01`
    const { indice } = aptitudDelCultivo({ cultivo, fechaSiembra, lugar })
    const riegoMm = demandaDeLaCampana({ cultivo, fechaSiembra, clima: lugar.clima }).totalNetaMm
    if (indice > mejor.indice || (indice === mejor.indice && riegoMm < mejor.riegoMm)) mejor = { fechaSiembra, indice, riegoMm }
  }
  return { fechaSiembra: mejor.fechaSiembra, indice: mejor.indice }
}
