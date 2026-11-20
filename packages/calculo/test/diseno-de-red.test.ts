import { describe, expect, it } from 'vitest'
import {
  calcularRed,
  CATALOGO_EMISORES,
  emisorDelCatalogo,
  generarRed,
  LONGITUD_MAXIMA_TRAMO_M,
  VELOCIDAD_MAXIMA,
  type EntradaDisenoDeRed,
  type PuntoLocal,
} from '../src/index.ts'

// El modulo compila sin los tipos del navegador ni los de Node; el reloj existe en los dos.
declare const performance: { now(): number }

// Parcela de una hectárea en ladera de Cerro de Pasco: cuadrada de 100 m, bajando 10 % hacia el este.
const PENDIENTE = 0.1
const cota = (x: number) => 3000 - PENDIENTE * x
const parcela = (lado = 100): PuntoLocal[] => [
  { x: 0, y: 0, z: cota(0) },
  { x: lado, y: 0, z: cota(lado) },
  { x: lado, y: lado, z: cota(lado) },
  { x: 0, y: lado, z: cota(0) },
]

const gotero = emisorDelCatalogo('gotero-2')

const entrada = (cambios: Partial<EntradaDisenoDeRed> = {}): EntradaDisenoDeRed => ({
  contorno: parcela(),
  // La fuente, 41 m por encima del borde alto: alcanza para goteo y deja ver la cámara rompe-presión.
  fuente: { x: -50, y: 50, z: 3040, presionInicialM: 1 },
  cotaEn: (x) => cota(x),
  emisor: {
    caudalNominalLph: gotero.caudalNominalLph,
    presionNominalM: gotero.presionNominalM,
    coeficienteK: gotero.coeficienteK,
    exponenteX: gotero.exponenteX,
  },
  separacionM: gotero.separacionM,
  separacionLateralesM: gotero.separacionLateralesM,
  turnos: 4,
  perdidaCabezalM: 8,
  ...cambios,
})

