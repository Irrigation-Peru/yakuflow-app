import { describe, expect, it } from 'vitest'
import { analisisDeLaRed, emisorDelCatalogo, emisorRecomendado, generarRedDelProyecto, type MetodoDeRiego } from '../src/index'
import { PARCELAS_REALES } from './datos/parcelas-reales'

// La red que el paso 5 genera sobre el relieve real (test/datos/parcelas-reales.ts), no sobre un plano. En terreno
// real los laterales no van del todo a nivel y en ladera hay que regar por pisos. Antes, en estas mismas parcelas, la
// red salía con laterales sin presión debajo de cada cámara: 23 alertas en la ladera de Pasco y 135 en Cerro de Pasco.
// Con el emisor que el paso 4 recomienda, la red tiene que funcionar sin nada que corregir, con cualquier número de
// turnos razonable.

const CASOS: { parcela: keyof typeof PARCELAS_REALES; metodo: MetodoDeRiego; separacion: [number, number] }[] = [
  { parcela: 'papaPascoLadera', metodo: 'goteo', separacion: [0.3, 0.9] },
  { parcela: 'maizMantaro', metodo: 'goteo', separacion: [0.3, 0.8] },
  { parcela: 'habaPascoValle', metodo: 'goteo', separacion: [0.3, 0.8] },
  { parcela: 'habaPascoValle', metodo: 'aspersion', separacion: [12, 12] },
  { parcela: 'papaCerroDePasco', metodo: 'goteo', separacion: [0.3, 0.9] },
]

describe('la red generada funciona sobre el relieve real', () => {
  for (const { parcela, metodo, separacion } of CASOS) {
    const p = PARCELAS_REALES[parcela]
    const emisor = emisorRecomendado(metodo, p.pendienteMediaPct)
    for (const turnos of [4, 8, 14]) {
      it(`${p.nombre} (${p.pendienteMediaPct.toFixed(0)} %), ${metodo} con ${emisor.nombre}, ${turnos} turnos`, () => {
        const g = generarRedDelProyecto({
          contorno: p.contorno,
          fuente: p.fuente,
          camaras: p.camaras,
          grilla: p.grilla,
          metodo,
          emisor: emisor.codigo,
          separacionM: separacion[0],
          separacionLateralesM: separacion[1],
          turnos,
        })
        const a = analisisDeLaRed({ red: g.red, sectores: g.sectores, presionNominalEmisorM: g.presionNominalEmisorM })
        const porCorregir = a.alertas.filter((x) => x.gravedad !== 'avisa').map((x) => x.causa)
        expect(porCorregir).toEqual([])
        expect(a.funciona).toBe(true)
        const vrp = Object.values(g.red.elementos ?? {}).filter((e) => e.tipo === 'vrp').length
        if (emisor.autocompensado) {
          // El autocompensado ya regula: una válvula por lateral sería pagar dos veces lo mismo.
          expect(vrp).toBe(0)
          // Y su caudal varía un poco con la presión: la uniformidad no es un 100 % irreal.
          for (const t of a.turnos) expect(t.uniformidad).toBeLessThan(0.999)
          // Ningún emisor recibe más presión de la que su rango admite.
          for (const t of a.turnos) for (const e of g.red.emisores.filter((x) => x.sector === t.sector)) {
            expect(t.resultado.nodos[e.nodo]!.presionM).toBeLessThanOrEqual(emisor.presionMaximaM! + 1e-6)
          }
        } else {
          // Con emisor común, a lo más una válvula por lateral: en terreno suave, una por zona de presión (la del cabezal
          // y una por lateral bajo cada cámara de piso), si con eso la red riega tan parejo como con todas.
          expect(vrp).toBeLessThanOrEqual(g.laterales.length)
          expect(vrp).toBeGreaterThanOrEqual(1)
        }
      })
    }
  }

  it('en ladera se recomienda el gotero autocompensado; en el valle, el común', () => {
    expect(emisorRecomendado('goteo', PARCELAS_REALES.papaCerroDePasco.pendienteMediaPct).autocompensado).toBe(true)
    expect(emisorRecomendado('goteo', PARCELAS_REALES.papaPascoLadera.pendienteMediaPct).autocompensado).toBe(true)
    expect(emisorRecomendado('goteo', PARCELAS_REALES.maizMantaro.pendienteMediaPct)).toBe(emisorDelCatalogo('gotero-2'))
  })

  it('en terreno suave, con gotero común, una sola válvula reguladora en el cabezal en lugar de una por lateral', () => {
    // El valle del Mantaro, 5 % de pendiente: antes, 135 válvulas, una por lateral.
    const p = PARCELAS_REALES.maizMantaro
    const g = generarRedDelProyecto({ contorno: p.contorno, fuente: p.fuente, camaras: p.camaras, grilla: p.grilla, metodo: 'goteo', emisor: 'gotero-2', separacionM: 0.3, separacionLateralesM: 0.8, turnos: 8 })
    const valvulas = Object.values(g.red.elementos ?? {}).filter((e) => e.tipo === 'vrp')
    expect(g.laterales.length).toBeGreaterThan(100)
    expect(valvulas).toHaveLength(1)
    const a = analisisDeLaRed({ red: g.red, sectores: g.sectores, presionNominalEmisorM: g.presionNominalEmisorM })
    expect(a.funciona).toBe(true)
    for (const t of a.turnos) expect(t.uniformidad).toBeGreaterThanOrEqual(0.9)
  })

  it('con el gotero común en la ladera de Cerro de Pasco la red funciona, pero la uniformidad lo delata', () => {
    const p = PARCELAS_REALES.papaCerroDePasco
    const g = generarRedDelProyecto({ contorno: p.contorno, fuente: p.fuente, camaras: p.camaras, grilla: p.grilla, metodo: 'goteo', emisor: 'gotero-2', separacionM: 0.3, separacionLateralesM: 0.9, turnos: 6 })
    const a = analisisDeLaRed({ red: g.red, sectores: g.sectores, presionNominalEmisorM: g.presionNominalEmisorM })
    expect(a.alertas.filter((x) => x.gravedad === 'impide')).toEqual([])
    expect(a.alertas.some((x) => x.codigo === 'uniformidad-baja')).toBe(true)
  })
})
