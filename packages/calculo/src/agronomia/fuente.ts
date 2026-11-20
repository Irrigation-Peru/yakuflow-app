// Agua que entrega la fuente. El caudal es el único dato que el estudiante escribe: lo midió en campo.

const M3_POR_HORA_POR_LPS = 3.6
const M3_HA_POR_MM = 10

/** Volumen que la fuente entrega en las horas de riego de un día y de una semana, m³. */
export function aguaDisponibleDeLaFuente({ caudalLps, horasDeRiegoPorDia }: { caudalLps: number; horasDeRiegoPorDia: number }) {
  const m3PorDia = caudalLps * M3_POR_HORA_POR_LPS * horasDeRiegoPorDia
  return { m3PorDia, m3PorSemana: 7 * m3PorDia }
}

/**
 * Área máxima que la fuente puede regar, ha: la que cubre la demanda bruta de la semana crítica.
 * Demanda bruta = demanda neta / eficiencia de aplicación.
 */
export function areaMaximaRegable({
  caudalLps,
  horasDeRiegoPorDia,
  demandaNetaPicoMmDia,
  eficiencia,
}: {
  caudalLps: number
  horasDeRiegoPorDia: number
  demandaNetaPicoMmDia: number
  eficiencia: number
}) {
  const { m3PorDia } = aguaDisponibleDeLaFuente({ caudalLps, horasDeRiegoPorDia })
  const necesidadM3HaDia = (demandaNetaPicoMmDia / eficiencia) * M3_HA_POR_MM
  return necesidadM3HaDia === 0 ? Infinity : m3PorDia / necesidadM3HaDia
}
