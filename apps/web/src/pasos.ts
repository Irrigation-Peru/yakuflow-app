/** Los nueve pasos del recorrido, del 0 al 8. */
export const PASOS = [
  'Entrar',
  'Conocer el lugar',
  'Elegir qué sembrar',
  'Comprobar el agua',
  'Definir cómo regar',
  'Generar la red',
  'Poner a funcionar',
  'Mejorar con ML',
  'Informe',
]

/** Hasta qué paso está construida la aplicación: los siguientes se muestran, pero todavía no se abren. */
export const ULTIMO_PASO_DISPONIBLE = 8

/** Lo que recibe la pantalla de cada paso del recorrido. */
export interface PropsDelPaso {
  proyectoId: string
  /** El proyecto ya no existe para esta cuenta: se vuelve a la lista. */
  alPerderlo: () => void
  alIrAlPaso: (paso: number) => void
}

/** En qué está cada etapa del recorrido, para la barra de etapas y el menú lateral. */
export type EstadoDeLaEtapa = 'hecha' | 'actual' | 'pendiente'

export interface NavegacionDelRecorrido {
  /** El último paso que el proyecto alcanzó. */
  alcanzado: number
  /** Pasos ya hechos cuyo resultado depende de algo que cambió después. */
  desactualizados: number[]
  alElegir: (paso: number) => void
}

export interface Etapa {
  indice: number
  nombre: string
  estado: EstadoDeLaEtapa
  /** Ya hecha, pero algo de un paso anterior cambió: hay que revisarla. */
  porRevisar: boolean
  /** Se puede abrir desde la navegación: ya alcanzada, construida y no es la que está abierta. */
  abrible: boolean
}

/** Las etapas con su estado: la misma lectura para la barra de arriba y para el menú lateral. */
export function etapasDelRecorrido(paso: number | null, navegacion?: NavegacionDelRecorrido): Etapa[] {
  return PASOS.map((nombre, indice) => {
    const hasta = navegacion ? navegacion.alcanzado : (paso ?? 0)
    const estado: EstadoDeLaEtapa = indice === paso ? 'actual' : indice < hasta ? 'hecha' : 'pendiente'
    return {
      indice,
      nombre,
      estado,
      porRevisar: navegacion?.desactualizados.includes(indice) ?? false,
      abrible: Boolean(navegacion && indice >= 1 && indice <= navegacion.alcanzado && indice <= ULTIMO_PASO_DISPONIBLE && indice !== paso),
    }
  })
}

/** Las disciplinas del recorrido, para el menú lateral: qué pasos son del terreno, del cultivo, de la red, del informe. */
export const DISCIPLINAS = [
  { nombre: 'Terreno', pasos: [1] },
  { nombre: 'Agronomía', pasos: [2, 3, 4] },
  { nombre: 'Hidráulica', pasos: [5, 6, 7] },
  { nombre: 'Resultados', pasos: [8] },
] as const
