import type { SugerenciasDelModelo } from './calculo/modelo-de-cultivos.ts'
import { explicacionDeLaSugerencia, lecturaDeCondicion } from './condiciones.ts'

// Lo que se guarda de cada sugerencia del modelo (HU0011): la versión del modelo, la probabilidad, la condición que
// más pesó y, por condición, el valor de la parcela y el rango del cultivo. Es evidencia del experimento: se anexa,
// no se reemplaza.

export function cuerpoDeLasRecomendaciones({ modelo, sugerencias }: SugerenciasDelModelo) {
  return {
    modelo,
    sugerencias: sugerencias.map((s) => {
      const { condiciones } = s.campana.aptitud
      return {
        cultivo: s.cultivo,
        orden: s.orden,
        probabilidad: s.probabilidad,
        condicionMasInfluyente: s.rasgoMasInfluyente,
        condiciones: Object.fromEntries(condiciones.map((c) => [c.condicion, c])),
        rangos: Object.fromEntries(condiciones.map((c) => [c.condicion, lecturaDeCondicion(c).pide])),
        explicacion: explicacionDeLaSugerencia(s.cultivo, s.rasgoMasInfluyente, condiciones),
      }
    }),
  }
}
