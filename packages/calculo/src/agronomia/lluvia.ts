/**
 * Lluvia efectiva del mes, mm, por el método del Servicio de Conservación de Suelos de los Estados Unidos
 * (USDA-SCS), en la forma mensual que usa CROPWAT de la FAO:
 *   P ≤ 250 mm: Pef = P · (125 − 0.2 · P) / 125
 *   P > 250 mm: Pef = 125 + 0.1 · P
 */
export function lluviaEfectivaMensual(lluviaMm: number) {
  if (!(lluviaMm >= 0)) throw new Error(`La lluvia del mes no puede ser negativa: ${lluviaMm} mm`)
  if (lluviaMm <= 250) return (lluviaMm * (125 - 0.2 * lluviaMm)) / 125
  return 125 + 0.1 * lluviaMm
}
