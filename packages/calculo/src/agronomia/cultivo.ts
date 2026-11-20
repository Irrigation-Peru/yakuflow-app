// Cultivo según el Estudio FAO Riego y Drenaje N.º 56 (Allen et al., 1998): cuatro etapas y un coeficiente
// de cultivo que es constante en la inicial y en la media, y varía en línea recta en las otras dos.

import type { MetodoDeRiego } from './diseno-agronomico'

export type Etapa = 'inicial' | 'desarrollo' | 'media' | 'final'

/** Las tres clases de textura de ECOCROP: ligera (arenosa), media (franca) y pesada (arcillosa). */
export type TexturaGruesa = 'ligera' | 'media' | 'pesada'

/** Un rango con su parte óptima: fuera de los extremos el cultivo no prospera; entre ellos, sí, pero rinde menos. */
export interface RangoConOptimo {
  minimo: number
  optimoMinimo: number
  optimoMaximo: number
  maximo: number
}

/** Lo que el cultivo pide del lugar. Son valores provisionales, por validar con el especialista. */
export interface RequisitosDelCultivo {
  /** Altitud por encima de la cual la helada impide el cultivo en los Andes, m.s.n.m. */
  altitudMaximaM: number
  /** Temperatura media de la campaña, °C. */
  temperaturaMediaC: RangoConOptimo
  /** Temperatura que mata al cultivo en crecimiento, °C. Sin dato, la helada no se evalúa. */
  temperaturaLetalC?: number
  ph: RangoConOptimo
  texturas: { optimas: readonly TexturaGruesa[]; posibles: readonly TexturaGruesa[] }
  /**
   * Salinidad del suelo que el cultivo tolera sin perder rendimiento (umbral, dS/m) y lo que pierde por cada
   * dS/m de más, % (FAO 56, tabla 23). Sin pérdida conocida, pasar el umbral lo deja fuera.
   */
  salinidad: { umbralDsM: number; perdidaPctPorDsM?: number }
  /** Métodos de riego con que se suele regar. */
  metodos: readonly MetodoDeRiego[]
  fuente: string
}

const ETAPAS: readonly Etapa[] = ['inicial', 'desarrollo', 'media', 'final']

export interface Cultivo {
  nombre: string
  /** Duración de cada etapa, en días (FAO 56, tabla 11). */
  etapas: Readonly<Record<Etapa, number>>
  /** Coeficiente de cultivo en la etapa inicial, en la media y al final del ciclo (FAO 56, tabla 12). */
  kc: { inicial: number; media: number; final: number }
  /** Profundidad radicular máxima efectiva, m (FAO 56, tabla 22). */
  profundidadRadicularM: { minima: number; maxima: number }
  /** Fracción de agotamiento sin estrés, p, válida para una ETc de unos 5 mm/día (FAO 56, tabla 22). */
  fraccionAgotamiento: number
  /** De dónde salen los valores. */
  fuente?: string
  requisitos?: RequisitosDelCultivo
  /**
   * Solo en los cultivos que se cosechan secos o con el follaje muerto (papa, granos secos): su etapa final es la
   * maduración, en la que el rendimiento casi no responde al agua (FAO 33, Doorenbos y Kassam, 1979: factor de
   * respuesta Ky bajo en la maduración). En ella el riego no se diseña: se riega a lo más lo de la semana crítica de
   * las etapas anteriores, y se deja de regar `corteDelRiegoDias` antes de la cosecha. Valor provisional, por
   * validar con el especialista. Sin este dato, la etapa final se riega como las demás.
   */
  maduracion?: { corteDelRiegoDias: number }
}

/** Día del ciclo desde el que ya no se riega: el siguiente al último riego. Sin maduración, después del ciclo. */
export function primerDiaSinRiego(cultivo: Cultivo) {
  return duracionDelCiclo(cultivo) - (cultivo.maduracion?.corteDelRiegoDias ?? 0) + 1
}

export function duracionDelCiclo(cultivo: Cultivo) {
  return ETAPAS.reduce((suma, etapa) => suma + cultivo.etapas[etapa], 0)
}

function comprobarDia(cultivo: Cultivo, dia: number) {
  const duracion = duracionDelCiclo(cultivo)
  if (!Number.isInteger(dia) || dia < 1 || dia > duracion) {
    throw new Error(`El día ${dia} está fuera del ciclo del cultivo, que va del día 1 al ${duracion}`)
  }
}

/** Etapa en la que está el cultivo el día `dia` del ciclo, contado desde 1. */
export function etapaDelDia(cultivo: Cultivo, dia: number): Etapa {
  comprobarDia(cultivo, dia)
  let fin = 0
  for (const etapa of ETAPAS) {
    fin += cultivo.etapas[etapa]
    if (dia <= fin) return etapa
  }
  return 'final'
}

/**
 * Coeficiente de cultivo del día `dia` (FAO 56, ecuación 66):
 * Kc = Kc anterior + (día − días de las etapas previas) / días de la etapa · (Kc siguiente − Kc anterior).
 */
export function coeficienteDeCultivo(cultivo: Cultivo, dia: number) {
  const etapa = etapaDelDia(cultivo, dia)
  const { inicial, desarrollo, media } = cultivo.etapas
  const { kc } = cultivo
  switch (etapa) {
    case 'inicial':
      return kc.inicial
    case 'desarrollo':
      return kc.inicial + ((dia - inicial) / desarrollo) * (kc.media - kc.inicial)
    case 'media':
      return kc.media
    case 'final':
      return kc.media + ((dia - inicial - desarrollo - media) / cultivo.etapas.final) * (kc.final - kc.media)
  }
}
