/**
 * Generador de números al azar con semilla (Mulberry32, de Tommy Ettinger, de dominio público). Se escribe a
 * mano para que la misma semilla dé la misma secuencia en el navegador, en las pruebas y al generar redes
 * para entrenar el modelo sustituto, sin depender de la versión de ninguna biblioteca.
 */
export function generadorConSemilla(semilla: number) {
  let estado = semilla >>> 0
  /** Real en [0, 1). */
  const siguiente = () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    siguiente,
    /** Real en [min, max). */
    real: (min: number, max: number) => min + siguiente() * (max - min),
    /** Entero en [min, max], con los dos extremos incluidos. */
    entero: (min: number, max: number) => min + Math.floor(siguiente() * (max - min + 1)),
    elegir: <T>(lista: readonly T[]) => lista[Math.floor(siguiente() * lista.length)]!,
  }
}

export type Generador = ReturnType<typeof generadorConSemilla>
