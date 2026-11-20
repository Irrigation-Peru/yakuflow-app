import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CLASES_TEXTURALES, PROPIEDADES_POR_CLASE, claseTextural, sueloDeLaTextura } from '../src/agronomia/textura'

// HU0009: el suelo del lugar llega con su textura y el estudiante la reemplaza por la de su muestra de campo. De
// la textura salen la clase del triángulo del USDA, la humedad a capacidad de campo y en el punto de marchitez
// (FAO 56, tabla 19) y la infiltración básica (FAO, Manual de capacitación N.º 5, anexo 2, tabla 7).

describe('clase textural del triángulo del USDA', () => {
  it('nombra las doce clases con un punto de cada una', () => {
    const puntos: [number, number, number, string][] = [
      [92, 5, 3, 'arena'],
      [82, 12, 6, 'arena franca'],
      [65, 25, 10, 'franco arenoso'],
      [40, 40, 20, 'franco'],
      [20, 65, 15, 'franco limoso'],
      [5, 88, 7, 'limo'],
      [60, 12, 28, 'franco arcillo arenoso'],
      [32, 34, 34, 'franco arcilloso'],
      [10, 56, 34, 'franco arcillo limoso'],
      [52, 6, 42, 'arcilla arenosa'],
      [6, 47, 47, 'arcilla limosa'],
      [20, 20, 60, 'arcilla'],
    ]
    for (const [arenaPct, limoPct, arcillaPct, clase] of puntos) {
      expect(claseTextural({ arenaPct, limoPct, arcillaPct }), `${arenaPct}/${limoPct}/${arcillaPct}`).toBe(clase)
    }
    expect(new Set(puntos.map((p) => p[3]))).toEqual(new Set(CLASES_TEXTURALES))
  })

  it('la muestra satelital de la parcela de Rancas es franco', () => {
    expect(claseTextural({ arenaPct: 46.7, limoPct: 33.7, arcillaPct: 19.5 })).toBe('franco')
  })

  it('en los bordes entre clases decide según las reglas del USDA', () => {
    // 52 % de arena con 20 % de arcilla aún es franco; con 53 % ya es franco arenoso.
    expect(claseTextural({ arenaPct: 52, limoPct: 28, arcillaPct: 20 })).toBe('franco')
    expect(claseTextural({ arenaPct: 53, limoPct: 27, arcillaPct: 20 })).toBe('franco arcillo arenoso')
    expect(claseTextural({ arenaPct: 53, limoPct: 28, arcillaPct: 19 })).toBe('franco arenoso')
    // 27 % de arcilla deja de ser franco y pasa a franco arcilloso.
    expect(claseTextural({ arenaPct: 35, limoPct: 38, arcillaPct: 27 })).toBe('franco arcilloso')
    expect(claseTextural({ arenaPct: 35, limoPct: 40, arcillaPct: 40 - 15 })).toBe('franco')
  })

  it('toda composición que suma 100 cae en exactamente una clase', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (a, b) => {
        const arenaPct = Math.min(a, b) / 10
        const arcillaPct = (1000 - Math.max(a, b)) / 10
        const limoPct = 100 - arenaPct - arcillaPct
        expect(CLASES_TEXTURALES).toContain(claseTextural({ arenaPct, limoPct, arcillaPct }))
      }),
    )
  })

  it('rechaza una composición que no suma 100', () => {
    expect(() => claseTextural({ arenaPct: 50, limoPct: 30, arcillaPct: 30 })).toThrow(/100/)
    expect(() => claseTextural({ arenaPct: -5, limoPct: 75, arcillaPct: 30 })).toThrow(/negativ/)
  })
})

describe('el suelo que sale de la textura', () => {
  it('franco: punto medio de los rangos del FAO 56 y la infiltración del manual de la FAO', () => {
    const suelo = sueloDeLaTextura({ arenaPct: 40, arcillaPct: 20 })
    expect(suelo.clase).toBe('franco')
    expect(suelo.limoPct).toBe(40)
    expect(suelo.capacidadDeCampo).toBeCloseTo(0.25, 12)
    expect(suelo.puntoDeMarchitez).toBeCloseTo(0.12, 12)
    expect(suelo.infiltracionBasicaMmH).toBe(15)
    expect(suelo.fuente).toMatch(/FAO 56, tabla 19/)
  })

  it('arena: la infiltración es la del extremo del rango, más de 30 mm/h', () => {
    const suelo = sueloDeLaTextura({ arenaPct: 90, arcillaPct: 4 })
    expect(suelo.clase).toBe('arena')
    expect(suelo.infiltracionBasicaMmH).toBe(30)
  })

  it('las clases que no están en la tabla 19 declaran de dónde sale su humedad', () => {
    const suelo = sueloDeLaTextura({ arenaPct: 30, arcillaPct: 35 })
    expect(suelo.clase).toBe('franco arcilloso')
    expect(suelo.fuente).toMatch(/Saxton y Rawls/)
  })

  it('en cada clase la capacidad de campo supera al punto de marchitez, y la infiltración baja con la arcilla', () => {
    const muestras = CLASES_TEXTURALES.map((clase) => ({ clase, ...PROPIEDADES_POR_CLASE[clase] }))
    for (const s of muestras) expect(s.capacidadDeCampo).toBeGreaterThan(s.puntoDeMarchitez)
    const infiltracion = (clase: string) => muestras.find((s) => s.clase === clase)!.infiltracionBasicaMmH
    expect(infiltracion('arena')).toBeGreaterThan(infiltracion('franco arenoso'))
    expect(infiltracion('franco arenoso')).toBeGreaterThan(infiltracion('franco'))
    expect(infiltracion('franco')).toBeGreaterThan(infiltracion('franco arcilloso'))
    expect(infiltracion('franco arcilloso')).toBeGreaterThan(infiltracion('arcilla'))
  })

  it('rechaza más de 100 % entre arena y arcilla', () => {
    expect(() => sueloDeLaTextura({ arenaPct: 70, arcillaPct: 40 })).toThrow(/100/)
  })
})

describe('la aritmética de coma flotante', () => {
  it('100 − 99.2 − 0.8 cuenta como cero de limo, no como un limo negativo', () => {
    expect(claseTextural({ arenaPct: 99.2, limoPct: 100 - 99.2 - 0.8, arcillaPct: 0.8 })).toBe('arena')
    expect(sueloDeLaTextura({ arenaPct: 99.2, arcillaPct: 0.8 }).limoPct).toBe(0)
  })
})
