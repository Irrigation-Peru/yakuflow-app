import { describe, expect, it } from 'vitest'
import { DESNIVEL_MAXIMO_SIN_CRP_M, DESNIVEL_MINIMO_GOTEO_M } from '../src/constantes'
import {
  cotaEnGrilla,
  cuadriculaAlrededor,
  extremosDeLaParcela,
  mapaDeZonas,
  PASO_DEL_RELIEVE_GRADOS,
  ZONAS_PARA_LA_FUENTE,
  zonaParaLaFuente,
  type Grilla,
} from '../src/terreno/relieve'
import { proyectarLocal } from '../src/terreno/terreno'

// El relieve alrededor de la parcela: dónde puede estar la fuente para que el agua llegue por gravedad.

const parcela = [
  { lat: -10.68, lon: -76.26 },
  { lat: -10.68, lon: -76.257 },
  { lat: -10.683, lon: -76.257 },
  { lat: -10.683, lon: -76.26 },
]

const distanciaAEntero = (x: number) => Math.abs(x - Math.round(x))

/** Una ladera plana que sube `pendienteNorte` m por metro hacia el norte desde la cota `z0` en la parcela. */
function ladera(cuadricula: ReturnType<typeof cuadriculaAlrededor>, z0: number, pendienteNorte: number): Grilla {
  const origen = parcela[0]!
  return { ...cuadricula, cotas: cuadricula.puntos.map((p) => z0 + pendienteNorte * proyectarLocal(origen, p).y) }
}

describe('cuadrícula alrededor de la parcela', () => {
  it('cubre la parcela más el margen por los cuatro lados', () => {
    const c = cuadriculaAlrededor(parcela, { margenM: 1000 })
    const norte = c.latSur + (c.filas - 1) * c.pasoGrados
    const este = c.lonOeste + (c.columnas - 1) * c.pasoGrados
    const origen = { lat: -10.6815, lon: -76.2585 }
    expect(proyectarLocal(origen, { lat: norte, lon: origen.lon }).y).toBeGreaterThan(1000 + 165)
    expect(proyectarLocal(origen, { lat: c.latSur, lon: origen.lon }).y).toBeLessThan(-(1000 + 165))
    expect(proyectarLocal(origen, { lat: origen.lat, lon: este }).x).toBeGreaterThan(1000 + 160)
    expect(proyectarLocal(origen, { lat: origen.lat, lon: c.lonOeste }).x).toBeLessThan(-(1000 + 160))
  })

  it('va por filas de sur a norte y de oeste a este', () => {
    const c = cuadriculaAlrededor(parcela)
    expect(c.puntos).toHaveLength(c.filas * c.columnas)
    expect(c.puntos[0]).toEqual({ lat: c.latSur, lon: c.lonOeste })
    expect(c.puntos[1]!.lon).toBeGreaterThan(c.puntos[0]!.lon)
    expect(c.puntos[c.columnas]!.lat).toBeGreaterThan(c.puntos[0]!.lat)
  })

  it('cae en una red fija de puntos, así dos parcelas vecinas comparten las cotas guardadas en la caché', () => {
    const vecina = parcela.map((p) => ({ lat: p.lat - 0.0011, lon: p.lon + 0.0007 }))
    const una = new Set(cuadriculaAlrededor(parcela).puntos.map((p) => `${p.lat},${p.lon}`))
    const otra = cuadriculaAlrededor(vecina).puntos.map((p) => `${p.lat},${p.lon}`)
    expect(otra.filter((p) => una.has(p)).length).toBeGreaterThan(otra.length / 2)
    expect(distanciaAEntero(cuadriculaAlrededor(parcela).latSur / PASO_DEL_RELIEVE_GRADOS)).toBeCloseTo(0, 6)
  })

  it('con una parcela muy grande, agranda el paso en vez de pasar del lado máximo', () => {
    const grande = parcela.map((p, i) => ({ lat: p.lat - (i >= 2 ? 0.1 : 0), lon: p.lon + (i === 1 || i === 2 ? 0.1 : 0) }))
    const c = cuadriculaAlrededor(grande, { ladoMaximo: 50 })
    expect(c.filas).toBeLessThanOrEqual(50)
    expect(c.columnas).toBeLessThanOrEqual(50)
    expect(distanciaAEntero(c.pasoGrados / PASO_DEL_RELIEVE_GRADOS)).toBeCloseTo(0, 9)
  })
})

