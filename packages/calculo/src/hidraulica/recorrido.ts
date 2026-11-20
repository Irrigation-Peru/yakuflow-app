// El recorrido del agua hasta un punto de la red (HU0018, HU0020): de la fuente al nodo, con la cota del terreno y la
// línea de presión. La distancia entre las dos líneas es la presión; es lo que el perfil le muestra al estudiante.

import type { Red, Tramo } from './tipos'

export interface PuntoDelRecorrido {
  nodo: string
  /** El tramo por el que el agua llegó a este nodo; la fuente no tiene. */
  tramo?: string
  distanciaM: number
  cota: number
  presionM: number
  /** Cota más presión: la altura de la línea de presión en este punto. */
  cotaPiezometrica: number
}

/** El camino de la fuente hasta el nodo. En una red abierta hay uno solo. */
export function caminoHasta(red: Red, nodo: string): Tramo[] {
  const llegada = new Map(red.tramos.map((t) => [t.hasta, t]))
  const camino: Tramo[] = []
  const visto = new Set<string>()
  let actual = nodo
  while (actual !== red.fuente.nodo) {
    const tramo = llegada.get(actual)
    if (!tramo || visto.has(actual)) throw new Error(`El nodo ${nodo} no está conectado con la fuente`)
    visto.add(actual)
    camino.unshift(tramo)
    actual = tramo.desde
  }
  return camino
}

/** Sigue aguas abajo desde el nodo hasta un extremo de la red, por el primer tramo que sale de cada nodo. */
export function extremoAguasAbajo(red: Red, nodo: string) {
  let actual = nodo
  const visto = new Set<string>()
  for (;;) {
    visto.add(actual)
    // En una junta sigue por el portalateral, que es el camino largo: los laterales salen por su válvula.
    const salidas = red.tramos.filter((t) => t.desde === actual && !visto.has(t.hasta))
    const siguiente = salidas.find((t) => !t.id.startsWith('v')) ?? salidas[0]
    if (!siguiente) return actual
    actual = siguiente.hasta
  }
}

/** Los puntos del recorrido hasta el nodo, con la presión que se le pase: la de un turno o la de las válvulas cerradas. */
export function recorridoHasta(red: Red, nodo: string, presiones: Readonly<Record<string, number>>): PuntoDelRecorrido[] {
  const porId = new Map(red.nodos.map((n) => [n.id, n]))
  const punto = (id: string, distanciaM: number, tramo?: string): PuntoDelRecorrido => {
    const n = porId.get(id)
    if (!n) throw new Error(`La red no tiene un nodo ${id}`)
    const presionM = presiones[id] ?? 0
    return { nodo: id, ...(tramo === undefined ? {} : { tramo }), distanciaM, cota: n.z, presionM, cotaPiezometrica: n.z + presionM }
  }
  const puntos = [punto(red.fuente.nodo, 0)]
  let distanciaM = 0
  for (const tramo of caminoHasta(red, nodo)) {
    const a = porId.get(tramo.desde)!
    const b = porId.get(tramo.hasta)!
    distanciaM += Math.hypot(a.x - b.x, a.y - b.y)
    puntos.push(punto(tramo.hasta, distanciaM, tramo.id))
  }
  return puntos
}

/**
 * A qué distancia de la fuente, siguiendo la tubería, queda cada tramo: con eso la vista 2D hace avanzar el agua. Solo
 * entran los tramos que el sector usa: los que llevan caudal en ese turno.
 */
export function avanceDelAgua(red: Red, caudales: Readonly<Record<string, { caudalLps: number }>>) {
  const porId = new Map(red.nodos.map((n) => [n.id, n]))
  const distancia = new Map([[red.fuente.nodo, 0]])
  const tramos: { tramo: string; desdeM: number; hastaM: number }[] = []
  const pendientes = [...red.tramos]
  while (pendientes.length > 0) {
    const i = pendientes.findIndex((t) => distancia.has(t.desde))
    if (i < 0) break
    const [t] = pendientes.splice(i, 1)
    const a = porId.get(t!.desde)!
    const b = porId.get(t!.hasta)!
    const desdeM = distancia.get(t!.desde)!
    const hastaM = desdeM + Math.hypot(a.x - b.x, a.y - b.y)
    distancia.set(t!.hasta, hastaM)
    if ((caudales[t!.id]?.caudalLps ?? 0) > 0) tramos.push({ tramo: t!.id, desdeM, hastaM })
  }
  return { tramos, totalM: tramos.reduce((mayor, t) => Math.max(mayor, t.hastaM), 0) }
}
