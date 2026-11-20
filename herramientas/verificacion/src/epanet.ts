import { longitudInclinada, type Red } from '@riego/calculo'
import { AnalysisStatistic, LinkProperty, NodeProperty, Project } from 'epanet-js'
import { EpanetEngine } from 'epanet-js/engines/v2.2'
import { Workspace } from 'epanet-js/slim'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Resuelve una red del módulo con EPANET 2.2 (OWA, compilado a WebAssembly por epanet-js) para compararla.
//
// Cómo se traduce cada pieza:
// - Emisores: el coeficiente pasa a l/s, C = k / 3600, con el exponente global de EPANET.
// - CRP y VRP: una válvula reductora (PRV) entre el nodo donde llega el agua y el nodo desde donde sigue,
//   con consigna 0 en la CRP y la suya en la VRP.
// - Cabezal: EPANET no tiene una pérdida fija que converja. La válvula de pérdida fija (PBV) oscila, y la
//   válvula general con una curva plana deja indeterminado el caudal que la atraviesa. Se usa en cambio una
//   equivalencia exacta: un cabezal resta la misma presión a todo lo que queda aguas abajo, y eso es lo
//   mismo que subir esas cotas en su pérdida. Los caudales dependen solo de diferencias de carga y de la
//   presión de cada emisor, así que no cambian; la presión de llegada al cabezal es la de EPANET más la pérdida.

/** Iteraciones que EPANET tiene para converger. Si las agota, la red no se compara. */
const ITERACIONES_EPANET = 1000

/** Carga EPANET 2.2 compilado a WebAssembly. Se fija la versión: la verificación no debe cambiar si cambia la biblioteca. */
export async function cargarEpanet() {
  const carpeta = dirname(createRequire(import.meta.url).resolve('epanet-js/engines/v2.2'))
  const wasmBinary = readFileSync(join(carpeta, 'EpanetEngine.wasm'))
  const ws = new Workspace()
  // epanet-js tipa la fábrica del módulo sin el argumento con el que se le pasa el binario.
  await ws.loadModuleVersion(() => (EpanetEngine as unknown as (m: object) => Promise<never>)({ wasmBinary }))
  return ws
}

const llegada = (id: string) => `${id}~`

/**
 * Pérdida de los cabezales que el agua atraviesa hasta salir de cada nodo, m. Las redes de verificación
 * declaran cada tramo en el sentido del agua, de `desde` a `hasta`.
 */
function perdidaDeCabezales(red: Red) {
  const elementos = red.elementos ?? {}
  const padre = new Map(red.tramos.map((t) => [t.hasta, t.desde]))
  const acumulada = new Map<string, number>()
  const de = (id: string): number => {
    const conocida = acumulada.get(id)
    if (conocida !== undefined) return conocida
    const arriba = padre.get(id)
    const elemento = elementos[id]
    const propia = elemento?.tipo === 'cabezal' ? elemento.perdidaM : 0
    const total = propia + (arriba === undefined ? 0 : de(arriba))
    acumulada.set(id, total)
    return total
  }
  for (const n of red.nodos) de(n.id)
  return acumulada
}

