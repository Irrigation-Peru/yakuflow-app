// El diseño agronómico del método elegido (paso 4), armado de una sola manera para el navegador, que lo muestra al
// instante, y para el servidor, que lo vuelve a calcular antes de guardarlo. Del suelo y del cultivo sale el agua
// fácilmente aprovechable; de ella, la lámina, la frecuencia, el tiempo y los turnos; del tiempo, el corte del suelo.

import { TEXTURA_GRUESA } from './aptitud'
import { corteDelGoteo, escurrimientoDeAspersion } from './bulbo'
import type { Cultivo } from './cultivo'
import { disenoAgronomico, eficienciaDeRiego, metodoMasEficiente, type MetodoDeRiego } from './diseno-agronomico'
import type { EmisorDeCatalogo } from './emisores'
import { aguaUtilTotal, fraccionDeAgotamientoAjustada } from './suelo'
import type { ClaseTextural } from './textura'

export type ProblemaDelDiseno = 'intervalo_con_estres' | 'riego_no_cabe' | 'riego_excede_el_dia' | 'turnos_no_caben' | 'escurre'

const NOMBRE_DEL_METODO: Readonly<Record<MetodoDeRiego, string>> = { goteo: 'goteo', aspersion: 'aspersión' }

/**
 * La demanda con que se dimensiona el riego, mm/día: el consumo pico del cultivo, sin descontar la lluvia, que no cae
 * pareja (en las rachas secas el cultivo consume igual); nunca menos que la demanda neta pico.
 */
export const demandaDeDiseno = (demanda: { demandaNetaPicoMmDia: number; etcDisenoMmDia?: number }) =>
  Math.max(demanda.demandaNetaPicoMmDia, demanda.etcDisenoMmDia ?? 0)

/** Los métodos con que se riega el cultivo; sin requisitos cargados, los dos. */
export const metodosDelCultivo = (cultivo: Cultivo): readonly MetodoDeRiego[] => cultivo.requisitos?.metodos ?? ['goteo', 'aspersion']

/**
 * La eficiencia con que se comprueba el agua en el paso 3, antes de elegir el método: la del más eficiente con que se
 * riega el cultivo. El paso 4 vuelve a comprobar con la del método elegido.
 */
export const eficienciaDelBalance = (cultivo: Cultivo, conductividadDelAguaDsM?: number | null) =>
  eficienciaDelMetodo(metodoMasEficiente(metodosDelCultivo(cultivo)), cultivo, conductividadDelAguaDsM)

/** La eficiencia de un método para el cultivo, con el lavado que pida la calidad del agua (FAO 29). */
export const eficienciaDelMetodo = (metodo: MetodoDeRiego, cultivo: Cultivo, conductividadDelAguaDsM?: number | null) =>
  eficienciaDeRiego({ metodo, conductividadDelAguaDsM, salinidad: cultivo.requisitos?.salinidad }).eficiencia

/**
 * Área de suelo mojada sobre el área total, % (Keller y Bliesner, 1990): cuando los bulbos de un lateral se tocan
 * mojan una franja de ancho 2r; si no, cada gotero moja un círculo de radio r.
 */
export function areaMojadaPct({ radioM, separacionM, separacionLateralesM }: { radioM: number; separacionM: number; separacionLateralesM: number }) {
  const porEmisor = separacionM < 2 * radioM ? separacionM * 2 * radioM : Math.PI * radioM ** 2
  return Math.min(100, (100 * porEmisor) / (separacionM * separacionLateralesM))
}

