import { FRACCION_MINIMA_DE_AREA, type AjusteDelBalance } from '@riego/calculo'
import type { AguaDeLaCampana } from './calculo/campana.ts'
import { cifra, conDecimales } from './formato.ts'

// Cómo se lee el balance del paso 3 (HU0013 y HU0014): el veredicto y las salidas cuando la fuente no alcanza. Los
// números salen del módulo de cálculo; aquí solo se escriben.

type Balance = AguaDeLaCampana['balance']

// Con dos decimales: con fuentes de décimas de litro, a un decimal «pide 0.4 y da 0.4» no deja ver que falta.
const lps = (valor: number) => `${conDecimales(valor, 2)} l/s`
const semanas = (n: number) => `${n} ${n === 1 ? 'semana' : 'semanas'}`

/**
 * El veredicto en dos tiempos: lo que pide la semana de más riego con la lluvia de un año normal, y lo que consume la de
 * más consumo si no llueve, que es con lo que se diseña el riego (paso 4). La fuente tiene que dar lo segundo.
 */
export function veredictoDelBalance(b: Balance, sinLluvia?: { semana: number; lps: number }) {
  const conLluviaLps = b.necesidadPicoConLluviaLps ?? b.necesidadPicoLps
  const secoLps = sinLluvia?.lps ?? b.necesidadPicoLps
  const pesaLaLluvia = secoLps > conLluviaLps * (1 + 1e-9)
  const conLluvia = pesaLaLluvia
    ? `Con la lluvia de un año normal, la semana ${b.semanaCritica} es la que más riego pide: ${lps(conLluviaLps)}.`
    : `La semana ${b.semanaCritica} es la que más riego pide: ${lps(conLluviaLps)}.`
  const semanaSeca = sinLluvia?.semana ?? b.semanaCritica
  const seco = !pesaLaLluvia
    ? ''
    : semanaSeca === b.semanaCritica
      ? ` Si no llueve, esa misma semana consume ${lps(secoLps)}, y con eso se diseña el riego.`
      : ` Si no llueve, la semana ${semanaSeca} consume ${lps(secoLps)}, y con eso se diseña el riego.`
  const fuente = ` Tu fuente da ${lps(b.caudalLps)}`
  const sinCubrir = b.semanasSinCubrir.length
  if (b.alcanza === 'si') {
    const conReservorio = Math.max(conLluviaLps, secoLps) > b.caudalLps
    return {
      titulo: 'Alcanza',
      texto: `${conLluvia}${seco}${fuente}${conReservorio ? '; lo que falta lo pone el reservorio.' : pesaLaLluvia ? ': alcanza también si no llueve.' : ': alcanza para todas las semanas.'}`,
    }
  }
  const falta =
    sinCubrir > 0
      ? `. Faltan ${lps(Math.max(conLluviaLps, secoLps) - b.caudalLps)}, y aun con la lluvia de un año normal hay ${semanas(sinCubrir)} en que el agua no alcanza.`
      : `: alcanza en un año normal, pero en una racha seca faltan ${lps(secoLps - b.caudalLps)}.`
  return b.alcanza === 'parcial'
    ? { titulo: 'Alcanza a medias', texto: `${conLluvia}${seco}${fuente}${falta}` }
    : { titulo: 'No alcanza', texto: `${conLluvia}${seco}${fuente}${falta} Ninguna de las salidas lo resuelve: vuelve a elegir el cultivo o la fecha de siembra.` }
}

export type SalidaDelBalance = AjusteDelBalance['tipo']

export interface OpcionDelBalance {
  tipo: SalidaDelBalance
  titulo: string
  detalle: string
  ajuste: AjusteDelBalance | null
  /** Solo en los turnos: de los menos que cubren la campaña a los más que caben en el día. */
  rangoDeTurnos?: { minimo: number; maximo: number }
}

const MOTIVO_DE_LOS_TURNOS = {
  fuente_por_horas: 'La fuente llega por turno de riego: no da más horas de agua.',
  sin_horas_libres: 'Ya tienes el agua las 24 horas: no quedan horas para otro turno.',
  no_caben_en_el_dia: 'Harían falta más turnos de los que caben en un día.',
} as const

