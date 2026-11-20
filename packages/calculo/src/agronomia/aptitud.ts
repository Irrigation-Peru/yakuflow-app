// Aptitud de un cultivo para el lugar y la fecha de siembra: cada condición del lugar contra lo que el cultivo
// pide. Como en ECOCROP, cada condición da un índice entre 0 y 1 (1 en el óptimo, 0 fuera de los extremos, en línea
// recta entre ellos) y el cultivo vale lo que su peor condición.

import type { NormalDelMes } from './clima'
import type { Cultivo, RangoConOptimo, TexturaGruesa } from './cultivo'
import { demandaDeLaCampana, type ClimaMensual } from './demanda'
import { eficienciaDeRiego, metodoMasEficiente, type MetodoDeRiego } from './diseno-agronomico'
import { aguaDisponibleDeLaFuente } from './fuente'
import type { ClaseTextural } from './textura'

export type NivelDeAptitud = 'optima' | 'marginal' | 'fuera'

/**
 * Margen sobre la temperatura letal, °C. La normal del mes es la media de las mínimas diarias, y las noches más
 * frías del mes bajan varios grados por debajo de ella: con la media a menos de este margen sobre la letal, alguna
 * helada es probable. Valor provisional, por validar con el especialista.
 */
export const MARGEN_DE_HELADA_C = 4

/**
 * Salinidad del extracto de saturación del suelo a partir de la del agua de riego, con una fracción de lavado de
 * 15 a 20 % (Ayers y Westcot, 1985, FAO Riego y Drenaje N.º 29): ECe = 1.5 · ECa.
 */
export const SALINIDAD_SUELO_POR_AGUA = 1.5

/**
 * Índice de un riesgo alto que no descarta el cultivo: la helada bajo la temperatura letal y la altitud por encima de la
 * habitual. Las dos se miden con datos que no alcanzan para descartar: la helada, con normales mensuales de una grilla de
 * unos 50 km y no con las heladas de la parcela; la altitud, con límites de los Andes bolivianos o de ECOCROP y no de
 * cosechas peruanas. En los lugares donde la ENA 2024 registra la cosecha de un cultivo del catálogo, descartar por
 * ellas dejaba fuera el 39,5 % (papa y avena a más de 4 000 m, zanahoria en toda la sierra). Queda como riesgo: el
 * cultivo baja al final del orden con su advertencia, y el estudiante decide. El valor no está calibrado con la ENA:
 * solo ordena este riesgo por debajo del 0,5 de una helada posible.
 */
export const INDICE_DE_RIESGO_ALTO = 0.25

/** Pérdida de rendimiento por sales a partir de la cual el cultivo queda fuera, %. */
const PERDIDA_MAXIMA_PCT = 50

const M3_HA_POR_MM = 10

/** Clase gruesa de ECOCROP para cada clase del triángulo del USDA: arenosas, francas y arcillosas. */
export const TEXTURA_GRUESA: Readonly<Record<ClaseTextural, TexturaGruesa>> = {
  arena: 'ligera',
  'arena franca': 'ligera',
  'franco arenoso': 'ligera',
  franco: 'media',
  'franco limoso': 'media',
  limo: 'media',
  'franco arcillo arenoso': 'media',
  'franco arcilloso': 'media',
  'franco arcillo limoso': 'media',
  'arcilla arenosa': 'pesada',
  'arcilla limosa': 'pesada',
  arcilla: 'pesada',
}

export interface LugarDelCultivo {
  altitudM: number
  /** Normales de los doce meses, de enero a diciembre. */
  normales: readonly NormalDelMes[]
  /** ET0 y lluvia de los doce meses, que salen de las normales. */
  clima: readonly ClimaMensual[]
  suelo: { clase: ClaseTextural; ph?: number | null }
  fuente: { caudalLps: number; horasDisponiblesDia: number; conductividadDsM?: number | null }
  areaHa: number
}

interface Evaluada {
  nivel: NivelDeAptitud
  indice: number
}

export type EvaluacionDeCondicion = Evaluada &
  (
    | { condicion: 'altitud'; valorM: number; maximoM: number }
    | { condicion: 'temperatura'; valorC: number; rango: RangoConOptimo }
    | { condicion: 'helada'; minimaC: number; letalC: number }
    | { condicion: 'ph'; valor: number; rango: RangoConOptimo }
    | { condicion: 'textura'; clase: ClaseTextural; gruesa: TexturaGruesa; optimas: readonly TexturaGruesa[]; posibles: readonly TexturaGruesa[] }
    | {
        condicion: 'salinidad'
        conductividadDelAguaDsM: number
        salinidadDelSueloDsM: number
        umbralDsM: number
        /** Rendimiento que se pierde por las sales, %; sin pérdida conocida, nulo. */
        perdidaPct: number | null
      }
    | { condicion: 'agua'; ofertaMmDia: number; necesidadMmDia: number; metodo: MetodoDeRiego }
  )

export type Condicion = EvaluacionDeCondicion['condicion']

const nivelDe = (indice: number): NivelDeAptitud => (indice >= 1 ? 'optima' : indice <= 0 ? 'fuera' : 'marginal')

/** Índice de un valor en un rango con óptimo: 1 dentro del óptimo, 0 fuera de los extremos, en línea recta entre ellos. */
export function indiceEnElRango(valor: number, { minimo, optimoMinimo, optimoMaximo, maximo }: RangoConOptimo) {
  if (valor < minimo || valor > maximo) return 0
  if (valor < optimoMinimo) return (valor - minimo) / (optimoMinimo - minimo)
  if (valor > optimoMaximo) return (maximo - valor) / (maximo - optimoMaximo)
  return 1
}

