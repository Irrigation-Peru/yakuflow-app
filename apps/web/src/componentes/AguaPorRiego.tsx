import { conDecimales } from '../formato.ts'

// Cuánta agua lleva un riego frente a lo que el suelo guarda para la raíz. La lámina neta es lo que el cultivo gastó
// desde el riego anterior; la bruta, eso más lo que se pierde por la eficiencia del método. El tope es el agua fácil
// de la parte del suelo que se moja: si la neta lo pasara, la planta sufriría antes del siguiente riego.

const ANCHO = 640
const IZQUIERDA = 214
const DERECHA = 70
const FILA = 34

export function AguaPorRiego({
  laminaNetaMm,
  laminaBrutaMm,
  aguaFacilMm,
  areaMojadaPct,
}: {
  laminaNetaMm: number
  laminaBrutaMm: number
  aguaFacilMm: number
  areaMojadaPct: number
}) {
  const tope = Math.max(aguaFacilMm, laminaBrutaMm) * 1.05
  const util = ANCHO - IZQUIERDA - DERECHA
  const x = (mm: number) => IZQUIERDA + (mm / tope) * util
  const parcial = areaMojadaPct < 99.5
  const filas = [
    { nombre: 'El suelo guarda para la raíz', detalle: parcial ? `agua fácil de la parte mojada (${conDecimales(areaMojadaPct, 0)} %)` : 'agua fácil del suelo', mm: aguaFacilMm, color: 'var(--azul-tecnico-suave)', borde: 'var(--agua)' },
    { nombre: 'Lo que repone cada riego', detalle: 'lámina neta', mm: laminaNetaMm, color: 'var(--agua)', borde: 'none' },
    { nombre: 'Lo que hay que echar', detalle: 'lámina bruta: la neta más lo que se pierde', mm: laminaBrutaMm, color: 'var(--azul-profundo)', borde: 'none' },
  ]
  const alto = filas.length * FILA + 8
  return (
    <svg
      className="grafico-svg"
      viewBox={`0 0 ${ANCHO} ${alto}`}
      role="img"
      aria-label={`Cada riego repone ${conDecimales(laminaNetaMm, 1)} mm y echa ${conDecimales(laminaBrutaMm, 1)} mm; el suelo guarda ${conDecimales(aguaFacilMm, 1)} mm de agua fácil para la raíz.`}
    >
      {filas.map((f, i) => {
        const y = 4 + i * FILA
        return (
          <g key={f.nombre}>
            <text x={IZQUIERDA - 10} y={y + 12} textAnchor="end" className="fuerte">
              {f.nombre}
            </text>
            <text x={IZQUIERDA - 10} y={y + 26} textAnchor="end" style={{ fontSize: 11 }}>
              {f.detalle}
            </text>
            <rect x={x(0)} y={y + 5} width={Math.max(2, x(f.mm) - x(0))} height={FILA - 12} rx={3} fill={f.color} stroke={f.borde} />
            <text x={x(f.mm) + 6} y={y + FILA / 2} dominantBaseline="middle" className="fuerte">
              {conDecimales(f.mm, 1)} mm
            </text>
          </g>
        )
      })}
      {/* El tope, de arriba abajo: la neta tiene que quedar a su izquierda. */}
      <line x1={x(aguaFacilMm)} x2={x(aguaFacilMm)} y1={4} y2={alto - 2} stroke="var(--agua)" strokeDasharray="4 3" />
    </svg>
  )
}
