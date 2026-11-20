import { describe, expect, it } from 'vitest'
import { caudalDeEmisor, energiaDeEmisor, presionParaCaudal } from '../src/hidraulica/emisor'
import { calcularRed } from '../src/hidraulica/red'

describe('ecuación del emisor', () => {
  it('entrega q = k · P^x en el rango de operación', () => {
    expect(caudalDeEmisor(2, 0.5, 4)).toBeCloseTo(4, 14)
    expect(caudalDeEmisor(3.6, 0, 12)).toBe(3.6)
  })

  it('no entrega agua sin presión', () => {
    expect(caudalDeEmisor(2, 0.5, 0)).toBe(0)
    expect(caudalDeEmisor(2, 0.5, -3)).toBe(0)
  })

  it('bajo un milímetro de columna de agua baja en línea recta hasta cero', () => {
    // 2 · (0.001)^0.5 · (0.0005 / 0.001)
    expect(caudalDeEmisor(2, 0.5, 5e-4)).toBeCloseTo(0.03162277660168379, 14)
  })
})

describe('ley inversa del emisor', () => {
  it('devuelve la presión que el emisor necesita para entregar un caudal', () => {
    expect(presionParaCaudal(2, 0.5, 4)).toBeCloseTo(4, 14)
    expect(presionParaCaudal(2, 0.5, 0.03162277660168379)).toBeCloseTo(5e-4, 15)
  })

  it('un autocompensante no entrega más que su k con ninguna presión', () => {
    expect(presionParaCaudal(3.6, 0, 3.7)).toBe(Infinity)
  })

  it('su integral es la energía del emisor', () => {
    // ∫₀^4 de la ley inversa de q = 2 · P^0.5: rampa hasta 0.0632 l/h y (q/2)² después. Comprobado además
    // con la regla del trapecio en dos millones de intervalos.
    expect(energiaDeEmisor(2, 0.5, 4)).toBeCloseTo(5.333343874258867, 12)
  })
})

describe('red donde el agua apenas llega', () => {
  // Emisor autocompensante (x = 0) con 0.1 mm de carga: sin la rampa, el caudal saltaría entre 0 y k
  // y no habría un punto donde caudal y presión sean coherentes.
  const r = calcularRed({
    nodos: [
      { id: 'F', x: 0, y: 0, z: 3000 },
      { id: 'E', x: 5, y: 0, z: 3000 },
    ],
    tramos: [{ id: 't1', desde: 'F', hasta: 'E', diametroInternoMm: 16, c: 140 }],
    emisores: [{ nodo: 'E', k: 1, x: 0 }],
    fuente: { nodo: 'F', presionInicialM: 1e-4 },
  })

  it('converge', () => {
    expect(r.convergio).toBe(true)
  })

  it('el emisor entrega solo lo que deja pasar la presión que le llega', () => {
    expect(r.nodos.E!.presionM).toBeCloseTo(9.996752668419112e-5, 15)
    // El caudal se acepta dentro de lo que mueve un nanómetro de presión en la rampa: 1 l/h por mm · 1e-6 mm.
    expect(Math.abs(r.nodos.E!.caudalEmisorLph! - 0.09996752668419112)).toBeLessThan(1e-6)
  })
})
