import { conDecimales } from '../formato.ts'
import { LEYENDA_DE_PRESION, TRAZO_DE_LA_BANDA, type BandaDePresion } from '../presion.ts'

// Qué significa cada color de la red: la banda de presión con su rango, medido contra la presión de trabajo del
// emisor, y qué le pasa al riego. La usan la planta (pasos 5 a 8) y el 3D (paso 6), con el mismo texto.

const RANGO: Readonly<Record<BandaDePresion, string>> = {
  insuficiente: 'menos del 50 %',
  baja: 'del 50 al 80 %',
  adecuada: 'del 80 al 125 %',
  alta: 'del 125 al 200 %',
  excesiva: 'más del 200 %',
}

/** El mismo rango, en metros de columna de agua. */
function enMetros(banda: BandaDePresion, nominal: number) {
  const m = (k: number) => `${conDecimales(nominal * k, 1)} m`
  if (banda === 'insuficiente') return `menos de ${m(0.5)}`
  if (banda === 'baja') return `de ${m(0.5)} a ${m(0.8)}`
  if (banda === 'adecuada') return `de ${m(0.8)} a ${m(1.25)}`
  if (banda === 'alta') return `de ${m(1.25)} a ${m(2)}`
  return `más de ${m(2)}`
}

export function LeyendaDeLaRed({
  presionNominalM,
  colorSinAgua,
  conRotos = false,
  conAfectados = false,
  colorRoto,
  colorAfectado,
  conCorriente = false,
  extra,
}: {
  presionNominalM: number
  colorSinAgua: string
  conRotos?: boolean
  conAfectados?: boolean
  colorRoto?: string
  colorAfectado?: string
  /** Si se está mostrando el agua correr. */
  conCorriente?: boolean
  /** Lo propio de cada vista (los símbolos de la planta, los colores del terreno en 3D). */
  extra?: React.ReactNode
}) {
  return (
    <div className="leyenda-de-la-red">
      <p className="titulo-de-la-leyenda">
        Qué significa cada color · la presión con la que llega el agua, frente a la de trabajo del emisor ({conDecimales(presionNominalM, 1)} m)
      </p>
      <ul>
        {LEYENDA_DE_PRESION.map((banda) => (
          <li key={banda.banda}>
            <svg className="trazo" width="28" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="28" y2="5" stroke={banda.color} strokeWidth="3.5" strokeDasharray={TRAZO_DE_LA_BANDA[banda.banda].join(' ') || undefined} />
            </svg>
            <span>
              <strong>{banda.nombre}</strong> · {RANGO[banda.banda]}, {enMetros(banda.banda, presionNominalM)}. {banda.lectura}
            </span>
          </li>
        ))}
        <li>
          <span className="muestra-plana" style={{ background: colorSinAgua }} aria-hidden="true" />
          <span>
            <strong>Gris</strong> · el tramo no lleva agua en este turno: su válvula está cerrada.
          </span>
        </li>
        {conRotos && colorRoto && (
          <li>
            <span className="muestra-plana" style={{ background: colorRoto }} aria-hidden="true" />
            <span>
              <strong>Rojo con rayas</strong> · la tubería no aguanta la presión con las válvulas cerradas: reventaría.
            </span>
          </li>
        )}
        {conAfectados && colorAfectado && (
          <li>
            <span className="muestra-plana" style={{ background: colorAfectado }} aria-hidden="true" />
            <span>
              <strong>Amarillo</strong> · los tramos a los que les cambió la presión con tu último cambio.
            </span>
          </li>
        )}
        {conCorriente && (
          <li>
            <svg className="trazo" width="28" height="10" aria-hidden="true">
              <rect x="0" y="2" width="28" height="6" fill="#1f8a4c" />
              <line x1="0" y1="5" x2="28" y2="5" stroke="#ffffff" strokeWidth="2" strokeDasharray="2 6" />
            </svg>
            <span>
              <strong>Rayas que avanzan</strong> · el agua corriendo; mientras más rápido avanzan, más rápido va el agua en ese tubo.
            </span>
          </li>
        )}
        {extra}
      </ul>
    </div>
  )
}
