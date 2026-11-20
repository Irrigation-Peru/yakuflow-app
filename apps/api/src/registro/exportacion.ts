import { createHmac } from 'node:crypto'
import type { Bd } from '../bd.ts'

// Exportación del registro para el análisis (HU0007, criterio 3; Ley N.º 29733). Cada participante sale con un
// código: los primeros 16 caracteres del HMAC-SHA256 de su identificador con un secreto que solo tiene el
// equipo. Sin el secreto, el código no se puede devolver a la persona; con el mismo secreto, dos exportaciones
// dan el mismo código y se pueden juntar. Solo sale quien tiene su consentimiento vigente.

const LARGO_MINIMO_SECRETO = 32

function celda(valor: unknown) {
  if (valor === null || valor === undefined) return ''
  const texto = typeof valor === 'string' ? valor : valor instanceof Date ? valor.toISOString() : typeof valor === 'object' ? JSON.stringify(valor) : String(valor)
  return /[",\n\r]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

const csv = (cabecera: string[], filas: unknown[][]) =>
  [cabecera.join(','), ...filas.map((f) => f.map(celda).join(',')), ''].join('\n')

export async function exportarRegistro(bd: Bd, secreto: string) {
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(`El secreto de seudonimización necesita al menos ${LARGO_MINIMO_SECRETO} caracteres`)
  }
  const codigo = (tipo: string, id: string) => createHmac('sha256', secreto).update(`${tipo}:${id}`).digest('hex').slice(0, 16)

  const participantes = await bd.usuario.findMany({
    // Quien retiró su consentimiento y lo volvió a dar tiene una fila sin revocar: vuelve a contar.
    where: { consentimientos: { some: { revocadoEn: null } } },
    select: { id: true, grupo: true },
  })
  const grupo = new Map(participantes.map((p) => [p.id, p.grupo]))
  const ids = participantes.map((p) => p.id)

  const eventos = await bd.evento.findMany({ where: { usuarioId: { in: ids } }, orderBy: [{ usuarioId: 'asc' }, { ocurridoEn: 'asc' }, { id: 'asc' }] })
  const respuestas = await bd.respuesta.findMany({
    where: { evaluacion: { usuarioId: { in: ids } } },
    include: { evaluacion: true, itemInstrumento: true },
    orderBy: [{ evaluacion: { usuarioId: 'asc' } }, { itemInstrumento: { codigo: 'asc' } }],
  })

  return {
    eventos: csv(
      ['participante', 'grupo', 'proyecto', 'paso', 'accion', 'detalle', 'ocurrido_en'],
      eventos.map((e) => [
        codigo('usuario', e.usuarioId),
        grupo.get(e.usuarioId),
        e.proyectoId ? codigo('proyecto', e.proyectoId) : '',
        e.paso,
        e.accion,
        e.detalle,
        e.ocurridoEn,
      ]),
    ),
    respuestas: csv(
      ['participante', 'grupo', 'prueba', 'forma', 'item', 'concepcion_erronea', 'nivel_cognitivo', 'alternativa', 'es_correcta', 'segundos'],
      respuestas.map((r) => [
        codigo('usuario', r.evaluacion.usuarioId),
        grupo.get(r.evaluacion.usuarioId),
        r.evaluacion.tipo,
        r.evaluacion.forma,
        r.itemInstrumento.codigo,
        r.itemInstrumento.concepcionErronea,
        r.itemInstrumento.nivelCognitivo,
        r.alternativaMarcada,
        r.esCorrecta,
        r.segundos,
      ]),
    ),
  }
}
