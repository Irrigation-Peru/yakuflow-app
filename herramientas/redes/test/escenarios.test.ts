import { analisisDeLaRed, generadorConSemilla } from '@riego/calculo'
import { describe, expect, it } from 'vitest'
import { escenario, PRECIOS, preciosVariados } from '../src/escenarios'

// Las redes con que se entrena el modelo sustituto tienen que poder volver a generarse igual, y todas tienen que funcionar,
// porque el paso 7 solo se abre para diseños que ya funcionaron.

function primeros(semilla: number, cuantos: number) {
  const azar = generadorConSemilla(semilla)
  return Array.from({ length: cuantos }, () => escenario(azar))
}

describe('los escenarios de ejemplo (HU0025)', { timeout: 60_000 }, () => {
  it('con la misma semilla salen los mismos escenarios', () => {
    expect(JSON.stringify(primeros(7, 3))).toBe(JSON.stringify(primeros(7, 3)))
  })

  it('con otra semilla salen otros', () => {
    expect(JSON.stringify(primeros(7, 3))).not.toBe(JSON.stringify(primeros(8, 3)))
  })

  it('el escenario que se entrega funciona; el que no, se descarta', () => {
    for (const diseno of primeros(11, 6)) {
      if (diseno) expect(analisisDeLaRed(diseno).funciona).toBe(true)
    }
  })
})

describe('los precios variados de la sensibilidad', () => {
  it('cambian solo la familia pedida', () => {
    const tuberias = preciosVariados('tuberias', 1.2)
    expect(tuberias.tuberias[0]!.precioPorM).toBeCloseTo(PRECIOS.tuberias[0]!.precioPorM * 1.2)
    expect(tuberias.emisores).toEqual(PRECIOS.emisores)
    expect(tuberias.accesorios).toEqual(PRECIOS.accesorios)
  })

  it('los laterales de goteo varían con los emisores, porque llevan el gotero integrado', () => {
    const emisores = preciosVariados('emisores', 0.8)
    expect(emisores.lateralesDeGoteo![0]!.precioPorM).toBeCloseTo(PRECIOS.lateralesDeGoteo![0]!.precioPorM * 0.8)
    expect(emisores.emisores[0]!.precioUnidad).toBeCloseTo(PRECIOS.emisores[0]!.precioUnidad * 0.8)
    expect(emisores.tuberias).toEqual(PRECIOS.tuberias)
  })

  it('los accesorios varían juntos', () => {
    const accesorios = preciosVariados('accesorios', 0.8)
    expect(accesorios.accesorios.cabezal).toBeCloseTo(PRECIOS.accesorios.cabezal * 0.8)
    expect(accesorios.accesorios.camaraRompePresion).toBeCloseTo(PRECIOS.accesorios.camaraRompePresion * 0.8)
    expect(accesorios.tuberias).toEqual(PRECIOS.tuberias)
  })
})
