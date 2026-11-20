import { describe, expect, it } from 'vitest'
import { calcularRed } from '../src/hidraulica/red'
import type { Red } from '../src/hidraulica/tipos'

// El módulo compila sin los tipos del navegador ni los de Node; el reloj existe en los dos.
declare const performance: { now(): number }

// HU0001, criterio 3: una red completa se recalcula en menos de 200 ms (eficiencia de desempeño, ISO/IEC 25010).
// Red tipo peine en ladera: una matriz con 40 laterales de 50 goteros cada uno, 2000 emisores en total.
function peine(laterales: number, goterosPorLateral: number): Red {
  const red: Red & { nodos: Red['nodos'][number][]; tramos: Red['tramos'][number][]; emisores: Red['emisores'][number][] } = {
    nodos: [{ id: 'F', x: 0, y: 0, z: 3030 }],
    tramos: [],
    emisores: [],
    fuente: { nodo: 'F', presionInicialM: 0.5 },
  }
  let anterior = 'F'
  for (let l = 0; l < laterales; l++) {
    const matriz = `M${l}`
    red.nodos.push({ id: matriz, x: 1, y: l * 1.0, z: 3000 - l * 0.05 })
    red.tramos.push({ id: `tm${l}`, desde: anterior, hasta: matriz, diametroInternoMm: 63.5, c: 140 })
    anterior = matriz
    let previo = matriz
    for (let g = 0; g < goterosPorLateral; g++) {
      const id = `G${l}-${g}`
      red.nodos.push({ id, x: 1 + (g + 1) * 0.3, y: l * 1.0, z: 3000 - l * 0.05 - g * 0.01 })
      red.tramos.push({ id: `t${l}-${g}`, desde: previo, hasta: id, diametroInternoMm: 13.6, c: 150 })
      red.emisores.push({ nodo: id, k: 0.7, x: 0.5, sector: `S${l % 4}` })
      previo = id
    }
  }
  return red
}

describe('tiempo de respuesta del módulo de cálculo', () => {
  const red = peine(40, 50)

  it('recalcula una red de 2000 emisores en menos de 200 ms', () => {
    calcularRed(red) // calentamiento del compilador
    const tiempos: number[] = []
    for (let i = 0; i < 5; i++) {
      const inicio = performance.now()
      const r = calcularRed(red)
      tiempos.push(performance.now() - inicio)
      expect(r.convergio).toBe(true)
    }
    const mediana = tiempos.sort((a, b) => a - b)[2]!
    expect(mediana).toBeLessThan(200)
  })
})
