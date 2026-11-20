import type { PuntoGeografico } from '@riego/calculo'
import { z } from 'zod'
import type { Bd } from './bd.ts'
import { noEncontrado } from './errores.ts'

// Lo que comparten las rutas de un proyecto: buscarlo entre los del estudiante, el polígono de la parcela en GeoJSON
// y el avance por los pasos del recorrido.

type Poligono = { type: 'Polygon'; coordinates: [number, number][][] }

export const aGeoJson = (contorno: readonly PuntoGeografico[]): Poligono => ({
  type: 'Polygon',
  coordinates: [[...contorno, contorno[0]!].map((p) => [p.lon, p.lat])],
})

export const deGeoJson = (poligono: unknown) =>
  (poligono as Poligono).coordinates[0]!.slice(0, -1).map(([lon, lat]) => ({ lat, lon }))

/** El proyecto con su parcela y su fuente, si es del estudiante; si no, como si no existiera. */
/**
 * Un proyecto eliminado no se borra: el registro de actividad solo se agrega (decisión de software 4) y sus eventos
 * apuntan al proyecto, así que la fila queda con este estado y el estudiante deja de verla. Sus datos siguen ahí para el
 * estudio.
 */
export const ELIMINADO = 'eliminado'

export async function proyectoPropio(bd: Bd, id: string, usuarioId: string) {
  const proyecto = z.uuid().safeParse(id).success
    ? await bd.proyecto.findFirst({ where: { id, usuarioId, estado: { not: ELIMINADO } }, include: { parcela: true, fuenteAgua: true } })
    : null
  if (!proyecto) throw noEncontrado('el proyecto')
  return proyecto
}

export type ProyectoPropio = Awaited<ReturnType<typeof proyectoPropio>>

/** Lo que el estudiante decidió de la campaña en los pasos 2 a 4, tal como quedó guardado. */
export async function resumenDeLaCampana(bd: Bd, proyectoId: string) {
  const [campania, diseno, red] = await Promise.all([
    bd.campania.findUnique({ where: { proyectoId }, include: { cultivo: true, decisiones: { orderBy: { decididaEn: 'desc' }, take: 1 } } }),
    bd.disenoAgronomico.findUnique({ where: { proyectoId }, include: { emisorCatalogo: true } }),
    bd.red.findFirst({ where: { proyectoId }, orderBy: { version: 'desc' } }),
  ])
  const decision = campania?.decisiones[0]
  return {
    campania: campania && {
      cultivo: campania.cultivo.nombre,
      fechaSiembra: campania.fechaSiembra.toISOString().slice(0, 10),
      duracionDias: campania.duracionDias,
      areaSembradaHa: campania.areaSembradaHa,
    },
    decisionBalance: decision
      ? {
          salida: decision.salida,
          volumenReservorioM3: decision.volumenReservorioM3,
          areaAjustadaHa: decision.areaAjustadaHa,
          parametros: decision.parametros,
        }
      : null,
    disenoAgronomico: diseno && {
      metodo: diseno.metodo,
      emisor: diseno.emisorCatalogo.codigo,
      separacionM: diseno.espaciamientoEmisorM,
      separacionLateralesM: diseno.espaciamientoLateralM,
      intervaloDias: diseno.frecuenciaDias,
      laminaNetaMm: diseno.laminaNetaMm,
      laminaBrutaMm: diseno.laminaBrutaMm,
      tiempoDeRiegoH: diseno.tiempoRiegoH,
      intensidadMmH: diseno.intensidadMmH,
      areaMojadaPct: diseno.areaMojadaPct,
      eficiencia: diseno.eficienciaAplicacion,
    },
    red: red && {
      version: red.version,
      origen: red.origen,
      cambios: red.cambios,
      funciono: red.funciono,
      uniformidadPct: red.uniformidadPct,
      presionMinMca: red.presionMinMca,
      presionMaxMca: red.presionMaxMca,
      costoTotal: red.costoTotal === null ? null : Number(red.costoTotal),
    },
  }
}

/**
 * Lo que cambia al guardar el paso `paso`: el proyecto llega al paso siguiente, sin retroceder nunca, y los resultados
 * de los pasos ya hechos que dependen de este quedan marcados como desactualizados. No se borra nada: el estudiante
 * los rehace cuando vuelve a ellos, y al guardarlos se desmarcan.
 */
export function avanceAlGuardar(proyecto: { pasoAlcanzado: number; resultadosDesactualizados: unknown }, paso: number) {
  const desactualizados = new Set((proyecto.resultadosDesactualizados as number[]) ?? [])
  desactualizados.delete(paso)
  for (let posterior = paso + 1; posterior < proyecto.pasoAlcanzado; posterior++) desactualizados.add(posterior)
  return {
    pasoAlcanzado: Math.max(proyecto.pasoAlcanzado, paso + 1),
    resultadosDesactualizados: [...desactualizados].sort((a, b) => a - b),
  }
}
