// Catálogo provisional de emisores. Son valores típicos de goteros y aspersores de impacto, no de un fabricante:
// queda pendiente reemplazarlos por el catálogo comercial peruano, con sus curvas y precios.

import type { MetodoDeRiego } from './diseno-agronomico'

export interface EmisorDeCatalogo {
  codigo: string
  nombre: string
  metodo: MetodoDeRiego
  caudalNominalLph: number
  presionNominalM: number
  /**
   * Ley del emisor q = k · P^x, con q en l/h y P en m.c.a. Un autocompensado no tiene x = 0: dentro de su rango el
   * caudal varía unos puntos (x de 0.03 a 0.10 en los catálogos); con x = 0 la uniformidad saldría en 100 % exacto,
   * lo que en campo no ocurre.
   */
  coeficienteK: number
  exponenteX: number
  /** El emisor regula su caudal frente a la presión: no necesita una válvula al arranque de cada lateral. */
  autocompensado: boolean
  /** La presión más alta que el emisor admite, m.c.a.: la red no puede darle más. Sin dato, la del método. */
  presionMaximaM?: number
  /** Separación propuesta entre emisores sobre el lateral y entre laterales, m. El estudiante puede cambiarlas. */
  separacionM: number
  separacionLateralesM: number
}

const emisor = (
  codigo: string,
  nombre: string,
  metodo: MetodoDeRiego,
  caudalNominalLph: number,
  presionNominalM: number,
  exponenteX: number,
  separacionM: number,
  separacionLateralesM: number,
  autocompensado = false,
  presionMaximaM?: number,
): EmisorDeCatalogo => ({
  codigo,
  nombre,
  metodo,
  caudalNominalLph,
  presionNominalM,
  coeficienteK: caudalNominalLph / presionNominalM ** exponenteX,
  exponenteX,
  separacionM,
  separacionLateralesM,
  autocompensado,
  ...(presionMaximaM === undefined ? {} : { presionMaximaM }),
})

export const CATALOGO_EMISORES: readonly EmisorDeCatalogo[] = [
  emisor('gotero-2', 'Gotero de botón, 2 l/h', 'goteo', 2, 10, 0.5, 0.3, 0.9),
  // Rango de compensación típico de 0.5 a 4 bar: de 5 a 40 m.c.a. Valores provisionales, por validar con el catálogo.
  emisor('gotero-pc-1.6', 'Gotero autocompensado, 1.6 l/h', 'goteo', 1.6, 10, 0.05, 0.3, 0.9, true, 40),
  emisor('cinta-1', 'Cinta de goteo, 1 l/h cada 20 cm', 'goteo', 1, 8, 0.5, 0.2, 0.9),
  emisor('gotero-4', 'Gotero de botón, 4 l/h', 'goteo', 4, 10, 0.5, 0.5, 0.9),
  emisor('aspersor-3.2', 'Aspersor de impacto, boquilla de 3.2 mm', 'aspersion', 800, 25, 0.5, 12, 12),
  emisor('aspersor-4.0', 'Aspersor de impacto, boquilla de 4.0 mm', 'aspersion', 1200, 30, 0.5, 12, 12),
  emisor('aspersor-4.4', 'Aspersor de impacto, boquilla de 4.4 mm', 'aspersion', 1500, 30, 0.5, 12, 18),
]

export function emisorDelCatalogo(codigo: string) {
  const encontrado = CATALOGO_EMISORES.find((e) => e.codigo === codigo)
  if (!encontrado) throw new Error(`El emisor ${codigo} no está en el catálogo`)
  return encontrado
}

/** Intensidad de aplicación con la separación dada, mm/h: l/h sobre m² es mm/h. */
export const intensidadDelEmisor = (e: Pick<EmisorDeCatalogo, 'caudalNominalLph' | 'separacionM' | 'separacionLateralesM'>) =>
  e.caudalNominalLph / (e.separacionM * e.separacionLateralesM)

/**
 * Pendiente media desde la que se recomienda el gotero autocompensado, %. En ladera el lateral no puede ir del todo a
 * nivel: el terreno real ondula y un lateral de 100 m sube y baja varios metros. El gotero común entrega más donde hay
 * más presión y la uniformidad cae; el autocompensado entrega lo mismo con cualquier presión dentro de su rango. En las
 * parcelas reales de prueba, con 31 % los dos funcionan y con 42 % y 60 % solo el autocompensado.
 */
export const PENDIENTE_PARA_AUTOCOMPENSADO_PCT = 30

/** El emisor con que el paso 4 arranca: el primero del método y, en goteo sobre ladera, el autocompensado. */
export function emisorRecomendado(metodo: MetodoDeRiego, pendienteMediaPct = 0) {
  const delMetodo = CATALOGO_EMISORES.filter((e) => e.metodo === metodo)
  if (metodo === 'goteo' && pendienteMediaPct >= PENDIENTE_PARA_AUTOCOMPENSADO_PCT) {
    return delMetodo.find((e) => e.autocompensado) ?? delMetodo[0]!
  }
  return delMetodo[0]!
}