describe('generarRed', () => {
  it('traza los laterales sobre las curvas de nivel y el portalateral por el centro, con un lateral a cada lado', () => {
    const { red, laterales } = generarRed(entrada())
    // La pendiente baja hacia +x, así que cada lateral va a x casi constante y recorre y; hay dos por curva de nivel.
    expect(laterales.length).toBe(2 * Math.floor(100 / gotero.separacionLateralesM))
    const porId = new Map(red.nodos.map((n) => [n.id, n]))
    const cabezal = porId.get('C')!
    expect(cabezal.y).toBeCloseTo(50, 6)
    for (const lateral of ['L1', 'L2']) {
      const primero = porId.get(`${lateral}-1`)!
      const ultimo = porId.get(`${lateral}-5`)!
      expect(Math.abs(primero.x - ultimo.x)).toBeLessThan(1e-6)
      expect(Math.abs(ultimo.y - cabezal.y)).toBeCloseTo(50, 6)
    }
    // Uno hacia cada lado del portalateral.
    expect(Math.sign(porId.get('L1-5')!.y - cabezal.y)).toBe(-Math.sign(porId.get('L2-5')!.y - cabezal.y))
  })

  it('cubre la parcela con los emisores que caben en las separaciones', () => {
    const { resumen, laterales } = generarRed(entrada())
    // 222 laterales de 50 m, dos por curva de nivel, con un gotero cada 30 cm.
    expect(laterales.every((l) => l.emisores === Math.floor(50 / gotero.separacionM))).toBe(true)
    expect(resumen.emisores).toBe(laterales.length * Math.floor(50 / gotero.separacionM))
  })

  it('reparte los laterales en tantos sectores como turnos, y cada sector es una zona contigua', () => {
    const { laterales, sectores } = generarRed(entrada({ turnos: 4 }))
    expect(sectores).toEqual(['S1', 'S2', 'S3', 'S4'])
    const indices = new Map<string, number[]>()
    laterales.forEach((l, i) => indices.set(l.sector, [...(indices.get(l.sector) ?? []), i]))
    for (const lista of indices.values()) {
      expect(lista[lista.length - 1]! - lista[0]!).toBe(lista.length - 1) // contiguos
    }
    // Los sectores quedan parejos: ninguno se pasa de una curva de nivel (sus dos laterales) respecto del promedio.
    const tamanos = [...indices.values()].map((l) => l.length)
    expect(Math.max(...tamanos) - Math.min(...tamanos)).toBeLessThanOrEqual(2)
  })

  it('elige diámetros con los que el agua no pasa de la velocidad máxima', () => {
    const { red } = generarRed(entrada())
    const resultado = calcularRed(red, { sectoresAbiertos: ['S1'] })
    for (const tramo of Object.values(resultado.tramos)) {
      expect(tramo.velocidadMs).toBeLessThanOrEqual(VELOCIDAD_MAXIMA + 1e-9)
    }
  })

  it('no deja tramos más largos que el máximo del método', () => {
    const { red } = generarRed(entrada())
    const porId = new Map(red.nodos.map((n) => [n.id, n]))
    for (const t of red.tramos) {
      const a = porId.get(t.desde)!
      const b = porId.get(t.hasta)!
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(LONGITUD_MAXIMA_TRAMO_M + 1e-9)
    }
  })

  it('no pone cámaras donde la parcela no cae más que el límite del método', () => {
    // Una hectárea al 10 % cae 10 m: las cámaras van en la conducción del paso 1, no dentro de la red.
    expect(generarRed(entrada()).resumen.camarasRompePresion).toBe(0)
  })

  it('pone cámara en la parcela larga que sí pasa el límite, y la zona nueva queda con menos carga', () => {
    // Parcela de 600 m al 10 %: cae 60 m, más que los 50 que el método admite sin cámara.
    const larga: PuntoLocal[] = [
      { x: 0, y: 0, z: cota(0) },
      { x: 600, y: 0, z: cota(600) },
      { x: 600, y: 100, z: cota(600) },
      { x: 0, y: 100, z: cota(0) },
    ]
    const diseno = generarRed(entrada({ contorno: larga, turnos: 8 }))
    expect(diseno.resumen.camarasRompePresion).toBeGreaterThanOrEqual(1)
    const conCamara = Object.entries(diseno.red.elementos ?? {}).filter(([, e]) => e.tipo === 'crp')
    expect(conCamara.length).toBe(diseno.resumen.camarasRompePresion)
    // La cámara deja el agua a cota: justo debajo de ella la presión arranca de cero. Se riega un turno, que
    // es como la red trabaja: con los ocho sectores abiertos pasaría ocho veces el caudal de diseño.
    const resultado = calcularRed(diseno.red, { sectoresAbiertos: [diseno.sectores[0]!] })
    expect(resultado.convergio).toBe(true)
    for (const [id] of conCamara) expect(resultado.nodos[id]!.presionM).toBeCloseTo(0, 6)
  })

  it('la red que genera se resuelve, converge y entrega agua a todos los emisores del sector', () => {
    const { red, sectores } = generarRed(entrada())
    for (const sector of sectores) {
      const resultado = calcularRed(red, { sectoresAbiertos: [sector] })
      expect(resultado.convergio).toBe(true)
      expect(resultado.rechazos).toEqual([])
      const delSector = red.emisores.filter((e) => e.sector === sector)
      expect(delSector.length).toBeGreaterThan(0)
      for (const e of delSector) {
        expect(resultado.nodos[e.nodo]!.caudalEmisorLph).toBeGreaterThan(0)
        expect(resultado.nodos[e.nodo]!.presionM).toBeGreaterThan(0)
      }
    }
  })

  it('declara la clase de cada tramo y el cálculo no la encuentra excedida', () => {
    const { red } = generarRed(entrada())
    expect(red.tramos.every((t) => t.presionMaximaM !== undefined)).toBe(true)
    // Con las válvulas cerradas la presión es la estática, que es el peor caso para la tubería.
    const cerrada = calcularRed(red, { sectoresAbiertos: [] })
    for (const tramo of Object.values(cerrada.tramos)) {
      expect(tramo.cumpleClase).toBe(true)
    }
  })

  it('el caudal de diseño es el del sector más exigente, no el de la parcela entera', () => {
    const { resumen, laterales, red } = generarRed(entrada({ turnos: 4 }))
    const caudalTotal = (resumen.emisores * gotero.caudalNominalLph) / 3600
    expect(resumen.caudalDisenoLps).toBeLessThan(caudalTotal)
    expect(resumen.caudalDisenoLps).toBeGreaterThan(caudalTotal / 5)
    // Y es el que de verdad pasa por la conducción cuando riega ese sector.
    const mayor = [...new Set(laterales.map((l) => l.sector))]
      .map((s) => ({ s, q: calcularRed(red, { sectoresAbiertos: [s] }).caudalFuenteLps }))
      .reduce((a, b) => (b.q > a.q ? b : a))
    expect(mayor.q).toBeLessThanOrEqual(resumen.caudalDisenoLps * 1.05)
  })

  it('funciona con aspersión, que tiene separaciones mucho mayores', () => {
    const aspersor = CATALOGO_EMISORES.find((e) => e.metodo === 'aspersion')!
    const { red, laterales, resumen } = generarRed(
      entrada({
        emisor: {
          caudalNominalLph: aspersor.caudalNominalLph,
          presionNominalM: aspersor.presionNominalM,
          coeficienteK: aspersor.coeficienteK,
          exponenteX: aspersor.exponenteX,
        },
        separacionM: aspersor.separacionM,
        separacionLateralesM: aspersor.separacionLateralesM,
        turnos: 6,
        fuente: { x: -50, y: 50, z: 3060, presionInicialM: 1 },
      }),
    )
    expect(laterales.length).toBe(2 * Math.floor(100 / aspersor.separacionLateralesM))
    expect(resumen.emisores).toBeLessThan(100)
    expect(calcularRed(red, { sectoresAbiertos: ['S1'] }).convergio).toBe(true)
  })

  it('rechaza lo que no se puede diseñar', () => {
    expect(() => generarRed(entrada({ turnos: 0 }))).toThrow(/turnos/)
    expect(() => generarRed(entrada({ contorno: parcela().slice(0, 2) }))).toThrow(/tres vértices/)
    expect(() => generarRed(entrada({ contorno: parcela(0.4) }))).toThrow(/más chica/)
    expect(() => generarRed(entrada({ tramosPorLateral: 0 }))).toThrow(/al menos un tramo/)
  })

  it('la red generada se recalcula en menos de 200 ms, que es lo que HU0019 necesita', () => {
    const { red, sectores } = generarRed(entrada())
    const opciones = { sectoresAbiertos: [sectores[0]!] }
    calcularRed(red, opciones) // calentamiento
    const tiempos: number[] = []
    for (let i = 0; i < 5; i++) {
      const inicio = performance.now()
      expect(calcularRed(red, opciones).convergio).toBe(true)
      tiempos.push(performance.now() - inicio)
    }
    expect(tiempos.sort((a, b) => a - b)[2]!).toBeLessThan(200)
  })
})
