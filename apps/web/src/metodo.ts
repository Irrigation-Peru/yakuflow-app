import {
  CATALOGO_EMISORES,
  DESNIVEL_MINIMO_ASPERSION_M,
  DESNIVEL_MINIMO_GOTEO_M,
  EFICIENCIA_APLICACION,
  intensidadDelEmisor,
  type MetodoDeRiego,
  type ProblemaDelDiseno,
  type ViabilidadDelMetodo,
} from '@riego/calculo'
import type { RiegoDeLaCampana } from './calculo/campana.ts'
import { cifra, conDecimales, cultivoEnFrase } from './formato.ts'

// Cómo se lee el paso 4 (HU0015 y HU0016): por qué se recomienda un método y por qué el otro no, qué problema tiene el
// diseño y qué muestra el corte del suelo. Los números salen del módulo de cálculo; aquí solo se escriben.

export const NOMBRE_DEL_METODO: Readonly<Record<MetodoDeRiego, string>> = { goteo: 'Goteo', aspersion: 'Aspersión' }
/** Con su artículo: «la eficiencia del goteo», «la eficiencia de la aspersión». */
export const DEL_METODO: Readonly<Record<MetodoDeRiego, string>> = { goteo: 'del goteo', aspersion: 'de la aspersión' }
export const EL_METODO: Readonly<Record<MetodoDeRiego, string>> = { goteo: 'El goteo', aspersion: 'La aspersión' }
/** «al regar por goteo», «por aspersión». */
export const POR_EL_METODO: Readonly<Record<MetodoDeRiego, string>> = { goteo: 'goteo', aspersion: 'aspersión' }
const CARGA_MINIMA_M: Readonly<Record<MetodoDeRiego, number>> = { goteo: DESNIVEL_MINIMO_GOTEO_M, aspersion: DESNIVEL_MINIMO_ASPERSION_M }

const metros = (valor: number, decimales = 1) => `${cifra(valor, decimales)} m`
const lps = (valor: number) => `${conDecimales(valor, 2)} l/s`
const porcentaje = (fraccion: number) => `${conDecimales(fraccion * 100, 0)} %`

interface ContextoDelMetodo {
  cultivo: string
  claseDelSuelo: string
  infiltracionMmH: number
  cargaDisponibleM: number
}

export function porQueElMetodo(metodo: MetodoDeRiego, viabilidad: ViabilidadDelMetodo, recomendado: MetodoDeRiego | null, c: ContextoDelMetodo) {
  const minima = metros(CARGA_MINIMA_M[metodo], 0)
  const tienes = metros(c.cargaDisponibleM)
  if (viabilidad.viable && metodo === recomendado) {
    return `Es el que más conviene para ${cultivoEnFrase(c.cultivo, 'el')} en suelo ${c.claseDelSuelo}. ${EL_METODO[metodo]} necesita al menos ${minima} de carga, la presión que te da el desnivel, y tienes ${tienes}.`
  }
  if (viabilidad.viable) {
    const otro = recomendado ?? metodo
    return `También funciona: ${EL_METODO[metodo].toLowerCase()} necesita al menos ${minima} de carga y tienes ${tienes}. Pero aprovecha menos el agua: el ${porcentaje(
      EFICIENCIA_APLICACION[metodo],
    )}, contra el ${porcentaje(EFICIENCIA_APLICACION[otro])} ${DEL_METODO[otro]}.`
  }
  const motivos = viabilidad.motivos.map((m) =>
    m === 'cultivo'
      ? `${cultivoEnFrase(c.cultivo, 'el')} no se suele regar por ${POR_EL_METODO[metodo]}`
      : m === 'presion'
        ? `necesita al menos ${metros(viabilidad.cargaNecesariaM ?? CARGA_MINIMA_M[metodo], 0)} de carga y solo tienes ${tienes}`
        : `todos los aspersores del catálogo echan el agua más rápido de lo que el suelo ${c.claseDelSuelo} la absorbe (${cifra(c.infiltracionMmH, 1)} mm por hora)`,
  )
  return `Aquí no funciona: ${motivos.join('; ')}.`
}

