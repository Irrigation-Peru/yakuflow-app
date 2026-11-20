// Balance hídrico de la campaña: lo que el cultivo pide cada semana contra lo que la fuente da. Cuando no alcanza,
// se evalúan tres salidas: regar por turnos más horas al día, guardar en un reservorio lo que sobra al principio, o
// regar menos área. Si ninguna sirve, hay que volver a elegir el cultivo.

import type { SemanaDeCampana } from './demanda'

const M3_POR_HORA_POR_LPS = 3.6
const M3_HA_POR_MM = 10
const HORAS_DEL_DIA = 24

/**
 * Lo que en papel da justo no puede quedar corto por redondeo: el reservorio y el área que propone el módulo se
 * calculan al filo, y al aplicarlos la oferta se compara con la necesidad con una parte en un billón de holgura.
 */
const HOLGURA = 1e-12
const alcanzaPara = (ofertaM3: number, necesidadM3: number) => ofertaM3 >= necesidadM3 * (1 - HOLGURA)

/**
 * Parte de la parcela por debajo de la cual regar menos área deja de ser una salida: el proyecto sería otro.
 * Valor provisional, por validar con el especialista.
 */
export const FRACCION_MINIMA_DE_AREA = 0.5

export type TipoDeFuente = 'canal' | 'manantial' | 'reservorio'

export type AjusteDelBalance =
  | { tipo: 'turnos'; turnos: number }
  | { tipo: 'reservorio'; volumenM3: number }
  | { tipo: 'menos_area'; areaHa: number }

export interface SemanaDelBalance {
  semana: number
  dias: number
  /** Necesidad bruta: la demanda neta sobre la eficiencia de aplicación, m³. */
  necesidadM3: number
  ofertaM3: number
  /** La necesidad expresada como caudal durante las horas de riego, l/s: se compara con el de la fuente. */
  necesidadLps: number
  /** Agua en el reservorio al final de la semana, m³; solo con el reservorio aplicado. */
  almacenadoM3?: number
  cubre: boolean
}

type NoViable<M extends string> = { viable: false; motivo: M }

