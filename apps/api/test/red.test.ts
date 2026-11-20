import { desproyectarLocal, type NormalDelMes } from '@riego/calculo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cargarCatalogo, catalogoVigente } from '../src/catalogo.ts'
import type { ProveedorDeClima } from '../src/servicios/clima.ts'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import type { ProveedorDeSuelo } from '../src/servicios/suelo.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// Pasos 5 y 6 en el servidor (HU0017 a HU0023): la red no se recibe del navegador; se genera con lo guardado, se le
// aplican los cambios y se vuelve a poner a funcionar antes de abrir el paso siguiente.

const ORIGEN = { lat: -10.68, lon: -76.25 }
const enMetros = (x: number, y: number) => desproyectarLocal(ORIGEN, { x, y })
const norteM = (p: { lat: number }) => (p.lat - ORIGEN.lat) * (Math.PI / 180) * 6_371_008.8
const plano: ProveedorDeElevacion = {
  cotas: async (puntos) => ({
    cotas: puntos.map((p) => 3000 + 0.05 * norteM(p)),
    fuente: { nombre: 'Plano de prueba', resolucionM: 1, respaldo: false },
  }),
}
const NORMALES: NormalDelMes[] = Array.from({ length: 12 }, (_, i) => ({
  temperaturaMaximaC: 22,
  temperaturaMinimaC: 8,
  humedadRelativaMediaPct: 70,
  vientoA2mMs: 2,
  radiacionSolarMJm2Dia: 18,
  lluviaMm: [0, 1, 2, 11].includes(i) ? 100 : 10,
}))
const FUENTE_CLIMA = { nombre: 'Clima de prueba', resolucion: '1 km', respaldo: false }
const clima: ProveedorDeClima = { normales: async () => ({ meses: NORMALES, lluvia: FUENTE_CLIMA, atmosfera: FUENTE_CLIMA }) }
const suelo: ProveedorDeSuelo = {
  suelo: async () => ({ arenaPct: 40, limoPct: 40, arcillaPct: 20, ph: 6, fuente: { nombre: 'Suelo de prueba', resolucion: '250 m', respaldo: false } }),
}

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba({ elevacion: plano, clima, suelo })
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

const cuadrado = [enMetros(0, 0), enMetros(100, 0), enMetros(100, 100), enMetros(0, 100)]

async function proyectoEnElPaso(paso: 4 | 5, caudalLps = 4) {
  const { agente } = await estudianteHabilitado(prueba.app)
  const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Campaña de prueba' })).body
  await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
  await agente
    .put(`/api/proyectos/${id}/fuente`)
    .send({ tipo: 'manantial', ...enMetros(50, 420), caudalLps, conductividadDsM: 0.3, horasDisponiblesDia: 12, origenDato: 'campo' })
  await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
  await agente.put(`/api/proyectos/${id}/campania`).send({ cultivo: 'Papa', fechaSiembra: '2027-10-01' })
  await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
  if (paso === 5) {
    const r = await agente.put(`/api/proyectos/${id}/diseno-agronomico`).send({ metodo: 'goteo', emisor: 'gotero-2', separacionM: 0.3, separacionLateralesM: 0.9 })
    expect(r.status).toBe(200)
  }
  return { agente, id: id as string }
}

