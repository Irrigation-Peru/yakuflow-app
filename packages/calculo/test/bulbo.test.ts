import { describe, expect, it } from 'vitest'
import { bulboHumedo, corteDelGoteo, escurrimientoDeAspersion, RELACION_PROFUNDIDAD_RADIO } from '../src/agronomia/bulbo'

// HU0016: el corte del suelo muestra el bulbo húmedo bajo el gotero, o el agua que escurre si el aspersor aplica
// más rápido de lo que el suelo infiltra; cambia al cambiar el emisor o el tiempo de riego.

const franco = { capacidadDeCampo: 0.25, puntoDeMarchitez: 0.12, gruesa: 'media' as const }

describe('bulbo húmedo bajo un gotero', () => {
  it('el agua aplicada llena un semielipsoide de suelo entre la humedad al regar y la capacidad de campo', () => {
    // 2 l/h durante 2 h = 4 l. Al regar, el suelo está agotado en la fracción p = 0.35 del agua útil:
    // θi = 0.25 − 0.35 · 0.13 = 0.2045 → cada m³ de suelo guarda 0.0455 m³ más.
    const b = bulboHumedo({ caudalLph: 2, tiempoH: 2, suelo: franco, fraccionAgotamiento: 0.35 })
    const volumenDeSuelo = 0.004 / (0.25 - 0.2045)
    expect(b.volumenDeSueloM3).toBeCloseTo(volumenDeSuelo, 12)
    // Franco: profundidad igual al radio → V = 2/3 · π · r³.
    expect(RELACION_PROFUNDIDAD_RADIO.media).toBe(1)
    expect(b.radioM).toBeCloseTo(Math.cbrt((3 * volumenDeSuelo) / (2 * Math.PI)), 12)
    expect(b.profundidadM).toBeCloseTo(b.radioM, 12)
  })

  it('en arena baja más y se abre menos que en arcilla', () => {
    const datos = { caudalLph: 2, tiempoH: 3, fraccionAgotamiento: 0.4 }
    const arena = bulboHumedo({ ...datos, suelo: { capacidadDeCampo: 0.12, puntoDeMarchitez: 0.045, gruesa: 'ligera' } })
    const arcilla = bulboHumedo({ ...datos, suelo: { capacidadDeCampo: 0.36, puntoDeMarchitez: 0.22, gruesa: 'pesada' } })
    expect(arena.profundidadM / arena.radioM).toBeGreaterThan(arcilla.profundidadM / arcilla.radioM)
    expect(arena.profundidadM).toBeGreaterThan(arcilla.profundidadM)
  })

  it('más tiempo de riego, bulbo más grande', () => {
    const corto = bulboHumedo({ caudalLph: 2, tiempoH: 1, suelo: franco, fraccionAgotamiento: 0.35 })
    const largo = bulboHumedo({ caudalLph: 2, tiempoH: 4, suelo: franco, fraccionAgotamiento: 0.35 })
    expect(largo.radioM).toBeGreaterThan(corto.radioM)
    expect(largo.profundidadM).toBeGreaterThan(corto.profundidadM)
  })
})

describe('corte bajo los goteros de un lateral', () => {
  // Franco: cada m³ de suelo gana 0.35 · 0.13 = 0.0455 m³ de agua; profundidad igual al radio.
  const gana = 0.35 * (0.25 - 0.12)

  it('si los bulbos no se tocan, cada gotero moja su propio bulbo', () => {
    const datos = { caudalLph: 2, tiempoH: 2, suelo: franco, fraccionAgotamiento: 0.35 }
    const c = corteDelGoteo({ ...datos, separacionM: 2, separacionLateralesM: 3 })
    const b = bulboHumedo(datos)
    expect(c).toEqual({ forma: 'bulbos', aguaM3: b.aguaM3, radioM: b.radioM, profundidadM: b.profundidadM })
  })

  it('si los bulbos de un lateral se juntan, el agua de los vecinos baja y el lateral moja una franja', () => {
    // 8 l cada 0.30 m son 0.02667 m³ por metro de lateral; la sección de la franja es media elipse, π/2 · r · z.
    const c = corteDelGoteo({ caudalLph: 2, tiempoH: 4, suelo: franco, fraccionAgotamiento: 0.35, separacionM: 0.3, separacionLateralesM: 3 })
    const seccion = 0.008 / 0.3 / gana
    expect(c.forma).toBe('franja')
    expect(c.radioM).toBeCloseTo(Math.sqrt((2 * seccion) / Math.PI), 12)
    expect(c.profundidadM).toBeCloseTo(c.radioM, 12)
    // Más hondo que el bulbo de un gotero solo.
    expect(c.profundidadM).toBeGreaterThan(bulboHumedo({ caudalLph: 2, tiempoH: 4, suelo: franco, fraccionAgotamiento: 0.35 }).profundidadM)
  })

  it('si las franjas de dos laterales también se juntan, se moja una capa pareja que baja con la lámina', () => {
    // 15 l sobre los 0.27 m² de cada gotero son 55.6 mm: bajan 0.0556 / 0.0455 = 1.22 m.
    const c = corteDelGoteo({ caudalLph: 2, tiempoH: 7.5, suelo: franco, fraccionAgotamiento: 0.35, separacionM: 0.3, separacionLateralesM: 0.9 })
    expect(c.forma).toBe('capa')
    expect(c.profundidadM).toBeCloseTo(0.015 / 0.27 / gana, 12)
    expect(2 * c.radioM).toBeGreaterThanOrEqual(0.9)
  })

  it('con más tiempo el agua nunca baja menos ni se abre menos, también al pasar de bulbos a franja y a capa', () => {
    let anterior = { radioM: 0, profundidadM: 0 }
    const formas = new Set<string>()
    for (let tiempoH = 0.1; tiempoH <= 24; tiempoH += 0.1) {
      const c = corteDelGoteo({ caudalLph: 2, tiempoH, suelo: franco, fraccionAgotamiento: 0.35, separacionM: 0.3, separacionLateralesM: 0.9 })
      expect(c.profundidadM).toBeGreaterThanOrEqual(anterior.profundidadM)
      expect(c.radioM).toBeGreaterThanOrEqual(anterior.radioM)
      formas.add(c.forma)
      anterior = c
    }
    expect([...formas]).toEqual(['bulbos', 'franja', 'capa'])
  })
})

describe('escurrimiento bajo un aspersor', () => {
  it('si aplica más rápido de lo que el suelo infiltra, escurre la diferencia', () => {
    // 18 mm/h sobre un suelo que infiltra 10.5: escurre 1 − 10.5/18 = 41.7 %.
    const e = escurrimientoDeAspersion({ intensidadMmH: 18, infiltracionBasicaMmH: 10.5, laminaAplicadaMm: 36, suelo: franco, fraccionAgotamiento: 0.35 })
    expect(e.fraccionEscurrida).toBeCloseTo(1 - 10.5 / 18, 12)
    expect(e.laminaInfiltradaMm).toBeCloseTo(36 * (10.5 / 18), 12)
  })

  it('si infiltra todo, no escurre y el frente húmedo baja según la lámina', () => {
    const e = escurrimientoDeAspersion({ intensidadMmH: 8, infiltracionBasicaMmH: 15, laminaAplicadaMm: 20, suelo: franco, fraccionAgotamiento: 0.35 })
    expect(e.fraccionEscurrida).toBe(0)
    // 20 mm sobre un suelo que guarda 0.0455 m³/m³: 0.020 / 0.0455 m.
    expect(e.profundidadDelFrenteM).toBeCloseTo(0.02 / 0.0455, 12)
  })
})
