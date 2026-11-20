// Poner a funcionar el sistema (HU0019, HU0020 y HU0021). Son tres cosas distintas que el estudiante hace
// sobre una red ya generada: cambiar un tramo y ver el efecto, regar sector por sector, y cerrar todas las
// válvulas para ver cuánta presión aguanta la tubería cuando el agua no corre.

import type { OpcionesCalculo, Red, ResultadoRed, Tramo } from './tipos'
import { calcularRed } from './red'
import { uniformidadPonderada } from './uniformidad'
import { claseDeTuberia, DIAMETROS_INTERNOS_MM } from './tuberias'

/** Lo que el estudiante puede cambiarle a un tramo: su diámetro o su clase (HU0019). */
export interface CambioDeTramo {
  diametroInternoMm?: number
  /** Código de la clase del catálogo, por ejemplo `C-10`. */
  clase?: string
}

/**
 * Devuelve una red nueva con el tramo cambiado. No modifica la que recibe: el estudiante puede volver atrás, y
 * el historial del paso 5 guarda cada versión.
 */
export function cambiarTramo(red: Red, tramoId: string, cambio: CambioDeTramo): Red {
  const original = red.tramos.find((t) => t.id === tramoId)
  if (!original) throw new Error(`La red no tiene un tramo ${tramoId}`)
  if (cambio.diametroInternoMm !== undefined && !DIAMETROS_INTERNOS_MM.includes(cambio.diametroInternoMm)) {
    throw new Error(`El diámetro ${cambio.diametroInternoMm} mm no está en el catálogo`)
  }
  const nuevo: Tramo = {
    ...original,
    ...(cambio.diametroInternoMm === undefined ? {} : { diametroInternoMm: cambio.diametroInternoMm }),
    ...(cambio.clase === undefined ? {} : { presionMaximaM: claseDeTuberia(cambio.clase).presionMaximaM }),
  }
  return { ...red, tramos: red.tramos.map((t) => (t.id === tramoId ? nuevo : t)) }
}

/**
 * Se puede poner una cámara rompe-presión en un nodo de paso: no en la fuente, ni donde ya hay un elemento de control,
 * ni donde hay emisores, porque la cámara deja el agua a presión cero y ese emisor ya no entregaría nada.
 */
export function nodoAdmiteCamara(red: Red, nodo: string) {
  return (
    red.nodos.some((n) => n.id === nodo) &&
    nodo !== red.fuente.nodo &&
    red.elementos?.[nodo] === undefined &&
    !red.emisores.some((e) => e.nodo === nodo)
  )
}

/** El nodo más cercano aguas arriba de `nodo` donde cabe una cámara, empezando por él mismo. */
export function lugarParaCamara(red: Red, nodo: string): string | undefined {
  let actual: string | undefined = nodo
  const visto = new Set<string>()
  while (actual !== undefined && !visto.has(actual)) {
    if (nodoAdmiteCamara(red, actual)) return actual
    visto.add(actual)
    const buscado: string = actual
    actual = red.tramos.find((t) => t.hasta === buscado)?.desde
  }
  return undefined
}

/** Devuelve una red nueva con una cámara rompe-presión en el nodo (HU0021). */
export function colocarCamara(red: Red, nodo: string): Red {
  if (!nodoAdmiteCamara(red, nodo)) throw new Error(`En el nodo ${nodo} no se puede poner una cámara rompe-presión`)
  return { ...red, elementos: { ...red.elementos, [nodo]: { tipo: 'crp' } } }
}

/** Devuelve una red nueva sin la cámara del nodo: para ver qué pasa con la tubería cuando falta (CE5). */
export function quitarCamara(red: Red, nodo: string): Red {
  if (red.elementos?.[nodo]?.tipo !== 'crp') throw new Error(`En el nodo ${nodo} no hay una cámara rompe-presión`)
  const { [nodo]: _quitada, ...elementos } = red.elementos
  return { ...red, elementos }
}

/** Lo que el estudiante le cambió a la red generada. La lista completa basta para rehacer su diseño. */
export type CambioDeRed =
  | ({ tipo: 'tramo'; tramo: string } & CambioDeTramo)
  | { tipo: 'poner-camara'; nodo: string }
  | { tipo: 'quitar-camara'; nodo: string }

