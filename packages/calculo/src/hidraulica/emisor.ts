/**
 * Bajo esta presión el emisor se modela con una rampa lineal hasta cero. Es una regularización numérica:
 * ningún emisor trabaja con un milímetro de columna de agua, así que no cambia ningún resultado en el rango
 * de operación, y permite que la red converja cuando el agua apenas llega. Sin ella, un emisor
 * autocompensante (x = 0) saltaría entre 0 y k sin un punto donde caudal y presión sean coherentes.
 */
export const PRESION_MINIMA_EMISOR_M = 1e-3

/**
 * Desajuste de presión que se acepta entre el caudal de un emisor y su presión: un nanómetro de columna de
 * agua. Con cotas de miles de metros, la presión se conoce con unos 1e-12 m de precisión; pedir más que esto
 * sería pedir más que la aritmética del equipo.
 */
export const TOLERANCIA_PRESION_M = 1e-9

/**
 * Exponentes que se aceptan: 0 para un autocompensante, o entre 0.01 y 1. Los catálogos dan x con dos
 * decimales (0.5 en un orificio turbulento, 1 en un flujo laminar). Un exponente positivo más chico que 0.01
 * no corresponde a ningún emisor y hace que la ley inversa, (q / k)^(1/x), desborde.
 */
export const EXPONENTE_MINIMO_EMISOR = 0.01
export const EXPONENTE_MAXIMO_EMISOR = 1

/** Caudal del emisor, l/h: q = k · P^x con P en m.c.a. Sin presión no entrega agua. */
export function caudalDeEmisor(k: number, x: number, presionM: number) {
  if (presionM <= 0) return 0
  if (presionM < PRESION_MINIMA_EMISOR_M) return k * PRESION_MINIMA_EMISOR_M ** x * (presionM / PRESION_MINIMA_EMISOR_M)
  return k * presionM ** x
}

/**
 * Derivada dq/dP, l/h por m. Bajo la presión mínima, incluida la presión negativa, se usa la pendiente de la
 * rampa: así la linealización ve que el emisor volvería a entregar agua si le llegara presión.
 */
export function derivadaCaudalDeEmisor(k: number, x: number, presionM: number) {
  if (presionM < PRESION_MINIMA_EMISOR_M) return k * PRESION_MINIMA_EMISOR_M ** (x - 1)
  return k * x * presionM ** (x - 1)
}

/** Caudal con el que termina la rampa: el que entrega el emisor a la presión mínima, l/h. */
function caudalAlFinDeLaRampa(k: number, x: number) {
  return k * PRESION_MINIMA_EMISOR_M ** x
}

/** Ley inversa: la presión que el emisor necesita para entregar q (l/h). Un autocompensante no pasa de k. */
export function presionParaCaudal(k: number, x: number, caudalLph: number) {
  const finRampa = caudalAlFinDeLaRampa(k, x)
  if (caudalLph <= finRampa) return (PRESION_MINIMA_EMISOR_M * caudalLph) / finRampa
  if (x === 0) return Infinity
  return (caudalLph / k) ** (1 / x)
}

/** dP/dq de la ley inversa, m por l/h. */
export function derivadaPresionParaCaudal(k: number, x: number, caudalLph: number) {
  const finRampa = caudalAlFinDeLaRampa(k, x)
  if (caudalLph < finRampa) return PRESION_MINIMA_EMISOR_M / finRampa
  if (x === 0) return Infinity
  return presionParaCaudal(k, x, caudalLph) / (x * caudalLph)
}

/**
 * Energía del emisor: la integral de su ley inversa desde cero hasta q, en m · l/h. Se escribe como
 * P(q) · q · x / (1 + x) para no elevar q a 1/x, que con x chico desborda.
 */
export function energiaDeEmisor(k: number, x: number, caudalLph: number) {
  const finRampa = caudalAlFinDeLaRampa(k, x)
  if (caudalLph <= finRampa) return (PRESION_MINIMA_EMISOR_M * caudalLph ** 2) / (2 * finRampa)
  if (x === 0) return Infinity
  const rampa = (PRESION_MINIMA_EMISOR_M * finRampa) / 2
  return rampa + ((presionParaCaudal(k, x, caudalLph) * caudalLph - PRESION_MINIMA_EMISOR_M * finRampa) * x) / (1 + x)
}
