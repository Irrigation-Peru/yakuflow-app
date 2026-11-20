import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDePrueba, navegador } from './app-de-prueba.ts'

// Las teselas del mapa pasan por el servidor (D13): se identifican ante OpenStreetMap como pide su política de
// uso, se guardan en memoria y nunca se descargan por adelantado.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const pedidos: { url: string; agente: string | null }[] = []
let fallar = false

const osmFalso = (async (url: string | URL, opciones?: RequestInit) => {
  pedidos.push({ url: String(url), agente: new Headers(opciones?.headers).get('User-Agent') })
  if (fallar) return new Response('no', { status: 503 })
  return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } })
}) as typeof fetch

// Cerro de Pasco (−10.68°, −76.26°) con zoom 15: x = 9442, y = 17361.
const TESELA = '/api/teselas/15/9442/17361.png'

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba({ obtenerTesela: osmFalso })
})
afterAll(() => prueba.cerrar())

describe('teselas del mapa', () => {
  it('trae la tesela de OpenStreetMap identificándose con el contacto del equipo', async () => {
    const respuesta = await navegador(prueba.app).get(TESELA)
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers['content-type']).toBe('image/png')
    expect(new Uint8Array(respuesta.body)).toEqual(PNG)
    expect(pedidos).toEqual([{ url: 'https://tile.openstreetmap.org/15/9442/17361.png', agente: expect.stringContaining('equipo@ejemplo.pe') }])
  })

  it('la segunda vez la sirve de la memoria, y le dice al navegador que la guarde', async () => {
    const respuesta = await navegador(prueba.app).get(TESELA)
    expect(respuesta.status).toBe(200)
    expect(pedidos).toHaveLength(1)
    expect(respuesta.headers['cache-control']).toMatch(/max-age=\d+/)
    expect(respuesta.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })

  it('no sirve teselas fuera del Perú ni con un zoom que no existe', async () => {
    expect((await navegador(prueba.app).get('/api/teselas/15/0/0.png')).status).toBe(404)
    expect((await navegador(prueba.app).get('/api/teselas/20/1/1.png')).status).toBe(404)
    expect((await navegador(prueba.app).get('/api/teselas/15/abc/1.png')).status).toBe(404)
    expect(pedidos).toHaveLength(1)
  })

  it('avisa cuando OpenStreetMap no responde', async () => {
    fallar = true
    const respuesta = await navegador(prueba.app).get('/api/teselas/15/9443/17361.png')
    fallar = false
    expect(respuesta.status).toBe(502)
  })
})
