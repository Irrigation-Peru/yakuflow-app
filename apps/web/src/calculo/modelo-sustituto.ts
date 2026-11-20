import { emisorDelCatalogo, presionesEstaticas, type CambioDeRed, type CatalogoDePrecios } from '@riego/calculo'
import { proponerAlternativas, type MetadatosDelSustituto, type PredecirSustituto } from '@riego/modelos'
import metadatosDelArchivo from '@riego/modelos/sustituto.json'
import urlDelModelo from '@riego/modelos/sustituto.onnx?url'
import * as ort from 'onnxruntime-web/wasm'
import urlDelWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { laRedDelEstudiante, type PlanteamientoDeLaRed } from './red.ts'

// El modelo sustituto (HU0025, HU0026) en el hilo del cálculo. El modelo solo ordena qué modificaciones probar: cada una
// se recalcula y se pone a funcionar con el módulo de cálculo, y la que no cumple no llega a la pantalla.

const metadatos = metadatosDelArchivo as unknown as MetadatosDelSustituto

let sesion: Promise<ort.InferenceSession> | null = null

function abrirSesion() {
  if (!sesion) {
    ort.env.wasm.wasmPaths = { wasm: urlDelWasm }
    ort.env.wasm.numThreads = 1
    sesion = ort.InferenceSession.create(urlDelModelo).catch((error: unknown) => {
      sesion = null
      throw error
    })
  }
  return sesion
}

const predecir: PredecirSustituto = async (filas) => {
  const s = await abrirSesion()
  const entrada = new ort.Tensor('float32', Float32Array.from(filas.flat()), [filas.length, metadatos.rasgos.length])
  const salida = await s.run({ [s.inputNames[0]!]: entrada })
  const datos = salida[s.outputNames[0]!]!.data as Float32Array
  const n = metadatos.salidas.length
  return filas.map((_, i) => Array.from(datos.subarray(i * n, (i + 1) * n)))
}

/** Las alternativas verificadas al diseño del estudiante, con lo que hace falta para verlas funcionar junto al suyo. */
export async function alternativasDelEstudiante(planteamiento: PlanteamientoDeLaRed, cambios: readonly CambioDeRed[], precios: CatalogoDePrecios) {
  const d = laRedDelEstudiante(planteamiento, cambios, precios)
  const emisor = emisorDelCatalogo(planteamiento.eleccion.emisor)
  const { alternativas, partida, estadisticas } = await proponerAlternativas({
    diseno: { red: d.red, sectores: d.sectores, presionNominalEmisorM: d.presionNominalEmisorM, emisor: { codigo: emisor.codigo, coeficienteK: emisor.coeficienteK }, precios },
    metadatos,
    predecir,
  })
  const { version, metricas, conjunto, entrenadoEn, archivo } = metadatos
  return {
    modelo: { version, metricas, conjunto, entrenadoEn, archivo },
    partida,
    estadisticas,
    alternativas: alternativas.map((a) => ({ ...a, cerrada: presionesEstaticas(a.red) })),
  }
}

export type AlternativasDelEstudiante = Awaited<ReturnType<typeof alternativasDelEstudiante>>
export type AlternativaDelEstudiante = AlternativasDelEstudiante['alternativas'][number]
