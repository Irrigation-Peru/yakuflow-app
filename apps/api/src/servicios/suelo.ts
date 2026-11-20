import type { PuntoGeografico } from '@riego/calculo'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { consultarConLimite, TIEMPO_LIMITE_MS } from './consulta.ts'

/**
 * SoilGrids responde lento: en una parcela de Huariaca tardó 60 s el 13/11/2026, y con el límite general de 15 s el
 * estudiante se quedaba sin suelo. Se le da su propio límite; el paso 1 muestra «Consultando…» mientras tanto.
 */
export const TIEMPO_LIMITE_SOILGRIDS_MS = Math.max(TIEMPO_LIMITE_MS, 75_000)
import type { FuenteDeDato } from './clima.ts'

// Suelo del lugar (HU0009; D13). La fuente oficial es el MIDAGRI, pero su servicio solo publica la capacidad de uso
// mayor y no la textura, y en Pasco no devuelve nada. Se usa SoilGrids 2.0 de ISRIC como respaldo declarado: arena,
// limo, arcilla y pH, promediados en los primeros 30 cm. El estudiante lo reemplaza por su muestra de campo.

export interface SueloDelLugar {
  arenaPct: number
  limoPct: number
  arcillaPct: number
  ph: number | null
  fuente: FuenteDeDato
}

export interface ProveedorDeSuelo {
  suelo(punto: PuntoGeografico): Promise<SueloDelLugar>
}

const VIGENCIA_MS = 365 * 24 * 60 * 60_000
const CAPAS = [
  { etiqueta: '0-5cm', espesorCm: 5 },
  { etiqueta: '5-15cm', espesorCm: 10 },
  { etiqueta: '15-30cm', espesorCm: 15 },
] as const
const FUENTE: FuenteDeDato = {
  nombre: 'SoilGrids 2.0 (ISRIC), promedio de 0 a 30 cm. Respaldo: el MIDAGRI no publica la textura de esta zona',
  resolucion: '250 m',
  respaldo: true,
}

const esquema = z.object({
  properties: z.object({
    layers: z.array(
      z.object({
        name: z.string(),
        depths: z.array(z.object({ label: z.string(), values: z.object({ mean: z.number().nullable() }) })),
      }),
    ),
  }),
})

export function sueloDeSoilGrids({
  bd,
  obtener = fetch,
  tiempoLimiteMs = TIEMPO_LIMITE_SOILGRIDS_MS,
  vigenciaMs = VIGENCIA_MS,
}: {
  bd: Bd
  obtener?: typeof fetch
  tiempoLimiteMs?: number
  vigenciaMs?: number
}): ProveedorDeSuelo {
  async function consultar({ lat, lon }: PuntoGeografico) {
    const url =
      `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}` +
      '&property=clay&property=sand&property=silt&property=phh2o' +
      CAPAS.map((c) => `&depth=${c.etiqueta}`).join('') +
      '&value=mean'
    const respuesta = await consultarConLimite(obtener, url, 'SoilGrids', tiempoLimiteMs)
    if (!respuesta.ok) throw new Error(`SoilGrids respondió ${respuesta.status}`)
    return esquema.parse(await respuesta.json())
  }

  return {
    async suelo(punto) {
      const clave = `soilgrids:v1:${punto.lat.toFixed(4)},${punto.lon.toFixed(4)}`
      const guardada = await bd.cacheServicioExterno.findUnique({ where: { servicio_claveConsulta: { servicio: 'suelo', claveConsulta: clave } } })
      let datos: z.infer<typeof esquema>
      if (guardada && guardada.expiraEn > new Date()) {
        datos = esquema.parse(guardada.respuesta)
      } else {
        datos = await consultar(punto)
        const fila = { respuesta: datos, obtenidoEn: new Date(), expiraEn: new Date(Date.now() + vigenciaMs) }
        await bd.cacheServicioExterno.upsert({
          where: { servicio_claveConsulta: { servicio: 'suelo', claveConsulta: clave } },
          create: { servicio: 'suelo', claveConsulta: clave, ...fila },
          update: fila,
        })
      }

      // Promedio de las tres capas según su espesor; SoilGrids da g/kg para las fracciones y pH × 10.
      const promedio = (nombre: string) => {
        const capa = datos.properties.layers.find((l) => l.name === nombre)
        let suma = 0
        for (const { etiqueta, espesorCm } of CAPAS) {
          const valor = capa?.depths.find((d) => d.label === etiqueta)?.values.mean
          if (valor === null || valor === undefined) throw new Error(`SoilGrids no tiene ${nombre} en este punto: usa tu muestra de campo`)
          suma += espesorCm * valor
        }
        return suma / 30 / 10
      }
      const [arena, limo, arcilla] = [promedio('sand'), promedio('silt'), promedio('clay')]
      // Las tres fracciones se predicen por separado y no suman 100 exacto: se reparten en proporción.
      const total = arena + limo + arcilla
      let ph: number | null
      try {
        ph = promedio('phh2o')
      } catch {
        ph = null
      }
      return { arenaPct: (100 * arena) / total, limoPct: (100 * limo) / total, arcillaPct: (100 * arcilla) / total, ph, fuente: FUENTE }
    },
  }
}
