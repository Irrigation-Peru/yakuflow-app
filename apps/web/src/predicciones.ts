import type { AjusteDelBalance } from '@riego/calculo'

// Las preguntas de predicción (HU0012 y HU0014, criterio 4): antes de mostrar el efecto de un cambio, la app pregunta
// qué espera el estudiante. La respuesta se registra y no se califica; sirve para que compare lo que esperaba con lo
// que pasa (C1) y como evidencia del experimento.

export interface OpcionDePrediccion {
  valor: string
  texto: string
}

export const PREDICCION_DE_LA_DEMANDA: readonly OpcionDePrediccion[] = [
  { valor: 'mas', texto: 'Pedirá más agua' },
  { valor: 'igual', texto: 'Pedirá casi la misma' },
  { valor: 'menos', texto: 'Pedirá menos agua' },
  { valor: 'no_se', texto: 'No lo sé' },
]

export const PREDICCION_DEL_AJUSTE: readonly OpcionDePrediccion[] = [
  { valor: 'todas', texto: 'Se cubren todas las semanas' },
  { valor: 'algunas', texto: 'Se cubren algunas, no todas' },
  { valor: 'ninguna', texto: 'No cambia nada' },
  { valor: 'no_se', texto: 'No lo sé' },
]

export const PREDICCION_DE_LA_PRESION: readonly OpcionDePrediccion[] = [
  { valor: 'sube', texto: 'La presión sube' },
  { valor: 'igual', texto: 'Queda casi igual' },
  { valor: 'baja', texto: 'La presión baja' },
  { valor: 'no_se', texto: 'No lo sé' },
]

/** Por debajo de esta diferencia, en m.c.a., la presión de un tramo se lee como «casi igual». */
const CASI_IGUAL_M = 0.1

/** Cómo cambió la presión de un tramo, en las mismas palabras de la pregunta. */
export function cambioDeLaPresion(antesM: number, ahoraM: number) {
  if (Math.abs(ahoraM - antesM) <= CASI_IGUAL_M) return 'igual'
  return ahoraM > antesM ? 'sube' : 'baja'
}

export const textoDeLaRespuesta = (opciones: readonly OpcionDePrediccion[], valor: string) =>
  opciones.find((o) => o.valor === valor)?.texto.toLowerCase() ?? valor

/** Por debajo de esta diferencia relativa, dos demandas se leen como «casi la misma». */
const CASI_IGUAL = 0.05

/** Cómo cambió la demanda pico al cambiar de cultivo, en las mismas palabras de la pregunta. */
export function cambioDeLaDemanda(antesMmDia: number, ahoraMmDia: number) {
  if (Math.abs(ahoraMmDia - antesMmDia) <= CASI_IGUAL * Math.max(antesMmDia, ahoraMmDia)) return 'igual'
  return ahoraMmDia > antesMmDia ? 'mas' : 'menos'
}

export function preguntaDelAjuste(ajuste: AjusteDelBalance, semanasSinCubrir: number) {
  const que =
    ajuste.tipo === 'turnos'
      ? `riegas en ${ajuste.turnos} turnos`
      : ajuste.tipo === 'reservorio'
        ? 'guardas en un reservorio el agua que sobra al principio'
        : 'riegas menos área'
  return `Ahora hay ${semanasSinCubrir} ${semanasSinCubrir === 1 ? 'semana' : 'semanas'} en que el agua no alcanza. Si ${que}, ¿qué crees que pasará?`
}
