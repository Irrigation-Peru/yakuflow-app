import type { Etapa } from './cultivo'
import type { DiaDeCampana } from './demanda'

// El plan de riego por etapa, para el informe (HU0028). El sistema se dimensiona para la semana de mayor consumo (CE8) y
// se opera como en el campo: la frecuencia se mantiene —la del diseño— y lo que cambia de una etapa a otra es cuánto dura
// cada riego, según lo que el cultivo consume en ella. Si la raíz todavía es corta y no guarda el agua de un intervalo, se
// riega más seguido. Así ninguna etapa se riega menos seguido que lo que dice el diseño.
//
// Lo que se hacía antes, y no debe volver:
// - dividir la lámina entre la demanda que queda descontada la lluvia media: daba «cada 101 d» en una etapa de 35;
// - dividir la lámina del diseño entre el poco consumo de las primeras etapas: daba «cada 185 d» en una cebada recién
//   sembrada, con una lámina de raíz adulta sobre una plántula.
// En cada etapa se dicen dos cosas: cada cuántos días regar si no llueve, y cuántos riegos pide un año normal, con la
// lluvia de siempre. La lluvia no cae pareja: entre aguaceros hay rachas secas en que el cultivo sigue consumiendo.
//
// La raíz mide unos 0.15 a 0.20 m al sembrar y crece hasta su profundidad máxima al empezar la etapa media (FAO 56,
// cap. 8): el agua que guarda crece con ella.

/** Profundidad de la raíz al sembrar, m (FAO 56, cap. 8: de 0.15 a 0.20 m). */
export const PROFUNDIDAD_DE_LA_RAIZ_AL_SEMBRAR_M = 0.2

export interface RaizDelCultivo {
  /** El agua fácilmente aprovechable del suelo por metro de raíz, mm/m: la del diseño sobre su profundidad. */
  aguaFacilMmPorM: number
  profundidadMaximaM: number
  /** Día del ciclo en que la raíz llega a su profundidad máxima: el primero de la etapa media. */
  diaDeRaizMaxima: number
}

/** Profundidad de la raíz el día `dia`: crece en línea recta desde la siembra hasta el inicio de la etapa media. */
export function profundidadDeLaRaiz(dia: number, raiz: Pick<RaizDelCultivo, 'profundidadMaximaM' | 'diaDeRaizMaxima'>) {
  const inicial = Math.min(PROFUNDIDAD_DE_LA_RAIZ_AL_SEMBRAR_M, raiz.profundidadMaximaM)
  const avance = Math.min(1, Math.max(0, (dia - 1) / Math.max(1, raiz.diaDeRaizMaxima - 1)))
  return inicial + (raiz.profundidadMaximaM - inicial) * avance
}

export interface RiegoDeLaEtapa {
  etapa: Etapa
  desde: string
  hasta: string
  dias: number
  /** Lo que el cultivo consume en la etapa (ETc), mm/día, en los días que se riega. */
  consumoMedioMmDia: number
  /** La lluvia efectiva de un año normal, mm/día. */
  lluviaEfectivaMediaMmDia: number
  /** Lo que queda por regar en un año normal: el consumo menos la lluvia, mm/día. */
  demandaNetaMediaMmDia: number
  /** La lámina neta de cada riego en la etapa: lo que el cultivo consume entre dos riegos, mm. */
  laminaNetaMm: number
  /** Lo que dura cada riego en la etapa, h: el del diseño en proporción a la lámina. */
  tiempoDeRiegoH?: number
  /** Cada cuántos días se riega si no llueve; `null` si en la etapa no se riega (el corte antes de la cosecha). */
  intervaloDias: number | null
  /** Los riegos que pide la etapa en un año normal, con la lluvia de siempre. */
  riegos: number
  /** En un año normal la lluvia cubre la etapa: el riego queda para las rachas secas. */
  soloSiNoLlueve: boolean
  aguaNetaMm: number
  /** En la maduración de la papa y los granos secos: el último día con riego, antes del corte. */
  ultimoRiego?: string
}

