// Qué hay que hacer en el paso, en orden, con lo que ya está hecho marcado y cuánto falta. El estudiante sabe dónde
// está y qué sigue sin tener que adivinarlo de los botones.

export interface TareaDelPaso {
  texto: string
  hecho: boolean
  /** Cuánto va o por qué importa, en pocas palabras. */
  detalle?: string
  /** Lo que se puede saltar. */
  opcional?: boolean
}

export function GuiaDelPaso({ tareas, avance }: { tareas: readonly TareaDelPaso[]; avance?: { hechos: number; total: number; nombre: string } }) {
  const siguiente = tareas.findIndex((t) => !t.hecho && !t.opcional)
  return (
    <section className="guia-del-paso" aria-label="Qué hacer en este paso">
      <h3 className="rotulo">Qué hacer en este paso</h3>
      <ol>
        {tareas.map((t, i) => (
          <li key={t.texto} className={t.hecho ? 'hecha' : i === siguiente ? 'siguiente' : undefined}>
            <span className="marca" aria-hidden="true">
              {t.hecho ? '✓' : i + 1}
            </span>
            <span>
              {t.texto}
              {t.opcional && <span className="opcional"> · si quieres</span>}
              {t.detalle && <span className="detalle"> {t.detalle}</span>}
              <span className="solo-lectores">{t.hecho ? ' (hecho)' : i === siguiente ? ' (lo que sigue)' : ''}</span>
            </span>
          </li>
        ))}
      </ol>
      {avance && avance.total > 0 && (
        <div className="avance-de-la-guia">
          <progress max={avance.total} value={avance.hechos} aria-label={`${avance.nombre}: ${avance.hechos} de ${avance.total}`} />
          <span>
            {avance.hechos} de {avance.total} {avance.nombre}
          </span>
        </div>
      )}
    </section>
  )
}
