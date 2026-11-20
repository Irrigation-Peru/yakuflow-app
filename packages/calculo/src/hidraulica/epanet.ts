// Pérdidas tal como las calcula EPANET 2.2, en sus unidades internas (pies y pies cúbicos por segundo).
// No son las del método: existen para verificar el recorrido de la red contra EPANET con las mismas
// ecuaciones de los dos lados, y aislar así el error del recorrido del error de la fórmula.
// Fuente: EPANET 2.2, hydcoeffs.c (resistcoeff) y la conversión de unidades de types.h.

const M_POR_PIE = 0.3048
const LPS_POR_CFS = 28.317
const MM_POR_PIE = 304.8

/** Pérdida por fricción de Hazen-Williams, m: 4.727 · L / C^1.852 / d^4.871 · q^1.852. */
export function friccionEpanet(caudalLps: number, c: number, diametroInternoMm: number, longitudM: number) {
  const resistencia = (4.727 * (longitudM / M_POR_PIE)) / c ** 1.852 / (diametroInternoMm / MM_POR_PIE) ** 4.871
  return resistencia * Math.abs(caudalLps / LPS_POR_CFS) ** 1.852 * M_POR_PIE
}

/** Pérdida local, m: EPANET pasa K de la base v²/2g a la base q² con 0.02517 · K / d⁴. */
export function localEpanet(caudalLps: number, sumaKr: number, diametroInternoMm: number) {
  const km = (0.02517 * sumaKr) / (diametroInternoMm / MM_POR_PIE) ** 4
  return km * (caudalLps / LPS_POR_CFS) ** 2 * M_POR_PIE
}

export function velocidadEpanet(caudalLps: number, diametroInternoMm: number) {
  return caudalLps / 1000 / ((Math.PI * (diametroInternoMm / 1000) ** 2) / 4)
}
