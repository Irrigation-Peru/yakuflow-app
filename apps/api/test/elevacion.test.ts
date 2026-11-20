import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  elevacionCompuesta,
  elevacionDeEscenario,
  elevacionDeOpenTopoData,
  type Escenario,
  type ProveedorDeElevacion,
} from '../src/servicios/elevacion.ts'
import { bdDePrueba } from './bd-de-prueba.ts'

// La cota de cada punto: primero del escenario precargado (el DEM del IGN extraído antes), y fuera de su
// cobertura del respaldo en línea, declarado. Nunca dos fuentes en el mismo cálculo.

// Un plano conocido: z = 3000 + 1000·(lat − latSur) + 500·(lon − lonOeste), en una cuadrícula de 3 × 4.
const escenario: Escenario = {
  nombre: 'Escenario de prueba',
  fuente: { nombre: 'DEM de prueba', resolucionM: 30, respaldo: false },
  latSur: -10.7,
  lonOeste: -76.3,
  pasoGrados: 0.01,
  filas: 3,
  columnas: 4,
  cotas: [0, 1, 2].flatMap((f) => [0, 1, 2, 3].map((c) => 3000 + 1000 * 0.01 * f + 500 * 0.01 * c)),
}

describe('escenario precargado', () => {
  const dem = elevacionDeEscenario(escenario)

  it('interpola dentro de la cuadrícula; en un plano, sin error', async () => {
    const { cotas, fuente } = await dem.cotas([{ lat: -10.685, lon: -76.275 }])
    expect(cotas[0]).toBeCloseTo(3000 + 1000 * 0.015 + 500 * 0.025, 9)
    expect(fuente.nombre).toBe('DEM de prueba')
  })

  it('sabe qué puntos cubre', () => {
    expect(dem.cubre({ lat: -10.69, lon: -76.28 })).toBe(true)
    expect(dem.cubre({ lat: -10.75, lon: -76.28 })).toBe(false)
    expect(dem.cubre({ lat: -10.69, lon: -76.2 })).toBe(false)
  })
})

describe('elevación compuesta', () => {
  const respaldo: ProveedorDeElevacion = {
    cotas: async (puntos) => ({ cotas: puntos.map(() => 1), fuente: { nombre: 'Respaldo', resolucionM: 30, respaldo: true } }),
  }
  const compuesta = elevacionCompuesta([elevacionDeEscenario(escenario)], respaldo)

  it('usa el escenario cuando cubre todos los puntos', async () => {
    const { fuente } = await compuesta.cotas([{ lat: -10.69, lon: -76.28 }])
    expect(fuente.nombre).toBe('DEM de prueba')
  })

  it('usa el respaldo para todos si un solo punto queda fuera, para no mezclar fuentes', async () => {
    const { cotas, fuente } = await compuesta.cotas([
      { lat: -10.69, lon: -76.28 },
      { lat: -10.9, lon: -76.28 },
    ])
    expect(fuente.respaldo).toBe(true)
    expect(cotas).toEqual([1, 1])
  })
})

describe('respaldo en línea (OpenTopoData, SRTM de 30 m)', () => {
  let prueba: Awaited<ReturnType<typeof bdDePrueba>>
  beforeAll(async () => {
    prueba = await bdDePrueba()
  })
  afterAll(() => prueba.cerrar())

  function servicioFalso(respuesta: (locations: string[]) => unknown) {
    const pedidos: string[] = []
    const obtener = async (url: string | URL) => {
      pedidos.push(String(url))
      const locations = new URL(String(url)).searchParams.get('locations')!.split('|')
      return new Response(JSON.stringify(respuesta(locations)), { status: 200 })
    }
    return { pedidos, obtener: obtener as typeof fetch }
  }
  const resultados = (locations: string[]) => ({
    status: 'OK',
    results: locations.map((l) => ({ elevation: 3000 + Number(l.split(',')[0]) * -1 })),
  })

  it('pide de a cien puntos, guarda cada cota en la caché y no vuelve a pedirla', async () => {
    const servicio = servicioFalso(resultados)
    const proveedor = elevacionDeOpenTopoData({ bd: prueba.bd, obtener: servicio.obtener, pausaMs: 0 })
    const puntos = Array.from({ length: 150 }, (_, i) => ({ lat: -10 - i * 0.001, lon: -76 }))
    const primera = await proveedor.cotas(puntos)
    expect(servicio.pedidos).toHaveLength(2)
    expect(primera.cotas[0]).toBeCloseTo(3010, 6)
    expect(primera.fuente).toMatchObject({ resolucionM: 30, respaldo: true })

    const segunda = await proveedor.cotas(puntos.slice(0, 10))
    expect(servicio.pedidos).toHaveLength(2)
    expect(segunda.cotas).toEqual(primera.cotas.slice(0, 10))
  })

  it('falla con un mensaje claro si el servicio no tiene la cota de un punto', async () => {
    const servicio = servicioFalso((locations) => ({ status: 'OK', results: locations.map(() => ({ elevation: null })) }))
    const proveedor = elevacionDeOpenTopoData({ bd: prueba.bd, obtener: servicio.obtener, pausaMs: 0 })
    await expect(proveedor.cotas([{ lat: 0.5, lon: 0.5 }])).rejects.toThrow(/no tiene la cota/)
  })
})
