import { useId, useState } from 'react'
import type { OpcionDePrediccion } from '../predicciones.ts'
import { useRegistrar } from '../registro/contexto.ts'

/**
 * Antes de ver el efecto, la pregunta. Se responde una vez, se registra como `prediccionRegistrada` y no se califica:
 * no hay respuesta correcta en pantalla, solo lo que pasa después.
 */
export function Prediccion({
  pregunta,
  enunciado,
  opciones,
  paso,
  proyectoId,
  detalle,
  alResponder,
  alCancelar,
}: {
  /** Qué se pregunta, como identificador estable para el análisis: demandaAlCambiarDeCultivo. */
  pregunta: string
  enunciado: string
  opciones: readonly OpcionDePrediccion[]
  paso: number
  proyectoId: string
  detalle: Record<string, unknown>
  alResponder: (respuesta: string) => void
  alCancelar: () => void
}) {
  const registrar = useRegistrar()
  const nombre = useId()
  const [respuesta, setRespuesta] = useState<string | null>(null)

  return (
    <form
      className="prediccion"
      onSubmit={(e) => {
        e.preventDefault()
        if (!respuesta) return
        registrar({ paso, accion: 'prediccionRegistrada', detalle: { pregunta, respuesta, ...detalle }, proyectoId })
        alResponder(respuesta)
      }}
    >
      <fieldset>
        <legend>
          <span className="rotulo">Antes de verlo</span>
          {enunciado}
        </legend>
        <div className="opciones">
          {opciones.map((o) => (
            <label key={o.valor}>
              <input type="radio" name={nombre} value={o.valor} checked={respuesta === o.valor} onChange={() => setRespuesta(o.valor)} /> {o.texto}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="nota">No se califica: es para que compares lo que esperabas con lo que pasa.</p>
      <div className="acciones">
        <button type="button" onClick={alCancelar}>
          Cancelar
        </button>
        <button className="primario" disabled={!respuesta}>
          Ver qué pasa
        </button>
      </div>
    </form>
  )
}