describe('guardar la red (HU0017)', () => {
  it('sin el paso 4 no hay red', async () => {
    const { agente, id } = await proyectoEnElPaso(4)
    const r = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('paso_pendiente')
  })

  it('la genera el servidor con lo guardado, y el proyecto llega al paso 6', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    const { status, body } = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(6)
    expect(body.red).toMatchObject({ version: 1, origen: 'modulo', funciono: false, cambios: [] })
    expect(body.red.costoTotal).toBeGreaterThan(0)
    expect(body.red.uniformidadPct).toBeGreaterThan(0)
    const fila = await prueba.bd.red.findFirstOrThrow({ where: { proyectoId: id } })
    expect((fila.definicion as { tramos: unknown[] }).tramos.length).toBeGreaterThan(10)
    expect(fila.verificada).toBe(true)
  })

  it('no recibe la red del navegador: solo la lista de cambios, y rechaza el que no se puede aplicar', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    const inventado = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [{ tipo: 'tramo', tramo: 'no-existe', clase: 'C-10' }] })
    expect(inventado.status).toBe(400)
    expect(inventado.body.codigo).toBe('cambio_invalido')
    const fuera = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 17 }] })
    expect(fuera.status).toBe(400)
    const camaraEnLaFuente = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [{ tipo: 'poner-camara', nodo: 'F' }] })
    expect(camaraEnLaFuente.status).toBe(400)
  })

  it('cada guardado es una versión nueva, las anteriores se quedan y el cambio se conserva', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })
    const cambios = [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 110 }]
    const { body } = await agente.put(`/api/proyectos/${id}/red`).send({ cambios })
    expect(body.red).toMatchObject({ version: 2, origen: 'estudiante', cambios })
    expect(await prueba.bd.red.count({ where: { proyectoId: id } })).toBe(2)
    expect((await agente.get(`/api/proyectos/${id}`)).body.red.version).toBe(2)
  })

  it('cambiar el tubo mueve el costo', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    const base = (await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })).body.red.costoTotal
    const delgada = (await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 40.8 }] })).body.red.costoTotal
    expect(delgada).toBeLessThan(base)
  })
})

describe('poner a funcionar (HU0021, HU0023)', () => {
  it('sin red guardada no hay nada que poner a funcionar', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    const r = await agente.put(`/api/proyectos/${id}/red/funcionamiento`).send({})
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('paso_pendiente')
  })

  it('el diseño que funciona abre el paso 7', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    const { body: guardada } = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })
    expect(guardada.alertas.filter((a: { gravedad: string }) => a.gravedad === 'impide')).toEqual([])
    const corregir = guardada.alertas.filter((a: { gravedad: string }) => a.gravedad === 'corrige')
    expect(corregir).toEqual([])
    const { status, body } = await agente.put(`/api/proyectos/${id}/red/funcionamiento`).send({})
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(7)
    expect(body.red.funciono).toBe(true)
  })

  it('el tubo demasiado delgado no deja seguir, y dice por qué', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 13.6 }] })
    const r = await agente.put(`/api/proyectos/${id}/red/funcionamiento`).send({})
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('diseno_no_funciona')
    expect(r.body.detalles?.alertas?.length ?? r.body.alertas?.length).toBeGreaterThan(0)
    expect((await agente.get(`/api/proyectos/${id}`)).body.pasoAlcanzado).toBe(6)
  })

  it('volver a guardar la red la deja sin funcionar y marca el paso 6 para revisar', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })
    await agente.put(`/api/proyectos/${id}/red/funcionamiento`).send({})
    const { body } = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 110 }] })
    expect(body.red.funciono).toBe(false)
    expect(body.resultadosDesactualizados).toContain(6)
    expect(body.pasoAlcanzado).toBe(7)
  })

  it('otro estudiante no llega a la red', async () => {
    const { id } = await proyectoEnElPaso(5)
    const { agente: otro } = await estudianteHabilitado(prueba.app)
    expect((await otro.put(`/api/proyectos/${id}/red`).send({ cambios: [] })).status).toBe(404)
  })
})

describe('el catálogo de precios (HU0027)', () => {
  it('sin cargar ninguno vale el provisional, y dice que lo es', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    const { status, body } = await agente.get('/api/catalogo/precios')
    expect(status).toBe(200)
    expect(body.provisional).toBe(true)
    expect(body.tuberias.length).toBeGreaterThan(0)
  })

  it('se reemplaza sin tocar el código, y el costo de la red cambia', async () => {
    const { agente, id } = await proyectoEnElPaso(5)
    const antes = (await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })).body.red.costoTotal
    const vigente = await catalogoVigente(prueba.bd)
    await cargarCatalogo(prueba.bd, {
      ...vigente,
      version: 'prueba-caro',
      provisional: false,
      fuente: 'Prueba',
      tuberias: vigente.tuberias.map((t) => ({ ...t, precioPorM: t.precioPorM * 10 })),
    })
    expect((await agente.get('/api/catalogo/precios')).body).toMatchObject({ version: 'prueba-caro', provisional: false })
    const despues = (await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })).body.red.costoTotal
    expect(despues).toBeGreaterThan(antes)
  })

  it('rechaza un catálogo mal formado', async () => {
    await expect(cargarCatalogo(prueba.bd, { version: 'mal' })).rejects.toThrow()
  })
})
