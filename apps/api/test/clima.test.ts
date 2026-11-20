import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { climaEnLinea, GRADIENTE_TERMICO_C_POR_M, puntoMedioDelRango } from '../src/servicios/clima.ts'
import { bdDePrueba } from './bd-de-prueba.ts'

// HU0009: el clima del lugar llega por coordenadas, con su origen y su resolución. La lluvia mensual es la del
// SENAMHI; la temperatura, la humedad, el viento y la radiación, de NASA POWER como respaldo mientras se extrae el
// PISCO, corregidas a la altitud de la parcela.

describe('punto medio de los rangos de lluvia del SENAMHI', () => {
  it('toma el centro del rango, la mitad del primero y el borde del último', () => {
    expect(puntoMedioDelRango('80 - 120')).toBe(100)
    expect(puntoMedioDelRango('10 - 15')).toBe(12.5)
    expect(puntoMedioDelRango('< 10')).toBe(5)
    expect(puntoMedioDelRango('> 2000')).toBe(2000)
  })

  it('rechaza un rango que no entiende', () => {
    expect(() => puntoMedioDelRango('sin dato')).toThrow(/rango/)
  })
})

// Respuestas con la forma de las reales (Rancas, Pasco), consultadas el 28 de octubre de 2026.
const RANGOS = ['80 - 120', '80 - 120', '80 - 120', '50 - 80', '15 - 25', '10 - 15', '10 - 15', '15 - 25', '50 - 80', '80 - 120', '80 - 120', '80 - 120']
const MESES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const porMes = (valores: number[]) => Object.fromEntries([...MESES.map((m, i) => [m, valores[i]!]), ['ANN', 0]])
const POWER = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-76.249, -10.697, 3994.12] },
  properties: {
    parameter: {
      T2M_MAX: porMes([19.85, 18.63, 18.72, 19, 19.5, 19.2, 19, 19.6, 20, 20.3, 20.4, 19.9]),
      T2M_MIN: porMes([-1.16, -0.12, -2.47, -3, -5, -6, -6.5, -5.5, -4, -2.5, -2, -1.5]),
      RH2M: porMes([76.7, 78.04, 79.23, 75, 68, 62, 60, 60, 65, 70, 72, 75]),
      WS2M: porMes([2.16, 2.07, 2.07, 2, 2.1, 2.2, 2.3, 2.4, 2.3, 2.2, 2.2, 2.1]),
      ALLSKY_SFC_SW_DWN: porMes([17.5, 16.38, 15.92, 17.13, 18.1, 18.19, 19.05, 19.55, 17.9, 18.41, 19.19, 17.09]),
      PRECTOTCORR: porMes([1.38, 1.74, 1.42, 1, 0.5, 0.2, 0.2, 0.3, 0.8, 1.2, 1.3, 1.4]),
    },
  },
  header: { fill_value: -999, range: '25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)' },
}

/** Un servicio que no contesta: la consulta solo termina si quien pregunta deja de esperar. */
const MUDO = Symbol('no responde')
const sinRespuesta = (init?: RequestInit) =>
  new Promise<Response>((_, rechazar) => init?.signal?.addEventListener('abort', () => rechazar(init.signal!.reason)))

function serviciosFalsos({ senamhi = true as boolean | typeof MUDO, power = POWER as unknown } = {}) {
  const pedidos: string[] = []
  const obtener = async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    pedidos.push(u)
    if (u.includes('idesep.senamhi.gob.pe')) {
      if (senamhi === MUDO) return sinRespuesta(init)
      if (!senamhi) return new Response('caído', { status: 503 })
      const mes = Number(/05_02_(\d{3})_03/.exec(u)![1])
      return Response.json({ type: 'FeatureCollection', features: [{ properties: { rango: RANGOS[mes - 1] } }] })
    }
    if (u.includes('power.larc.nasa.gov')) return power === MUDO ? sinRespuesta(init) : Response.json(power)
    return new Response('no esperado', { status: 404 })
  }
  return { pedidos, obtener: obtener as typeof fetch }
}

