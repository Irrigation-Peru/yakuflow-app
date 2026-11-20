import type { LugarDelCultivo } from '@riego/calculo'
import type { DatosDelLugar, LugarDelProyecto } from './api/tipos.ts'

// El lugar tal como lo recibe el módulo de cálculo, armado con lo que guardó el servidor: la parcela, la fuente, el
// clima de los doce meses y el suelo vigente (la muestra de campo si el estudiante la tomó; si no, el satelital).

export const sueloVigente = (datos: DatosDelLugar) => (datos.suelo.vigente === 'campo' ? datos.suelo.campo : datos.suelo.satelital)

export function lugarDelCultivo(proyecto: LugarDelProyecto, datos: DatosDelLugar): LugarDelCultivo | null {
  const suelo = sueloVigente(datos)
  if (!proyecto.parcela || !proyecto.fuente || !datos.clima || !suelo) return null
  return {
    altitudM: proyecto.parcela.altitudMsnm,
    normales: datos.clima.meses.map(({ mes: _mes, et0MmDia: _et0, ...normal }) => normal),
    clima: datos.clima.meses.map((m) => ({ et0MmDia: m.et0MmDia, lluviaMm: m.lluviaMm })),
    suelo: { clase: suelo.clase, ph: suelo.ph },
    fuente: {
      caudalLps: proyecto.fuente.caudalLps,
      horasDisponiblesDia: proyecto.fuente.horasDisponiblesDia,
      conductividadDsM: proyecto.fuente.conductividadDsM,
    },
    areaHa: proyecto.parcela.areaHa,
  }
}