export function aptitudDelCultivo({ cultivo, fechaSiembra, lugar }: { cultivo: Cultivo; fechaSiembra: string; lugar: LugarDelCultivo }) {
  const requisitos = cultivo.requisitos
  if (!requisitos) throw new Error(`El cultivo ${cultivo.nombre} no tiene requisitos con que compararlo`)
  if (lugar.normales.length !== 12) throw new Error(`Se necesitan las normales de los doce meses y llegaron ${lugar.normales.length}`)

  const demanda = demandaDeLaCampana({ cultivo, fechaSiembra, clima: lugar.clima })
  const meses = demanda.dias.map((d) => lugar.normales[Number(d.fecha.slice(5, 7)) - 1]!)
  const temperaturaMediaC = meses.reduce((suma, m) => suma + (m.temperaturaMaximaC + m.temperaturaMinimaC) / 2, 0) / meses.length
  const minimaC = Math.min(...meses.map((m) => m.temperaturaMinimaC))

  const condiciones: EvaluacionDeCondicion[] = []
  const evaluar = (indice: number) => ({ indice, nivel: nivelDe(indice) })

  condiciones.push({
    condicion: 'altitud',
    valorM: lugar.altitudM,
    maximoM: requisitos.altitudMaximaM,
    ...evaluar(lugar.altitudM <= requisitos.altitudMaximaM ? 1 : INDICE_DE_RIESGO_ALTO),
  })
  condiciones.push({
    condicion: 'temperatura',
    valorC: temperaturaMediaC,
    rango: requisitos.temperaturaMediaC,
    ...evaluar(indiceEnElRango(temperaturaMediaC, requisitos.temperaturaMediaC)),
  })
  if (requisitos.temperaturaLetalC !== undefined) {
    const letalC = requisitos.temperaturaLetalC
    const indice = minimaC < letalC ? INDICE_DE_RIESGO_ALTO : minimaC < letalC + MARGEN_DE_HELADA_C ? 0.5 : 1
    condiciones.push({ condicion: 'helada', minimaC, letalC, ...evaluar(indice) })
  }
  if (lugar.suelo.ph !== undefined && lugar.suelo.ph !== null) {
    condiciones.push({
      condicion: 'ph',
      valor: lugar.suelo.ph,
      rango: requisitos.ph,
      ...evaluar(indiceEnElRango(lugar.suelo.ph, requisitos.ph)),
    })
  }
  const gruesa = TEXTURA_GRUESA[lugar.suelo.clase]
  condiciones.push({
    condicion: 'textura',
    clase: lugar.suelo.clase,
    gruesa,
    ...requisitos.texturas,
    ...evaluar(requisitos.texturas.optimas.includes(gruesa) ? 1 : requisitos.texturas.posibles.includes(gruesa) ? 0.5 : 0),
  })
  const conductividad = lugar.fuente.conductividadDsM
  if (conductividad !== undefined && conductividad !== null) {
    const salinidadDelSueloDsM = SALINIDAD_SUELO_POR_AGUA * conductividad
    const { umbralDsM, perdidaPctPorDsM } = requisitos.salinidad
    const exceso = Math.max(0, salinidadDelSueloDsM - umbralDsM)
    const perdidaPct = perdidaPctPorDsM === undefined ? null : perdidaPctPorDsM * exceso
    const indice =
      exceso === 0 ? 1 : perdidaPct === null || perdidaPct >= PERDIDA_MAXIMA_PCT ? 0 : 1 - perdidaPct / 100
    condiciones.push({ condicion: 'salinidad', conductividadDelAguaDsM: conductividad, salinidadDelSueloDsM, umbralDsM, perdidaPct, ...evaluar(indice) })
  }
  const metodo = metodoMasEficiente(requisitos.metodos)
  const necesidadMmDia =
    demanda.demandaNetaPicoMmDia / eficienciaDeRiego({ metodo, conductividadDelAguaDsM: conductividad, salinidad: requisitos.salinidad }).eficiencia
  const ofertaMmDia =
    aguaDisponibleDeLaFuente({ caudalLps: lugar.fuente.caudalLps, horasDeRiegoPorDia: lugar.fuente.horasDisponiblesDia }).m3PorDia /
    (lugar.areaHa * M3_HA_POR_MM)
  // Si no alcanza, el paso 3 propone turnos, reservorio o menos área: queda en el margen, no fuera.
  const indiceDeAgua = necesidadMmDia === 0 ? 1 : Math.min(1, ofertaMmDia / necesidadMmDia)
  condiciones.push({
    condicion: 'agua',
    ofertaMmDia,
    necesidadMmDia,
    metodo,
    indice: indiceDeAgua,
    nivel: indiceDeAgua >= 1 ? 'optima' : 'marginal',
  })

  const peor = condiciones.reduce((a, b) => (b.indice < a.indice ? b : a))
  const indice = peor.indice
  return {
    condiciones,
    indice,
    nivel: condiciones.some((c) => c.nivel === 'fuera') ? ('fuera' as const) : indice < 1 ? ('marginal' as const) : ('optima' as const),
    /** La condición que más resta; nula si todas están en el óptimo. */
    limitante: indice < 1 ? peor.condicion : null,
    temperaturaMediaC,
    minimaC,
  }
}