export function aplicarCambio(red: Red, cambio: CambioDeRed): Red {
  if (cambio.tipo === 'poner-camara') return colocarCamara(red, cambio.nodo)
  if (cambio.tipo === 'quitar-camara') return quitarCamara(red, cambio.nodo)
  const { tipo: _tipo, tramo, ...delTramo } = cambio
  return cambiarTramo(red, tramo, delTramo)
}

export const aplicarCambios = (red: Red, cambios: readonly CambioDeRed[]) => cambios.reduce(aplicarCambio, red)

export interface RiegoDelSector {
  sector: string
  resultado: ResultadoRed
  /** Caudal de cada emisor del sector, l/h, en el orden en que están en la red. */
  caudalesLph: readonly number[]
  /** Uniformidad de distribución del sector, entre 0 y 1: el cuarto más desfavorecido sobre el promedio. */
  uniformidad: number
  /** Lo que el sector le pide a la fuente, l/s. */
  caudalFuenteLps: number
}

/**
 * Riega sector por sector, que es como el sistema trabaja: una válvula abierta a la vez. De cada turno
 * interesan el caudal de cada emisor y la uniformidad, que es lo que dice si el riego llega parejo.
 */
export function regarPorSectores(red: Red, sectores: readonly string[], opciones: OpcionesCalculo = {}): RiegoDelSector[] {
  return sectores.map((sector) => {
    const resultado = calcularRed(red, { ...opciones, sectoresAbiertos: [sector] })
    const delSector = red.emisores.filter((e) => e.sector === sector)
    const caudalesLph = delSector.map((e) => resultado.nodos[e.nodo]?.caudalEmisorLph ?? 0)
    // El emisor equivalente suma los que representa, y no todos representan igual: se compara lo que entrega cada uno.
    const filas = delSector.map((e, i) => ({ caudal: caudalesLph[i]! / e.k, peso: e.k }))
    return {
      sector,
      resultado,
      caudalesLph,
      uniformidad: filas.length > 0 ? uniformidadPonderada(filas) : 1,
      caudalFuenteLps: resultado.caudalFuenteLps,
    }
  })
}

export interface CaudalDelEmisor {
  nodo: string
  /** Cuántos emisores reales representa el emisor equivalente de este nodo. */
  emisores: number
  presionM: number
  /** Lo que entrega cada emisor real, l/h. */
  caudalPorEmisorLph: number
}

/** Lo que entrega cada emisor en el turno (HU0020). El equivalente suma los que representa: aquí se vuelve a uno solo. */
export function caudalesPorEmisor(red: Red, turno: RiegoDelSector, coeficienteK: number): CaudalDelEmisor[] {
  return red.emisores
    .filter((e) => e.sector === turno.sector)
    .map((e) => {
      const nodo = turno.resultado.nodos[e.nodo]
      const emisores = Math.max(1, Math.round(e.k / coeficienteK))
      return { nodo: e.nodo, emisores, presionM: nodo?.presionM ?? 0, caudalPorEmisorLph: (nodo?.caudalEmisorLph ?? 0) / emisores }
    })
}

/** Por debajo de esta diferencia, en m.c.a., un cambio no se lee como un efecto sobre el tramo. */
const CAMBIO_APRECIABLE_M = 0.05

/** Los tramos cuya presión cambió de un análisis a otro, en cualquier turno: los que la pantalla resalta (HU0019). */
export function tramosAfectados(antes: readonly RiegoDelSector[], ahora: readonly RiegoDelSector[]) {
  const afectados = new Set<string>()
  for (const turno of ahora) {
    const previo = antes.find((t) => t.sector === turno.sector)
    if (!previo) continue
    for (const [id, tramo] of Object.entries(turno.resultado.tramos)) {
      const anterior = previo.resultado.tramos[id]
      if (!anterior || Math.abs(anterior.presionSalidaM - tramo.presionSalidaM) > CAMBIO_APRECIABLE_M) afectados.add(id)
    }
  }
  return [...afectados]
}

