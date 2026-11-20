// Constantes del método de diseño normalizado. Se escriben como en la hoja, no como en un libro de física:
// el objetivo es reproducir sus valores guardados con error cero.

/** π como lo escribe la hoja. */
export const PI_METODO = 3.1416

/** Gravedad, m/s². */
export const G = 9.81

/** Coeficiente de Hazen-Williams en unidades del método: Q en l/s, Ø en pulgadas, hf en m/km. */
export const K_HAZEN_WILLIAMS = 0.0004264

/**
 * Constante de la pérdida unitaria, (1/0.0004264)^1.85 = 1 717 268.4…
 * Es la que adopta el método de referencia. Hay una variante con 1 742 143 (exponente exacto 1/0.54) que
 * difiere 1.43 %; se adopta la primera porque reproduce los valores guardados, y se calcula sin redondear
 * porque así lo hace el método.
 */
export const CONSTANTE_PERDIDA = (1 / K_HAZEN_WILLIAMS) ** 1.85

export const METROS_POR_PULGADA = 0.0254

/** Coeficientes de pérdida local Kr del método. */
export const KR = {
  entrada: 0.5,
  codo45: 0.2,
  codo25: 0.1,
  ampliacion: 0.1,
  reduccion: 0.37,
} as const

/** Rango de velocidad aceptable, m/s: debajo sedimenta, encima vibra. */
export const VELOCIDAD_MINIMA = 0.6
export const VELOCIDAD_MAXIMA = 3.0

/** Guardas del método: el diseño se rechaza si se superan. */
export const DESNIVEL_MAXIMO_SIN_CRP_M = 50
export const LONGITUD_MAXIMA_TRAMO_M = 500

/**
 * Desnivel mínimo entre la fuente y el punto más alto de la parcela para regar a presión sin bombeo, m: el
 * menor del método por desnivel (goteo de 15 a 20 m; aspersión de 30 a 45 m).
 */
export const DESNIVEL_MINIMO_GOTEO_M = 15

/** Desnivel mínimo para regar por aspersión sin bombeo, m: el menor del método por desnivel (30 a 45 m). */
export const DESNIVEL_MINIMO_ASPERSION_M = 30

/**
 * Lo que se deja de lado por la precisión del relieve, m. El paso 1 mide la parcela con una muestra del DEM y la red
 * pone cada lateral con la cota interpolada en su lugar: entre las dos hay décimas de metro. Sin este margen, una
 * cámara puesta justo a 50 m sobre el punto más bajo deja algún lateral a 50.2 m, y la red tiene que cortarlo.
 */
export const MARGEN_POR_PRECISION_DEL_RELIEVE_M = 1
