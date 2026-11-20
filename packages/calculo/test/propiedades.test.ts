import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { caudalDeEmisor, derivadaCaudalDeEmisor } from '../src/hidraulica/emisor'
import { calcularRed } from '../src/hidraulica/red'
import type { Red } from '../src/hidraulica/tipos'
import { uniformidadDistribucion } from '../src/hidraulica/uniformidad'

// Invariantes físicas que deben cumplirse para cualquier red abierta, no solo para los casos escritos a mano.

const DIAMETROS_MM = [16, 20, 25.4, 32, 38.1, 50.8, 63.5]

const arbitrariaRed = fc.integer({ min: 2, max: 25 }).chain((n) =>
  fc
    .record({
      padres: fc.tuple(...Array.from({ length: n - 1 }, (_, i) => fc.integer({ min: 0, max: i }))),
      nodos: fc.array(
        fc.record({
          dx: fc.double({ min: 5, max: 80, noNaN: true }),
          dy: fc.double({ min: -40, max: 40, noNaN: true }),
          horizontal: fc.boolean(),
          dz: fc.double({ min: -25, max: 5, noNaN: true }),
          diametro: fc.constantFrom(...DIAMETROS_MM),
          emisor: fc.option(
            fc.record({ k: fc.double({ min: 1, max: 400, noNaN: true }), x: fc.oneof(fc.constant(0), fc.double({ min: 0.01, max: 0.6, noNaN: true })) }),
          ),
        }),
        { minLength: n - 1, maxLength: n - 1 },
      ),
      presionInicialM: fc.double({ min: 0, max: 30, noNaN: true }),
    })
    .map(({ padres, nodos, presionInicialM }): Red => {
      const red: { nodos: Red['nodos'][number][]; tramos: Red['tramos'][number][]; emisores: Red['emisores'][number][] } = {
        nodos: [{ id: 'n0', x: 0, y: 0, z: 3000 }],
        tramos: [],
        emisores: [],
      }
      nodos.forEach((d, i) => {
        const padre = red.nodos[padres[i]!]!
        const id = `n${i + 1}`
        red.nodos.push({ id, x: padre.x + d.dx, y: padre.y + d.dy, z: padre.z + (d.horizontal ? 0 : d.dz) })
        red.tramos.push({ id: `t${i + 1}`, desde: padre.id, hasta: id, diametroInternoMm: d.diametro, c: 140 })
        if (d.emisor) red.emisores.push({ nodo: id, ...d.emisor })
      })
      return { ...red, fuente: { nodo: 'n0', presionInicialM } }
    }),
)

/** Ids de los nodos que cuelgan de `raiz`, incluido él. */
function subarbol(red: Red, raiz: string) {
  const hijos = new Map<string, string[]>()
  for (const t of red.tramos) hijos.set(t.desde, [...(hijos.get(t.desde) ?? []), t.hasta])
  const resultado = [raiz]
  for (let i = 0; i < resultado.length; i++) resultado.push(...(hijos.get(resultado[i]!) ?? []))
  return resultado
}

describe('invariantes físicas sobre redes al azar', () => {
  it('la suma de los caudales de los emisores iguala el caudal de la fuente', () => {
    fc.assert(
      fc.property(arbitrariaRed, (red) => {
        const r = calcularRed(red)
        const suma = Object.values(r.nodos).reduce((s, n) => s + (n.caudalEmisorLph ?? 0) / 3600, 0)
        expect(Math.abs(suma - r.caudalFuenteLps)).toBeLessThanOrEqual(1e-12 * Math.max(1, r.caudalFuenteLps))
      }),
    )
  })

  it('la presión nunca aumenta aguas abajo en un tramo horizontal', () => {
    fc.assert(
      fc.property(arbitrariaRed, (red) => {
        const r = calcularRed(red)
        const cota = new Map(red.nodos.map((n) => [n.id, n.z]))
        for (const t of red.tramos) {
          if (cota.get(t.desde) !== cota.get(t.hasta)) continue
          expect(r.tramos[t.id]!.presionSalidaM).toBeLessThanOrEqual(r.tramos[t.id]!.presionEntradaM)
        }
      }),
    )
  })

  // Donde el agua llega con presión. Si llega en succión (un sifón), la cámara corta el sifón y su propio nodo
  // pasa de presión negativa a cero: ahí sí la sube, y es lo físicamente correcto.
  it('una cámara rompe-presión donde el agua llega con presión nunca sube la presión aguas abajo', () => {
    fc.assert(
      fc.property(arbitrariaRed, fc.nat(), (red, eleccion) => {
        const nodo = red.nodos[1 + (eleccion % (red.nodos.length - 1))]!.id
        const sin = calcularRed(red)
        fc.pre(sin.nodos[nodo]!.presionM > 0)
        const con = calcularRed({ ...red, elementos: { [nodo]: { tipo: 'crp' } } })
        for (const id of subarbol(red, nodo)) {
          expect(con.nodos[id]!.presionM).toBeLessThanOrEqual(sin.nodos[id]!.presionM + 1e-7)
        }
      }),
    )
  })

  it('la uniformidad de distribución cae entre 0 y 1', () => {
    fc.assert(
      fc.property(arbitrariaRed, (red) => {
        fc.pre(red.emisores.length > 0)
        const r = calcularRed(red)
        const du = uniformidadDistribucion(red.emisores.map((e) => r.nodos[e.nodo]!.caudalEmisorLph!))
        expect(du).toBeGreaterThanOrEqual(0)
        expect(du).toBeLessThanOrEqual(1)
      }),
    )
  })

  it('con las válvulas cerradas, la presión es todo el desnivel desde la fuente', () => {
    fc.assert(
      fc.property(arbitrariaRed, (red) => {
        const r = calcularRed(red, { sectoresAbiertos: [] })
        const fuente = red.nodos[0]!
        for (const n of red.nodos) {
          expect(r.nodos[n.id]!.presionM).toBeCloseTo(red.fuente.presionInicialM + fuente.z - n.z, 9)
        }
      }),
    )
  })

  it('el caudal y la presión de cada emisor quedan coherentes', () => {
    fc.assert(
      fc.property(arbitrariaRed, (red) => {
        const r = calcularRed(red)
        expect(r.convergio).toBe(true)
        for (const e of red.emisores) {
          const p = r.nodos[e.nodo]!.presionM
          const esperado = caudalDeEmisor(e.k, e.x, p)
          // Margen: 1e-9 relativo, más lo que mueve al caudal un nanómetro de presión (el redondeo de la cota).
          const margen = 1e-9 * esperado + derivadaCaudalDeEmisor(e.k, e.x, p) * 1e-9
          expect(Math.abs(r.nodos[e.nodo]!.caudalEmisorLph! - esperado)).toBeLessThanOrEqual(margen)
        }
      }),
    )
  })
})

// HU0001, criterio 1: el módulo corre sin abrir la interfaz (estas pruebas corren en Node, sin navegador) y con los
// mismos datos devuelve los mismos resultados. Tampoco toca los datos que recibe: la pantalla, el worker y el
// generador de redes del modelo sustituto le pasan su propio estado.
// El módulo compila sin los tipos del navegador ni los de Node; structuredClone existe en los dos.
declare const structuredClone: <T>(valor: T) => T
describe('mismos datos, mismos resultados', () => {
  it('dos cálculos de la misma red dan lo mismo, y la red queda como estaba', () => {
    fc.assert(
      fc.property(arbitrariaRed, (red) => {
        const original = structuredClone(red)
        expect(calcularRed(red)).toEqual(calcularRed(structuredClone(red)))
        expect(red).toEqual(original)
      }),
    )
  })
})
