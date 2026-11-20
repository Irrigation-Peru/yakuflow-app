import { describe, expect, it } from 'vitest'
import { corteDelGoteo, escurrimientoDeAspersion } from '../src/agronomia/bulbo'
import { CATALOGO_FAO56 } from '../src/agronomia/catalogo-fao56'
import { disenoAgronomico } from '../src/agronomia/diseno-agronomico'
import { emisorDelCatalogo } from '../src/agronomia/emisores'
import { areaMojadaPct, disenoDelRiego } from '../src/agronomia/riego'
import { aguaUtilTotal, fraccionDeAgotamientoAjustada } from '../src/agronomia/suelo'

// HU0015 y HU0016: el diseño agronómico del método elegido, armado igual en el navegador y en el servidor. Del suelo
// y del cultivo sale el agua fácilmente aprovechable; de ella, la lámina, la frecuencia y el tiempo; del tiempo, el
// corte del suelo bajo el emisor.

const papa = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!
const franco = { clase: 'franco' as const, capacidadDeCampo: 0.25, puntoDeMarchitez: 0.12, infiltracionBasicaMmH: 15 }
const base = {
  cultivo: papa,
  demanda: { demandaNetaPicoMmDia: 4, etcPicoMmDia: 4.5 },
  suelo: franco,
  areaHa: 1,
  horasDeRiegoPorDia: 12,
  fuente: { caudalLps: 2 },
}
const goteo = { ...base, metodo: 'goteo' as const, emisor: emisorDelCatalogo('gotero-2'), separacionM: 0.3, separacionLateralesM: 0.9 }

