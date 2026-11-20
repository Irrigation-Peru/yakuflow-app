import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analisisDeLaRed, generadorConSemilla, medirModificacion, mejoraEnAlgo, modificacionesPosibles, valorDelDiseno } from '@riego/calculo'
import { proponerAlternativas, type MetadatosDelSustituto, type PredecirSustituto } from '@riego/modelos'
import * as ort from 'onnxruntime-web'
import { escenario } from './escenarios.ts'

// Las métricas de optimizacion-ml.md, de punta a punta y en redes que el modelo no vio: otra semilla que la del
// entrenamiento, el mismo archivo ONNX que usa el navegador y el mismo código de la aplicación. Compara contra elegir al
// azar el mismo número de modificaciones: si no gana a eso, el modelo no aporta.
//
//   pnpm --filter @riego/redes evaluar [redes]

const raiz = join(import.meta.dirname, '../../../packages/modelos')
const metadatos = JSON.parse(readFileSync(join(raiz, 'sustituto.json'), 'utf8')) as MetadatosDelSustituto
ort.env.wasm.numThreads = 1
const sesion = await ort.InferenceSession.create(readFileSync(join(raiz, metadatos.archivo)))
const predecir: PredecirSustituto = async (filas) => {
  const entrada = new ort.Tensor('float32', Float32Array.from(filas.flat()), [filas.length, metadatos.rasgos.length])
  const salida = await sesion.run({ [sesion.inputNames[0]!]: entrada })
  const datos = salida[sesion.outputNames[0]!]!.data as Float32Array
  const n = metadatos.salidas.length
  return filas.map((_, i) => Array.from(datos.subarray(i * n, (i + 1) * n)))
}

const redes = Number(process.argv[2] ?? 60)
const azar = generadorConSemilla(424242)
const tiempos: number[] = []
const del = { recalculadas: 0, pasan: 0, mejoran: 0, conAlternativas: 0, redes: 0, posibles: 0 }
const alAzar = { recalculadas: 0, pasan: 0, mejoran: 0 }
let mejorCosto = 0
let mejorCostoAlAzar = 0
while (del.redes < redes) {
  const diseno = escenario(azar)
  if (!diseno) continue
  del.redes++
  const inicio = performance.now()
  const { alternativas, estadisticas, partida } = await proponerAlternativas({ diseno, metadatos, predecir })
  tiempos.push(performance.now() - inicio)
  del.posibles += estadisticas.posibles
  del.recalculadas += estadisticas.recalculadas
  del.pasan += estadisticas.pasaronLaVerificacion
  del.mejoran += estadisticas.mejoranEnAlgo
  if (alternativas.length > 0) del.conAlternativas++
  mejorCosto += Math.min(0, ...alternativas.map((a) => a.diferencia.costoPct))

  const analisis = analisisDeLaRed(diseno)
  const valor = valorDelDiseno(diseno, analisis)
  const posibles = modificacionesPosibles(diseno.red)
  let costo = 0
  for (let i = 0; i < Math.min(estadisticas.recalculadas, posibles.length); i++) {
    const k = azar.entero(i, posibles.length - 1)
    ;[posibles[i], posibles[k]] = [posibles[k]!, posibles[i]!]
    const m = medirModificacion(diseno, valor, posibles[i]!)
    alAzar.recalculadas++
    if (m.valor.funciona) {
      alAzar.pasan++
      if (mejoraEnAlgo(m.diferencia)) alAzar.mejoran++
      costo = Math.min(costo, m.diferencia.costoPct)
    }
  }
  mejorCostoAlAzar += costo
  void partida
}
tiempos.sort((a, b) => a - b)
const pct = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100)
console.log(
  JSON.stringify(
    {
      version: metadatos.version,
      redes: del.redes,
      modificacionesPosiblesPorRed: del.posibles / del.redes,
      recalculadasPorRed: del.recalculadas / del.redes,
      redesConAlternativasPct: pct(del.conAlternativas, del.redes),
      modelo: {
        pasanLaVerificacionPct: pct(del.pasan, del.recalculadas),
        funcionanYMejoranPct: pct(del.mejoran, del.recalculadas),
        ahorroMedioDeLaMejorPct: -mejorCosto / del.redes,
      },
      alAzarConElMismoEsfuerzo: {
        pasanLaVerificacionPct: pct(alAzar.pasan, alAzar.recalculadas),
        funcionanYMejoranPct: pct(alAzar.mejoran, alAzar.recalculadas),
        ahorroMedioDeLaMejorPct: -mejorCostoAlAzar / del.redes,
      },
      tiempoMsMediano: tiempos[Math.floor(tiempos.length / 2)],
      tiempoMsMaximo: tiempos.at(-1),
    },
    null,
    2,
  ),
)
