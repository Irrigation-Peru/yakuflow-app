// El método de riego que se recomienda para el cultivo, el suelo y el desnivel (paso 4). Por desnivel, el goteo pide
// de 15 a 20 m y la aspersión de 30 a 45; el cultivo dice con qué métodos se suele regar, y el suelo, si el agua del
// aspersor alcanza a entrar.

import { DESNIVEL_MINIMO_ASPERSION_M, DESNIVEL_MINIMO_GOTEO_M } from '../constantes'
import type { Cultivo } from './cultivo'
import { metodoMasEficiente, type MetodoDeRiego } from './diseno-agronomico'
import { CATALOGO_EMISORES, intensidadDelEmisor, type EmisorDeCatalogo } from './emisores'

export type MotivoDeMetodoNoViable = 'cultivo' | 'presion' | 'infiltracion'

export type ViabilidadDelMetodo = { viable: true } | { viable: false; motivos: MotivoDeMetodoNoViable[]; cargaNecesariaM?: number }

const CARGA_MINIMA_M: Readonly<Record<MetodoDeRiego, number>> = {
  goteo: DESNIVEL_MINIMO_GOTEO_M,
  aspersion: DESNIVEL_MINIMO_ASPERSION_M,
}

const METODOS: readonly MetodoDeRiego[] = ['goteo', 'aspersion']

export function metodoDeRiego({
  cultivo,
  cargaDisponibleM,
  infiltracionBasicaMmH,
  emisores = CATALOGO_EMISORES,
}: {
  cultivo: Cultivo
  /** Desnivel entre el nivel libre del agua (la fuente o la última cámara) y el punto más alto de la parcela, m. */
  cargaDisponibleM: number
  infiltracionBasicaMmH: number
  emisores?: readonly EmisorDeCatalogo[]
}) {
  const evaluar = (metodo: MetodoDeRiego): ViabilidadDelMetodo => {
    const motivos: MotivoDeMetodoNoViable[] = []
    if (cultivo.requisitos && !cultivo.requisitos.metodos.includes(metodo)) motivos.push('cultivo')
    const presionCorta = cargaDisponibleM < CARGA_MINIMA_M[metodo]
    if (presionCorta) motivos.push('presion')
    // El goteo moja un punto y el suelo lo absorbe; el aspersor moja toda la superficie a la vez.
    if (metodo === 'aspersion' && !emisores.some((e) => e.metodo === 'aspersion' && intensidadDelEmisor(e) <= infiltracionBasicaMmH)) {
      motivos.push('infiltracion')
    }
    if (motivos.length === 0) return { viable: true }
    return presionCorta ? { viable: false, motivos, cargaNecesariaM: CARGA_MINIMA_M[metodo] } : { viable: false, motivos }
  }

  const metodos = { goteo: evaluar('goteo'), aspersion: evaluar('aspersion') }
  const viables = METODOS.filter((m) => metodos[m].viable)
  const recomendado = viables.length > 0 ? metodoMasEficiente(viables) : null
  return { recomendado, metodos, emisor: recomendado && emisores.find((e) => e.metodo === recomendado) }
}
