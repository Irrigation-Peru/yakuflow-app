// Agua que el suelo guarda para el cultivo (FAO 56, capítulo 8).

/**
 * Agua útil total en la zona de raíces, mm (FAO 56, ecuación 82): AT = 1000 · (θcc − θpmp) · Zr,
 * con las humedades en m³/m³ y la profundidad radicular en m.
 */
export function aguaUtilTotal({
  capacidadDeCampo,
  puntoDeMarchitez,
  profundidadRadicularM,
}: {
  capacidadDeCampo: number
  puntoDeMarchitez: number
  profundidadRadicularM: number
}) {
  if (!(capacidadDeCampo > puntoDeMarchitez)) {
    throw new Error(
      `La capacidad de campo (${capacidadDeCampo}) tiene que ser mayor que el punto de marchitez (${puntoDeMarchitez})`,
    )
  }
  if (!(profundidadRadicularM > 0)) throw new Error(`La profundidad radicular tiene que ser positiva: ${profundidadRadicularM} m`)
  return 1000 * (capacidadDeCampo - puntoDeMarchitez) * profundidadRadicularM
}

/** Agua fácilmente aprovechable, mm (FAO 56, ecuación 83): AFA = p · AT. */
export function aguaFacilmenteAprovechable(aguaUtilTotalMm: number, fraccionAgotamiento: number) {
  return fraccionAgotamiento * aguaUtilTotalMm
}

/**
 * Fracción de agotamiento ajustada a la demanda del cultivo (FAO 56, nota 2 de la tabla 22):
 * p = p de la tabla + 0.04 · (5 − ETc), con ETc en mm/día y p entre 0.1 y 0.8. Con poca demanda, como en la
 * sierra, el cultivo aguanta agotar un poco más el suelo antes de sufrir.
 */
export function fraccionDeAgotamientoAjustada(fraccionDeTabla: number, etcMmDia: number) {
  return Math.min(0.8, Math.max(0.1, fraccionDeTabla + 0.04 * (5 - etcMmDia)))
}

/** Humedad volumétrica, m³/m³, a partir de la gravimétrica (g/g) y la densidad aparente (g/cm³). */
export function humedadVolumetrica(humedadGravimetrica: number, densidadAparente: number) {
  return humedadGravimetrica * densidadAparente
}
