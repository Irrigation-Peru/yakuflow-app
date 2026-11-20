// Diseño agronómico: cuánta agua aplicar en cada riego, cada cuánto, durante cuánto tiempo y en cuántos turnos.

export type MetodoDeRiego = 'goteo' | 'aspersion'

/**
 * Eficiencia de aplicación en campo por método: la parte del agua aplicada que queda en la zona de raíces
 * (Brouwer et al., 1989, FAO, Manual de capacitación N.º 4: aspersión 75 %, goteo 90 %).
 */
export const EFICIENCIA_APLICACION: Readonly<Record<MetodoDeRiego, number>> = { goteo: 0.9, aspersion: 0.75 }

/** Lo más que se acepta lavar: con más, el agua no sirve para regar ese cultivo y la aptitud ya lo dice. */
const LAVADO_MAXIMO = 0.9

/**
 * Requerimiento de lavado: la parte del agua aplicada que tiene que pasar de la raíz para llevarse las sales que trae el
 * agua de riego (Ayers y Westcot, 1985, FAO Riego y Drenaje N.º 29). En riego localizado, de alta frecuencia,
 * LR = CEa / (2 · CEe máx), con CEe máx la salinidad del suelo a la que el cultivo deja de rendir; en aspersión,
 * LR = CEa / (5 · CEe umbral − CEa). Sin dato de calidad del agua no se supone ninguna sal: 0.
 */
export function requerimientoDeLavado({
  metodo,
  conductividadDelAguaDsM,
  salinidad,
}: {
  metodo: MetodoDeRiego
  conductividadDelAguaDsM?: number | null
  /** La tolerancia del cultivo: CEe a la que empieza a perder y cuánto pierde por cada dS/m más, % (FAO 29). */
  salinidad?: { umbralDsM: number; perdidaPctPorDsM?: number }
}) {
  if (!(conductividadDelAguaDsM && conductividadDelAguaDsM > 0) || !salinidad) return 0
  const ce = conductividadDelAguaDsM
  if (metodo === 'goteo') {
    // Sin pendiente conocida se toma la de la aspersión, la más exigente de las dos.
    if (salinidad.perdidaPctPorDsM && salinidad.perdidaPctPorDsM > 0) {
      const ceeMaxima = salinidad.umbralDsM + 100 / salinidad.perdidaPctPorDsM
      return Math.min(LAVADO_MAXIMO, ce / (2 * ceeMaxima))
    }
  }
  const denominador = 5 * salinidad.umbralDsM - ce
  return denominador > 0 ? Math.min(LAVADO_MAXIMO, ce / denominador) : LAVADO_MAXIMO
}

/**
 * La eficiencia con que se pasa de la lámina neta a la bruta: la de aplicación del método o, si el agua es salina y el
 * lavado pide más, 1 − LR (Pizarro, 1996: el agua que se pierde bajo la raíz ya lava, así que no se suman, se toma la
 * mayor de las dos pérdidas).
 */
export function eficienciaDeRiego({
  metodo,
  conductividadDelAguaDsM,
  salinidad,
}: {
  metodo: MetodoDeRiego
  conductividadDelAguaDsM?: number | null
  salinidad?: { umbralDsM: number; perdidaPctPorDsM?: number }
}) {
  const aplicacion = EFICIENCIA_APLICACION[metodo]
  const lavado = requerimientoDeLavado({ metodo, conductividadDelAguaDsM, salinidad })
  const eficiencia = Math.min(aplicacion, 1 - lavado)
  return { eficiencia, aplicacion, lavado, mandaElLavado: eficiencia < aplicacion }
}

/** Entre los métodos con que se riega el cultivo, el que aplica con más eficiencia: el que menos agua pide a la fuente. */
export function metodoMasEficiente(metodos: readonly MetodoDeRiego[]): MetodoDeRiego {
  const mejor = [...metodos].sort((a, b) => EFICIENCIA_APLICACION[b] - EFICIENCIA_APLICACION[a])[0]
  if (!mejor) throw new Error('El cultivo no tiene ningún método de riego')
  return mejor
}

/**
 * Días entre riegos que se proponen en goteo. El riego localizado es de alta frecuencia: moja solo una parte del suelo
 * y lo mantiene cerca de capacidad de campo, regando cada uno a tres días (Pizarro, 1996; Keller y Bliesner, 1990).
 * Regar cada 30 días con goteo, aunque el suelo guarde el agua, es aplicar en un día lo de un mes por un punto. El
 * intervalo máximo que el suelo permite se sigue mostrando, y el estudiante puede elegir otro.
 */