/**
 * Cuando ningún método funciona, adónde volver. Si falta presión hasta para el goteo, otro cultivo no lo arregla: hay
 * que subir la fuente. Si no, otro cultivo que se riegue por goteo.
 */
export function sinMetodoQueSirva(viabilidad: Readonly<Record<MetodoDeRiego, ViabilidadDelMetodo>>, c: ContextoDelMetodo) {
  const goteo = viabilidad.goteo
  if (!goteo.viable && goteo.motivos.includes('presion')) {
    return {
      paso: 1 as const,
      texto: `Con ${metros(c.cargaDisponibleM)} de carga no alcanza para ningún método: el goteo necesita al menos ${metros(
        goteo.cargaNecesariaM ?? CARGA_MINIMA_M.goteo,
        0,
      )}. Vuelve al paso 1 y ubica la fuente más arriba.`,
    }
  }
  return {
    paso: 2 as const,
    texto: `Con este suelo y esta fuente, ningún método sirve para ${cultivoEnFrase(c.cultivo, 'el')}. Vuelve al paso 2 y elige un cultivo que se pueda regar por goteo.`,
  }
}

type Diseno = NonNullable<RiegoDeLaCampana['diseno']>

export function lecturaDelProblema(problema: ProblemaDelDiseno, d: Diseno, horasDeRiegoPorDia: number, claseDelSuelo: string, infiltracionMmH: number) {
  if (problema === 'intervalo_con_estres') {
    return `Si riegas cada ${d.intervaloDias} días, entre riego y riego el cultivo gasta más agua de la que la raíz saca fácil del suelo${
      d.areaMojadaPct < 100 ? ` que moja el gotero, el ${cifra(d.areaMojadaPct, 0)} % de la parcela` : ''
    } (${cifra(d.aguaFacilDelAreaMojadaMm ?? d.aguaFacilmenteAprovechableMm, 1)} mm) y sufre. Riega cada ${d.intervaloMaximoDias} ${
      d.intervaloMaximoDias === 1 ? 'día' : 'días'
    } o menos.`
  }
  if (problema === 'riego_no_cabe') {
    return `Cada riego dura ${cifra(d.tiempoDeRiegoH, 1)} h y no entra en las ${cifra(horasDeRiegoPorDia * d.intervaloDias, 1)} h de agua que tienes entre riego y riego. Usa un emisor que eche más agua o júntalos más.`
  }
  if (problema === 'riego_excede_el_dia') {
    return `Cada riego dura ${cifra(d.tiempoDeRiegoH, 1)} h y tu fuente da agua ${cifra(horasDeRiegoPorDia, 1)} h al día: un turno no se termina en el día. Riega más seguido —cada ${d.intervaloPropuestoDias} ${d.intervaloPropuestoDias === 1 ? 'día' : 'días'}—, con menos agua por riego.`
  }
  if (problema === 'turnos_no_caben') {
    // Hacia arriba: con «piden 13.5 h y tienes 13.5» no se vería que faltan horas.
    const piden = cifra(Math.ceil(d.horasDeRiegoNecesariasPorDia * 10) / 10, 1)
    return `Para que ningún turno pida más de los ${lps(d.caudalDisponibleLps)} que hay, harían falta ${d.turnosNecesarios} turnos, y en ${d.intervaloDias} días solo caben ${d.turnosMaximos}: los ${d.turnosNecesarios} piden ${piden} h de riego al día y tienes ${cifra(horasDeRiegoPorDia, 1)}. Vuelve al paso 3 y riega más horas al día, o usa un reservorio o menos área.`
  }
  return `El aspersor echa ${cifra(d.intensidadMmH, 1)} mm por hora y el suelo ${claseDelSuelo} solo absorbe ${cifra(infiltracionMmH, 1)} mm por hora: lo que sobra se queda arriba y escurre pendiente abajo.`
}

/** Los aspersores del catálogo que, con su separación propuesta, aplican menos de lo que el suelo infiltra. */
export const aspersoresQueNoEscurren = (infiltracionMmH: number) =>
  CATALOGO_EMISORES.filter((e) => e.metodo === 'aspersion' && intensidadDelEmisor(e) <= infiltracionMmH).map((e) => ({
    ...e,
    intensidadMmH: intensidadDelEmisor(e),
  }))

