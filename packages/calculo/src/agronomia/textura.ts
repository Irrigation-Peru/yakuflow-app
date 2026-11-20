// Del análisis granulométrico al suelo con que se diseña: la clase del triángulo textural del USDA, el agua que
// el suelo retiene y la velocidad a la que la deja entrar.

export const CLASES_TEXTURALES = [
  'arena',
  'arena franca',
  'franco arenoso',
  'franco',
  'franco limoso',
  'limo',
  'franco arcillo arenoso',
  'franco arcilloso',
  'franco arcillo limoso',
  'arcilla arenosa',
  'arcilla limosa',
  'arcilla',
] as const

export type ClaseTextural = (typeof CLASES_TEXTURALES)[number]

/** Lo que pueden faltar o sobrar las tres fracciones por redondeo, en puntos porcentuales. */
const TOLERANCIA_DE_LA_SUMA = 1

export interface Granulometria {
  arenaPct: number
  limoPct: number
  arcillaPct: number
}

/**
 * Lo que una resta en coma flotante deja por debajo de cero: 100 − 99.2 − 0.8 da −2.9e−15, que es cero. Se mide en
 * puntos porcentuales.
 */
const CERO_DE_LA_ARITMETICA = 1e-9

/** Clase textural según los límites del triángulo del USDA (Soil Survey Manual). */
export function claseTextural(granulometria: Granulometria): ClaseTextural {
  const { arenaPct, limoPct, arcillaPct } = granulometria
  if (Math.min(arenaPct, limoPct, arcillaPct) < -CERO_DE_LA_ARITMETICA) {
    throw new Error(`Ninguna fracción puede ser negativa: ${arenaPct}/${limoPct}/${arcillaPct}`)
  }
  const [arena, limo, arcilla] = [arenaPct, limoPct, arcillaPct].map((f) => Math.max(0, f)) as [number, number, number]
  if (Math.abs(arena + limo + arcilla - 100) > TOLERANCIA_DE_LA_SUMA) {
    throw new Error(`Arena, limo y arcilla tienen que sumar 100 % y suman ${arena + limo + arcilla} %`)
  }
  if (limo + 1.5 * arcilla < 15) return 'arena'
  if (limo + 2 * arcilla < 30) return 'arena franca'
  if ((arcilla >= 7 && arcilla < 20 && arena > 52) || (arcilla < 7 && limo < 50)) return 'franco arenoso'
  if (arcilla >= 7 && arcilla < 27 && limo >= 28 && limo < 50 && arena <= 52) return 'franco'
  if ((limo >= 50 && arcilla >= 12 && arcilla < 27) || (limo >= 50 && limo < 80 && arcilla < 12)) return 'franco limoso'
  if (limo >= 80 && arcilla < 12) return 'limo'
  if (arcilla >= 20 && arcilla < 35 && limo < 28 && arena > 45) return 'franco arcillo arenoso'
  if (arcilla >= 27 && arcilla < 40 && arena > 20 && arena <= 45) return 'franco arcilloso'
  if (arcilla >= 27 && arcilla < 40 && arena <= 20) return 'franco arcillo limoso'
  if (arcilla >= 35 && arena > 45) return 'arcilla arenosa'
  if (arcilla >= 40 && limo >= 40) return 'arcilla limosa'
  return 'arcilla'
}

export interface PropiedadesDelSuelo {
  /** Humedad volumétrica a capacidad de campo, m³/m³. */
  capacidadDeCampo: number
  /** Humedad volumétrica en el punto de marchitez permanente, m³/m³. */
  puntoDeMarchitez: number
  /** Velocidad de infiltración cuando el suelo ya se saturó, mm/h. */
  infiltracionBasicaMmH: number
  fuente: string
}

const TABLA_19 = 'FAO 56, tabla 19, punto medio del rango'
const SAXTON_RAWLS = 'Saxton y Rawls (2006), con 2.5 % de materia orgánica en el punto representativo de la clase, que la tabla 19 del FAO 56 no trae'
// Tabla 7 del anexo 2 del Manual de capacitación N.º 5 de la FAO (Brouwer et al., 1988): arena, más de 30 mm/h (la
// edición en línea imprime «menos de 30», que rompe el orden de la tabla); franco arenoso, 20 a 30; franco, 10 a
// 20; franco arcilloso, 5 a 10; arcilla, 1 a 5. Se toma el punto medio, y cada clase del USDA va con el tipo de
// suelo más cercano.
const INFILTRACION = 'infiltración del Manual de capacitación N.º 5 de la FAO, anexo 2, tabla 7'

const propiedades = (capacidadDeCampo: number, puntoDeMarchitez: number, infiltracionBasicaMmH: number, fuente: string) => ({
  capacidadDeCampo,
  puntoDeMarchitez,
  infiltracionBasicaMmH,
  fuente: `${fuente}; ${INFILTRACION}`,
})

export const PROPIEDADES_POR_CLASE: Readonly<Record<ClaseTextural, PropiedadesDelSuelo>> = {
  arena: propiedades(0.12, 0.045, 30, TABLA_19),
  'arena franca': propiedades(0.15, 0.065, 30, TABLA_19),
  'franco arenoso': propiedades(0.23, 0.11, 25, TABLA_19),
  franco: propiedades(0.25, 0.12, 15, TABLA_19),
  'franco limoso': propiedades(0.29, 0.15, 15, TABLA_19),
  limo: propiedades(0.32, 0.17, 15, TABLA_19),
  'franco arcillo arenoso': propiedades(0.27, 0.17, 7.5, SAXTON_RAWLS),
  'franco arcilloso': propiedades(0.36, 0.22, 7.5, SAXTON_RAWLS),
  'franco arcillo limoso': propiedades(0.335, 0.205, 7.5, TABLA_19),
  'arcilla arenosa': propiedades(0.36, 0.25, 3, SAXTON_RAWLS),
  'arcilla limosa': propiedades(0.36, 0.23, 3, TABLA_19),
  arcilla: propiedades(0.36, 0.22, 3, TABLA_19),
}

/** El suelo que sale de la muestra: el estudiante da arena y arcilla, y el limo es lo que queda. */
export function sueloDeLaTextura({ arenaPct, arcillaPct }: { arenaPct: number; arcillaPct: number }) {
  const resto = 100 - arenaPct - arcillaPct
  if (resto < -CERO_DE_LA_ARITMETICA) throw new Error(`Arena y arcilla suman ${arenaPct + arcillaPct} %: no pueden pasar de 100 %`)
  const limoPct = Math.max(0, resto)
  const clase = claseTextural({ arenaPct, limoPct, arcillaPct })
  return { clase, arenaPct, limoPct, arcillaPct, ...PROPIEDADES_POR_CLASE[clase] }
}
