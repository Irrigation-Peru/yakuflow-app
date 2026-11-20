import type { ReactNode } from 'react'

// Toda vista o gráfico de la app lleva arriba un título que dice qué es y, debajo, en una línea, qué se está mirando:
// el estudiante sabe qué lee antes de mirarlo. La lectura, si la hay, va al pie y dice qué sale de ahí.

/** Solo el encabezado, para vistas que ya tienen su propio contenedor (el mapa, el 3D, la red). */
export function TituloDeVista({ titulo, queMuestra, acciones }: { titulo: string; queMuestra?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="cabeza-de-figura titulo-de-vista">
      <div className="figcaption">
        <span className="titulo-de-figura">{titulo}</span>
        {queMuestra && <span className="que-muestra">{queMuestra}</span>}
      </div>
      {acciones}
    </div>
  )
}

export function Figura({
  titulo,
  queMuestra,
  lectura,
  className,
  acciones,
  children,
}: {
  titulo: string
  queMuestra?: ReactNode
  lectura?: ReactNode
  className?: string
  /** Controles que van a la derecha del título (por ejemplo, cambiar de vista). */
  acciones?: ReactNode
  children: ReactNode
}) {
  return (
    <figure className={className ? `figura ${className}` : 'figura'}>
      <div className="cabeza-de-figura">
        <figcaption>
          <span className="titulo-de-figura">{titulo}</span>
          {queMuestra && <span className="que-muestra">{queMuestra}</span>}
        </figcaption>
        {acciones}
      </div>
      {children}
      {lectura && <div className="lectura-de-figura">{lectura}</div>}
    </figure>
  )
}
