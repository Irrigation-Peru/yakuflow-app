import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bdDePrueba } from './bd-de-prueba.ts'

// HU0007, criterio 2: el registro de actividad no se modifica ni se borra, aunque se intente directo en la base.

describe('registro de actividad en solo-anexado', () => {
  let prueba: Awaited<ReturnType<typeof bdDePrueba>>
  let eventoId: bigint

  beforeAll(async () => {
    prueba = await bdDePrueba()
    const usuario = await prueba.bd.usuario.create({
      data: { correoInstitucional: 'a@undac.edu.pe', contrasenaHash: 'x', nombres: 'Prueba', codigoCurso: 'C1' },
    })
    const evento = await prueba.bd.evento.create({
      data: { usuarioId: usuario.id, paso: 1, accion: 'parcelaCerrada', ocurridoEn: new Date() },
    })
    eventoId = evento.id
  })
  afterAll(() => prueba.cerrar())

  it('admite agregar eventos', async () => {
    expect(await prueba.bd.evento.count()).toBe(1)
  })

  it('rechaza modificar un evento', async () => {
    await expect(prueba.bd.evento.update({ where: { id: eventoId }, data: { accion: 'otra' } })).rejects.toThrow(
      /solo admite agregar/,
    )
  })

  it('rechaza borrar un evento', async () => {
    await expect(prueba.bd.evento.delete({ where: { id: eventoId } })).rejects.toThrow(/solo admite agregar/)
  })

  it('rechaza vaciar la tabla', async () => {
    await expect(prueba.bd.$executeRawUnsafe('TRUNCATE evento CASCADE')).rejects.toThrow(/solo admite agregar/)
  })

  it('conserva el evento original', async () => {
    const evento = await prueba.bd.evento.findUniqueOrThrow({ where: { id: eventoId } })
    expect(evento.accion).toBe('parcelaCerrada')
  })
})
