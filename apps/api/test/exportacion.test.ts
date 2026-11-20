import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportarRegistro } from '../src/registro/exportacion.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// HU0007, criterio 3: el registro sale para el análisis sin nombres ni correos, vinculado solo por un código.

const SECRETO = 'secreto de seudonimización de más de treinta y dos caracteres'

let prueba: Awaited<ReturnType<typeof appDePrueba>>
let conConsentimiento: Awaited<ReturnType<typeof estudianteHabilitado>>
let queSeRetiro: Awaited<ReturnType<typeof estudianteHabilitado>>

beforeAll(async () => {
  prueba = await appDePrueba()
  await cargarItemsDePrueba(prueba.bd)
  conConsentimiento = await estudianteHabilitado(prueba.app)
  queSeRetiro = await estudianteHabilitado(prueba.app)
  for (const { agente } of [conConsentimiento, queSeRetiro]) {
    const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Mi parcela' })).body
    await agente.post('/api/eventos').send({
      eventos: [{ paso: 1, accion: 'parcelaCerrada', proyectoId: id, detalle: { vertices: 4 }, ocurridoEn: new Date().toISOString() }],
    })
  }
  await queSeRetiro.agente.post('/api/consentimiento/retiro')
  const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { correoInstitucional: conConsentimiento.datos.correo } })
  await prueba.bd.usuario.update({ where: { id: usuario.id }, data: { grupo: 'experimental' } })
})
afterAll(() => prueba.cerrar())

const filas = (csv: string) => csv.trim().split('\n').slice(1)
const columna = (csv: string, nombre: string) => {
  const [cabecera, ...resto] = csv.trim().split('\n')
  const i = cabecera!.split(',').indexOf(nombre)
  return resto.map((f) => f.split(',')[i])
}

describe('exportación sin identificadores', () => {
  it('no lleva nombres, correos ni los identificadores de la base', async () => {
    const { eventos, respuestas } = await exportarRegistro(prueba.bd, SECRETO)
    const usuarios = await prueba.bd.usuario.findMany()
    const proyectos = await prueba.bd.proyecto.findMany()
    for (const texto of [eventos, respuestas]) {
      for (const u of usuarios) {
        expect(texto).not.toContain(u.nombres)
        expect(texto).not.toContain(u.correoInstitucional)
        expect(texto).not.toContain(u.id)
      }
      for (const p of proyectos) expect(texto).not.toContain(p.id)
    }
  })

  it('vincula los eventos y las respuestas de cada participante por el mismo código', async () => {
    const { eventos, respuestas } = await exportarRegistro(prueba.bd, SECRETO)
    const [codigo] = columna(eventos, 'participante')
    expect(codigo).toMatch(/^[0-9a-f]{16}$/)
    expect(new Set(columna(respuestas, 'participante'))).toEqual(new Set([codigo]))
    expect(columna(eventos, 'grupo')).toEqual(['experimental'])
    expect(filas(respuestas)).toHaveLength(2)
  })

  it('da el mismo código con el mismo secreto y otro con un secreto distinto', async () => {
    const a = columna((await exportarRegistro(prueba.bd, SECRETO)).eventos, 'participante')
    const b = columna((await exportarRegistro(prueba.bd, SECRETO)).eventos, 'participante')
    const c = columna((await exportarRegistro(prueba.bd, `${SECRETO} otro`)).eventos, 'participante')
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('deja fuera a quien retiró su consentimiento', async () => {
    const { eventos, respuestas } = await exportarRegistro(prueba.bd, SECRETO)
    expect(filas(eventos)).toHaveLength(1)
    expect(new Set(columna(respuestas, 'participante')).size).toBe(1)
  })

  it('exige un secreto largo', async () => {
    await expect(exportarRegistro(prueba.bd, 'corto')).rejects.toThrow(/32/)
  })
})