/** Escribe la red en el formato INP de EPANET. Exige un mismo exponente para todos los emisores. */
export function aInp(red: Red) {
  const exponentes = new Set(red.emisores.map((e) => e.x))
  if (exponentes.size > 1) throw new Error('EPANET usa un solo exponente para todos los emisores')
  const elementos = red.elementos ?? {}
  if (elementos[red.fuente.nodo]) throw new Error('La verificación no modela elementos en la fuente')
  const cabezales = perdidaDeCabezales(red)
  const valvula = (id: string) => elementos[id] !== undefined && elementos[id]!.tipo !== 'cabezal'

  const uniones: string[] = []
  const valvulas: string[] = []
  for (const n of red.nodos) {
    if (n.id === red.fuente.nodo) continue
    const cota = n.z + cabezales.get(n.id)!
    uniones.push(`${n.id} ${cota} 0`)
    const e = elementos[n.id]
    if (!valvula(n.id) || !e || e.tipo === 'cabezal') continue
    uniones.push(`${llegada(n.id)} ${cota} 0`)
    valvulas.push(`v${n.id} ${llegada(n.id)} ${n.id} 100 PRV ${e.tipo === 'crp' ? 0 : e.consignaM} 0`)
  }
  const fuente = red.nodos.find((n) => n.id === red.fuente.nodo)!

  const nodo = new Map(red.nodos.map((n) => [n.id, n]))
  const tuberias = red.tramos.map((t) => {
    const a = nodo.get(t.desde)!
    const b = nodo.get(t.hasta)!
    const longitud = longitudInclinada(a.z - b.z, Math.hypot(a.x - b.x, a.y - b.y))
    const k = (t.coeficientesKr ?? []).reduce((s, kr) => s + kr, 0)
    const hasta = valvula(t.hasta) ? llegada(t.hasta) : t.hasta
    return `${t.id} ${t.desde} ${hasta} ${longitud} ${t.diametroInternoMm} ${t.c} ${k} Open`
  })

  const coeficiente = new Map<string, number>()
  for (const e of red.emisores) coeficiente.set(e.nodo, (coeficiente.get(e.nodo) ?? 0) + e.k / 3600)

  return [
    '[TITLE]',
    'Verificación del módulo de cálculo',
    '[JUNCTIONS]',
    ...uniones,
    '[RESERVOIRS]',
    `${fuente.id} ${fuente.z + red.fuente.presionInicialM}`,
    '[PIPES]',
    ...tuberias,
    '[VALVES]',
    ...valvulas,
    '[EMITTERS]',
    ...[...coeficiente].map(([id, c]) => `${id} ${c}`),
    '[OPTIONS]',
    'Units LPS',
    'Headloss H-W',
    // EPANET no acepta una exactitud global menor que 1e-5; los criterios por tramo de la versión 2.2 sí
    // la afinan: error de pérdida y cambio de caudal de cada tramo.
    'Accuracy 0.00001',
    'HeadError 0.000000001',
    'FlowChange 0.000000001',
    `Trials ${ITERACIONES_EPANET}`,
    `Emitter Exponent ${[...exponentes][0] ?? 0.5}`,
    '[END]',
    '',
  ].join('\n')
}

export interface ResultadoEpanet {
  /** Presión con la que el agua sigue desde el nodo, m. */
  presion: Record<string, number>
  /** Presión con la que llega el agua al nodo, antes de su elemento, m. */
  presionLlegada: Record<string, number>
  /** Caudal de cada tramo, l/s, en valor absoluto. */
  caudalTramo: Record<string, number>
  /** Caudal de los emisores de cada nodo, l/h. */
  caudalEmisor: Record<string, number>
  convergio: boolean
  iteraciones: number
  /** Suma de los cambios de caudal sobre la suma de caudales en la última iteración. */
  errorRelativo: number
}

export function resolverEnEpanet(ws: Workspace, red: Red): ResultadoEpanet {
  ws.writeFile('red.inp', aInp(red))
  const p = new Project(ws)
  p.open('red.inp', 'red.rpt', '')
  try {
    p.solveH()
    const elementos = red.elementos ?? {}
    const iteraciones = p.getStatistic(AnalysisStatistic.Iterations)
    const resultado: ResultadoEpanet = {
      presion: {},
      presionLlegada: {},
      caudalTramo: {},
      caudalEmisor: {},
      convergio: iteraciones <= ITERACIONES_EPANET,
      iteraciones,
      errorRelativo: p.getStatistic(AnalysisStatistic.RelativeError),
    }
    const presion = (id: string) => p.getNodeValue(p.getNodeIndex(id), NodeProperty.Pressure)
    for (const n of red.nodos) {
      const e = elementos[n.id]
      if (n.id === red.fuente.nodo) {
        resultado.presion[n.id] = red.fuente.presionInicialM
        resultado.presionLlegada[n.id] = red.fuente.presionInicialM
      } else {
        resultado.presion[n.id] = presion(n.id)
        resultado.presionLlegada[n.id] =
          e?.tipo === 'cabezal' ? presion(n.id) + e.perdidaM : e ? presion(llegada(n.id)) : presion(n.id)
      }
    }
    for (const e of red.emisores) {
      resultado.caudalEmisor[e.nodo] = p.getNodeValue(p.getNodeIndex(e.nodo), NodeProperty.Demand) * 3600
    }
    for (const t of red.tramos) {
      resultado.caudalTramo[t.id] = Math.abs(p.getLinkValue(p.getLinkIndex(t.id), LinkProperty.Flow))
    }
    return resultado
  } finally {
    p.close()
  }
}
