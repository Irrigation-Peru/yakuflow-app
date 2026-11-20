import type { RequestHandler } from 'express'
import type { Bd } from './bd.ts'
import { VERSION_CONSENTIMIENTO } from './consentimiento/texto.ts'
import { ErrorDeApi } from './errores.ts'
import { usuarioDe } from './sesion.ts'

// El paso 0 del recorrido: sin consentimiento vigente y sin la prueba de entrada terminada, el recorrido no se
// abre (HU0006, criterio 2). Así el punto de partida de cada estudiante queda medido antes de usar la app.

export async function estadoDelRecorrido(bd: Bd, usuarioId: string) {
  const consentimiento = await bd.consentimiento.findFirst({
    where: { usuarioId, versionTexto: VERSION_CONSENTIMIENTO, revocadoEn: null },
  })
  const entrada = await bd.evaluacion.findUnique({ where: { usuarioId_tipo: { usuarioId, tipo: 'entrada' } } })
  const pruebaDeEntrada = !entrada ? 'pendiente' : entrada.terminadaEn ? 'terminada' : 'en_curso'
  const falta = [
    ...(consentimiento ? [] : ['consentimiento']),
    ...(pruebaDeEntrada === 'terminada' ? [] : ['prueba_de_entrada']),
  ]
  return { consentimiento: !!consentimiento, pruebaDeEntrada, falta, recorridoHabilitado: falta.length === 0, ...(await estadoDeLaSalida(bd, usuarioId)) }
}

/** La prueba de salida se abre al terminar el recorrido en algún proyecto: al llegar al paso 8 con un diseño vigente. */
export async function estadoDeLaSalida(bd: Bd, usuarioId: string) {
  const terminados = await bd.proyecto.findMany({ where: { usuarioId, pasoAlcanzado: { gte: 8 } }, select: { resultadosDesactualizados: true } })
  const salidaHabilitada = terminados.some((p) => ![5, 6, 7].some((paso) => (p.resultadosDesactualizados as number[]).includes(paso)))
  const salida = await bd.evaluacion.findUnique({ where: { usuarioId_tipo: { usuarioId, tipo: 'salida' } } })
  return { salidaHabilitada, pruebaDeSalida: !salida ? 'pendiente' : salida.terminadaEn ? 'terminada' : 'en_curso' }
}

export function requiereRecorrido(bd: Bd): RequestHandler {
  return async (_req, res, siguiente) => {
    const { falta } = await estadoDelRecorrido(bd, usuarioDe(res))
    if (falta.length > 0) {
      throw new ErrorDeApi(403, 'recorrido_bloqueado', 'Antes de empezar, acepta el consentimiento y termina la prueba de entrada', { falta })
    }
    siguiente()
  }
}