describe('diseño del riego', () => {
  it('el agua fácilmente aprovechable sale del suelo y de la raíz más profunda del cultivo, con p ajustada a la ETc', () => {
    const d = disenoDelRiego(goteo)
    const p = fraccionDeAgotamientoAjustada(papa.fraccionAgotamiento, 4.5)
    const afa = p * aguaUtilTotal({ capacidadDeCampo: 0.25, puntoDeMarchitez: 0.12, profundidadRadicularM: papa.profundidadRadicularM.maxima })
    expect(d.fraccionAgotamiento).toBe(p)
    expect(d.aguaFacilmenteAprovechableMm).toBeCloseTo(afa, 12)
    const esperado = disenoAgronomico({
      metodo: 'goteo',
      demandaNetaPicoMmDia: 4,
      aguaFacilmenteAprovechableMm: afa,
      emisor: { caudalLph: 2, separacionM: 0.3, separacionLateralesM: 0.9 },
      areaHa: 1,
      horasDeRiegoPorDia: 12,
      fuente: { caudalLps: 2 },
      infiltracionBasicaMmH: 15,
    })
    // En goteo el intervalo máximo es el del agua fácil del suelo que moja el gotero, no el del suelo entero.
    expect(d).toMatchObject({ ...esperado, aguaFacilmenteAprovechableMm: expect.any(Number), intervaloMaximoDias: expect.any(Number) })
    expect(d.aguaFacilDelAreaMojadaMm).toBeCloseTo((afa * d.areaMojadaPct) / 100, 12)
    expect(d.intervaloMaximoDias).toBe(Math.min(esperado.intervaloMaximoDias, Math.max(1, Math.floor((d.aguaFacilDelAreaMojadaMm / 4) * (1 + 1e-12)))))
    expect(d.problemas).toEqual([])
  })

  it('el corte del goteo es el de los goteros del lateral en el tiempo de riego; otro tiempo cambia el corte, no el diseño', () => {
    const d = disenoDelRiego(goteo)
    const suelo = { capacidadDeCampo: 0.25, puntoDeMarchitez: 0.12, gruesa: 'media' as const }
    expect(d.corte).toEqual({
      tipo: 'bulbo',
      tiempoH: d.tiempoDeRiegoH,
      ...corteDelGoteo({
        caudalLph: 2,
        tiempoH: d.tiempoDeRiegoH,
        separacionM: 0.3,
        separacionLateralesM: 0.9,
        suelo,
        fraccionAgotamiento: d.fraccionAgotamiento,
      }),
    })
    const otro = disenoDelRiego({ ...goteo, tiempoDelCorteH: 2 * d.tiempoDeRiegoH })
    expect(otro.tiempoDeRiegoH).toBe(d.tiempoDeRiegoH)
    expect(otro.corte.tiempoH).toBe(2 * d.tiempoDeRiegoH)
    expect(otro.corte.tipo === 'bulbo' && d.corte.tipo === 'bulbo' && otro.corte.profundidadM > d.corte.profundidadM).toBe(true)
    expect(d.profundidadRadicularM).toBe(papa.profundidadRadicularM.maxima)
  })

  it('el aspersor que aplica más de lo que el suelo infiltra escurre', () => {
    const arcilla = { clase: 'arcilla' as const, capacidadDeCampo: 0.36, puntoDeMarchitez: 0.22, infiltracionBasicaMmH: 3 }
    const d = disenoDelRiego({ ...base, suelo: arcilla, metodo: 'aspersion', emisor: emisorDelCatalogo('aspersor-3.2'), separacionM: 12, separacionLateralesM: 12 })
    expect(d.intensidadMmH).toBeCloseTo(800 / 144, 12)
    expect(d.problemas).toContain('escurre')
    const suelo = { capacidadDeCampo: 0.36, puntoDeMarchitez: 0.22, gruesa: 'pesada' as const }
    expect(d.corte).toEqual({
      tipo: 'escurrimiento',
      tiempoH: d.tiempoDeRiegoH,
      intensidadMmH: d.intensidadMmH,
      infiltracionBasicaMmH: 3,
      ...escurrimientoDeAspersion({
        intensidadMmH: d.intensidadMmH,
        infiltracionBasicaMmH: 3,
        laminaAplicadaMm: d.intensidadMmH * d.tiempoDeRiegoH,
        suelo,
        fraccionAgotamiento: d.fraccionAgotamiento,
      }),
    })
    expect(d.areaMojadaPct).toBe(100)
  })

  it('dice si el intervalo deja al cultivo sin agua o si un riego no cabe en las horas del día', () => {
    const d = disenoDelRiego(goteo)
    const largo = disenoDelRiego({ ...goteo, intervaloDias: Math.floor(d.aguaFacilmenteAprovechableMm / d.demandaDeDisenoMmDia) + 1 })
    expect(largo.problemas).toContain('intervalo_con_estres')
    const lento = disenoDelRiego({ ...goteo, emisor: emisorDelCatalogo('cinta-1'), separacionM: 2, separacionLateralesM: 3, horasDeRiegoPorDia: 1 })
    expect(lento.turnos).toBe(0)
    // Cada riego dura más que la hora de agua del día: ni un turno cabe.
    expect(lento.problemas).toContain('riego_excede_el_dia')
  })

  it('dice si la fuente no alcanza a regar todos los turnos en el intervalo', () => {
    const d = disenoDelRiego({ ...goteo, intervaloDias: 1, fuente: { caudalLps: 0.05 } })
    expect(d.turnosNecesarios).toBeGreaterThan(d.turnosMaximos)
    expect(d.turnos).toBe(0)
    expect(d.problemas).toContain('turnos_no_caben')
    expect(d.problemas).not.toContain('riego_no_cabe')
  })

  it('no admite un emisor de otro método', () => {
    expect(() => disenoDelRiego({ ...goteo, emisor: emisorDelCatalogo('aspersor-3.2') })).toThrow(/aspersión/)
  })
})

describe('área mojada', () => {
  it('cuando los bulbos de un lateral se tocan, moja una franja de ancho 2r', () => {
    expect(areaMojadaPct({ radioM: 0.2, separacionM: 0.3, separacionLateralesM: 0.9 })).toBeCloseTo((100 * 0.3 * 0.4) / 0.27, 12)
  })

  it('si no se tocan, cada gotero moja su círculo', () => {
    expect(areaMojadaPct({ radioM: 0.1, separacionM: 0.5, separacionLateralesM: 1 })).toBeCloseTo((100 * Math.PI * 0.01) / 0.5, 12)
  })

  it('nunca pasa del 100 %', () => {
    expect(areaMojadaPct({ radioM: 1, separacionM: 0.3, separacionLateralesM: 0.9 })).toBe(100)
  })
})