/**
 * Por qué son esos turnos: los menos que la fuente alimenta, para que ninguno pida más de lo que llega; y cuántos
 * cabrían en el intervalo. Sin turnos que quepan, lo dice el problema del diseño.
 */
export function porQueLosTurnos(d: Diseno, caudalDeLaFuenteLps: number) {
  if (d.turnos === 0) return null
  const conReservorio = d.caudalDisponibleLps > caudalDeLaFuenteLps * (1 + 1e-9)
  const quien = conReservorio ? 'dan tu fuente y el reservorio' : 'da tu fuente'
  if (d.turnos === 1) return `Los ${lps(d.caudalDisponibleLps)} que ${quien} alcanzan para regar toda la parcela a la vez.`
  const porDia = Math.ceil(d.turnos / d.intervaloDias)
  const reparto =
    d.intervaloDias === 1
      ? `Se riegan todos el mismo día: ${cifra(porDia * d.tiempoDeRiegoH, 1)} h de riego.`
      : `Se reparten en los ${d.intervaloDias} días del intervalo: a lo más ${porDia} por día, ${cifra(porDia * d.tiempoDeRiegoH, 1)} h de riego.`
  return `Son ${d.turnos} turnos porque ninguno puede llevar más de los ${lps(d.caudalDisponibleLps)} que ${quien}. ${reparto} Entrarían hasta ${d.turnosMaximos}: ${d.turnosPorDia} por día.`
}

/** Lo que muestra el corte, en una o dos frases. */
export function lecturaDelCorte(corte: Diseno['corte'], profundidadRadicularM: number, separacionM: number, separacionLateralesM: number) {
  // Lo que pasa con la raíz: si el agua no llega al fondo, esa parte se queda seca; si lo pasa, lo de abajo se pierde.
  const conLaRaiz = (profundidadM: number) =>
    `La raíz llega a ${metros(profundidadRadicularM, 2)}, así que ${
      profundidadM < profundidadRadicularM ? 'su parte más honda se queda sin agua' : 'el agua que baja más allá se pierde'
    }.`
  const en = `En ${cifra(corte.tiempoH, 1)} h de riego`
  if (corte.tipo === 'bulbo') {
    const raiz = conLaRaiz(corte.profundidadM)
    if (corte.forma === 'capa') {
      return `${en}, el agua de los laterales se junta y moja todo el suelo parejo hasta ${metros(corte.profundidadM, 2)} de hondo. ${raiz}`
    }
    const entreLaterales = separacionLateralesM < 2 * corte.radioM ? 'Las franjas de dos laterales se tocan.' : 'Entre lateral y lateral queda suelo seco.'
    const abre = `baja ${metros(corte.profundidadM, 2)} y se abre ${metros(corte.radioM, 2)} a cada lado`
    if (corte.forma === 'franja') {
      return `${en}, los bulbos de cada lateral se juntan en una franja húmeda que ${abre}. ${raiz} ${entreLaterales}`
    }
    const entreGoteros = separacionM < 2 * corte.radioM ? 'Los bulbos de un mismo lateral se tocan.' : 'Entre gotero y gotero queda suelo seco.'
    return `${en}, cada gotero moja un bulbo que ${abre}. ${raiz} ${entreGoteros} ${entreLaterales}`
  }
  const raiz = conLaRaiz(corte.profundidadDelFrenteM)
  return corte.fraccionEscurrida > 0
    ? `El aspersor echa ${cifra(corte.intensidadMmH, 1)} mm por hora y el suelo solo absorbe ${cifra(corte.infiltracionBasicaMmH, 1)} mm por hora: el ${porcentaje(
        corte.fraccionEscurrida,
      )} del agua escurre. Lo que entra baja hasta ${metros(corte.profundidadDelFrenteM, 2)}. ${raiz}`
    : `El suelo alcanza a absorber todo lo que echa el aspersor. ${en}, el agua baja hasta ${metros(corte.profundidadDelFrenteM, 2)}. ${raiz}`
}
