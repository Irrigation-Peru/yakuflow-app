import type { RiegoDeLaEtapa } from '@riego/calculo'
import { diaDelCalendario } from './formato.ts'

// Cómo se lee el plan de riego por etapa, en el paso 8 y en el informe en PDF: los mismos textos en los dos lados.

/** Lo que explica la tabla, con el intervalo del diseño. */
export const notaDelPlan = (intervaloDeDisenoDias: number) =>
  `Se riega cada ${intervaloDeDisenoDias} ${intervaloDeDisenoDias === 1 ? 'día' : 'días'}, la frecuencia del diseño, y en cada etapa cambia lo que dura el riego según lo que el cultivo consume; si la raíz aún es corta, se riega más seguido. «Si no llueve» es la frecuencia en una racha seca; «en un año normal», los riegos que hacen falta con la lluvia de siempre.`

/** Cada cuántos días regar si no llueve, y hasta cuándo si hay corte antes de la cosecha. */
export const frecuenciaDeLaEtapa = (e: RiegoDeLaEtapa) =>
  e.intervaloDias === null ? 'Sin riego' : `Cada ${e.intervaloDias} d${e.ultimoRiego ? `, hasta el ${diaDelCalendario(e.ultimoRiego)}` : ''}`

/** Lo que dura cada riego en la etapa. */
export const duracionDeLaEtapa = (e: RiegoDeLaEtapa) =>
  e.intervaloDias === null || e.tiempoDeRiegoH === undefined ? '—' : `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(e.tiempoDeRiegoH)} h`

/** Los riegos de un año normal; si la lluvia cubre la etapa, se dice. */
export const riegosDeLaEtapa = (e: RiegoDeLaEtapa) => (e.soloSiNoLlueve ? '0 · alcanza la lluvia' : String(e.riegos))
