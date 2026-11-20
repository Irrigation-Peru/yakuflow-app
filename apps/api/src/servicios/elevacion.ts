import type { PuntoGeografico } from '@riego/calculo'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Bd } from '../bd.ts'

// Cota del terreno en cada punto (D13: los servicios externos, detrás de una interfaz).
//
// La fuente primaria es el DEM del IGN, extraído antes para cada escenario y guardado con su hoja, año y
// resolución: así el día del experimento no se depende de ningún servicio. Fuera de esa cobertura se usa el SRTM
// de 30 m por OpenTopoData, y la pantalla lo declara como respaldo. Un mismo cálculo nunca mezcla dos fuentes.

export interface FuenteDeElevacion {
  nombre: string
  resolucionM: number
  respaldo: boolean
}

export interface ProveedorDeElevacion {
  cotas(puntos: readonly PuntoGeografico[]): Promise<{ cotas: number[]; fuente: FuenteDeElevacion }>
}

const esquemaDeEscenario = z
  .object({
    nombre: z.string().min(1),
    fuente: z.object({ nombre: z.string().min(1), resolucionM: z.number().positive(), respaldo: z.literal(false) }),
    // Cuadrícula regular en grados: esquina suroeste, paso, y cotas por filas de sur a norte, de oeste a este.
    latSur: z.number().min(-90).max(90),
    lonOeste: z.number().min(-180).max(180),
    pasoGrados: z.number().positive(),
    filas: z.int().min(2),
    columnas: z.int().min(2),
    cotas: z.array(z.number()),
  })
  .refine((e) => e.cotas.length === e.filas * e.columnas, 'Las cotas no llenan la cuadrícula')

export type Escenario = z.infer<typeof esquemaDeEscenario>

/** Cota de un escenario precargado, por interpolación bilineal en su cuadrícula. */
export function elevacionDeEscenario(escenario: Escenario) {
  const { latSur, lonOeste, pasoGrados, filas, columnas, cotas } = escenario
  const fila = (lat: number) => (lat - latSur) / pasoGrados
  const columna = (lon: number) => (lon - lonOeste) / pasoGrados
  const cubre = (p: PuntoGeografico) => {
    const [f, c] = [fila(p.lat), columna(p.lon)]
    return f >= 0 && f <= filas - 1 && c >= 0 && c <= columnas - 1
  }
  const cota = (p: PuntoGeografico) => {
    const [f, c] = [fila(p.lat), columna(p.lon)]
    const [f0, c0] = [Math.min(Math.floor(f), filas - 2), Math.min(Math.floor(c), columnas - 2)]
    const [tf, tc] = [f - f0, c - c0]
    const z = (i: number, j: number) => cotas[(f0 + i) * columnas + c0 + j]!
    return (1 - tf) * ((1 - tc) * z(0, 0) + tc * z(0, 1)) + tf * ((1 - tc) * z(1, 0) + tc * z(1, 1))
  }
  return {
    cubre,
    async cotas(puntos: readonly PuntoGeografico[]) {
      if (!puntos.every(cubre)) throw new Error(`Hay puntos fuera del escenario ${escenario.nombre}`)
      return { cotas: puntos.map(cota), fuente: escenario.fuente }
    },
  }
}

/** Los escenarios precargados de una carpeta: un JSON por escenario. */
export function cargarEscenarios(carpeta: string) {
  let archivos: string[]
  try {
    archivos = readdirSync(carpeta).filter((a) => a.endsWith('.json'))
  } catch {
    return []
  }
  return archivos.map((a) => elevacionDeEscenario(esquemaDeEscenario.parse(JSON.parse(readFileSync(join(carpeta, a), 'utf8')))))
}

/** El primer escenario que cubre todos los puntos; si ninguno, el respaldo para todos. */
export function elevacionCompuesta(
  escenarios: readonly ReturnType<typeof elevacionDeEscenario>[],
  respaldo: ProveedorDeElevacion,
): ProveedorDeElevacion {
  return {
    cotas(puntos) {
      const escenario = escenarios.find((e) => puntos.every(e.cubre))
      return (escenario ?? respaldo).cotas(puntos)
    },
  }
}

const FUENTE_SRTM: FuenteDeElevacion = { nombre: 'SRTM de 30 m (NASA), por OpenTopoData', resolucionM: 30, respaldo: true }
const PUNTOS_POR_PEDIDO = 100
const VIGENCIA_MS = 365 * 24 * 60 * 60_000

/**
 * Respaldo en línea: el SRTM de 30 m del servicio público de OpenTopoData, que admite 100 puntos por pedido y un
 * pedido por segundo. Cada cota se guarda en la caché con sus coordenadas redondeadas a 1e-5° (poco más de un
 * metro), así que un punto ya consultado no se vuelve a pedir.
 */
export function elevacionDeOpenTopoData({
  bd,
  obtener = fetch,
  pausaMs = 1100,
  vigenciaMs = VIGENCIA_MS,
}: {
  bd: Bd
  obtener?: typeof fetch
  pausaMs?: number
  vigenciaMs?: number
}): ProveedorDeElevacion {
  const clave = (p: PuntoGeografico) => `srtm30m:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`
  let ultimoPedido = 0

  async function pedir(puntos: readonly PuntoGeografico[]) {
    const espera = ultimoPedido + pausaMs - Date.now()
    if (espera > 0) await new Promise((listo) => setTimeout(listo, espera))
    ultimoPedido = Date.now()
    const locations = puntos.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|')
    const respuesta = await obtener(`https://api.opentopodata.org/v1/srtm30m?locations=${locations}`)
    if (!respuesta.ok) throw new Error(`El servicio de elevación respondió ${respuesta.status}`)
    const { results } = (await respuesta.json()) as { results: { elevation: number | null }[] }
    return results.map((r, i) => {
      if (r.elevation === null) throw new Error(`El servicio de elevación no tiene la cota de ${locations.split('|')[i]}`)
      return r.elevation
    })
  }

  return {
    async cotas(puntos) {
      const claves = puntos.map(clave)
      const guardadas = await bd.cacheServicioExterno.findMany({
        where: { servicio: 'elevacion', claveConsulta: { in: [...new Set(claves)] }, expiraEn: { gt: new Date() } },
      })
      const cota = new Map(guardadas.map((g) => [g.claveConsulta, (g.respuesta as { cota: number }).cota]))
      const faltan = [...new Map(puntos.filter((p) => !cota.has(clave(p))).map((p) => [clave(p), p])).values()]
      for (let i = 0; i < faltan.length; i += PUNTOS_POR_PEDIDO) {
        const lote = faltan.slice(i, i + PUNTOS_POR_PEDIDO)
        const cotas = await pedir(lote)
        const expiraEn = new Date(Date.now() + vigenciaMs)
        await bd.cacheServicioExterno.createMany({
          data: lote.map((p, j) => ({ servicio: 'elevacion' as const, claveConsulta: clave(p), respuesta: { cota: cotas[j]! }, expiraEn })),
          skipDuplicates: true,
        })
        lote.forEach((p, j) => cota.set(clave(p), cotas[j]!))
      }
      return { cotas: claves.map((c) => cota.get(c)!), fuente: FUENTE_SRTM }
    },
  }
}
