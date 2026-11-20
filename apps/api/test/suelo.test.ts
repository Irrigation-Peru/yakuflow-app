import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sueloDeSoilGrids } from '../src/servicios/suelo.ts'
import { bdDePrueba } from './bd-de-prueba.ts'

// HU0009: el suelo del lugar llega con su origen y su resolución. El MIDAGRI no tiene textura en Pasco: se usa
// SoilGrids como respaldo declarado, con el promedio de los primeros 30 cm.

// Con la forma de la respuesta real en Rancas (Pasco), consultada el 28 de octubre de 2026.
const capa = (name: string, valores: (number | null)[]) => ({
  name,
  depths: ['0-5cm', '5-15cm', '15-30cm'].map((label, i) => ({ label, values: { mean: valores[i]! } })),
})
const RANCAS = {
  type: 'Feature',
  properties: {
    layers: [
      capa('clay', [195, 201, 196]),
      capa('sand', [467, 462, 455]),
      capa('silt', [337, 337, 348]),
      capa('phh2o', [61, 61, 62]),
    ],
  },
}

function servicioFalso(respuesta: unknown) {
  const pedidos: string[] = []
  const obtener = async (url: string | URL) => {
    pedidos.push(String(url))
    return Response.json(respuesta)
  }
  return { pedidos, obtener: obtener as typeof fetch }
}

describe('suelo de SoilGrids', () => {
  let prueba: Awaited<ReturnType<typeof bdDePrueba>>
  beforeAll(async () => {
    prueba = await bdDePrueba()
  })
  afterAll(() => prueba.cerrar())

  it('promedia los primeros 30 cm según el espesor de cada capa y lleva las fracciones a 100 %', async () => {
    const servicio = servicioFalso(RANCAS)
    const suelo = await sueloDeSoilGrids({ bd: prueba.bd, obtener: servicio.obtener }).suelo({ lat: -10.6967, lon: -76.2493 })
    // g/kg con espesores de 5, 10 y 15 cm.
    const promedio = (v: number[]) => (5 * v[0]! + 10 * v[1]! + 15 * v[2]!) / 30 / 10
    const [arcilla, arena, limo] = [promedio([195, 201, 196]), promedio([467, 462, 455]), promedio([337, 337, 348])]
    const suma = arcilla + arena + limo
    expect(suelo.arenaPct).toBeCloseTo((100 * arena) / suma, 9)
    expect(suelo.arcillaPct).toBeCloseTo((100 * arcilla) / suma, 9)
    expect(suelo.limoPct).toBeCloseTo((100 * limo) / suma, 9)
    expect(suelo.arenaPct + suelo.limoPct + suelo.arcillaPct).toBeCloseTo(100, 9)
    expect(suelo.ph).toBeCloseTo((5 * 6.1 + 10 * 6.1 + 15 * 6.2) / 30, 9)
    expect(suelo.fuente).toMatchObject({ resolucion: '250 m', respaldo: true })
    expect(suelo.fuente.nombre).toMatch(/SoilGrids/)
  })

  it('si SoilGrids no responde a tiempo, la consulta se corta con un error claro', async () => {
    // Un servicio que no contesta: la consulta solo termina si quien pregunta deja de esperar.
    const obtener = ((_url: string | URL, init?: RequestInit) =>
      new Promise<Response>((_, rechazar) => init?.signal?.addEventListener('abort', () => rechazar(init.signal!.reason)))) as typeof fetch
    const proveedor = sueloDeSoilGrids({ bd: prueba.bd, obtener, tiempoLimiteMs: 20 })
    await expect(proveedor.suelo({ lat: -12.5, lon: -75.5 })).rejects.toThrow(/SoilGrids no respondió/)
  })

  it('lo consultado queda en la caché', async () => {
    const servicio = servicioFalso(RANCAS)
    const proveedor = sueloDeSoilGrids({ bd: prueba.bd, obtener: servicio.obtener })
    await proveedor.suelo({ lat: -11, lon: -76 })
    await proveedor.suelo({ lat: -11, lon: -76 })
    expect(servicio.pedidos).toHaveLength(1)
  })

  it('donde SoilGrids no tiene dato (agua, nieve, ciudad), lo dice', async () => {
    const sinDato = { properties: { layers: [capa('clay', [null, null, null]), ...RANCAS.properties.layers.slice(1)] } }
    const proveedor = sueloDeSoilGrids({ bd: prueba.bd, obtener: servicioFalso(sinDato).obtener })
    await expect(proveedor.suelo({ lat: -12, lon: -77 })).rejects.toThrow(/SoilGrids no tiene/)
  })
})
