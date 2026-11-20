import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDePrueba, estudianteHabilitado, estudianteRegistrado, navegador } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// HU0007, criterio 1: cada acción del estudiante queda registrada con su marca de tiempo, el paso y sus datos.

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba()
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

const hace = (segundos: number) => new Date(Date.now() - segundos * 1000).toISOString()

describe('registro de cada acción', () => {
  it('guarda un lote de acciones con su paso, sus datos y la hora en que ocurrieron', async () => {
    const { agente, datos } = await estudianteHabilitado(prueba.app)
    const respuesta = await agente.post('/api/eventos').send({
      eventos: [
        { paso: 1, accion: 'parcelaCerrada', detalle: { vertices: 5 }, ocurridoEn: hace(20) },
        { paso: 1, accion: 'fuenteUbicada', detalle: {}, ocurridoEn: hace(10) },
      ],
    })
    expect(respuesta.status).toBe(201)
    expect(respuesta.body).toEqual({ registrados: 2 })
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { correoInstitucional: datos.correo } })
    const eventos = await prueba.bd.evento.findMany({ where: { usuarioId: usuario.id }, orderBy: { ocurridoEn: 'asc' } })
    expect(eventos.map((e) => [e.paso, e.accion, e.detalle])).toEqual([
      [1, 'parcelaCerrada', { vertices: 5 }],
      [1, 'fuenteUbicada', {}],
    ])
  })

  it('registra el paso 0 aunque el recorrido siga bloqueado', async () => {
    const { agente } = await estudianteRegistrado(prueba.app)
    const respuesta = await agente.post('/api/eventos').send({ eventos: [{ paso: 0, accion: 'consentimientoLeido', ocurridoEn: hace(1) }] })
    expect(respuesta.status).toBe(201)
  })

  it('no registra pasos del recorrido mientras el recorrido está bloqueado', async () => {
    const { agente } = await estudianteRegistrado(prueba.app)
    const respuesta = await agente.post('/api/eventos').send({ eventos: [{ paso: 1, accion: 'parcelaCerrada', ocurridoEn: hace(1) }] })
    expect(respuesta.status).toBe(403)
  })

  it('pide sesión', async () => {
    const respuesta = await navegador(prueba.app).post('/api/eventos').send({ eventos: [] })
    expect(respuesta.status).toBe(401)
  })

  it('rechaza un paso fuera del recorrido, una acción mal nombrada y una hora del futuro', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    const enviar = (evento: Record<string, unknown>) =>
      agente.post('/api/eventos').send({ eventos: [{ paso: 1, accion: 'algoPaso', ocurridoEn: hace(1), ...evento }] })
    expect((await enviar({ paso: 9 })).status).toBe(400)
    expect((await enviar({ accion: 'Cambiar diámetro' })).status).toBe(400)
    expect((await enviar({ ocurridoEn: new Date(Date.now() + 60 * 60_000).toISOString() })).status).toBe(400)
  })

  it('rechaza un lote de más de doscientas acciones', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    const eventos = Array.from({ length: 201 }, () => ({ paso: 1, accion: 'algoPaso', ocurridoEn: hace(1) }))
    expect((await agente.post('/api/eventos').send({ eventos })).status).toBe(400)
  })

  it('no acepta acciones sobre el proyecto de otro estudiante', async () => {
    const otro = await estudianteHabilitado(prueba.app)
    const { id } = (await otro.agente.post('/api/proyectos').send({ nombre: 'Ajeno' })).body
    const { agente } = await estudianteHabilitado(prueba.app)
    const respuesta = await agente
      .post('/api/eventos')
      .send({ eventos: [{ paso: 1, accion: 'parcelaCerrada', proyectoId: id, ocurridoEn: hace(1) }] })
    expect(respuesta.status).toBe(404)
  })

  it('no ofrece ninguna forma de modificar o borrar lo registrado', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    expect((await agente.put('/api/eventos/1').send({ accion: 'otra' })).status).toBe(404)
    expect((await agente.delete('/api/eventos/1')).status).toBe(404)
  })
})
