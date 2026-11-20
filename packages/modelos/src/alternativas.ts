import {
  analisisDeLaRed,
  claseDelTramo,
  descripcionDelDiseno,
  medirModificacion,
  mejoraEnAlgo,
  modificacionesPosibles,
  rasgosDeLaModificacion,
  RASGOS_DE_LA_MODIFICACION,
  valorDelDiseno,
  type DisenoAValorar,
  type Modificacion,
} from '@riego/calculo'

// Las alternativas del paso 7 (HU0026). El modelo sustituto no diseña: ordena las modificaciones posibles por lo que
// estima de cada criterio, y solo las más prometedoras se recalculan. El módulo tiene la última palabra: la que no
// funciona o no mejora en nada no se muestra. Sin recocido ni ninguna otra búsqueda: una sola pasada.

export interface MetadatosDelSustituto {
  nombre: 'sustituto'
  version: string
  rasgos: readonly string[]
  /** Las salidas del modelo, en orden. */
  salidas: readonly string[]
  metricas: Record<string, unknown>
  conjunto: string
  entrenadoEn: string
  archivo: string
}

/** Lo que estima el modelo para cada fila, en el orden de `salidas`. */
export type PredecirSustituto = (filas: readonly (readonly number[])[]) => Promise<number[][]>

export type CriterioDeMejora = 'costo' | 'uniformidad' | 'margen'

const POR_CRITERIO = 6
const ESTIMA_QUE_FUNCIONA = 0.5

export function ordenDelModelo(modificaciones: readonly Modificacion[], estimaciones: readonly (readonly number[])[], metadatos: Pick<MetadatosDelSustituto, 'salidas'>) {
  const i = (salida: string) => {
    const columna = metadatos.salidas.indexOf(salida)
    if (columna < 0) throw new Error(`El modelo no estima ${salida}`)
    return columna
  }
  const filas = modificaciones.map((modificacion, k) => ({
    modificacion,
    costoPct: estimaciones[k]![i('costoPct')]!,
    uniformidad: estimaciones[k]![i('uniformidad')]!,
    margenM: estimaciones[k]![i('margenM')]!,
    funciona: estimaciones[k]![i('funciona')]!,
  }))
  const viables = filas.filter((f) => f.funciona >= ESTIMA_QUE_FUNCIONA)
  return {
    costo: [...viables].sort((a, b) => a.costoPct - b.costoPct),
    uniformidad: [...viables].sort((a, b) => b.uniformidad - a.uniformidad),
    margen: [...viables].sort((a, b) => b.margenM - a.margenM),
  }
}

const describirAccion = ({ grupo, pasosDeDiametro, pasosDeClase }: Modificacion[number]) => {
  const nombre = { conduccion: 'la conducción', portalateral: 'el portalateral', valvulas: 'las válvulas', laterales: 'los laterales' }[grupo]
  if (pasosDeDiametro !== 0) return `${pasosDeDiametro > 0 ? 'Engrosar' : 'Adelgazar'} ${nombre} ${Math.abs(pasosDeDiametro)} ${Math.abs(pasosDeDiametro) === 1 ? 'diámetro' : 'diámetros'}`
  return `${pasosDeClase > 0 ? 'Subir' : 'Bajar'} la clase de ${nombre}`
}

/** Propone hasta `cuantas` alternativas verificadas para un diseño que ya funciona. */
export async function proponerAlternativas({
  diseno,
  metadatos,
  predecir,
  cuantas = 4,
}: {
  diseno: DisenoAValorar
  metadatos: MetadatosDelSustituto
  predecir: PredecirSustituto
  cuantas?: number
}) {
  if (metadatos.rasgos.join() !== RASGOS_DE_LA_MODIFICACION.join()) throw new Error('El modelo sustituto no espera los rasgos que describe el módulo')
  const analisis = analisisDeLaRed(diseno)
  if (!analisis.funciona) throw new Error('Las alternativas se piden para un diseño que ya funciona')
  const partida = valorDelDiseno(diseno, analisis)
  const descripcion = descripcionDelDiseno(diseno, analisis, partida)
  const modificaciones = modificacionesPosibles(diseno.red)
  const estimaciones = await predecir(modificaciones.map((m) => rasgosDeLaModificacion(descripcion, m)))
  const orden = ordenDelModelo(modificaciones, estimaciones, metadatos)

  const antes = new Map(diseno.red.tramos.map((t) => [t.id, t]))
  const medidas = new Map<string, ReturnType<typeof medirModificacion>>()
  const medir = (m: Modificacion) => {
    const clave = JSON.stringify(m)
    let medida = medidas.get(clave)
    if (!medida) {
      medida = medirModificacion(diseno, partida, m)
      medidas.set(clave, medida)
    }
    return medida
  }

  const criterios: CriterioDeMejora[] = ['costo', 'uniformidad', 'margen']
  const ganadoras = criterios.flatMap((criterio) => {
    const verificadas = orden[criterio].slice(0, POR_CRITERIO).filter(({ modificacion }) => {
      const m = medir(modificacion)
      return m.valor.funciona && mejoraEnAlgo(m.diferencia)
    })
    const delCriterio = verificadas.map(({ modificacion }) => ({ modificacion, medida: medir(modificacion) }))
    const logro = ({ medida: { diferencia: d } }: (typeof delCriterio)[number]) => (criterio === 'costo' ? -d.costoPct : criterio === 'uniformidad' ? d.uniformidad : d.margenM)
    return delCriterio.filter((c) => logro(c) > 0).sort((a, b) => logro(b) - logro(a)).map((c) => ({ ...c, criterio }))
  })

  const vistas = new Set<string>()
  const alternativas = []
  // Primero la mejor de cada criterio; después, las que sigan, hasta completar.
  for (const candidata of [...criterios.flatMap((c) => ganadoras.filter((g) => g.criterio === c).slice(0, 1)), ...ganadoras]) {
    const clave = JSON.stringify(candidata.modificacion)
    if (vistas.has(clave) || alternativas.length >= cuantas) continue
    vistas.add(clave)
    const { medida, criterio, modificacion } = candidata
    alternativas.push({
      criterio,
      descripcion: modificacion.map(describirAccion).join(' y '),
      cambios: medida.cambios,
      porTramo: medida.cambios.flatMap((c) => {
        if (c.tipo !== 'tramo') return []
        const tramo = antes.get(c.tramo)!
        return [
          {
            tramo: c.tramo,
            antes: { diametroInternoMm: tramo.diametroInternoMm, clase: claseDelTramo(tramo.presionMaximaM) },
            ahora: { diametroInternoMm: c.diametroInternoMm ?? tramo.diametroInternoMm, clase: c.clase ?? claseDelTramo(tramo.presionMaximaM) },
          },
        ]
      }),
      red: medida.red,
      analisis: medida.analisis,
      valor: medida.valor,
      diferencia: medida.diferencia,
    })
  }

  const todas = [...medidas.values()]
  return {
    partida,
    alternativas,
    estadisticas: {
      posibles: modificaciones.length,
      recalculadas: todas.length,
      pasaronLaVerificacion: todas.filter((m) => m.valor.funciona).length,
      mejoranEnAlgo: todas.filter((m) => m.valor.funciona && mejoraEnAlgo(m.diferencia)).length,
    },
  }
}

export type AlternativasDelDiseno = Awaited<ReturnType<typeof proponerAlternativas>>
export type AlternativaDelDiseno = AlternativasDelDiseno['alternativas'][number]
