import { caminoHasta, CLASES_DE_TUBERIA, claseDelTramo, desproyectarLocal, extremoAguasAbajo, type CambioDeRed, type RiegoDelSector, type PuntoGeografico, type Red, type Tramo } from '@riego/calculo'
import type { SegmentoEn3D } from './componentes/Relieve3D.tsx'
import { colorDePresion } from './presion.ts'

// Cómo se nombra y se ubica la red en las pantallas de los pasos 5 y 6.

const LATERAL = /^[lv](\d+)/

/** El nombre de un tramo en palabras del estudiante, no el identificador que usa el módulo. */
export function nombreDelTramo(id: string) {
  if (id.startsWith('conduccion')) return 'Conducción'
  if (id.startsWith('m')) return 'Portalateral'
  const lateral = LATERAL.exec(id)?.[1]
  if (id === 'vc') return 'Válvula reguladora del cabezal'
  if (id.startsWith('v')) return `Válvula de los laterales ${lateral} y ${Number(lateral) + 1}`
  return `Lateral ${lateral}`
}

/** El sector que riega un tramo de lateral; la conducción y el portalateral llevan agua en todos. */
export function sectorDelTramo(id: string, laterales: readonly { id: string; sector: string }[]) {
  const lateral = LATERAL.exec(id)?.[1]
  return lateral === undefined ? undefined : laterales.find((l) => l.id === `L${lateral}`)?.sector
}

const conClavesOrdenadas = (cambio: CambioDeRed) => JSON.stringify(Object.entries(cambio).sort(([a], [b]) => a.localeCompare(b)))

/** Si lo que el estudiante tiene es lo guardado. La base devuelve las claves de cada cambio en otro orden. */
export const mismosCambios = (a: readonly CambioDeRed[], b: readonly CambioDeRed[]) =>
  a.length === b.length && a.every((cambio, i) => conClavesOrdenadas(cambio) === conClavesOrdenadas(b[i]!))

/**
 * Hasta dónde llega el perfil: el emisor con menos presión del turno, que es el que manda, o, con un tramo elegido, ese
 * mismo emisor si el agua pasa por el tramo para llegar a él; si no, el final de ese tramo.
 */
export function destinoDelPerfil(red: Red, turno: RiegoDelSector, tramo: Tramo | undefined) {
  const peor = red.emisores
    .filter((e) => e.sector === turno.sector)
    .reduce<{ nodo: string; presion: number } | null>((menor, e) => {
      const presion = turno.resultado.nodos[e.nodo]?.presionM ?? Infinity
      return menor === null || presion < menor.presion ? { nodo: e.nodo, presion } : menor
    }, null)?.nodo
  if (peor !== undefined && (!tramo || caminoHasta(red, peor).some((t) => t.id === tramo.id))) return peor
  return extremoAguasAbajo(red, tramo?.hasta ?? red.fuente.nodo)
}

export const OPCIONES_DE_CLASE = CLASES_DE_TUBERIA.map((c) => ({ codigo: c.codigo, aguanta: c.presionMaximaM }))

export const claseDe = (tramo: Tramo) => claseDelTramo(tramo.presionMaximaM)

interface MedidaDelTramo {
  diametroInternoMm: number
  clase: string
}

/** Lo que cambió tramo por tramo, juntando los que cambiaron igual: una alternativa puede tocar mil laterales. */
export function cambiosAgrupados(porTramo: readonly { tramo: string; antes: MedidaDelTramo; ahora: MedidaDelTramo }[]) {
  const grupos = new Map<string, { tramos: string[]; antes: MedidaDelTramo; ahora: MedidaDelTramo }>()
  for (const { tramo, antes, ahora } of porTramo) {
    const clave = JSON.stringify([antes, ahora])
    const grupo = grupos.get(clave)
    if (grupo) grupo.tramos.push(tramo)
    else grupos.set(clave, { tramos: [tramo], antes, ahora })
  }
  return [...grupos.values()]
}

/** La red como segmentos con su color de presión, en coordenadas del terreno, para la vista 3D (HU0022). */
export function segmentosEn3D(
  red: Red,
  origen: PuntoGeografico,
  presiones: Readonly<Record<string, number | undefined>>,
  presionNominalM: number,
  rotos: ReadonlySet<string>,
  /** Si el agua corre (un sector regando) o está quieta (las válvulas cerradas). */
  fluye = true,
): SegmentoEn3D[] {
  const porId = new Map(red.nodos.map((n) => [n.id, n]))
  const segmentos: SegmentoEn3D[] = []
  for (const tramo of red.tramos) {
    const a = porId.get(tramo.desde)
    const b = porId.get(tramo.hasta)
    if (!a || !b) continue
    const presion = presiones[tramo.hasta]
    segmentos.push({
      tramo: tramo.id,
      a: { ...desproyectarLocal(origen, a), cota: a.z },
      b: { ...desproyectarLocal(origen, b), cota: b.z },
      color: presion === undefined ? '#d1d5db' : colorDePresion(presion, presionNominalM),
      roto: rotos.has(tramo.id),
      corre: fluye && presion !== undefined,
    })
  }
  return segmentos
}
