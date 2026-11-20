import { describe, expect, it } from 'vitest'
import { uniformidadDistribucion, variacionPresion } from '../src/hidraulica/uniformidad'

describe('uniformidad de distribución del cuarto inferior', () => {
  it('es el caudal medio del 25 % con menos caudal sobre el caudal medio', () => {
    // Cuarto inferior de 8 emisores: 1 y 2, media 1.5; media total 4.5.
    expect(uniformidadDistribucion([5, 1, 8, 3, 2, 7, 4, 6])).toBeCloseTo(1.5 / 4.5, 14)
  })

  it('con un número de emisores que no es múltiplo de cuatro, el cuarto se redondea hacia abajo', () => {
    // 10 emisores: el cuarto inferior son los 2 menores (1 y 2), media 1.5; media total 5.5.
    expect(uniformidadDistribucion([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(1.5 / 5.5, 14)
  })

  it('con menos de cuatro emisores, el cuarto inferior es el de menor caudal', () => {
    expect(uniformidadDistribucion([2, 4, 6])).toBeCloseTo(2 / 4, 14)
  })

  it('vale 1 cuando todos los emisores entregan lo mismo', () => {
    expect(uniformidadDistribucion([3.2, 3.2, 3.2, 3.2])).toBe(1)
  })

  it('vale 0 si ningún emisor entrega agua', () => {
    expect(uniformidadDistribucion([0, 0, 0, 0])).toBe(0)
  })

  it('no se define sin emisores', () => {
    expect(() => uniformidadDistribucion([])).toThrow(/emisores/)
  })
})

describe('variación de presión del sector', () => {
  it('es la diferencia entre la mayor y la menor presión sobre la presión nominal del emisor', () => {
    // Δp = 12 − 9.5 = 2.5 m sobre 10 m nominales: 25 %, sobre el 20 % que pide el criterio.
    expect(variacionPresion([10, 12, 9.5, 11], 10)).toBeCloseTo(0.25, 14)
  })
})
