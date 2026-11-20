import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bdDePrueba } from './bd-de-prueba.ts'

// Decisión de software 4: la aplicación se conecta con un usuario al que se le quitan UPDATE y DELETE sobre el
// registro de actividad. Aquí se corre el script que lo crea y se prueba con ese rol.

const SCRIPT = readFileSync(join(import.meta.dirname, '..', 'prisma', 'rol-de-la-aplicacion.sql'), 'utf8')

describe('usuario restringido de la aplicación', () => {
  let prueba: Awaited<ReturnType<typeof bdDePrueba>>
  let usuarioId: string

  // Cada sentencia va en su propia transacción con SET LOCAL ROLE: si falla, el adaptador descarta la conexión,
  // y un SET ROLE de sesión se perdería con ella.
  const comoAplicacion = (sql: string) =>
    prueba.bd
      .$transaction([prueba.bd.$executeRawUnsafe('SET LOCAL ROLE riego_app'), prueba.bd.$executeRawUnsafe(sql)])
      .then(([, n]) => n)

  beforeAll(async () => {
    prueba = await bdDePrueba()
    // La base en memoria aplica las migraciones sin Prisma; la tabla que Prisma usa para recordarlas se crea a mano.
    await prueba.bd.$executeRawUnsafe('CREATE TABLE _prisma_migrations (id VARCHAR(36) PRIMARY KEY)')
    // psql reemplaza :'clave' por el literal; aquí se hace a mano, y se separa por «;» al final de una línea sin
    // sangría, que es como está escrito el script.
    const sentencias = SCRIPT.replace(":'clave'", "'una clave de prueba'")
      .split(/;[ \t]*(?:\r?\n|$)(?![ \t])/)
      .filter((s) => s.split('\n').some((linea) => linea.trim() && !linea.trim().startsWith('--')))
    for (const sentencia of sentencias) await prueba.bd.$executeRawUnsafe(sentencia)
    const usuario = await prueba.bd.usuario.create({
      data: { correoInstitucional: 'rol@undac.edu.pe', contrasenaHash: 'x', nombres: 'Rol', codigoCurso: 'C' },
    })
    usuarioId = usuario.id
  })
  afterAll(() => prueba.cerrar())

  it('puede agregar eventos', async () => {
    const insertados = await comoAplicacion(
      `INSERT INTO evento (usuario_id, paso, accion, ocurrido_en) VALUES ('${usuarioId}', 1, 'parcelaCerrada', now())`,
    )
    expect(insertados).toBe(1)
  })

  it('no tiene permiso para modificar ni borrar eventos', async () => {
    await expect(comoAplicacion(`UPDATE evento SET accion = 'otra'`)).rejects.toThrow(/permission denied/)
    await expect(comoAplicacion('DELETE FROM evento')).rejects.toThrow(/permission denied/)
    await expect(comoAplicacion('TRUNCATE evento')).rejects.toThrow(/permission denied/)
  })

  it('sí puede modificar el resto de las tablas', async () => {
    const cambiados = await comoAplicacion(`UPDATE usuario SET nombres = 'Otro' WHERE id = '${usuarioId}'`)
    expect(cambiados).toBe(1)
  })

  it('no puede tocar el historial de migraciones', async () => {
    await expect(comoAplicacion('DELETE FROM _prisma_migrations')).rejects.toThrow(/permission denied/)
  })

  it('no puede crear tablas', async () => {
    await expect(comoAplicacion('CREATE TABLE intrusa (id int)')).rejects.toThrow(/permission denied/)
  })
})
