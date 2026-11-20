// Contrato de la red que resuelve el módulo de cálculo. Solo redes abiertas (árboles): la red se recorre
// desde la fuente, nodo por nodo, sin resolver un sistema de ecuaciones.

/** Coordenadas locales en metros; z es la cota en m.s.n.m. */
export interface Nodo {
  id: string
  x: number
  y: number
  z: number
}

export interface Tramo {
  id: string
  desde: string
  hasta: string
  diametroInternoMm: number
  /** Coeficiente de Hazen-Williams. */
  c: number
  /** Coeficientes Kr de los accesorios del tramo (entrada, codos, reducciones). */
  coeficientesKr?: readonly number[]
  /** Presión máxima de trabajo de la clase de la tubería, m.c.a. */
  presionMaximaM?: number
}

/** Emisor con su ecuación característica q = k · P^x, con q en l/h y P en m.c.a. */
export interface Emisor {
  nodo: string
  k: number
  x: number
  sector?: string
}

export type Elemento =
  /** Cámara rompe-presión: el agua llega a una cámara abierta y la presión vuelve a cero. */
  | { tipo: 'crp' }
  /** Válvula reductora: recorta la presión a la consigna; si llega menos, no la sube. */
  | { tipo: 'vrp'; consignaM: number }
  /** Cabezal de filtrado y válvulas: una pérdida fija antes de repartir el agua. */
  | { tipo: 'cabezal'; perdidaM: number }

export interface Red {
  nodos: readonly Nodo[]
  tramos: readonly Tramo[]
  emisores: readonly Emisor[]
  /** Elemento de control instalado en un nodo, por id del nodo. */
  elementos?: Readonly<Record<string, Elemento>>
  /** Nodo de la fuente y la presión con la que sale el agua (por ejemplo, la lámina sobre la salida del reservorio). */
  fuente: { nodo: string; presionInicialM: number }
}

/**
 * Con qué ecuaciones se calcula la pérdida.
 * - `metodo`: las del método de diseño normalizado (exponentes 1.85 y 4.87, π = 3.1416, g = 9.81).
 * - `epanet`: las de EPANET 2.2 (exponentes 1.852 y 4.871, en sus unidades internas). Sirve para verificar
 *   el recorrido de la red contra EPANET con las mismas ecuaciones de los dos lados.
 */
export type Formulacion = 'metodo' | 'epanet'

export interface OpcionesCalculo {
  /** Sectores con la válvula abierta. Por omisión, todos. Una lista vacía es la red con las válvulas cerradas. */
  sectoresAbiertos?: readonly string[] | 'todos'
  formulacion?: Formulacion
  /** Diferencia relativa máxima entre el caudal de cada emisor y el que le corresponde por su presión. */
  tolerancia?: number
  /** Pasos de Newton antes de declarar que la red no convergió. */
  iteracionesMaximas?: number
}

export type EstadoVelocidad = 'sedimentacion' | 'adecuada' | 'vibracion'

export interface ResultadoNodo {
  id: string
  /** Presión con la que el agua sigue aguas abajo, después del elemento del nodo si lo hay. m.c.a. */
  presionM: number
  /** Presión con la que llega el agua al nodo, antes del elemento. m.c.a. */
  presionLlegadaM: number
  cotaPiezometrica: number
  /** Caudal del emisor del nodo, si tiene uno. */
  caudalEmisorLph?: number
}

export interface ResultadoTramo {
  id: string
  caudalLps: number
  velocidadMs: number
  longitudInclinadaM: number
  perdidaFriccionM: number
  perdidaLocalM: number
  presionEntradaM: number
  presionSalidaM: number
  estadoVelocidad: EstadoVelocidad
  /** La presión del tramo no supera la de su clase. Sin clase declarada, se da por cumplida. */
  cumpleClase: boolean
}

export type Rechazo =
  | { tipo: 'tramo-largo'; tramo: string; longitudM: number }
  | { tipo: 'desnivel-sin-crp'; nodo: string; desnivelM: number }

export interface ResultadoRed {
  nodos: Record<string, ResultadoNodo>
  tramos: Record<string, ResultadoTramo>
  caudalFuenteLps: number
  convergio: boolean
  iteraciones: number
  /** Guardas del método que el diseño no cumple. */
  rechazos: Rechazo[]
}
