import { desproyectarLocal } from '@riego/calculo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import { fuentesDeLaAna, puntosDeLaCapa, type ProveedorDeFuentesDeReferencia } from '../src/servicios/fuentes-de-referencia.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { bdDePrueba } from './bd-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// Paso 1: puntos de referencia para ubicar la fuente, del inventario de la ANA · SNIRH. Ayudan, no obligan: sin la
// ANA el paso sigue.

// Con la forma de las respuestas reales cerca de Cerro de Pasco, consultadas el 7 de noviembre de 2026.
const BOCATOMAS = {
  features: [
    {
      attributes: { NombreBocatoma: 'MANTALOMA', FuenteNatural: 'Río SAN JUAN', Altitud: 4195, AnioInventario: '2020' },
      geometry: { x: -76.323197, y: -10.686122 },
    },
    { attributes: { NombreBocatoma: 'OCHO', FuenteNatural: 'No Especifica ', Altitud: 4354, AnioInventario: '2020' }, geometry: { x: -76.247257, y: -10.73603 } },
  ],
}
const TOMAS = { features: [{ attributes: { NombreBocatoma: 'JOGO', FuenteNatural: ' ', Altitud: 0, AnioInventario: '2020' }, geometry: { x: -76.288333, y: -10.717182 } }] }
const LAGUNAS = {
  features: [
    {
      attributes: { NOMBREOFICIAL: ' ', NOMBRECUERPO: ' ' },
      geometry: { rings: [[[-76.25072, -10.62934], [-76.25048, -10.63208], [-76.25156, -10.63225], [-76.25155, -10.62921], [-76.25072, -10.62934]]] },
    },
  ],
}

function anaFalsa() {
  const pedidos: string[] = []
  const obtener = async (url: string | URL) => {
    const u = String(url)
    pedidos.push(u)
    return Response.json(u.includes('/Bocatomas/') ? BOCATOMAS : u.includes('/Tomas/') ? TOMAS : LAGUNAS)
  }
  return { pedidos, obtener: obtener as typeof fetch }
}

describe('los puntos de la ANA', () => {
  it('limpia lo que la ANA deja sin especificar y no trae el caudal', () => {
    const [mantaloma, ocho] = puntosDeLaCapa('bocatoma', BOCATOMAS)
    expect(mantaloma).toEqual({ tipo: 'bocatoma', nombre: 'MANTALOMA', fuenteNatural: 'Río SAN JUAN', altitudMsnm: 4195, anioInventario: '2020', lat: -10.686122, lon: -76.323197 })
    expect(ocho!.fuenteNatural).toBeNull()
    const [jogo] = puntosDeLaCapa('toma', TOMAS)
    expect(jogo).toMatchObject({ fuenteNatural: null, altitudMsnm: null })
    expect(Object.keys(jogo!)).not.toContain('caudal')
  })

  it('una laguna se ubica en el centro de su borde, sin contar dos veces el vértice de cierre', () => {
    const [laguna] = puntosDeLaCapa('laguna', LAGUNAS)
    expect(laguna!.nombre).toBeNull()
    expect(laguna!.lon).toBeCloseTo((-76.25072 - 76.25048 - 76.25156 - 76.25155) / 4, 9)
    expect(laguna!.lat).toBeCloseTo((-10.62934 - 10.63208 - 10.63225 - 10.62921) / 4, 9)
  })

  describe('con la caché del servidor', () => {
    let prueba: Awaited<ReturnType<typeof bdDePrueba>>
    beforeAll(async () => {
      prueba = await bdDePrueba()
    })
    afterAll(() => prueba.cerrar())

    it('consulta las tres capas en un recuadro alrededor del punto, y la segunda vez no sale a internet', async () => {
      const ana = anaFalsa()
      const proveedor = fuentesDeLaAna({ bd: prueba.bd, obtener: ana.obtener })
      const primera = await proveedor.cerca({ lat: -10.68, lon: -76.26 })
      expect(primera.puntos.map((p) => p.tipo)).toEqual(['bocatoma', 'bocatoma', 'toma', 'laguna'])
      expect(primera.fuente.nombre).toMatch(/ANA · SNIRH/)
      expect(ana.pedidos).toHaveLength(3)
      expect(ana.pedidos[0]).toContain('geometry=-76.30000,-10.72000,-76.22000,-10.64000')
      expect(ana.pedidos.every((u) => !/Caudal/i.test(u))).toBe(true)
      const segunda = await proveedor.cerca({ lat: -10.68, lon: -76.26 })
      expect(segunda).toEqual(primera)
      expect(ana.pedidos).toHaveLength(3)
    })
  })
})

