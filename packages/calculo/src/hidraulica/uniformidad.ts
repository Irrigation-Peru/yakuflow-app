/**
 * Uniformidad de distribución del cuarto inferior, entre 0 y 1:
 * DU = caudal medio del 25 % de emisores con menos caudal / caudal medio de todos.
 *
 * Como lámina bruta × eficiencia = lámina neta, el DU es la parte de la necesidad del cultivo que se
 * cubre en el cuarto más desfavorecido del campo. Si el número de emisores no es múltiplo de cuatro,
 * el cuarto se redondea hacia abajo (al menos un emisor): es la lectura más exigente.
 */
export function uniformidadDistribucion(caudales: readonly number[]) {
  if (caudales.length === 0) throw new Error('La uniformidad no se define sin emisores')
  const ordenados = [...caudales].sort((a, b) => a - b)
  const media = ordenados.reduce((s, q) => s + q, 0) / ordenados.length
  if (media === 0) return 0
  const cuarto = Math.max(1, Math.floor(ordenados.length / 4))
  const mediaCuarto = ordenados.slice(0, cuarto).reduce((s, q) => s + q, 0) / cuarto
  return mediaCuarto / media
}

/**
 * La misma uniformidad cuando cada fila representa varios emisores iguales: el peso de la fila es cuántos representa y
 * `caudal`, lo que entrega cada uno. Sin esto, un emisor equivalente que representa uno solo al final de un lateral corto
 * se leería como un emisor que casi no riega. El cuarto se toma exacto sobre el total de emisores.
 */
export function uniformidadPonderada(filas: readonly { caudal: number; peso: number }[]) {
  if (filas.length === 0) throw new Error('La uniformidad no se define sin emisores')
  // Se divide por el mayor caudal: el cociente no cambia y un caudal diminuto no pierde precisión al multiplicarse.
  const maximo = Math.max(...filas.map((f) => f.caudal))
  if (maximo === 0) return 0
  const ordenadas = filas.map((f) => ({ caudal: f.caudal / maximo, peso: f.peso })).sort((a, b) => a.caudal - b.caudal)
  const pesoTotal = ordenadas.reduce((s, f) => s + f.peso, 0)
  const media = ordenadas.reduce((s, f) => s + f.caudal * f.peso, 0) / pesoTotal
  if (media === 0) return 0
  let falta = pesoTotal / 4
  let suma = 0
  for (const { caudal, peso } of ordenadas) {
    const tomado = Math.min(falta, peso)
    suma += caudal * tomado
    falta -= tomado
    if (falta <= 0) break
  }
  // El cuarto que menos recibe no puede superar a la media: lo que pase de 1 es redondeo.
  return Math.min(1, suma / (pesoTotal / 4) / media)
}

/** Δp del sector sobre la presión nominal del emisor. El criterio pide que no pase de 0.20 (DU ≈ 90 %). */
export function variacionPresion(presiones: readonly number[], presionNominalM: number) {
  return (Math.max(...presiones) - Math.min(...presiones)) / presionNominalM
}
