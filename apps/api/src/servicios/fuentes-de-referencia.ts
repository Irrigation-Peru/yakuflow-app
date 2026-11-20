import type { PuntoGeografico } from '@riego/calculo'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import type { FuenteDeDato } from './clima.ts'
import { consultarConLimite, TIEMPO_LIMITE_MS } from './consulta.ts'

// Puntos de referencia para ubicar la fuente de agua (paso 1, C6 y C7): las bocatomas, las tomas y las lagunas que
// la ANA tiene inventariadas cerca de la parcela, del SNIRH (geosnirh.ana.gob.pe, servicios ArcGIS REST). Son solo
// referencia: el estudiante sigue ubicando la fuente y escribiendo el caudal que midió, así que el caudal del
// inventario no se pasa. Tampoco se usan los derechos de uso, que traen el nombre de cada titular.

export type TipoDeReferencia = 'bocatoma' | 'toma' | 'laguna'

// Un tipo y no una interfaz: así se puede guardar tal cual como JSON en la caché.
export type PuntoDeReferencia = {
  tipo: TipoDeReferencia
  nombre: string | null
  /** El río, la quebrada o el manantial del que capta, si la ANA lo registra. */
  fuenteNatural: string | null
  altitudMsnm: number | null
  anioInventario: string | null
  lat: number
  lon: number
}

export interface FuentesDeReferencia {
  puntos: PuntoDeReferencia[]
  fuente: FuenteDeDato
}

export interface ProveedorDeFuentesDeReferencia {
  cerca(punto: PuntoGeografico): Promise<FuentesDeReferencia>
}

const VIGENCIA_MS = 365 * 24 * 60 * 60_000
/** Medio lado del recuadro de búsqueda, en grados: unos 4.4 km a cada lado de la parcela. */
export const RADIO_GRADOS = 0.04
const MAXIMO_POR_CAPA = 200
const BASE = 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico'
export const FUENTE: FuenteDeDato = {
  nombre: 'ANA · SNIRH, inventario de bocatomas, tomas y lagunas. Solo como referencia: el caudal es el que mides',
  resolucion: 'puntual',
  respaldo: false,
}

const CAPAS = [
  { tipo: 'bocatoma', servicio: 'Bocatomas/MapServer/0', campos: 'NombreBocatoma,FuenteNatural,Altitud,AnioInventario' },
  { tipo: 'toma', servicio: 'Tomas/MapServer/0', campos: 'NombreBocatoma,FuenteNatural,Altitud,AnioInventario' },
  { tipo: 'laguna', servicio: 'Lagunas/MapServer/36', campos: 'NOMBREOFICIAL,NOMBRECUERPO' },
] as const

const texto = z
  .string()
  .nullish()
  .transform((t) => {
    const limpio = t?.trim() ?? ''
    return limpio === '' || /^no especifica$/i.test(limpio) ? null : limpio
  })
const respuestaDeCapa = z.object({
  features: z.array(
    z.object({
      attributes: z.record(z.string(), z.unknown()),
      geometry: z.union([z.object({ x: z.number(), y: z.number() }), z.object({ rings: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1) })]),
    }),
  ),
})

/** El centro de una laguna: el promedio de los vértices de su borde exterior, sin repetir el de cierre. */
function centroDelBorde(borde: [number, number][]) {
  const vertices = borde.length > 1 ? borde.slice(0, -1) : borde
  const suma = vertices.reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0])
  return { lon: suma[0] / vertices.length, lat: suma[1] / vertices.length }
}

export function puntosDeLaCapa(tipo: TipoDeReferencia, datos: unknown): PuntoDeReferencia[] {
  return respuestaDeCapa.parse(datos).features.map(({ attributes: a, geometry: g }) => {
    const ubicacion = 'x' in g ? { lon: g.x, lat: g.y } : centroDelBorde(g.rings[0]!)
    const altitud = typeof a.Altitud === 'number' && a.Altitud > 0 ? a.Altitud : null
    if (tipo === 'laguna') {
      return { tipo, nombre: texto.parse(a.NOMBREOFICIAL) ?? texto.parse(a.NOMBRECUERPO), fuenteNatural: null, altitudMsnm: null, anioInventario: null, ...ubicacion }
    }
    return {
      tipo,
      nombre: texto.parse(a.NombreBocatoma),
      fuenteNatural: texto.parse(a.FuenteNatural),
      altitudMsnm: altitud,
      anioInventario: texto.parse(a.AnioInventario === undefined ? null : String(a.AnioInventario)),
      ...ubicacion,
    }
  })
}

const guardados = z.array(
  z.object({
    tipo: z.enum(['bocatoma', 'toma', 'laguna']),
    nombre: z.string().nullable(),
    fuenteNatural: z.string().nullable(),
    altitudMsnm: z.number().nullable(),
    anioInventario: z.string().nullable(),
    lat: z.number(),
    lon: z.number(),
  }),
)

export function fuentesDeLaAna({
  bd,
  obtener = fetch,
  tiempoLimiteMs = TIEMPO_LIMITE_MS,
  vigenciaMs = VIGENCIA_MS,
}: {
  bd: Bd
  obtener?: typeof fetch
  tiempoLimiteMs?: number
  vigenciaMs?: number
}): ProveedorDeFuentesDeReferencia {
  async function consultar({ lat, lon }: PuntoGeografico) {
    const recuadro = [lon - RADIO_GRADOS, lat - RADIO_GRADOS, lon + RADIO_GRADOS, lat + RADIO_GRADOS].map((v) => v.toFixed(5)).join(',')
    const porCapa = await Promise.all(
      CAPAS.map(async ({ tipo, servicio, campos }) => {
        const url =
          `${BASE}/${servicio}/query?f=json&geometry=${recuadro}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326` +
          `&spatialRel=esriSpatialRelIntersects&returnGeometry=true&maxAllowableOffset=0.0005&geometryPrecision=5` +
          `&resultRecordCount=${MAXIMO_POR_CAPA}&outFields=${campos}`
        const respuesta = await consultarConLimite(obtener, url, 'ANA · SNIRH', tiempoLimiteMs)
        if (!respuesta.ok) throw new Error(`ANA · SNIRH respondió ${respuesta.status}`)
        return puntosDeLaCapa(tipo, await respuesta.json())
      }),
    )
    return porCapa.flat()
  }

  return {
    async cerca(punto) {
      const clave = `ana:v1:${punto.lat.toFixed(3)},${punto.lon.toFixed(3)}`
      const donde = { servicio_claveConsulta: { servicio: 'agua' as const, claveConsulta: clave } }
      const guardada = await bd.cacheServicioExterno.findUnique({ where: donde })
      if (guardada && guardada.expiraEn > new Date()) return { puntos: guardados.parse(guardada.respuesta), fuente: FUENTE }
      const puntos = await consultar(punto)
      const fila = { respuesta: puntos, obtenidoEn: new Date(), expiraEn: new Date(Date.now() + vigenciaMs) }
      await bd.cacheServicioExterno.upsert({ where: donde, create: { servicio: 'agua', claveConsulta: clave, ...fila }, update: fila })
      return { puntos, fuente: FUENTE }
    },
  }
}
