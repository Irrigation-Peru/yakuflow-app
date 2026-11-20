import { cifra } from '../formato.ts'

// Un ciclo de riego, día por día: qué turnos se riegan cada día y cuántas de las horas de agua usan. Se reparten como
// en el cálculo (metodo.ts, porQueLosTurnos): a lo más ⌈turnos / intervalo⌉ por día, de corrido desde que llega el agua.

function repartoDeLosTurnos(turnos: number, intervaloDias: number) {
  const porDia = Math.ceil(turnos / intervaloDias)
  const dias: number[][] = []
  let siguiente = 1
  for (let d = 0; d < intervaloDias; d++) {
    const hoy: number[] = []
    for (let k = 0; k < porDia && siguiente <= turnos; k++) hoy.push(siguiente++)
    dias.push(hoy)
  }
  return dias
}

const ANCHO = 640
const IZQUIERDA = 64
const DERECHA = 16
const ARRIBA = 8
const FILA = 34
const ABAJO = 34

export function CalendarioDeTurnos({
  turnos,
  intervaloDias,
  tiempoDeRiegoH,
  horasDeAguaPorDia,
}: {
  turnos: number
  intervaloDias: number
  tiempoDeRiegoH: number
  horasDeAguaPorDia: number
}) {
  const dias = repartoDeLosTurnos(turnos, intervaloDias)
  const usadas = Math.max(...dias.map((d) => d.length)) * tiempoDeRiegoH
  const horas = Math.max(horasDeAguaPorDia, usadas)
  const util = ANCHO - IZQUIERDA - DERECHA
  const x = (h: number) => IZQUIERDA + (h / horas) * util
  const alto = ARRIBA + dias.length * FILA + ABAJO
  const paso = horas <= 6 ? 1 : horas <= 12 ? 2 : 4
  const marcas = Array.from({ length: Math.floor(horas / paso) + 1 }, (_, i) => i * paso)
  const descripcion = dias
    .map((d, i) => `día ${i + 1}: ${d.length ? `turno${d.length > 1 ? 's' : ''} ${d.join(', ')}, ${cifra(d.length * tiempoDeRiegoH, 1)} h` : 'no se riega'}`)
    .join('; ')

  return (
    <svg className="grafico-svg" viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={`Calendario de un ciclo de riego de ${intervaloDias} días: ${descripcion}.`}>
      {dias.map((hoy, i) => {
        const y = ARRIBA + i * FILA
        return (
          <g key={i}>
            <text x={IZQUIERDA - 10} y={y + FILA / 2} textAnchor="end" dominantBaseline="middle" className="fuerte">
              Día {i + 1}
            </text>
            {/* Las horas de agua del día, de fondo: lo que queda sin turno es agua que no se usa ese día. */}
            <rect x={x(0)} y={y + 4} width={x(horasDeAguaPorDia) - x(0)} height={FILA - 8} fill="var(--fondo-suave)" stroke="var(--linea)" />
            {hoy.length === 0 && (
              <text x={x(0) + 8} y={y + FILA / 2} dominantBaseline="middle">
                no se riega: el suelo todavía tiene agua
              </text>
            )}
            {hoy.map((t, k) => {
              const a = x(k * tiempoDeRiegoH)
              const b = x((k + 1) * tiempoDeRiegoH)
              return (
                <g key={t}>
                  <rect x={a + 1} y={y + 4} width={Math.max(1, b - a - 2)} height={FILA - 8} rx={3} fill="var(--agua)" />
                  {b - a > 30 && (
                    <text x={(a + b) / 2} y={y + FILA / 2} textAnchor="middle" dominantBaseline="middle" className="en-barra">
                      {b - a > 64 ? `Turno ${t}` : `T${t}`}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
      {marcas.map((h) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={ARRIBA + dias.length * FILA} y2={ARRIBA + dias.length * FILA + 4} stroke="var(--tinta-suave)" />
          <text x={x(h)} y={ARRIBA + dias.length * FILA + 16} textAnchor="middle">
            {h} h
          </text>
        </g>
      ))}
      <text x={IZQUIERDA + util / 2} y={alto - 2} textAnchor="middle">
        horas desde que llega el agua · el fondo gris son las {cifra(horasDeAguaPorDia, 1)} h de agua del día
      </text>
    </svg>
  )
}
