import { Router } from 'express'
import type { Logger } from 'pino'
import type { Bd } from '../bd.ts'
import { ErrorDeApi } from '../errores.ts'
import { proyectoPropio } from '../proyecto.ts'
import { FUENTE, type ProveedorDeFuentesDeReferencia } from '../servicios/fuentes-de-referencia.ts'
import { usuarioDe } from '../sesion.ts'

// Paso 1: las bocatomas, tomas y lagunas de la ANA cerca de la parcela, para ubicar la fuente. Son una ayuda y no un
// requisito: si la ANA no responde, el paso sigue igual, sin puntos y con el aviso de por qué.

export function rutasDeFuentesDeReferencia(bd: Bd, proveedor: ProveedorDeFuentesDeReferencia, registro?: Logger) {
  const rutas = Router()

  rutas.get('/:id/fuentes-de-referencia', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (!proyecto.parcela) throw new ErrorDeApi(409, 'parcela_pendiente', 'Primero dibuja la parcela: las fuentes de referencia se buscan a su alrededor')
    const centro = { lat: proyecto.parcela.centroideLat, lon: proyecto.parcela.centroideLon }
    try {
      res.json({ ...(await proveedor.cerca(centro)), aviso: null })
    } catch (error) {
      registro?.warn({ err: error }, 'ANA · SNIRH no respondió')
      res.json({ puntos: [], fuente: FUENTE, aviso: 'La ANA no respondió: ahora no hay puntos de referencia. Igual puedes ubicar la fuente.' })
    }
  })

  return rutas
}
