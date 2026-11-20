import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analisisDeLaRed,
  generadorConSemilla,
  medirModificacion,
  mejoraEnAlgo,
  modificacionesPosibles,
  valorDelDiseno,
  type Modificacion,
} from '@riego/calculo'
import { proponerAlternativas, type MetadatosDelSustituto, type PredecirSustituto } from '@riego/modelos'
import * as ort from 'onnxruntime-web'
import { escenario, FAMILIAS_DE_PRECIOS, preciosVariados, type FamiliaDePrecios } from './escenarios.ts'

// Contraste del modelo sustituto desplegado contra dos líneas base que no aprenden, red por red, para la estadística
// pareada del artículo y de la memoria (RQ2). Mismas redes no vistas que `evaluar.ts` (semilla 424242), mismo ONNX y
// mismo código de la aplicación. Cada estrategia recalcula con el módulo exactamente tantas modificaciones como el
// modelo en esa red, así que el presupuesto es idéntico.
//
// - modelo: `proponerAlternativas`, las seis mejores estimadas por criterio;
// - al azar: el mismo número de modificaciones posibles, elegidas al azar;
// - regla experta: la que aplicaría un proyectista sin modelo, también seis por criterio: para el costo, adelgazar o
//   bajar la clase; para la uniformidad, engrosar los laterales, las válvulas o el portalateral; para el margen, subir
//   la clase. Dentro de cada criterio, primero los cambios de un paso, y entre ellos los grupos de mayor longitud.
//
// Imprime una línea JSON por red; el análisis estadístico se hace aparte.
//
// Sensibilidad a los precios: con un segundo argumento `familia=factor` (familia: tuberias, emisores o accesorios), las
// mismas redes se valoran con los precios de esa familia multiplicados por el factor, con el mismo modelo y sin
// reentrenarlo. El artículo usa 0.8 y 1.2 para cada familia.
//
//   pnpm --filter @riego/redes exec tsx src/contrastar.ts [redes] [familia=factor]

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

const POR_CRITERIO = 6
const ORDEN_DE_GRUPOS = ['laterales', 'portalateral', 'valvulas', 'conduccion']
const pasos = (m: Modificacion) => m.reduce((s, a) => s + Math.abs(a.pasosDeDiametro) + Math.abs(a.pasosDeClase), 0)
const grupo = (m: Modificacion) => Math.min(...m.map((a) => ORDEN_DE_GRUPOS.indexOf(a.grupo)))
const porSencillez = (a: Modificacion, b: Modificacion) => pasos(a) - pasos(b) || grupo(a) - grupo(b)

function reglaExperta(posibles: readonly Modificacion[]): Modificacion[] {
  const costo = posibles.filter((m) => m.every((a) => a.pasosDeDiametro < 0 || a.pasosDeClase < 0)).sort(porSencillez)
  const uniformidad = posibles
    .filter((m) => m.every((a) => a.pasosDeDiametro > 0 && a.grupo !== 'conduccion'))
    .sort(porSencillez)
  const margen = posibles.filter((m) => m.every((a) => a.pasosDeClase > 0)).sort(porSencillez)
  const vistas = new Set<string>()
  const elegidas: Modificacion[] = []
  for (const lista of [costo, uniformidad, margen]) {
    for (const m of lista.slice(0, POR_CRITERIO)) {
      const clave = JSON.stringify(m)
      if (!vistas.has(clave)) {
        vistas.add(clave)
        elegidas.push(m)
      }
    }
  }
  return elegidas
}

const redes = Number(process.argv[2] ?? 60)
const variacion = process.argv[3]?.split('=')
if (variacion && (!FAMILIAS_DE_PRECIOS.includes(variacion[0] as FamiliaDePrecios) || !(Number(variacion[1]) > 0))) {
  throw new Error(`Variación de precios no válida: «${process.argv[3]}». Se espera familia=factor, con familia en ${FAMILIAS_DE_PRECIOS.join(', ')}.`)
}
const precios = variacion ? preciosVariados(variacion[0] as FamiliaDePrecios, Number(variacion[1])) : undefined
const azar = generadorConSemilla(424242)
const azarDeLaLinea = generadorConSemilla(20261110)
let hechas = 0
while (hechas < redes) {
  const generado = escenario(azar)
  if (!generado) continue
  const diseno = precios ? { ...generado, precios } : generado
  hechas++
  const { alternativas, estadisticas } = await proponerAlternativas({ diseno, metadatos, predecir })
  const presupuesto = estadisticas.recalculadas
  const analisis = analisisDeLaRed(diseno)
  const valor = valorDelDiseno(diseno, analisis)
  const posibles = modificacionesPosibles(diseno.red)

  const medir = (lista: readonly Modificacion[]) => {
    let pasan = 0
    let mejoran = 0
    let mejorCosto = 0
    for (const m of lista) {
      const medida = medirModificacion(diseno, valor, m)
      if (!medida.valor.funciona) continue
      pasan++
      if (mejoraEnAlgo(medida.diferencia)) {
        mejoran++
        mejorCosto = Math.min(mejorCosto, medida.diferencia.costoPct)
      }
    }
    return { evaluadas: lista.length, pasan, mejoran, mejorAhorroPct: -mejorCosto }
  }

  // Al azar: el mismo número de modificaciones, sin reemplazo.
  const barajadas = [...posibles]
  for (let i = 0; i < Math.min(presupuesto, barajadas.length); i++) {
    const k = azarDeLaLinea.entero(i, barajadas.length - 1)
    ;[barajadas[i], barajadas[k]] = [barajadas[k]!, barajadas[i]!]
  }
  const alAzar = barajadas.slice(0, presupuesto)

  // Regla experta: sus candidatas, completadas al azar o recortadas hasta el mismo presupuesto.
  const deLaRegla = reglaExperta(posibles)
  const claves = new Set(deLaRegla.map((m) => JSON.stringify(m)))
  for (const m of barajadas) {
    if (deLaRegla.length >= presupuesto) break
    if (!claves.has(JSON.stringify(m))) deLaRegla.push(m)
  }

  const mejorDelModelo = Math.min(0, ...alternativas.map((a) => a.diferencia.costoPct))
  console.log(
    JSON.stringify({
      red: hechas,
      posibles: posibles.length,
      presupuesto,
      modelo: {
        evaluadas: presupuesto,
        pasan: estadisticas.pasaronLaVerificacion,
        mejoran: estadisticas.mejoranEnAlgo,
        mejorAhorroPct: -mejorDelModelo,
        alternativas: alternativas.length,
      },
      alAzar: medir(alAzar),
      reglaExperta: medir(deLaRegla.slice(0, presupuesto)),
    }),
  )
}
