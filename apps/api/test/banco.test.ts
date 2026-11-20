import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cargarBanco, revisarBanco } from '../src/instrumento/banco.ts'
import { bdDePrueba } from './bd-de-prueba.ts'

// HU0008: el banco de ítems de la prueba, clasificado por concepción errónea y validado por juicio de expertos.

const CONCEPCIONES = ['CE1', 'CE2', 'CE3', 'CE4', 'CE5', 'CE6', 'CE7', 'CE8']
const conformes = [
  { experto: 'E1', conformidad: true },
  { experto: 'E2', conformidad: true },
]

function item(codigo: string, forma: 'A' | 'B', concepcionErronea: string, cambios: Record<string, unknown> = {}) {
  return {
    codigo,
    forma,
    concepcionErronea,
    nivelCognitivo: 'analizar',
    enunciado: `Enunciado ${codigo}`,
    alternativas: [
      { letra: 'a', texto: 'Una' },
      { letra: 'b', texto: 'Otra' },
      { letra: 'c', texto: 'Una más' },
    ],
    clave: 'b',
    juicios: conformes,
    ...cambios,
  }
}

/** Un ítem por concepción errónea en cada forma: el banco mínimo que cumple todo. */
const bancoCompleto = () => ({
  version: 'prueba',
  items: CONCEPCIONES.flatMap((ce, i) => [item(`A${i + 1}`, 'A', ce), item(`B${i + 1}`, 'B', ce)]),
})

describe('ítems clasificados (criterio 1)', () => {
  it('exige declarar qué concepción errónea evalúa cada ítem', () => {
    const banco = bancoCompleto()
    delete (banco.items[0] as Partial<ReturnType<typeof item>>).concepcionErronea
    expect(() => revisarBanco(banco)).toThrow(/concepcionErronea/)
  })

  it('rechaza una concepción errónea que no está entre las ocho', () => {
    const banco = bancoCompleto()
    banco.items[0] = item('A1', 'A', 'CE9')
    expect(() => revisarBanco(banco)).toThrow(/concepcionErronea/)
  })

  it('rechaza una clave que no es ninguna de las alternativas', () => {
    const banco = bancoCompleto()
    banco.items[0] = item('A1', 'A', 'CE1', { clave: 'z' })
    expect(() => revisarBanco(banco)).toThrow(/clave/)
  })

  it('rechaza dos ítems con el mismo código', () => {
    const banco = bancoCompleto()
    banco.items[1] = item('A1', 'B', 'CE1')
    expect(() => revisarBanco(banco)).toThrow(/A1/)
  })
})

describe('juicio de expertos (criterio 2)', () => {
  it('aprueba el banco cuando dos expertos distintos dan su conformidad a cada ítem', () => {
    expect(revisarBanco(bancoCompleto())).toEqual({ aprobado: true, observaciones: [] })
  })

  it('no lo aprueba si un ítem tiene un solo experto conforme', () => {
    const banco = bancoCompleto()
    banco.items[3] = item('B2', 'B', 'CE2', { juicios: [conformes[0], { experto: 'E2', conformidad: false }] })
    const revision = revisarBanco(banco)
    expect(revision.aprobado).toBe(false)
    expect(revision.observaciones).toEqual(['B2: tiene 1 experto conforme y necesita 2'])
  })

  it('no cuenta dos veces al mismo experto', () => {
    const banco = bancoCompleto()
    banco.items[0] = item('A1', 'A', 'CE1', { juicios: [conformes[0], conformes[0]] })
    expect(revisarBanco(banco).aprobado).toBe(false)
  })
})

describe('dos formas equivalentes (criterio 3)', () => {
  it('no lo aprueba si una forma tiene más ítems de una concepción y nivel que la otra', () => {
    const banco = bancoCompleto()
    banco.items.push(item('A9', 'A', 'CE3'))
    const revision = revisarBanco(banco)
    expect(revision.aprobado).toBe(false)
    expect(revision.observaciones).toContain('CE3, analizar: la forma A tiene 2 ítems y la B, 1')
  })

  it('no lo aprueba si falta alguna de las ocho concepciones', () => {
    const banco = bancoCompleto()
    banco.items = banco.items.filter((i) => i.concepcionErronea !== 'CE8')
    expect(revisarBanco(banco).observaciones).toContain('Ninguna forma evalúa CE8')
  })
})

describe('carga del banco en la base', () => {
  let prueba: Awaited<ReturnType<typeof bdDePrueba>>
  beforeAll(async () => {
    prueba = await bdDePrueba()
  })
  afterAll(() => prueba.cerrar())

  it('carga un banco aprobado y deja fuera los juicios', async () => {
    await cargarBanco(prueba.bd, bancoCompleto())
    expect(await prueba.bd.itemInstrumento.count({ where: { forma: 'A' } })).toBe(8)
  })

  it('se niega a cargar un banco sin aprobar, salvo como borrador', async () => {
    const banco = bancoCompleto()
    banco.items[0] = item('A1', 'A', 'CE1', { juicios: [] })
    await expect(cargarBanco(prueba.bd, banco)).rejects.toThrow(/no está aprobado/)
    await expect(cargarBanco(prueba.bd, banco, { borrador: true })).resolves.toMatchObject({ aprobado: false })
  })

  it('no cambia el banco cuando ya hay respuestas', async () => {
    const usuario = await prueba.bd.usuario.create({
      data: { correoInstitucional: 'r@undac.edu.pe', contrasenaHash: 'x', nombres: 'R', codigoCurso: 'C' },
    })
    const evaluacion = await prueba.bd.evaluacion.create({ data: { usuarioId: usuario.id, tipo: 'entrada', forma: 'A' } })
    const unItem = await prueba.bd.itemInstrumento.findFirstOrThrow()
    await prueba.bd.respuesta.create({
      data: { evaluacionId: evaluacion.id, itemInstrumentoId: unItem.id, alternativaMarcada: 'a', esCorrecta: false },
    })
    await expect(cargarBanco(prueba.bd, bancoCompleto())).rejects.toThrow(/respuestas/)
  })
})
