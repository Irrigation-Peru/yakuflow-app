import { Router } from 'express'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { ErrorDeApi, noEncontrado } from '../errores.ts'
import { estadoDelRecorrido } from '../recorrido.ts'
import { usuarioDe } from '../sesion.ts'

// Registro de actividad (HU0007). La web junta las acciones del estudiante y las manda por lotes; aquí solo se
// agregan. No hay ruta para modificarlas ni borrarlas, y la base lo rechaza aunque alguien lo intente directo.

// Una hora un poco adelantada se acepta: el reloj del navegador no tiene por qué coincidir con el del servidor.
const ADELANTO_ADMITIDO_MS = 5 * 60_000

export const lote = z.object({
  eventos: z
    .array(
      z.object({
        paso: z.int().min(0).max(8),
        // Las acciones se nombran como eventos ya ocurridos, en camelCase: diametroCambiado, parcelaCerrada.
        accion: z.string().regex(/^[a-z][A-Za-z0-9]{1,63}$/, 'Nombra la acción como un evento: parcelaCerrada'),
        proyectoId: z.uuid().optional(),
        detalle: z.record(z.string(), z.unknown()).default({}),
        ocurridoEn: z.iso
          .datetime({ offset: true })
          .transform((t) => new Date(t))
          .refine((t) => t.getTime() <= Date.now() + ADELANTO_ADMITIDO_MS, 'La hora de la acción está en el futuro'),
      }),
    )
    .max(200),
})

export function rutasDeEventos(bd: Bd) {
  const rutas = Router()

  rutas.post('/', async (req, res) => {
    const usuarioId = usuarioDe(res)
    const { eventos } = lote.parse(req.body)
    if (eventos.some((e) => e.paso > 0) && !(await estadoDelRecorrido(bd, usuarioId)).recorridoHabilitado) {
      throw new ErrorDeApi(403, 'recorrido_bloqueado', 'El recorrido todavía no está abierto')
    }
    const proyectos = [...new Set(eventos.flatMap((e) => (e.proyectoId ? [e.proyectoId] : [])))]
    if (proyectos.length > 0) {
      const propios = await bd.proyecto.count({ where: { id: { in: proyectos }, usuarioId } })
      if (propios !== proyectos.length) throw noEncontrado('el proyecto')
    }
    const { count } = await bd.evento.createMany({
      data: eventos.map((e) => ({
        usuarioId,
        proyectoId: e.proyectoId ?? null,
        paso: e.paso,
        accion: e.accion,
        detalle: e.detalle as object,
        ocurridoEn: e.ocurridoEn,
      })),
    })
    res.status(201).json({ registrados: count })
  })

  return rutas
}