export const INTERVALO_PROPUESTO_GOTEO_DIAS = 3

const M2_POR_HA = 10_000
const M3_POR_HORA_POR_LPS = 3.6
const LPH_POR_LPS = 3600

/**
 * Parte entera de una división que en papel es exacta: el cociente se corrige en una parte en un billón
 * para que 17.999999999999996 cuente como 18.
 */
const cuantosCaben = (total: number, parte: number) => Math.floor((total / parte) * (1 + 1e-12))
/** Lo contrario: cuántas partes hacen falta para cubrir el total; 12.000000000000002 cuenta como 12. */
const cuantosHacenFalta = (total: number, parte: number) => Math.ceil((total / parte) * (1 - 1e-12))

export interface EmisorElegido {
  caudalLph: number
  /** Separación entre emisores sobre el lateral, m. */
  separacionM: number
  /** Separación entre laterales, m. */
  separacionLateralesM: number
}

export function disenoAgronomico({
  metodo,
  demandaNetaPicoMmDia,
  aguaFacilmenteAprovechableMm,
  eficiencia = EFICIENCIA_APLICACION[metodo],
  intervaloDias,
  emisor,
  areaHa,
  horasDeRiegoPorDia,
  fuente,
  infiltracionBasicaMmH,
}: {
  metodo: MetodoDeRiego
  /** Demanda neta diaria de la semana crítica: se diseña para la etapa de mayor demanda, no para el promedio. */
  demandaNetaPicoMmDia: number
  aguaFacilmenteAprovechableMm: number
  eficiencia?: number
  /** Días entre riegos que elige el estudiante. Por omisión, el máximo que el suelo permite; en goteo, a lo más tres. */
  intervaloDias?: number
  emisor: EmisorElegido
  areaHa: number
  horasDeRiegoPorDia: number
  /** De dónde sale el agua que lleva la red: la fuente y, si el paso 3 lo puso, el reservorio, m³. */
  fuente: { caudalLps: number; reservorioM3?: number }
  infiltracionBasicaMmH?: number
}) {
  if (!(demandaNetaPicoMmDia > 0)) throw new Error('Sin demanda neta no hay nada que regar')

  // El suelo guarda el agua fácilmente aprovechable; el cultivo la gasta al ritmo de la demanda.
  const intervaloMaximoDias = Math.max(1, cuantosCaben(aguaFacilmenteAprovechableMm, demandaNetaPicoMmDia))
  // El intervalo que se propone: el que el suelo permite, a lo más tres días en goteo, y uno con el que un turno se
  // riegue dentro de las horas de agua de un día. Regar 31 horas seguidas un turno cada 43 días cabe en el papel, pero no
  // en la operación de la parcela.
  const intensidadDelEmisorMmH = emisor.caudalLph / (emisor.separacionM * emisor.separacionLateralesM)
  const intervaloQueCabeEnUnDia = Math.max(1, cuantosCaben(horasDeRiegoPorDia * intensidadDelEmisorMmH * eficiencia, demandaNetaPicoMmDia))
  const intervaloPropuesto = Math.min(intervaloMaximoDias, intervaloQueCabeEnUnDia, metodo === 'goteo' ? INTERVALO_PROPUESTO_GOTEO_DIAS : Infinity)
  const intervalo = intervaloDias ?? intervaloPropuesto
  if (!Number.isInteger(intervalo) || intervalo < 1) throw new Error(`El intervalo entre riegos tiene que ser un número entero de días: ${intervalo}`)

  const laminaNetaMm = demandaNetaPicoMmDia * intervalo
  const laminaBrutaMm = laminaNetaMm / eficiencia
  // l/h sobre m² es mm/h.
  const intensidadMmH = emisor.caudalLph / (emisor.separacionM * emisor.separacionLateralesM)
  const tiempoDeRiegoH = laminaBrutaMm / intensidadMmH
  // Un turno no se parte entre dos días: cada día caben los turnos enteros que entran en sus horas de agua, y en el
  // intervalo, eso por los días. Contar las horas del intervalo juntas dejaba pasar, por ejemplo, 7 turnos de 5 h en 3 días
  // de 12 h: algún día tendría 3 turnos, 15 h.
  const turnosPorDia = cuantosCaben(horasDeRiegoPorDia, tiempoDeRiegoH)
  const turnosMaximos = turnosPorDia * intervalo
  // Lo que la red puede llevar mientras riega un turno: la fuente, más lo que el reservorio entrega en ese tiempo.
  const caudalDisponibleLps = fuente.caudalLps + (fuente.reservorioM3 ?? 0) / (M3_POR_HORA_POR_LPS * tiempoDeRiegoH)
  // Los menos turnos que la fuente alimenta: cada uno lleva a lo más ese caudal, con menos válvulas y menos tubo.
  const caudalDeTodaLaParcelaLps = (areaHa * M2_POR_HA * intensidadMmH) / LPH_POR_LPS
  const turnosNecesarios = Math.max(1, cuantosHacenFalta(caudalDeTodaLaParcelaLps, caudalDisponibleLps))
  const turnos = turnosNecesarios <= turnosMaximos ? turnosNecesarios : 0
  // Cada turno tarda lo mismo, sea del tamaño que sea: aunque el agua del intervalo alcance justo, puede faltar un turno
  // entero. Lo que sí cabe es lo que la fuente riega en un turno por los turnos que caben en el intervalo.
  const areaQueCabeHa = turnos > 0 ? areaHa : (turnosMaximos * caudalDisponibleLps * LPH_POR_LPS) / intensidadMmH / M2_POR_HA
  // O, con un reservorio, el que deja a cada uno de los turnos que caben el caudal que pide: Qs + V / (3.6 · t) ≥ Qp / n.
  const reservorioQueCabeM3 =
    turnos > 0 || turnosMaximos === 0 ? 0 : Math.max(0, caudalDeTodaLaParcelaLps / turnosMaximos - fuente.caudalLps) * M3_POR_HORA_POR_LPS * tiempoDeRiegoH

  const areaPorTurnoHa = turnos > 0 ? areaHa / turnos : undefined
  const emisoresPorTurno =
    areaPorTurnoHa === undefined ? undefined : (areaPorTurnoHa * M2_POR_HA) / (emisor.separacionM * emisor.separacionLateralesM)

  return {
    eficiencia,
    intervaloMaximoDias,
    /** El que se propone si el estudiante no elige: ver arriba. */
    intervaloPropuestoDias: intervaloPropuesto,
    intervaloDias: intervalo,
    laminaNetaMm,
    laminaBrutaMm,
    intensidadMmH,
    tiempoDeRiegoH,
    /** Turnos en que se riega la parcela: los menos que la fuente alimenta. 0 si no caben en el intervalo. */
    turnos,
    /** Los que la fuente pide: la parcela entera a la vez entre lo que la red puede llevar. */
    turnosNecesarios,
    /** Los que caben en las horas de riego del intervalo; 0 si un solo riego no cabe. */
    turnosMaximos,
    /** Los turnos enteros que caben en las horas de agua de un día. */
    turnosPorDia,
    /**
     * Horas de riego al día que piden los turnos necesarios. Si pasan de las que hay, los turnos no caben, aunque el
     * agua alcance en papel: los turnos son enteros y el último deja parada parte de la fuente.
     */
    /** Las horas de riego del día más cargado: los turnos se reparten enteros entre los días del intervalo. */
    horasDeRiegoNecesariasPorDia: Math.ceil(turnosNecesarios / intervalo) * tiempoDeRiegoH,
    caudalDisponibleLps,
    /** El área que se puede regar con los turnos que caben en el intervalo, ha: si los turnos no caben, menos que el área. */
    areaQueCabeHa,
    /** El reservorio con el que los turnos caben, m³: 0 si ya caben. */
    reservorioQueCabeM3,
    areaPorTurnoHa,
    emisoresPorTurno,
    /** Caudal que la red tiene que llevar: el de los emisores de un turno. */
    caudalDeDisenoLps: emisoresPorTurno === undefined ? undefined : (emisoresPorTurno * emisor.caudalLph) / LPH_POR_LPS,
    /** La lámina neta supera el agua fácilmente aprovechable: el cultivo sufre antes del siguiente riego. */
    estres: laminaNetaMm > aguaFacilmenteAprovechableMm * (1 + 1e-12),
    /** La intensidad supera la infiltración del suelo y el agua escurre. Sin infiltración medida, no se sabe. */
    escurre: infiltracionBasicaMmH === undefined ? undefined : intensidadMmH > infiltracionBasicaMmH,
  }
}