/**
 * Presión estática de cada nodo, m.c.a.: con las válvulas cerradas el agua no corre, así que no hay
 * pérdida por fricción y la presión es el desnivel desde la última superficie libre aguas arriba —la
 * fuente o una cámara rompe-presión—, recortada por las válvulas reductoras que encuentre.
 *
 * Se calcula por geometría y no con `calcularRed`, por dos razones. La primera es que no hace falta
 * resolver nada: sin caudal no hay incógnitas. La segunda es que `calcularRed` modela el cabezal como una
 * pérdida fija, que resta igual con las válvulas cerradas; la pérdida de un filtro depende del caudal y
 * con la red cerrada es nula, así que por ese camino la estática saldría menor que la real justo en el
 * estado que decide la clase de la tubería.
 */
export function presionesEstaticas(red: Red): Record<string, number> {
  const vecinos = new Map<string, { nodo: string }[]>()
  for (const nodo of red.nodos) vecinos.set(nodo.id, [])
  for (const t of red.tramos) {
    vecinos.get(t.desde)?.push({ nodo: t.hasta })
    vecinos.get(t.hasta)?.push({ nodo: t.desde })
  }
  const cota = new Map(red.nodos.map((n) => [n.id, n.z]))
  const raiz = red.fuente.nodo
  if (!cota.has(raiz)) throw new Error(`La fuente está en el nodo ${raiz}, que no existe`)

  const nivel = new Map<string, number>([[raiz, cota.get(raiz)! + red.fuente.presionInicialM]])
  const visto = new Set([raiz])
  const cola = [raiz]
  const estaticas: Record<string, number> = {}
  while (cola.length > 0) {
    const actual = cola.shift()!
    const z = cota.get(actual)!
    let nivelAqui = nivel.get(actual)!
    const elemento = red.elementos?.[actual]
    // La cámara deja el agua a su propia cota; la reductora recorta a su consigna; el cabezal no resta nada
    // sin caudal.
    if (elemento?.tipo === 'crp') nivelAqui = z
    else if (elemento?.tipo === 'vrp') nivelAqui = Math.min(nivelAqui, z + elemento.consignaM)
    nivel.set(actual, nivelAqui)
    estaticas[actual] = nivelAqui - z
    for (const { nodo } of vecinos.get(actual) ?? []) {
      if (visto.has(nodo)) continue
      visto.add(nodo)
      nivel.set(nodo, nivelAqui)
      cola.push(nodo)
    }
  }
  return estaticas
}

export interface PresionDelTramo {
  tramo: string
  /** La mayor presión que ve el tramo en cualquier estado de operación, m.c.a. */
  presionMaximaM: number
  /** En qué estado la ve: `cerrada` con todas las válvulas cerradas, o el sector que la provoca. */
  estado: string
  /** Presión de la clase declarada, si el tramo la declara. */
  claseM?: number
  cumpleClase: boolean
}

/**
 * La presión máxima que cada tramo llega a ver, mirando todos los estados en que el sistema puede quedar:
 * con todas las válvulas cerradas y con cada sector abierto por separado. La estática casi siempre es la
 * mayor, porque sin caudal no hay pérdida que la baje: es el estado que rompe la tubería y el que CE5 dice
 * que los estudiantes no anticipan (HU0021).
 */
export function presionesMaximas(red: Red, sectores: readonly string[], opciones: OpcionesCalculo = {}): PresionDelTramo[] {
  const estaticas = presionesEstaticas(red)
  const regando: { nombre: string; resultado: ResultadoRed }[] = sectores.map((sector) => ({
    nombre: sector,
    resultado: calcularRed(red, { ...opciones, sectoresAbiertos: [sector] }),
  }))

  return red.tramos.map((tramo) => {
    // El estado cerrado sale de la estática, que es geometría; los demás, del cálculo de la red.
    let presionMaximaM = Math.max(estaticas[tramo.desde] ?? 0, estaticas[tramo.hasta] ?? 0)
    let estado = 'cerrada'
    for (const { nombre, resultado } of regando) {
      const t = resultado.tramos[tramo.id]
      if (!t) continue
      // El tramo ve la mayor de sus dos puntas: entra con una presión y sale con otra.
      const mayor = Math.max(t.presionEntradaM, t.presionSalidaM)
      if (mayor > presionMaximaM) {
        presionMaximaM = mayor
        estado = nombre
      }
    }
    return {
      tramo: tramo.id,
      presionMaximaM,
      estado,
      claseM: tramo.presionMaximaM,
      cumpleClase: tramo.presionMaximaM === undefined || presionMaximaM <= tramo.presionMaximaM,
    }
  })
}