/**
 * Las tres salidas, viables o no; las que no lo son dicen por qué. Se evalúan sobre el balance sin ajustar. En los
 * turnos, el estudiante puede pedir más de los que propone el módulo, hasta los que caben en el día.
 */
export function opcionesDelBalance(b: Balance, horasDeLaFuente: number, areaHa: number, turnosElegidos?: number): OpcionDelBalance[] {
  const { turnos, reservorio, menosArea } = b.ajustes
  const n = turnos.viable ? Math.min(turnos.turnosMaximos, Math.max(turnos.turnos, turnosElegidos ?? turnos.turnos)) : 0
  return [
    turnos.viable
      ? {
          tipo: 'turnos',
          titulo: `Regar en ${n} turnos`,
          detalle: `Tu fuente corre todo el día: con ${n} turnos de ${cifra(horasDeLaFuente, 1)} h riegas ${cifra(n * horasDeLaFuente, 1)} h al día en lugar de ${cifra(horasDeLaFuente, 1)}.`,
          ajuste: { tipo: 'turnos', turnos: n },
          rangoDeTurnos: { minimo: turnos.turnos, maximo: turnos.turnosMaximos },
        }
      : { tipo: 'turnos', titulo: 'Regar por turnos', detalle: MOTIVO_DE_LOS_TURNOS[turnos.motivo], ajuste: null },
    reservorio.viable
      ? {
          tipo: 'reservorio',
          titulo: `Un reservorio de ${conDecimales(reservorio.volumenM3, 0)} m³`,
          detalle: 'Guarda el agua que sobra al inicio de la campaña para usarla en las semanas de más demanda.',
          ajuste: { tipo: 'reservorio', volumenM3: reservorio.volumenM3 },
        }
      : { tipo: 'reservorio', titulo: 'Un reservorio', detalle: 'Falta agua desde las primeras semanas: el reservorio no tiene con qué llenarse.', ajuste: null },
    menosArea.viable
      ? {
          tipo: 'menos_area',
          titulo: `Regar solo ${conDecimales(menosArea.areaHa, 2)} ha`,
          detalle: `Es lo que tu fuente alcanza a cubrir de las ${conDecimales(areaHa, 2)} ha de la parcela.`,
          ajuste: { tipo: 'menos_area', areaHa: menosArea.areaHa },
        }
      : {
          tipo: 'menos_area',
          titulo: 'Regar menos área',
          detalle: `Alcanzaría para ${conDecimales(menosArea.areaHa, 2)} ha, menos del ${conDecimales(FRACCION_MINIMA_DE_AREA * 100, 0)} % de la parcela: sería otro proyecto.`,
          ajuste: null,
        },
  ]
}

/** Cuántas semanas quedaban sin cubrir y cuántas quedan con el ajuste. */
export const comparacionDelAjuste = (sinCubrirAntes: number, sinCubrirDespues: number) =>
  `Antes ${sinCubrirAntes === 1 ? 'quedaba 1 semana' : `quedaban ${sinCubrirAntes} semanas`} sin cubrir y ahora ${sinCubrirDespues === 0 ? 'ninguna' : sinCubrirDespues}`

/** Lo que pasó al aplicar el ajuste, en las mismas palabras de la pregunta de predicción. */
export function resultadoDelAjuste(sinCubrirAntes: number, sinCubrirDespues: number) {
  if (sinCubrirDespues === 0) return 'todas'
  return sinCubrirDespues < sinCubrirAntes ? 'algunas' : 'ninguna'
}

export const nombreDelAjuste = (a: AjusteDelBalance) =>
  a.tipo === 'turnos' ? `Con ${a.turnos} turnos` : a.tipo === 'reservorio' ? `Con el reservorio de ${conDecimales(a.volumenM3, 0)} m³` : `Con ${conDecimales(a.areaHa, 2)} ha`
