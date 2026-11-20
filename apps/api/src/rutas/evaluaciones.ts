import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { ErrorDeApi, noEncontrado } from '../errores.ts'
import { estadoDelRecorrido, estadoDeLaSalida } from '../recorrido.ts'
import { usuarioDe } from '../sesion.ts'

// Las pruebas de entrada (HU0006, criterio 3) y de salida (HU0030). Se guarda cada respuesta al marcarla, y al terminar
// no se muestra ni la clave ni el puntaje: las pruebas miden, no enseñan. La de salida usa la forma B y se abre al
// terminar el recorrido.

const PRUEBAS = { entrada: 'A', salida: 'B' } as const

interface Alternativa {
  letra: string
  texto: string
}

export const respuesta = z.object({
  alternativa: z.string().min(1).max(4),
  segundos: z.int().min(0).max(3600).optional(),
})

type Prueba = keyof typeof PRUEBAS

export function rutasDeEvaluaciones(bd: Bd) {
  const rutas = Router()

  async function evaluacionAbierta(usuarioId: string, tipo: Prueba) {
    const evaluacion = await bd.evaluacion.findUnique({ where: { usuarioId_tipo: { usuarioId, tipo } } })
    if (!evaluacion) throw new ErrorDeApi(409, 'prueba_no_iniciada', 'Primero abre la prueba')
    if (evaluacion.terminadaEn) throw new ErrorDeApi(409, 'prueba_terminada', 'La prueba ya terminó')
    return evaluacion
  }

  const abrir = (tipo: Prueba) => async (_req: Request, res: Response) => {
    const usuarioId = usuarioDe(res)
    if (!(await estadoDelRecorrido(bd, usuarioId)).consentimiento) {
      throw new ErrorDeApi(403, 'falta_consentimiento', 'Antes de la prueba, lee y acepta el consentimiento')
    }
    if (tipo === 'salida' && !(await estadoDeLaSalida(bd, usuarioId)).salidaHabilitada) {
      throw new ErrorDeApi(403, 'salida_no_habilitada', 'La prueba de salida se abre al terminar el recorrido')
    }
    const forma = PRUEBAS[tipo]
    const items = await bd.itemInstrumento.findMany({ where: { forma }, orderBy: { codigo: 'asc' } })
    if (items.length === 0) throw new ErrorDeApi(503, 'banco_vacio', 'La prueba todavía no está cargada')

    let evaluacion = await bd.evaluacion.findUnique({ where: { usuarioId_tipo: { usuarioId, tipo } } })
    if (evaluacion?.terminadaEn) throw new ErrorDeApi(409, 'prueba_terminada', 'La prueba ya terminó')
    evaluacion ??= await bd.evaluacion.create({ data: { usuarioId, tipo, forma } })

    const marcadas = await bd.respuesta.findMany({ where: { evaluacionId: evaluacion.id } })
    const marcada = new Map(marcadas.map((r) => [r.itemInstrumentoId, r.alternativaMarcada]))
    res.json({
      items: items.map((item) => ({
        id: item.id,
        enunciado: item.enunciado,
        alternativas: (item.alternativas as unknown as Alternativa[]).map(({ letra, texto }) => ({ letra, texto })),
        marcada: marcada.get(item.id) ?? null,
      })),
    })
  }

  const responder = (tipo: Prueba) => async (req: Request, res: Response) => {
    const evaluacion = await evaluacionAbierta(usuarioDe(res), tipo)
    const itemId = z.uuid().safeParse(req.params.itemId)
    const item = itemId.success ? await bd.itemInstrumento.findUnique({ where: { id: itemId.data } }) : null
    if (!item || item.forma !== evaluacion.forma) throw noEncontrado('ese ítem en tu prueba')
    const { alternativa, segundos } = respuesta.parse(req.body)
    if (!(item.alternativas as unknown as Alternativa[]).some((a) => a.letra === alternativa)) {
      throw new ErrorDeApi(400, 'alternativa_invalida', 'Esa alternativa no está en el ítem')
    }
    const datos = { alternativaMarcada: alternativa, esCorrecta: alternativa === item.clave, segundos: segundos ?? null }
    await bd.respuesta.upsert({
      where: { evaluacionId_itemInstrumentoId: { evaluacionId: evaluacion.id, itemInstrumentoId: item.id } },
      create: { evaluacionId: evaluacion.id, itemInstrumentoId: item.id, ...datos },
      update: datos,
    })
    res.status(204).end()
  }

  const terminar = (tipo: Prueba) => async (_req: Request, res: Response) => {
    const evaluacion = await evaluacionAbierta(usuarioDe(res), tipo)
    const total = await bd.itemInstrumento.count({ where: { forma: evaluacion.forma } })
    const respuestas = await bd.respuesta.findMany({ where: { evaluacionId: evaluacion.id } })
    if (respuestas.length < total) {
      throw new ErrorDeApi(400, 'prueba_incompleta', 'Responde todos los ítems antes de terminar', {
        faltan: total - respuestas.length,
      })
    }
    await bd.evaluacion.update({
      where: { id: evaluacion.id },
      data: { terminadaEn: new Date(), puntaje: respuestas.filter((r) => r.esCorrecta).length / total },
    })
    res.json({ terminada: true })
  }

  rutas.post('/entrada', abrir('entrada'))
  rutas.put('/entrada/respuestas/:itemId', responder('entrada'))
  rutas.post('/entrada/fin', terminar('entrada'))
  rutas.post('/salida', abrir('salida'))
  rutas.put('/salida/respuestas/:itemId', responder('salida'))
  rutas.post('/salida/fin', terminar('salida'))

  return rutas
}
