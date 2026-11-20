import { rasgosDelLugar, type LugarDelCultivo } from '@riego/calculo'
import { sugerirCultivos, type MetadatosDelModelo, type Predecir } from '@riego/modelos'
import metadatosDelArchivo from '@riego/modelos/cultivos.json'
import urlDelModelo from '@riego/modelos/cultivos.onnx?url'
import * as ort from 'onnxruntime-web/wasm'
import urlDelWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { proximoPrimeroDelMes } from '../fechas.ts'
import { campanaDelCultivo } from './campana.ts'

// El modelo de cultivos (HU0011) en el hilo del cálculo: un bosque aleatorio en ONNX que corre en el navegador, sin
// servidor de modelos. El motor de ONNX y el modelo se descargan la primera vez que se abre el paso 2, desde el propio
// sitio, y el navegador los guarda.

const metadatos = metadatosDelArchivo as MetadatosDelModelo

let sesion: Promise<ort.InferenceSession> | null = null

function abrirSesion() {
  if (!sesion) {
    ort.env.wasm.wasmPaths = { wasm: urlDelWasm }
    // Varios hilos piden aislamiento entre orígenes; para treinta árboles basta uno.
    ort.env.wasm.numThreads = 1
    sesion = ort.InferenceSession.create(urlDelModelo).catch((error: unknown) => {
      sesion = null
      throw error
    })
  }
  return sesion
}

const predecir: Predecir = async (filas) => {
  const s = await abrirSesion()
  const entrada = new ort.Tensor('float32', Float32Array.from(filas.flat()), [filas.length, metadatos.rasgos.length])
  const salida = await s.run({ [s.inputNames[0]!]: entrada })
  const probabilidades = salida.probabilities!.data as Float32Array
  const clases = metadatos.clases.length
  return filas.map((_, i) => Array.from(probabilidades.subarray(i * clases, (i + 1) * clases)))
}

/**
 * Los tres cultivos que sugiere el modelo, cada uno con su probabilidad, la condición que más pesó, el mes en que más se
 * siembra en lugares parecidos y su aptitud sembrado ese mes: el rango que pide y el valor de la parcela. El módulo de
 * cálculo comprueba la fecha que sugiere el modelo, como cualquier otra. También lo que se guarda del modelo.
 */
export async function sugerenciasDelModelo(lugar: LugarDelCultivo) {
  const sugerencias = await sugerirCultivos({ rasgos: rasgosDelLugar(lugar), metadatos, predecir })
  const { version, metricas, conjunto, entrenadoEn, archivo } = metadatos
  return {
    modelo: { version, metricas, conjunto, entrenadoEn, archivo },
    sugerencias: sugerencias.map((s) => ({
      ...s,
      campana: campanaDelCultivo({ cultivo: s.cultivo, fechaSiembra: s.mesDeSiembra ? proximoPrimeroDelMes(s.mesDeSiembra) : undefined, lugar }),
    })),
  }
}

export type SugerenciasDelModelo = Awaited<ReturnType<typeof sugerenciasDelModelo>>
