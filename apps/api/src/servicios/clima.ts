import type { NormalDelMes, PuntoGeografico } from '@riego/calculo'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { consultarConLimite, TIEMPO_LIMITE_MS } from './consulta.ts'

// Clima del lugar (HU0009; D13: los servicios externos, detrás de una interfaz). El estudiante no escribe clima.
//
// - La lluvia de cada mes es la de la caracterización de la precipitación del SENAMHI (IDESEP, por WFS): polígonos
//   con un rango de lluvia mensual, del que se toma el punto medio.
// - La temperatura, la humedad, el viento y la radiación salen de la climatología de NASA POWER, como respaldo
//   declarado mientras se extrae el PISCO del SENAMHI, que no tiene servicio en línea. Su celda es de medio grado y su
//   altitud no es la de la parcela: las temperaturas se corrigen con el gradiente de la atmósfera estándar.
// Ninguno de los dos envía CORS: se consultan desde el servidor y se guardan en la caché.

export interface FuenteDeDato {
  nombre: string
  resolucion: string
  respaldo: boolean
}

export interface ClimaDelLugar {
  meses: NormalDelMes[]
  lluvia: FuenteDeDato
  /** De dónde salen la temperatura, la humedad, el viento y la radiación. */
  atmosfera: FuenteDeDato
}

export interface ProveedorDeClima {
  normales(punto: PuntoGeografico, altitudM: number): Promise<ClimaDelLugar>
}

/**
 * Cuánto baja la temperatura por cada metro de subida, °C/m: el de la atmósfera estándar, el mismo que usa la
 * ecuación 7 del FAO 56 para la presión.
 */
export const GRADIENTE_TERMICO_C_POR_M = 0.0065

const VIGENCIA_MS = 365 * 24 * 60 * 60_000
const DIAS_DEL_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MESES_POWER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

/**
 * El valor con que se representa un rango de lluvia del SENAMHI, mm: el centro del rango; en el primero («< 10»),
 * la mitad de su borde; en el último («> 2000»), su borde, que es el lado que pide más riego.
 */
export function puntoMedioDelRango(rango: string) {
  const numeros = (rango.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (numeros.length === 2) return (numeros[0]! + numeros[1]!) / 2
  if (numeros.length === 1 && rango.includes('<')) return numeros[0]! / 2
  if (numeros.length === 1 && rango.includes('>')) return numeros[0]!
  throw new Error(`No se entiende el rango de lluvia del SENAMHI: «${rango}»`)
}

const esquemaWfs = z.object({ features: z.array(z.object({ properties: z.object({ rango: z.string() }) })) })
const parametroPower = z.record(z.string(), z.number())
const esquemaPower = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number(), z.number()]) }),
  properties: z.object({
    parameter: z.object({
      T2M_MAX: parametroPower,
      T2M_MIN: parametroPower,
      RH2M: parametroPower,
      WS2M: parametroPower,
      ALLSKY_SFC_SW_DWN: parametroPower,
      PRECTOTCORR: parametroPower,
    }),
  }),
  header: z.object({ fill_value: z.number(), range: z.string() }),
})
type Power = z.infer<typeof esquemaPower>

const capaDelMes = (mes: number) => `g_05_02:05_02_${String(mes).padStart(3, '0')}_03_001_512_0000_00_00`

