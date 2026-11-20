import { describe, expect, it } from 'vitest'
import { diametroPreliminar, perdidaLocal, tramoDelMetodo } from '../src/hidraulica/metodo'

// HU0003: reproducir el método de diseño normalizado tramo por tramo. Criterio 1, la longitud de cada tramo es la
// inclinada, no la horizontal.

// Error relativo, para comparar contra los valores guardados en las celdas de la hoja.
const errorRelativo = (obtenido: number, esperado: number) => Math.abs(obtenido - esperado) / Math.abs(esperado)

describe('tramo del método de diseño normalizado', () => {
  // Caso guardado del método de referencia: tramo RESERVORIO → CRP-1.
  const reservorioACrp1 = tramoDelMetodo({
    caudalLps: 2,
    c: 140,
    diametroPulg: 2,
    cotaInicio: 3000,
    cotaFin: 2990,
    progresivaInicioM: 0,
    progresivaFinM: 20,
    presionAnteriorM: 2.5,
  })

  it('reproduce la velocidad media de la hoja', () => {
    expect(errorRelativo(reservorioACrp1.velocidadMs, 0.9867603132201427)).toBeLessThan(1e-12)
  })

  it('reproduce la pérdida de carga de la hoja, con la longitud inclinada', () => {
    expect(errorRelativo(reservorioACrp1.perdidaCargaM, 0.5068456652968484)).toBeLessThan(1e-12)
  })

  it('reproduce la presión residual de la hoja', () => {
    expect(errorRelativo(reservorioACrp1.presionResidualM, 11.993154334703151)).toBeLessThan(1e-12)
  })

  it('reproduce la cota piezométrica final de la hoja', () => {
    expect(errorRelativo(reservorioACrp1.cotaPiezometricaFinal, 3001.9931543347034)).toBeLessThan(1e-12)
  })

  it('usa la longitud inclinada y no la horizontal', () => {
    // √(10² + 20²) = 22.360679... m; la horizontal sería 20 m.
    expect(reservorioACrp1.longitudInclinadaM).toBeCloseTo(22.360679774997898, 12)
  })
})

describe('diámetro preliminar', () => {
  it('sale de la pérdida disponible (H + Pr anterior) / L', () => {
    // S = 12.5 m / 0.0223607 km = 559.017 m/km → D = (2 / (0.0004264 · 140 · S^0.54))^(1/2.63)
    const d = diametroPreliminar({ caudalLps: 2, c: 140, desnivelM: 10, presionAnteriorM: 2.5, longitudKm: 0.022360679774997897 })
    expect(errorRelativo(d, 1.0369792354223422)).toBeLessThan(1e-12)
  })
})

describe('pérdida local', () => {
  it('es v²/2g por la suma de los coeficientes Kr', () => {
    // Entrada (0.5) y codo de 45° (0.2) con v = 0.98676 m/s y g = 9.81
    expect(perdidaLocal(0.9867603132201427, [0.5, 0.2])).toBeCloseTo(0.034739405760571856, 14)
  })

  it('sin accesorios no hay pérdida local', () => {
    expect(perdidaLocal(1.2, [])).toBe(0)
  })
})
