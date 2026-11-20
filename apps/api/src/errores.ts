import type { ErrorRequestHandler } from 'express'
import { z } from 'zod'

/** Un error que la API explica al cliente: estado HTTP, un código estable para la interfaz y un mensaje legible. */
export class ErrorDeApi extends Error {
  readonly estado: number
  readonly codigo: string
  readonly extra: Record<string, unknown>

  constructor(estado: number, codigo: string, mensaje: string, extra: Record<string, unknown> = {}) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
    this.extra = extra
  }
}

export const noEncontrado = (que: string) => new ErrorDeApi(404, 'no_encontrado', `No se encontró ${que}`)

export const manejarErrores: ErrorRequestHandler = (error, req, res, _siguiente) => {
  if (error instanceof ErrorDeApi) {
    res.status(error.estado).json({ codigo: error.codigo, mensaje: error.message, ...error.extra })
    return
  }
  if (error instanceof z.ZodError) {
    const detalles = error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }))
    res.status(400).json({ codigo: 'datos_invalidos', mensaje: detalles.map((d) => `${d.campo}: ${d.mensaje}`).join('; '), detalles })
    return
  }
  // El cuerpo JSON mal formado o demasiado grande lo rechaza express.json con su propio estado.
  if (typeof error?.status === 'number' && error.status >= 400 && error.status < 500) {
    res.status(error.status).json({ codigo: 'solicitud_invalida', mensaje: 'La solicitud no se pudo leer' })
    return
  }
  req.log.error({ err: error }, 'error no controlado')
  res.status(500).json({ codigo: 'error_interno', mensaje: 'Ocurrió un error en el servidor' })
}
