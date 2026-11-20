import { RASGOS_DEL_LUGAR, type RasgoDelLugar } from '@riego/calculo'

// Las sugerencias del modelo de cultivos (HU0011): los tres cultivos más probables para el lugar y, para cada uno, la
// condición que más pesó y el mes en que más se siembra en lugares parecidos. El modelo es un bosque aleatorio exportado
// a ONNX; aquí no se sabe cómo corre, solo se le piden probabilidades. Así la misma lógica se prueba sin navegador y
// corre igual en el hilo del cálculo.

/** La entrada del modelo que no es un rasgo del lugar: el mes de siembra, contado desde agosto como la campaña agrícola. */
export const MES_DE_LA_CAMPANA = 'mesDeLaCampana'

export type EntradaDelModelo = RasgoDelLugar | typeof MES_DE_LA_CAMPANA

/** Un mes del calendario, de 1 (enero) a 12, como mes de la campaña: 1 es agosto, 6 es enero y 12 es julio. */
export const mesDeLaCampana = (mes: number) => ((mes + 4) % 12) + 1

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

/** Lo que el entrenamiento deja junto al modelo: con qué se entrenó, qué espera y qué devuelve. */
export interface MetadatosDelModelo {
  nombre: 'cultivos'
  version: string
  /**
   * Las entradas del modelo, en el orden en que las espera: rasgos de RASGOS_DEL_LUGAR y, si el modelo lo usa, el mes de
   * siembra. La ENA 2024 no dice cuánta agua tiene cada lugar, así que el modelo no la mira y el agua se comprueba
   * aparte, con la aptitud.
   */
  rasgos: readonly EntradaDelModelo[]
  /** Los cultivos en el orden de las columnas de probabilidad. */
  clases: readonly string[]
  /** Mediana de cada entrada en el conjunto de entrenamiento: el valor de referencia para medir cuánto pesa cada rasgo. */
  medianas: readonly number[]
  /**
   * Si el modelo usa el mes: qué parte de las siembras cae en cada mes, de enero a diciembre, por banda de altitud de
   * `bandaM` metros. Sin este dato, los doce meses pesan lo mismo.
   */
  siembrasPorMes?: { bandaM: number; proporciones: readonly (readonly number[])[] }
  metricas: Record<string, unknown>
  conjunto: string
  entrenadoEn: string
  archivo: string
}

/** Probabilidad de cada clase para cada fila de entradas, en el orden de `clases`. */
export type Predecir = (filas: readonly (readonly number[])[]) => Promise<number[][]>

export interface SugerenciaDelModelo {
  cultivo: string
  /** 1, 2 o 3. */
  orden: number
  /** Si el modelo usa el mes, la de sembrar este cultivo en algún mes del año. */
  probabilidad: number
  rasgoMasInfluyente: RasgoDelLugar
  /** Cuánto baja la probabilidad del cultivo si cada rasgo del modelo se lleva a la mediana del entrenamiento. */
  pesos: Partial<Record<RasgoDelLugar, number>>
  /** El mes, de 1 (enero) a 12, en que más se siembra este cultivo en lugares parecidos. Nulo si el modelo no usa el mes. */
  mesDeSiembra: number | null
}

/** Con qué peso entra cada mes, de enero a diciembre: la parte de las siembras que cae en él a la altitud del lugar. */
function pesosDeLosMeses({ siembrasPorMes }: MetadatosDelModelo, altitudM: number): readonly number[] {
  if (!siembrasPorMes) return MESES.map(() => 1 / 12)
  const { bandaM, proporciones } = siembrasPorMes
  const fila = proporciones[Math.min(Math.max(0, Math.floor(altitudM / bandaM)), proporciones.length - 1)]!
  const suma = fila.reduce((s, p) => s + p, 0)
  return fila.map((p) => p / suma)
}

const indiceDelMayor = (valores: readonly number[]) => valores.reduce((mejor, v, i) => (v > valores[mejor]! ? i : mejor), 0)