export function planDeRiegoPorEtapa({
  dias,
  laminaNetaMm,
  intervaloDeDisenoDias,
  tiempoDeRiegoDelDisenoH,
  raiz,
}: {
  dias: readonly DiaDeCampana[]
  laminaNetaMm: number
  /** El intervalo del diseño, el de la semana de mayor consumo: ninguna etapa se riega menos seguido. */
  intervaloDeDisenoDias?: number
  /** Lo que dura un riego del diseño, h: con él se dice cuánto dura en cada etapa. */
  tiempoDeRiegoDelDisenoH?: number
  /** Cómo crece la raíz; sin ella, todas las etapas se riegan con la lámina del diseño. */
  raiz?: RaizDelCultivo
}): RiegoDeLaEtapa[] {
  if (!(laminaNetaMm > 0)) throw new Error('La lámina neta del diseño tiene que ser positiva')
  const etapas: DiaDeCampana[][] = []
  for (const dia of dias) {
    const ultima = etapas.at(-1)
    if (ultima?.[0]?.etapa === dia.etapa) ultima.push(dia)
    else etapas.push([dia])
  }
  const media = (lista: readonly DiaDeCampana[], campo: 'etcMm' | 'lluviaEfectivaMm' | 'demandaNetaMm') =>
    lista.length === 0 ? 0 : lista.reduce((s, d) => s + d[campo], 0) / lista.length
  return etapas.map((delaEtapa) => {
    const aguaNetaMm = delaEtapa.reduce((suma, d) => suma + d.demandaNetaMm, 0)
    // Los días después del corte del riego no cuentan: en ellos no se riega aunque el cultivo consuma.
    const conRiego = delaEtapa.filter((d) => d.riego !== 'suspendido')
    const consumoMedioMmDia = media(conRiego, 'etcMm')
    const raizMediaM = raiz && conRiego.length > 0 ? conRiego.reduce((s, d) => s + profundidadDeLaRaiz(d.dia, raiz), 0) / conRiego.length : Infinity
    // Lo más que un riego puede llevar en la etapa: lo que guarda la raíz de ese momento, y nunca más que el del diseño.
    const laminaMaximaMm = Math.min(laminaNetaMm, raiz ? raiz.aguaFacilMmPorM * raizMediaM : Infinity)
    const cuantosDias = (lamina: number) => Math.max(1, Math.floor((lamina / consumoMedioMmDia) * (1 + 1e-12)))
    const intervaloDias =
      conRiego.length === 0 || !(consumoMedioMmDia > 0)
        ? null
        : Math.min(intervaloDeDisenoDias ?? cuantosDias(laminaMaximaMm), cuantosDias(laminaMaximaMm))
    // La lámina repone lo que el cultivo consume entre dos riegos; si consume poco, el riego dura menos.
    const laminaDeLaEtapaMm = intervaloDias === null ? laminaMaximaMm : Math.min(laminaMaximaMm, consumoMedioMmDia * intervaloDias)
    const riegos = laminaDeLaEtapaMm > 0 ? Math.ceil((aguaNetaMm / laminaDeLaEtapaMm) * (1 - 1e-12)) : 0
    const hayCorte = conRiego.length < delaEtapa.length
    return {
      ...(hayCorte ? { ultimoRiego: conRiego.at(-1)?.fecha ?? delaEtapa[0]!.fecha } : {}),
      etapa: delaEtapa[0]!.etapa,
      desde: delaEtapa[0]!.fecha,
      hasta: delaEtapa.at(-1)!.fecha,
      dias: delaEtapa.length,
      consumoMedioMmDia,
      lluviaEfectivaMediaMmDia: media(delaEtapa, 'lluviaEfectivaMm'),
      demandaNetaMediaMmDia: media(conRiego, 'demandaNetaMm'),
      laminaNetaMm: laminaDeLaEtapaMm,
      ...(tiempoDeRiegoDelDisenoH === undefined ? {} : { tiempoDeRiegoH: (tiempoDeRiegoDelDisenoH * laminaDeLaEtapaMm) / laminaNetaMm }),
      intervaloDias,
      riegos,
      soloSiNoLlueve: intervaloDias !== null && riegos === 0,
      aguaNetaMm,
    }
  })
}