export function climaEnLinea({
  bd,
  obtener = fetch,
  tiempoLimiteMs = TIEMPO_LIMITE_MS,
  vigenciaMs = VIGENCIA_MS,
}: {
  bd: Bd
  obtener?: typeof fetch
  tiempoLimiteMs?: number
  vigenciaMs?: number
}): ProveedorDeClima {
  async function conCache<T>(clave: string, consultar: () => Promise<T>): Promise<T> {
    const guardada = await bd.cacheServicioExterno.findUnique({ where: { servicio_claveConsulta: { servicio: 'clima', claveConsulta: clave } } })
    if (guardada && guardada.expiraEn > new Date()) return guardada.respuesta as T
    const respuesta = await consultar()
    const datos = { respuesta: respuesta as object, obtenidoEn: new Date(), expiraEn: new Date(Date.now() + vigenciaMs) }
    await bd.cacheServicioExterno.upsert({
      where: { servicio_claveConsulta: { servicio: 'clima', claveConsulta: clave } },
      create: { servicio: 'clima', claveConsulta: clave, ...datos },
      update: datos,
    })
    return respuesta
  }

  // WFS 1.0.0: el punto va con la longitud primero. En 2.0.0 el orden de EPSG:4326 es latitud, longitud.
  const rangosDelSenamhi = ({ lat, lon }: PuntoGeografico) =>
    conCache(`senamhi-precipitacion:v1:${lat.toFixed(3)},${lon.toFixed(3)}`, () =>
      Promise.all(
        Array.from({ length: 12 }, async (_, i) => {
          const url =
            'https://idesep.senamhi.gob.pe/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature' +
            `&typeName=${capaDelMes(i + 1)}&outputFormat=application/json&propertyName=rango` +
            `&cql_filter=${encodeURIComponent(`INTERSECTS(geom,POINT(${lon} ${lat}))`)}`
          const respuesta = await consultarConLimite(obtener, url, 'El SENAMHI', tiempoLimiteMs)
          if (!respuesta.ok) throw new Error(`El SENAMHI respondió ${respuesta.status}`)
          const rango = esquemaWfs.parse(await respuesta.json()).features[0]?.properties.rango
          if (!rango) throw new Error(`El SENAMHI no tiene lluvia del mes ${i + 1} en este punto`)
          return rango
        }),
      ),
    )

  const climatologiaDePower = ({ lat, lon }: PuntoGeografico) =>
    conCache(`nasa-power-climatologia:v1:${lat.toFixed(2)},${lon.toFixed(2)}`, async () => {
      const url =
        'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN' +
        `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`
      const respuesta = await consultarConLimite(obtener, url, 'NASA POWER', tiempoLimiteMs)
      if (!respuesta.ok) throw new Error(`NASA POWER respondió ${respuesta.status}`)
      const power = esquemaPower.parse(await respuesta.json())
      for (const [parametro, valores] of Object.entries(power.properties.parameter)) {
        for (const mes of MESES_POWER) {
          if (valores[mes] === undefined || valores[mes] === power.header.fill_value) {
            throw new Error(`NASA POWER no tiene ${parametro} de ${mes} en este punto`)
          }
        }
      }
      return power
    })

  return {
    async normales(punto, altitudM) {
      const power: Power = await climatologiaDePower(punto)
      const { parameter } = power.properties
      const altitudDeLaCelda = power.geometry.coordinates[2]
      const correccion = -GRADIENTE_TERMICO_C_POR_M * (altitudM - altitudDeLaCelda)

      let lluvias: number[]
      let lluvia: FuenteDeDato
      try {
        lluvias = (await rangosDelSenamhi(punto)).map(puntoMedioDelRango)
        lluvia = {
          nombre: 'SENAMHI, caracterización de la precipitación mensual (IDESEP), punto medio del rango',
          resolucion: 'zonas de igual rango de lluvia',
          respaldo: false,
        }
      } catch {
        lluvias = MESES_POWER.map((m, i) => parameter.PRECTOTCORR[m]! * DIAS_DEL_MES[i]!)
        lluvia = {
          nombre: `NASA POWER, precipitación corregida, ${power.header.range}: el SENAMHI no respondió`,
          resolucion: '0.5° × 0.625°',
          respaldo: true,
        }
      }

      return {
        meses: MESES_POWER.map((m, i) => ({
          temperaturaMaximaC: parameter.T2M_MAX[m]! + correccion,
          temperaturaMinimaC: parameter.T2M_MIN[m]! + correccion,
          humedadRelativaMediaPct: parameter.RH2M[m]!,
          vientoA2mMs: parameter.WS2M[m]!,
          radiacionSolarMJm2Dia: parameter.ALLSKY_SFC_SW_DWN[m]!,
          lluviaMm: lluvias[i]!,
        })),
        lluvia,
        atmosfera: {
          nombre:
            `NASA POWER, ${power.header.range}; temperaturas llevadas de los ${Math.round(altitudDeLaCelda)} m de su celda ` +
            `a los ${Math.round(altitudM)} m de la parcela (−6.5 °C por km). Respaldo mientras se extrae el PISCO del SENAMHI`,
          resolucion: '0.5° × 0.625°',
          respaldo: true,
        },
      }
    },
  }
}
