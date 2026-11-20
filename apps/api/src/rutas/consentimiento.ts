import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { TEXTO_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from '../consentimiento/texto.ts'
import { ErrorDeApi } from '../errores.ts'
import { usuarioDe } from '../sesion.ts'

// Consentimiento informado (Ley N.º 29733). El texto se lee antes de crear la cuenta, porque va antes de
// cualquier dato; aceptarlo y retirarlo piden sesión. Se acepta una versión concreta del texto.

export const datosDelConsentimiento = z.object({ version: z.string() })

export function rutasDeConsentimiento(bd: Bd, conSesion: RequestHandler) {
  const rutas = Router()

  rutas.get('/', (_req, res) => {
    res.json({ version: VERSION_CONSENTIMIENTO, texto: TEXTO_CONSENTIMIENTO })
  })

  rutas.post('/', conSesion, async (req, res) => {
    const { version } = datosDelConsentimiento.parse(req.body)
    // Se acepta lo que el estudiante leyó: si el texto cambió mientras lo leía, tiene que leer el nuevo.
    if (version !== VERSION_CONSENTIMIENTO) {
      throw new ErrorDeApi(409, 'version_desactualizada', 'El texto del consentimiento cambió; vuelve a leerlo')
    }
    const usuarioId = usuarioDe(res)
    const vigente = await bd.consentimiento.findFirst({ where: { usuarioId, versionTexto: version, revocadoEn: null } })
    if (!vigente) await bd.consentimiento.create({ data: { usuarioId, versionTexto: version } })
    res.status(201).json({ version })
  })

  rutas.post('/retiro', conSesion, async (_req, res) => {
    await bd.consentimiento.updateMany({ where: { usuarioId: usuarioDe(res), revocadoEn: null }, data: { revocadoEn: new Date() } })
    res.status(204).end()
  })

  return rutas
}