/**
 * Los `cuantos` cultivos más probables. Si el modelo usa el mes, el lugar se le pasa con los doce meses de siembra y cada
 * mes se pesa por lo que se siembra en él a esa altitud: la probabilidad de un cultivo es la de sembrarlo en algún mes, y
 * su mes de siembra es aquel en que más se siembra. La condición que más pesó se mide por oclusión: se lleva cada rasgo
 * del lugar, uno a la vez, a su mediana en el entrenamiento, y la que más hace bajar la probabilidad del cultivo es la más
 * influyente. El mes no es una condición del lugar y no entra en esa cuenta. Todo sale de un solo pedido al modelo: la
 * fila del lugar y una por rasgo ocluido, cada una con sus meses.
 */
export async function sugerirCultivos({
  rasgos: rasgosDelLugar,
  metadatos,
  predecir,
  cuantos = 3,
}: {
  /** Los rasgos del lugar, en el orden de RASGOS_DEL_LUGAR; de ahí se toman por nombre los que el modelo usa. */
  rasgos: readonly number[]
  metadatos: MetadatosDelModelo
  predecir: Predecir
  cuantos?: number
}): Promise<SugerenciaDelModelo[]> {
  if (rasgosDelLugar.length !== RASGOS_DEL_LUGAR.length) {
    throw new Error(`Un lugar tiene ${RASGOS_DEL_LUGAR.length} rasgos y llegaron ${rasgosDelLugar.length}`)
  }
  const valorDe = (rasgo: RasgoDelLugar) => rasgosDelLugar[RASGOS_DEL_LUGAR.indexOf(rasgo)]!
  const usaElMes = metadatos.rasgos.includes(MES_DE_LA_CAMPANA)
  const delLugar = metadatos.rasgos.filter((r): r is RasgoDelLugar => r !== MES_DE_LA_CAMPANA)
  const meses = usaElMes ? MESES : [null]
  const pesoDelMes = usaElMes ? pesosDeLosMeses(metadatos, valorDe('altitudM')) : [1]

  const fila = (ocluido: RasgoDelLugar | null, mes: number | null) =>
    metadatos.rasgos.map((entrada, j) => {
      if (entrada === MES_DE_LA_CAMPANA) return mesDeLaCampana(mes!)
      return entrada === ocluido ? metadatos.medianas[j]! : valorDe(entrada)
    })
  const variantes = [null, ...delLugar]
  const filas = variantes.flatMap((ocluido) => meses.map((mes) => fila(ocluido, mes)))
  const probabilidades = await predecir(filas)
  if (probabilidades.length !== filas.length || probabilidades.some((p) => p.length !== metadatos.clases.length)) {
    throw new Error('El modelo no devolvió una probabilidad por cultivo')
  }

  // Por variante y mes, la probabilidad de cada cultivo por el peso del mes; sumada sobre los meses, la del cultivo.
  const porMes = (variante: number) => meses.map((_, k) => probabilidades[variante * meses.length + k]!.map((p) => p * pesoDelMes[k]!))
  const sumaDeLosMeses = (matriz: readonly (readonly number[])[]) => metadatos.clases.map((_, c) => matriz.reduce((s, f) => s + f[c]!, 0))
  const delLugarPorMes = porMes(0)
  const deCadaCultivo = sumaDeLosMeses(delLugarPorMes)
  const sinCadaRasgo = delLugar.map((_, j) => sumaDeLosMeses(porMes(j + 1)))

  return deCadaCultivo
    .map((probabilidad, clase) => ({ probabilidad, clase }))
    .sort((a, b) => b.probabilidad - a.probabilidad || a.clase - b.clase)
    .slice(0, cuantos)
    .map(({ probabilidad, clase }, i) => {
      const pesos = Object.fromEntries(delLugar.map((rasgo, j) => [rasgo, probabilidad - sinCadaRasgo[j]![clase]!])) as Partial<Record<RasgoDelLugar, number>>
      const rasgoMasInfluyente = delLugar.reduce((a, b) => (pesos[b]! > pesos[a]! ? b : a))
      const mesDeSiembra = usaElMes ? MESES[indiceDelMayor(delLugarPorMes.map((f) => f[clase]!))]! : null
      return { cultivo: metadatos.clases[clase]!, orden: i + 1, probabilidad, rasgoMasInfluyente, pesos, mesDeSiembra }
    })
}