export function balanceHidrico({
  semanas,
  areaHa,
  eficiencia,
  fuente,
  ajuste,
  demandaDeDisenoMmDia,
}: {
  semanas: readonly SemanaDeCampana[]
  areaHa: number
  eficiencia: number
  fuente: { tipo: TipoDeFuente; caudalLps: number; horasDisponiblesDia: number }
  ajuste?: AjusteDelBalance
  /**
   * La demanda con que el paso 4 dimensiona el riego, mm/día: el consumo pico del cultivo sin descontar la lluvia, que no
   * cae pareja (demandaDeDiseno). Con ella se comprueba la capacidad de la fuente en la semana crítica, para que lo que
   * el paso 3 da por alcanzado se pueda regar en el paso 4. Sin ella, solo la demanda neta.
   */
  demandaDeDisenoMmDia?: number
}) {
  if (semanas.length === 0) throw new Error('La campaña no tiene semanas')
  const area = ajuste?.tipo === 'menos_area' ? ajuste.areaHa : areaHa
  const horas = ajuste?.tipo === 'turnos' ? ajuste.turnos * fuente.horasDisponiblesDia : fuente.horasDisponiblesDia
  if (horas > HORAS_DEL_DIA) throw new Error(`${ajuste?.tipo === 'turnos' ? ajuste.turnos : ''} turnos no caben en un día: suman ${horas} h`)
  const capacidad = ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined

  const ofertaPorDiaM3 = (horasDeRiego: number) => fuente.caudalLps * M3_POR_HORA_POR_LPS * horasDeRiego
  const necesidadPorHa = (s: SemanaDeCampana) => (s.demandaNetaMm * M3_HA_POR_MM) / eficiencia

  let almacenado = 0
  const filas: SemanaDelBalance[] = semanas.map((s) => {
    const necesidadM3 = necesidadPorHa(s) * area
    const ofertaM3 = ofertaPorDiaM3(horas) * s.dias
    const necesidadLps = necesidadM3 / (M3_POR_HORA_POR_LPS * horas * s.dias)
    if (capacidad === undefined) return { semana: s.semana, dias: s.dias, necesidadM3, ofertaM3, necesidadLps, cubre: alcanzaPara(ofertaM3, necesidadM3) }
    // El reservorio empieza vacío al sembrar; lo que no cabe se pierde, y lo que falta no se puede regar.
    const cubre = alcanzaPara(almacenado + ofertaM3, necesidadM3)
    almacenado = Math.min(capacidad, Math.max(0, almacenado + ofertaM3 - necesidadM3))
    return { semana: s.semana, dias: s.dias, necesidadM3, ofertaM3, necesidadLps, almacenadoM3: almacenado, cubre }
  })

  // La semana crítica es la de mayor necesidad diaria: la última puede ser corta. Las semanas de la maduración no la
  // eligen (demandaDeLaCampana): ahí el riego está acotado a la semana crítica, o suspendido.
  const candidatas = semanas.some((s) => s.cuentaParaElDiseno !== false) ? semanas.filter((s) => s.cuentaParaElDiseno !== false) : semanas
  const critica = candidatas.reduce((mayor, s) => (s.demandaNetaMm / s.dias > mayor.demandaNetaMm / mayor.dias ? s : mayor))
  const filaCritica = filas[semanas.indexOf(critica)]!

  // La capacidad: en la semana crítica la fuente tiene que dar, en sus horas de riego, lo que el cultivo consume si no
  // llueve, porque con eso se dimensiona el paso 4. Si la lluvia cubre toda la campaña no hay riego que dimensionar.
  const hayRiego = critica.demandaNetaMm > 0
  const necesidadPicoPorHaDiaM3 = Math.max(
    necesidadPorHa(critica) / critica.dias,
    hayRiego && demandaDeDisenoMmDia !== undefined ? (demandaDeDisenoMmDia * M3_HA_POR_MM) / eficiencia : 0,
  )
  // Las salidas se evalúan sobre el planteamiento sin ajustar, para que el estudiante las compare.
  const necesidadPicoDiaM3 = necesidadPicoPorHaDiaM3 * areaHa
  // Lo que falta en un día de consumo pico con el planteamiento vigente; con el reservorio, lo pone él.
  const capacidadAlcanza = alcanzaPara(ofertaPorDiaM3(horas) + (capacidad ?? 0), necesidadPicoPorHaDiaM3 * area)

  const turnos = (():
    | { viable: true; turnos: number; horasDeRiegoPorDia: number; areaPorTurnoHa: number; turnosMaximos: number }
    | NoViable<'fuente_por_horas' | 'sin_horas_libres' | 'no_caben_en_el_dia'> => {
    if (fuente.tipo !== 'manantial') return { viable: false, motivo: 'fuente_por_horas' }
    if (fuente.horasDisponiblesDia >= HORAS_DEL_DIA) return { viable: false, motivo: 'sin_horas_libres' }
    // Al menos un turno: sin demanda en la semana crítica, el riego sigue siendo uno solo.
    const n = Math.max(1, Math.ceil(necesidadPicoDiaM3 / ofertaPorDiaM3(fuente.horasDisponiblesDia)))
    if (n * fuente.horasDisponiblesDia > HORAS_DEL_DIA) return { viable: false, motivo: 'no_caben_en_el_dia' }
    // n son los menos que cubren la campaña; el estudiante puede pedir más, hasta llenar el día, para dejar holgura
    // a los turnos del paso 4, que son enteros. 24 / 1.5 = 16 cuenta como 16 aunque la división dé 15.999….
    const turnosMaximos = Math.floor((HORAS_DEL_DIA / fuente.horasDisponiblesDia) * (1 + HOLGURA))
    return { viable: true, turnos: n, horasDeRiegoPorDia: n * fuente.horasDisponiblesDia, areaPorTurnoHa: areaHa / n, turnosMaximos }
  })()

  const reservorio = ((): { viable: true; volumenM3: number } | NoViable<'deficit_sin_reserva_previa'> => {
    // Con el reservorio vacío al sembrar, lo acumulado nunca puede quedar en negativo; el volumen que hace falta es
    // la mayor caída del acumulado desde un máximo anterior.
    let [ofertaAcumulada, necesidadAcumulada] = [0, 0]
    let maximo = 0
    let volumenM3 = 0
    for (const s of semanas) {
      ofertaAcumulada += ofertaPorDiaM3(fuente.horasDisponiblesDia) * s.dias
      necesidadAcumulada += necesidadPorHa(s) * areaHa
      if (!alcanzaPara(ofertaAcumulada, necesidadAcumulada)) return { viable: false, motivo: 'deficit_sin_reserva_previa' }
      const acumulado = ofertaAcumulada - necesidadAcumulada
      maximo = Math.max(maximo, acumulado)
      volumenM3 = Math.max(volumenM3, maximo - acumulado)
    }
    // Y lo que falta en un día de consumo pico sin lluvia, que el reservorio entrega mientras riega.
    volumenM3 = Math.max(volumenM3, necesidadPicoDiaM3 - ofertaPorDiaM3(fuente.horasDisponiblesDia))
    return { viable: true, volumenM3 }
  })()

  const areaMaximaHa = ofertaPorDiaM3(fuente.horasDisponiblesDia) / necesidadPicoPorHaDiaM3
  const menosArea = { viable: areaMaximaHa >= FRACCION_MINIMA_DE_AREA * areaHa, areaHa: Math.min(areaHa, areaMaximaHa) }

  const semanasSinCubrir = filas.filter((f) => !f.cubre).map((f) => f.semana)
  const hayAjusteSinAplicar = turnos.viable || reservorio.viable || menosArea.viable
  return {
    semanas: filas,
    areaHa: area,
    horasDeRiegoPorDia: horas,
    caudalLps: fuente.caudalLps,
    semanaCritica: critica.semana,
    /** Lo que pide la semana crítica en las horas de riego, l/s: si no llueve, cuando se da la demanda de diseño. */
    necesidadPicoLps: Math.max(filaCritica.necesidadLps, (necesidadPicoPorHaDiaM3 * area) / (M3_POR_HORA_POR_LPS * horas)),
    /** La de la semana crítica con su lluvia media, l/s. */
    necesidadPicoConLluviaLps: filaCritica.necesidadLps,
    /** Si la fuente, con el ajuste, da lo que el riego pide en el día de más consumo sin lluvia. */
    capacidadAlcanza,
    semanasSinCubrir,
    alcanza:
      semanasSinCubrir.length === 0 && capacidadAlcanza ? ('si' as const) : hayAjusteSinAplicar ? ('parcial' as const) : ('no' as const),
    ajustes: { turnos, reservorio, menosArea },
  }
}