export function disenoDelRiego({
  cultivo,
  metodo,
  emisor,
  separacionM,
  separacionLateralesM,
  intervaloDias,
  demanda,
  suelo,
  areaHa,
  horasDeRiegoPorDia,
  fuente,
  tiempoDelCorteH,
  conductividadDelAguaDsM,
}: {
  cultivo: Cultivo
  metodo: MetodoDeRiego
  emisor: EmisorDeCatalogo
  separacionM: number
  separacionLateralesM: number
  /** Días entre riegos; por omisión, el máximo que el suelo permite. */
  intervaloDias?: number
  /**
   * De la campaña: la demanda neta de la semana crítica y el consumo máximo del cultivo. Se diseña con el consumo
   * máximo; sin él, con la demanda neta.
   */
  demanda: { demandaNetaPicoMmDia: number; etcPicoMmDia: number; etcDisenoMmDia?: number }
  suelo: { clase: ClaseTextural; capacidadDeCampo: number; puntoDeMarchitez: number; infiltracionBasicaMmH: number }
  /** El área y las horas que quedaron después del paso 3: menos área o más horas por turnos. */
  areaHa: number
  horasDeRiegoPorDia: number
  /** El caudal de la fuente y, con el ajuste del paso 3, el reservorio. */
  fuente: { caudalLps: number; reservorioM3?: number }
  /** Otro tiempo de riego para ver en el corte; el diseño no cambia. Por omisión, el del diseño. */
  tiempoDelCorteH?: number
  /** Conductividad del agua de riego, dS/m: si es salina, la lámina bruta incluye el lavado. */
  conductividadDelAguaDsM?: number | null
}) {
  if (emisor.metodo !== metodo) {
    throw new Error(`${emisor.nombre} es para ${NOMBRE_DEL_METODO[emisor.metodo]}, no para ${NOMBRE_DEL_METODO[metodo]}`)
  }
  const profundidadRadicularM = cultivo.profundidadRadicularM.maxima
  const demandaDeDisenoMmDia = demandaDeDiseno(demanda)
  const fraccionAgotamiento = fraccionDeAgotamientoAjustada(cultivo.fraccionAgotamiento, Math.max(demanda.etcPicoMmDia, demanda.etcDisenoMmDia ?? 0))
  const aguaUtilTotalMm = aguaUtilTotal({ capacidadDeCampo: suelo.capacidadDeCampo, puntoDeMarchitez: suelo.puntoDeMarchitez, profundidadRadicularM })
  const aguaFacilmenteAprovechableMm = fraccionAgotamiento * aguaUtilTotalMm

  const diseno = disenoAgronomico({
    metodo,
    demandaNetaPicoMmDia: demandaDeDisenoMmDia,
    aguaFacilmenteAprovechableMm,
    eficiencia: eficienciaDelMetodo(metodo, cultivo, conductividadDelAguaDsM),
    intervaloDias,
    emisor: { caudalLph: emisor.caudalNominalLph, separacionM, separacionLateralesM },
    areaHa,
    horasDeRiegoPorDia,
    fuente,
    infiltracionBasicaMmH: suelo.infiltracionBasicaMmH,
  })

  const sueloDelCorte = { capacidadDeCampo: suelo.capacidadDeCampo, puntoDeMarchitez: suelo.puntoDeMarchitez, gruesa: TEXTURA_GRUESA[suelo.clase] }
  const tiempoH = tiempoDelCorteH ?? diseno.tiempoDeRiegoH
  const delGoteo = (t: number) =>
    corteDelGoteo({ caudalLph: emisor.caudalNominalLph, tiempoH: t, separacionM, separacionLateralesM, suelo: sueloDelCorte, fraccionAgotamiento })
  const corte =
    metodo === 'goteo'
      ? { tipo: 'bulbo' as const, tiempoH, ...delGoteo(tiempoH) }
      : {
          tipo: 'escurrimiento' as const,
          tiempoH,
          intensidadMmH: diseno.intensidadMmH,
          infiltracionBasicaMmH: suelo.infiltracionBasicaMmH,
          ...escurrimientoDeAspersion({
            intensidadMmH: diseno.intensidadMmH,
            infiltracionBasicaMmH: suelo.infiltracionBasicaMmH,
            laminaAplicadaMm: diseno.intensidadMmH * tiempoH,
            suelo: sueloDelCorte,
            fraccionAgotamiento,
          }),
        }
  // El área mojada se mide con el bulbo del tiempo de diseño, no con el que el estudiante prueba en el corte.
  const bulboDelDiseno = metodo === 'goteo' ? delGoteo(diseno.tiempoDeRiegoH) : null
  const mojadaPct = bulboDelDiseno ? areaMojadaPct({ radioM: bulboDelDiseno.radioM, separacionM, separacionLateralesM }) : 100
  // En goteo la raíz solo saca agua del suelo que el bulbo moja: el agua fácil de un riego es la de esa parte (Keller y
  // Bliesner, 1990). Con el riego cada pocos días sobra, pero si el estudiante alarga el intervalo el estrés llega antes
  // de lo que diría el suelo entero.
  const aguaFacilDelAreaMojadaMm = (aguaFacilmenteAprovechableMm * mojadaPct) / 100
  const intervaloMaximoDias = Math.min(diseno.intervaloMaximoDias, Math.max(1, Math.floor((aguaFacilDelAreaMojadaMm / demandaDeDisenoMmDia) * (1 + 1e-12))))
  const estres = diseno.estres || diseno.laminaNetaMm > aguaFacilDelAreaMojadaMm * (1 + 1e-12)

  const problemas: ProblemaDelDiseno[] = []
  if (estres) problemas.push('intervalo_con_estres')
  // Un turno se riega dentro de las horas de agua de un día: un riego de 31 h con 12 h de agua al día no se puede operar,
  // aunque en el papel quepa en los días del intervalo.
  if (diseno.tiempoDeRiegoH > horasDeRiegoPorDia * (1 + 1e-9)) problemas.push('riego_excede_el_dia')
  else if (diseno.turnosMaximos === 0) problemas.push('riego_no_cabe')
  else if (diseno.turnos === 0) problemas.push('turnos_no_caben')
  // En goteo la intensidad sobre el área no dice nada: el agua entra por un punto y el suelo la reparte.
  if (metodo === 'aspersion' && diseno.escurre) problemas.push('escurre')

  return {
    ...diseno,
    intervaloMaximoDias,
    estres,
    /** El agua fácil del suelo que moja el emisor, mm: en aspersión, la de todo el suelo. */
    aguaFacilDelAreaMojadaMm,
    /** La demanda con que se diseñó, mm/día: el consumo máximo del cultivo, sin descontar la lluvia. */
    demandaDeDisenoMmDia,
    fraccionAgotamiento,
    aguaUtilTotalMm,
    aguaFacilmenteAprovechableMm,
    profundidadRadicularM,
    corte,
    areaMojadaPct: mojadaPct,
    problemas,
  }
}
