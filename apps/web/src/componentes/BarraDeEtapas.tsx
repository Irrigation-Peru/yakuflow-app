import { DISCIPLINAS, etapasDelRecorrido, PASOS, ULTIMO_PASO_DISPONIBLE, type Etapa, type NavegacionDelRecorrido } from '../pasos.ts'
import { IconoCheck } from './Iconos.tsx'

// La barra de etapas: los nueve pasos del recorrido en una línea, unidos como un tramo de tubería que se llena hasta
// donde llegó el proyecto, y agrupados por disciplina como en el menú lateral (terreno, agronomía, hidráulica y
// resultados): cada grupo lleva su nombre arriba, con una línea fina hasta donde llegan sus pasos. Cada etapa dice su estado con forma y color a la vez (no solo color): hecha con un check,
// la actual llena, la pendiente en hueco, y la que quedó por revisar con un signo de advertencia.

function Indicador({ etapa }: { etapa: Etapa }) {
  if (etapa.porRevisar) return <span className="indicador por-revisar">!</span>
  if (etapa.estado === 'hecha')
    return (
      <span className="indicador hecha">
        <IconoCheck tamano={12} />
      </span>
    )
  return <span className={`indicador ${etapa.estado}`}>{etapa.indice}</span>
}

const lecturaDelEstado = (etapa: Etapa) =>
  etapa.porRevisar ? 'por revisar' : etapa.estado === 'hecha' ? 'hecha' : etapa.estado === 'actual' ? 'actual' : 'pendiente'

export function BarraDeEtapas({ paso, navegacion }: { paso: number; navegacion?: NavegacionDelRecorrido }) {
  const etapas = etapasDelRecorrido(paso, navegacion)

  // Cada etapa con el tramo que la une a la anterior, aunque esa quede en otra disciplina: lleno si la anterior ya
  // está hecha.
  const elemento = (etapa: Etapa) => {
    const anterior = etapas[etapa.indice - 1]
    const contenido = (
      <>
        <Indicador etapa={etapa} />
        <span className="etapa-nombre">{etapa.nombre}</span>
        <span className="solo-lectores"> ({lecturaDelEstado(etapa)})</span>
      </>
    )
    return (
      <li
        key={etapa.nombre}
        className={['etapa', etapa.estado, etapa.porRevisar ? 'con-aviso' : '', anterior ? 'con-tramo' : '', anterior?.estado === 'hecha' ? 'tramo-lleno' : '']
          .filter(Boolean)
          .join(' ')}
        aria-current={etapa.estado === 'actual' ? 'step' : undefined}
        title={etapa.porRevisar ? `${etapa.nombre}: por revisar, cambió algo de un paso anterior` : etapa.nombre}
      >
        {etapa.abrible && navegacion ? (
          <button type="button" onClick={() => navegacion.alElegir(etapa.indice)}>
            {contenido}
          </button>
        ) : (
          <span className="etapa-fija">{contenido}</span>
        )}
      </li>
    )
  }

  return (
    <div className="etapas">
      <nav className="etapas-lista" aria-label="Pasos del recorrido">
        <ol>
          {/* Entrar (el paso 0) no es de ninguna disciplina: va solo, al comienzo. */}
          {elemento(etapas[0]!)}
          {DISCIPLINAS.map((disciplina) => (
            <li key={disciplina.nombre} className="disciplina">
              <span className="disciplina-nombre">{disciplina.nombre}</span>
              <ol>{disciplina.pasos.map((indice) => elemento(etapas[indice]!))}</ol>
            </li>
          ))}
        </ol>
      </nav>
      {/* En el celular no caben los nueve pasos: un selector con los ya alcanzados, la misma navegación que la barra. */}
      {navegacion && (
        <label className="etapas-movil">
          <span className="solo-lectores">Ir a otro paso</span>
          <select value={paso} onChange={(e) => navegacion.alElegir(Number(e.target.value))}>
            {PASOS.map((nombre, i) =>
              i >= 1 && i <= Math.min(navegacion.alcanzado, ULTIMO_PASO_DISPONIBLE) ? (
                <option key={nombre} value={i}>
                  Paso {i} de {ULTIMO_PASO_DISPONIBLE} · {nombre}
                  {navegacion.desactualizados.includes(i) ? ' (por revisar)' : ''}
                </option>
              ) : null,
            )}
          </select>
        </label>
      )}
    </div>
  )
}
