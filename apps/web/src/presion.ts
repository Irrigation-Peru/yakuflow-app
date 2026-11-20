// Cómo se lee la presión de un nodo en la vista 2D y en la 3D (HU0018, HU0022). Las bandas no son un degradado
// cualquiera: están puestas respecto de la presión nominal del emisor, que es la que decide si el riego sale
// como se diseñó. Así el color dice algo —«acá el emisor entrega menos de lo que debe»— y no solo «acá hay
// menos presión que allá».
//
// Cada banda lleva su nombre además de su color: el color solo no sirve para quien no lo distingue, y la
// leyenda y la descripción del gráfico usan el mismo texto.

export type BandaDePresion = 'insuficiente' | 'baja' | 'adecuada' | 'alta' | 'excesiva'

export interface Banda {
  banda: BandaDePresion
  nombre: string
  color: string
  /** Qué significa para el riego, en una línea. */
  lectura: string
}

const BANDAS: Readonly<Record<BandaDePresion, Banda>> = {
  insuficiente: {
    banda: 'insuficiente',
    nombre: 'Insuficiente',
    color: '#b42318',
    lectura: 'El emisor entrega menos de la mitad de su caudal: esa parte de la parcela se queda con sed.',
  },
  baja: {
    banda: 'baja',
    nombre: 'Baja',
    color: '#e07a1f',
    lectura: 'El emisor entrega menos de lo que el diseño calculó.',
  },
  adecuada: {
    banda: 'adecuada',
    nombre: 'Adecuada',
    color: '#1f8a4c',
    lectura: 'El emisor trabaja alrededor de su presión nominal: entrega el caudal del diseño.',
  },
  alta: {
    banda: 'alta',
    nombre: 'Alta',
    color: '#2a78d6',
    lectura: 'El emisor entrega más agua de la que el diseño calculó: la lámina se pasa.',
  },
  excesiva: {
    banda: 'excesiva',
    nombre: 'Excesiva',
    color: '#6b3fa0',
    lectura: 'Más del doble de la presión nominal: además de regar de más, el emisor y el lateral sufren.',
  },
}

export const LEYENDA_DE_PRESION: readonly Banda[] = [
  BANDAS.insuficiente,
  BANDAS.baja,
  BANDAS.adecuada,
  BANDAS.alta,
  BANDAS.excesiva,
]

/** En qué banda cae una presión, medida contra la nominal del emisor. */
export function bandaDePresion(presionM: number, presionNominalM: number): Banda {
  if (!(presionNominalM > 0)) throw new Error('La presión nominal del emisor tiene que ser positiva')
  const relativa = presionM / presionNominalM
  if (relativa < 0.5) return BANDAS.insuficiente
  if (relativa < 0.8) return BANDAS.baja
  if (relativa <= 1.25) return BANDAS.adecuada
  if (relativa <= 2) return BANDAS.alta
  return BANDAS.excesiva
}

/**
 * El trazo de cada banda en la red en planta: el color no basta para quien no distingue el rojo del verde (WCAG 1.4.1),
 * así que cada banda tiene además su propio patrón de línea, el mismo en el dibujo y en la leyenda.
 */
export const TRAZO_DE_LA_BANDA: Readonly<Record<BandaDePresion, readonly number[]>> = {
  insuficiente: [2, 3],
  baja: [4, 3],
  adecuada: [],
  alta: [12, 4],
  excesiva: [12, 3, 2, 3],
}

/** El color con que se pinta un nodo o un tramo según su presión. */
export const colorDePresion = (presionM: number, presionNominalM: number) => bandaDePresion(presionM, presionNominalM).color