// Un plano cualquiera: aquí solo importa que la parcela exista.
const ORIGEN = { lat: -10.68, lon: -76.25 }
const plano: ProveedorDeElevacion = {
  cotas: async (puntos) => ({ cotas: puntos.map(() => 3000), fuente: { nombre: 'Plano de prueba', resolucionM: 1, respaldo: false } }),
}
const cuadrado = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
].map(([x, y]) => desproyectarLocal(ORIGEN, { x: x!, y: y! }))

describe('la ruta del paso 1', () => {
  let centroPedido: { lat: number; lon: number } | null = null
  const fijas: ProveedorDeFuentesDeReferencia = {
    cerca: async (centro) => {
      centroPedido = centro
      return { puntos: puntosDeLaCapa('bocatoma', BOCATOMAS), fuente: { nombre: 'ANA de prueba', resolucion: 'puntual', respaldo: false } }
    },
  }

  async function conParcela(app: Awaited<ReturnType<typeof appDePrueba>>['app']) {
    const { agente } = await estudianteHabilitado(app)
    const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Parcela de prueba' })).body
    return { agente, id: id as string }
  }

  it('busca alrededor del centro de la parcela, y sin parcela pide dibujarla primero', async () => {
    const prueba = await appDePrueba({ elevacion: plano, fuentesDeReferencia: fijas })
    try {
      await cargarItemsDePrueba(prueba.bd)
      const { agente, id } = await conParcela(prueba.app)
      const sinParcela = await agente.get(`/api/proyectos/${id}/fuentes-de-referencia`)
      expect(sinParcela.status).toBe(409)
      expect(sinParcela.body.codigo).toBe('parcela_pendiente')

      await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado }).expect(200)
      const respuesta = await agente.get(`/api/proyectos/${id}/fuentes-de-referencia`).expect(200)
      expect(respuesta.body.puntos).toHaveLength(2)
      expect(respuesta.body.aviso).toBeNull()
      const centro = desproyectarLocal(ORIGEN, { x: 50, y: 50 })
      expect(centroPedido!.lat).toBeCloseTo(centro.lat, 6)
      expect(centroPedido!.lon).toBeCloseTo(centro.lon, 6)
    } finally {
      await prueba.cerrar()
    }
  })

  it('si la ANA no responde, la lista llega vacía con un aviso y el paso sigue', async () => {
    const prueba = await appDePrueba({ elevacion: plano })
    try {
      await cargarItemsDePrueba(prueba.bd)
      const { agente, id } = await conParcela(prueba.app)
      await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado }).expect(200)
      const respuesta = await agente.get(`/api/proyectos/${id}/fuentes-de-referencia`).expect(200)
      expect(respuesta.body.puntos).toEqual([])
      expect(respuesta.body.aviso).toMatch(/La ANA no respondió/)
    } finally {
      await prueba.cerrar()
    }
  })

  it('el proyecto de otro estudiante no existe para ti', async () => {
    const prueba = await appDePrueba({ elevacion: plano, fuentesDeReferencia: fijas })
    try {
      await cargarItemsDePrueba(prueba.bd)
      const { id } = await conParcela(prueba.app)
      const { agente: otro } = await estudianteHabilitado(prueba.app)
      expect((await otro.get(`/api/proyectos/${id}/fuentes-de-referencia`)).status).toBe(404)
    } finally {
      await prueba.cerrar()
    }
  })
})