describe('clima del lugar en línea', () => {
  let prueba: Awaited<ReturnType<typeof bdDePrueba>>
  beforeAll(async () => {
    prueba = await bdDePrueba()
  })
  afterAll(() => prueba.cerrar())

  const punto = { lat: -10.6967, lon: -76.2493 }

  it('la lluvia es el punto medio del rango del SENAMHI, mes por mes', async () => {
    const servicios = serviciosFalsos()
    const clima = await climaEnLinea({ bd: prueba.bd, obtener: servicios.obtener }).normales(punto, 4300)
    expect(clima.meses.map((m) => m.lluviaMm)).toEqual(RANGOS.map(puntoMedioDelRango))
    expect(clima.lluvia).toMatchObject({ respaldo: false })
    expect(clima.lluvia.nombre).toMatch(/SENAMHI/)
    // Doce capas, una por mes, consultadas por WFS 1.0.0: longitud primero.
    const alSenamhi = servicios.pedidos.filter((p) => p.includes('senamhi'))
    expect(alSenamhi).toHaveLength(12)
    expect(alSenamhi[0]).toContain('version=1.0.0')
    expect(decodeURIComponent(alSenamhi[0]!)).toContain('POINT(-76.2493 -10.6967)')
  })

  it('la temperatura de NASA POWER se corrige de la altitud de su celda a la de la parcela', async () => {
    expect(GRADIENTE_TERMICO_C_POR_M).toBe(0.0065)
    const clima = await climaEnLinea({ bd: prueba.bd, obtener: serviciosFalsos().obtener }).normales(punto, 4300)
    const correccion = -0.0065 * (4300 - 3994.12)
    expect(clima.meses[0]!.temperaturaMaximaC).toBeCloseTo(19.85 + correccion, 9)
    expect(clima.meses[6]!.temperaturaMinimaC).toBeCloseTo(-6.5 + correccion, 9)
    expect(clima.meses[0]!.humedadRelativaMediaPct).toBe(76.7)
    expect(clima.meses[0]!.vientoA2mMs).toBe(2.16)
    expect(clima.meses[0]!.radiacionSolarMJm2Dia).toBe(17.5)
    expect(clima.atmosfera).toMatchObject({ respaldo: true })
    expect(clima.atmosfera.nombre).toMatch(/NASA POWER/)
    expect(clima.atmosfera.nombre).toMatch(/2001 - December 2025|2001 a 2025/)
    expect(clima.atmosfera.nombre).toMatch(/3994 m/)
  })

  it('lo consultado queda en la caché: la segunda vez no sale a internet', async () => {
    const servicios = serviciosFalsos()
    const proveedor = climaEnLinea({ bd: prueba.bd, obtener: servicios.obtener })
    const lejos = { lat: -11.2, lon: -75.9 }
    await proveedor.normales(lejos, 3500)
    const pedidos = servicios.pedidos.length
    const otra = await proveedor.normales(lejos, 3600)
    expect(servicios.pedidos).toHaveLength(pedidos)
    // La corrección por altitud se aplica sobre lo guardado, con la altitud de cada consulta.
    expect(otra.meses[0]!.temperaturaMaximaC).toBeCloseTo(19.85 - 0.0065 * (3600 - 3994.12), 9)
  })

  it('si el SENAMHI no responde, la lluvia sale de NASA POWER y se declara respaldo', async () => {
    const clima = await climaEnLinea({ bd: prueba.bd, obtener: serviciosFalsos({ senamhi: false }).obtener }).normales(
      { lat: -12, lon: -75 },
      3300,
    )
    expect(clima.lluvia.respaldo).toBe(true)
    expect(clima.lluvia.nombre).toMatch(/NASA POWER/)
    // 1.38 mm al día en los 31 días de enero.
    expect(clima.meses[0]!.lluviaMm).toBeCloseTo(1.38 * 31, 9)
    expect(clima.meses[1]!.lluviaMm).toBeCloseTo(1.74 * 28, 9)
  })

  it('si NASA POWER no responde a tiempo, la consulta se corta con un error claro', async () => {
    const proveedor = climaEnLinea({ bd: prueba.bd, obtener: serviciosFalsos({ power: MUDO }).obtener, tiempoLimiteMs: 20 })
    await expect(proveedor.normales({ lat: -13.5, lon: -74.5 }, 3000)).rejects.toThrow(/NASA POWER no respondió/)
  })

  it('si el SENAMHI no responde a tiempo, la lluvia sale de NASA POWER', async () => {
    const proveedor = climaEnLinea({ bd: prueba.bd, obtener: serviciosFalsos({ senamhi: MUDO }).obtener, tiempoLimiteMs: 20 })
    const clima = await proveedor.normales({ lat: -12.5, lon: -75.5 }, 3300)
    expect(clima.lluvia.respaldo).toBe(true)
    expect(clima.lluvia.nombre).toMatch(/NASA POWER/)
  })

  it('un valor de relleno de NASA POWER es un error claro, no un número', async () => {
    const conHueco = structuredClone(POWER)
    conHueco.properties.parameter.T2M_MAX.MAR = -999
    const proveedor = climaEnLinea({ bd: prueba.bd, obtener: serviciosFalsos({ power: conHueco }).obtener })
    await expect(proveedor.normales({ lat: -13, lon: -74 }, 3000)).rejects.toThrow(/NASA POWER no tiene/)
  })
})