describe('cota en la cuadrícula', () => {
  const grilla: Grilla = { latSur: -10.7, lonOeste: -76.3, pasoGrados: 0.01, filas: 2, columnas: 2, cotas: [3000, 3010, 3100, 3110] }

  it('en un nodo es la cota del nodo', () => {
    expect(cotaEnGrilla(grilla, { lat: -10.69, lon: -76.29 })).toBeCloseTo(3110, 9)
  })

  it('entre nodos interpola, y un plano lo reproduce exacto', () => {
    expect(cotaEnGrilla(grilla, { lat: -10.695, lon: -76.2975 })).toBeCloseTo(3000 + 50 + 2.5, 9)
  })

  it('fuera de la cuadrícula no inventa una cota', () => {
    expect(cotaEnGrilla(grilla, { lat: -10.68, lon: -76.29 })).toBeNull()
    expect(cotaEnGrilla(grilla, { lat: -10.695, lon: -76.31 })).toBeNull()
  })
})

describe('zona para la fuente', () => {
  const extremos = { cotaMasAlta: 4000, cotaMasBaja: 3980 }

  it('debajo del punto más alto de la parcela, el agua no llega por gravedad', () => {
    expect(zonaParaLaFuente(3990, extremos)).toBe('no_llega')
    expect(zonaParaLaFuente(4000, extremos)).toBe('no_llega')
  })

  it(`con menos de ${DESNIVEL_MINIMO_GOTEO_M} m sobre el punto más alto, llega con poca presión`, () => {
    expect(zonaParaLaFuente(4000 + DESNIVEL_MINIMO_GOTEO_M - 0.1, extremos)).toBe('poca_presion')
  })

  it(`desde ${DESNIVEL_MINIMO_GOTEO_M} m sobre el punto más alto hasta ${DESNIVEL_MAXIMO_SIN_CRP_M} m sobre el más bajo, es adecuada`, () => {
    expect(zonaParaLaFuente(4000 + DESNIVEL_MINIMO_GOTEO_M, extremos)).toBe('adecuada')
    expect(zonaParaLaFuente(3980 + DESNIVEL_MAXIMO_SIN_CRP_M, extremos)).toBe('adecuada')
  })

  it(`con más de ${DESNIVEL_MAXIMO_SIN_CRP_M} m sobre el punto más bajo, la red necesita cámaras rompe-presión`, () => {
    expect(zonaParaLaFuente(3980 + DESNIVEL_MAXIMO_SIN_CRP_M + 0.1, extremos)).toBe('necesita_crp')
  })

  it('si la parcela tiene tanto relieve que le falta presión arriba y le sobra abajo, manda la falta de presión', () => {
    expect(zonaParaLaFuente(4010, { cotaMasAlta: 4000, cotaMasBaja: 3940 })).toBe('poca_presion')
  })
})

describe('mapa de zonas', () => {
  it('en una ladera que sube al norte, las zonas se ordenan de abajo hacia arriba', () => {
    const c = cuadriculaAlrededor(parcela)
    const grilla = ladera(c, 4000, 0.06)
    const mapa = mapaDeZonas(grilla, { cotaMasAlta: 4000, cotaMasBaja: 3982 }, 40, 60)
    expect(mapa).toHaveLength(40 * 60)
    // Columna del medio, de norte (fila 0) a sur: la zona nunca sube al bajar.
    const columna = Array.from({ length: 60 }, (_, fila) => mapa[fila * 40 + 20]!)
    for (let i = 1; i < columna.length; i++) expect(columna[i]).toBeLessThanOrEqual(columna[i - 1]!)
    expect(ZONAS_PARA_LA_FUENTE[columna[0]!]).toBe('necesita_crp')
    expect(ZONAS_PARA_LA_FUENTE[columna.at(-1)!]).toBe('no_llega')
    expect(new Set(columna.map((z) => ZONAS_PARA_LA_FUENTE[z]))).toEqual(new Set(ZONAS_PARA_LA_FUENTE))
  })
})

describe('puntos extremos de la parcela', () => {
  it('son la muestra más alta y la más baja, con su cota', () => {
    const muestras = [
      { lat: 1, lon: 1 },
      { lat: 2, lon: 2 },
      { lat: 3, lon: 3 },
    ]
    expect(extremosDeLaParcela(muestras, [10, 30, 20])).toEqual({
      masAlto: { lat: 2, lon: 2, cota: 30 },
      masBajo: { lat: 1, lon: 1, cota: 10 },
    })
  })
})
