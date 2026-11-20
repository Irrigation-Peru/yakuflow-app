import { closeSync, openSync, writeSync } from 'node:fs'
import {
  analisisDeLaRed,
  descripcionDelDiseno,
  generadorConSemilla,
  medirModificacion,
  modificacionesPosibles,
  rasgosDeLaModificacion,
  RASGOS_DE_LA_MODIFICACION,
  valorDelDiseno,
} from '@riego/calculo'
import { escenario } from './escenarios.ts'

// El conjunto de entrenamiento del modelo sustituto (HU0025): no existe un registro público de diseños de riego con su
// calidad, así que lo genera el propio módulo de cálculo. Cada fila es una red, una modificación y lo que el módulo midió.
//
//   pnpm --filter @riego/redes generar <salida.csv> [redes] [modificacionesPorRed]

const [salida, redes = '600', porRed = '16'] = process.argv.slice(2)
if (!salida) throw new Error('Falta el archivo de salida')

export const SEMILLA_DE_ENTRENAMIENTO = 20261107
const azar = generadorConSemilla(SEMILLA_DE_ENTRENAMIENTO)
// Se escribe fila por fila y sin búfer: el bucle no suelta el hilo, y un flujo guardaría todo en memoria hasta el final.
const archivo = openSync(salida, 'w')
writeSync(archivo, `red,${RASGOS_DE_LA_MODIFICACION.join(',')},costoPct,uniformidad,margenM,funciona\n`)

let generadas = 0
let filas = 0
let rechazadas = 0
const inicio = Date.now()
while (generadas < Number(redes)) {
  const diseno = escenario(azar)
  if (!diseno) {
    rechazadas++
    continue
  }
  const analisis = analisisDeLaRed(diseno)
  const partida = valorDelDiseno(diseno, analisis)
  const descripcion = descripcionDelDiseno(diseno, analisis, partida)
  const posibles = modificacionesPosibles(diseno.red)
  // Sin repetir dentro de la misma red.
  for (let i = 0; i < Math.min(Number(porRed), posibles.length); i++) {
    const elegida = azar.entero(i, posibles.length - 1)
    ;[posibles[i], posibles[elegida]] = [posibles[elegida]!, posibles[i]!]
    const modificacion = posibles[i]!
    const { diferencia, valor } = medirModificacion(diseno, partida, modificacion)
    const rasgos = rasgosDeLaModificacion(descripcion, modificacion).map((v) => Number(v.toFixed(4)))
    writeSync(archivo, `${generadas},${rasgos.join(',')},${diferencia.costoPct.toFixed(4)},${diferencia.uniformidad.toFixed(4)},${diferencia.margenM.toFixed(4)},${valor.funciona ? 1 : 0}\n`)
    filas++
  }
  generadas++
}
closeSync(archivo)
console.log(`${generadas} redes, ${filas} filas, ${rechazadas} escenarios descartados por no funcionar, ${((Date.now() - inicio) / 1000).toFixed(0)} s. Semilla ${SEMILLA_DE_ENTRENAMIENTO}.`)
