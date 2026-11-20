import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  alertasDelDiseno,
  analisisDeLaRed,
  aplicarCambios,
  avanceDelAgua,
  calcularRed,
  caudalesPorEmisor,
  caminoHasta,
  cambiarTramo,
  CLASES_DE_TUBERIA,
  colocarCamara,
  disenoFunciona,
  DIAMETROS_INTERNOS_MM,
  emisorDelCatalogo,
  emisoresDeLaRed,
  extremoAguasAbajo,
  generarRed,
  lugarParaCamara,
  nodoAdmiteCamara,
  presionesEstaticas,
  presionesMaximas,
  presupuestoDeLaRed,
  quitarCamara,
  recorridoHasta,
  regarPorSectores,
  tramosAfectados,
  uniformidadDistribucion,
  uniformidadPonderada,
  type CatalogoDePrecios,
  type EntradaDisenoDeRed,
  type PuntoLocal,
} from '../src/index.ts'

declare const performance: { now(): number }

const cota = (x: number) => 3000 - 0.1 * x
const parcela = (lado = 100, ancho = 100): PuntoLocal[] => [
  { x: 0, y: 0, z: cota(0) },
  { x: lado, y: 0, z: cota(lado) },
  { x: lado, y: ancho, z: cota(lado) },
  { x: 0, y: ancho, z: cota(0) },
]
const gotero = emisorDelCatalogo('gotero-2')
const entrada = (cambios: Partial<EntradaDisenoDeRed> = {}): EntradaDisenoDeRed => ({
  contorno: parcela(),
  fuente: { x: -50, y: 50, z: 3040, presionInicialM: 1 },
  cotaEn: (x) => cota(x),
  emisor: { caudalNominalLph: gotero.caudalNominalLph, presionNominalM: gotero.presionNominalM, coeficienteK: gotero.coeficienteK, exponenteX: gotero.exponenteX },
  separacionM: gotero.separacionM,
  separacionLateralesM: gotero.separacionLateralesM,
  turnos: 4,
  perdidaCabezalM: 8,
  ...cambios,
})
const nominal = gotero.presionNominalM

const PRECIOS: CatalogoDePrecios = {
  version: 'prueba',
  provisional: true,
  fuente: 'Valores de prueba',
  moneda: 'PEN',
  tuberias: DIAMETROS_INTERNOS_MM.flatMap((diametroInternoMm) =>
    CLASES_DE_TUBERIA.map((c) => ({ diametroInternoMm, clase: c.codigo, precioPorM: diametroInternoMm / 10 + c.presionMaximaM / 100 })),
  ),
  emisores: [{ codigo: 'gotero-2', precioUnidad: 0.5 }],
  accesorios: { camaraRompePresion: 1000, valvulaReguladora: 100, cabezal: 2000 },
}

describe('la conducción de la red', () => {
  // La fuente 170 m por encima y a 1200 m: el paso 1 deja dos cámaras, y la última a 40 m sobre el cabezal.
  const conCamaras = entrada({
    fuente: { x: -1200, y: 50, z: 3140, presionInicialM: 1 },
    camarasDeLaConduccion: [
      { x: -900, y: 50, z: 3090 },
      { x: -600, y: 50, z: 3040 },
    ],
  })

  it('pasa por las cámaras que calculó el paso 1 y parte los tramos largos', () => {
    const { red, resumen } = generarRed(conCamaras)
    expect(resumen.camarasRompePresion).toBe(2)
    expect(red.elementos!['R1']).toEqual({ tipo: 'crp' })
    expect(red.elementos!['R2']).toEqual({ tipo: 'crp' })
    expect(caminoHasta(red, 'C')[0]!.id).toBe('conduccion')
    expect(calcularRed(red, { sectoresAbiertos: ['S1'] }).rechazos).toEqual([])
  })

  it('cada zona lleva la clase de su propia columna, no la de todo el desnivel', () => {
    const { red, sectores } = generarRed(conCamaras)
    expect(presionesMaximas(red, sectores).filter((p) => !p.cumpleClase)).toEqual([])
    expect(presionesEstaticas(red)['C']).toBeCloseTo(3040 - red.nodos.find((n) => n.id === 'C')!.z, 6)
  })

  it('sin cámaras sigue siendo un solo tramo de la fuente al cabezal', () => {
    const { red } = generarRed(entrada())
    expect(red.tramos.filter((t) => t.id.startsWith('conduccion')).map((t) => t.id)).toEqual(['conduccion'])
  })
})

describe('la cámara que pone el generador', () => {
  it('queda aguas arriba del nodo que pasaría el límite, y la guarda del cálculo no lo rechaza', () => {
    // Parcela de 600 m al 10 %: cae 60 m. Antes la cámara iba en el nodo ya excedido y la alerta nunca se iba.
    const { red, sectores } = generarRed(entrada({ contorno: parcela(600), turnos: 8 }))
    expect(calcularRed(red, { sectoresAbiertos: [sectores[0]!] }).rechazos).toEqual([])
  })

  it('con el cabezal justo arriba del límite, abre un nodo propio', () => {
    // El cabezal queda a 49 m de la fuente: el primer tramo del portalateral ya pasa el límite.
    const { red, sectores } = generarRed(entrada({ fuente: { x: -50, y: 50, z: 3049, presionInicialM: 1 } }))
    expect(calcularRed(red, { sectoresAbiertos: [sectores[0]!] }).rechazos).toEqual([])
    expect(red.elementos!['C']!.tipo).toBe('cabezal')
    expect(Object.values(red.elementos!).filter((e) => e.tipo === 'crp').length).toBeGreaterThanOrEqual(1)
  })
})

describe('poner y quitar cámaras (HU0021)', () => {
  const { red, sectores } = generarRed(entrada({ fuente: { x: -300, y: 50, z: 3045, presionInicialM: 1 } }))

  it('la cámara no va en la fuente, ni en un elemento, ni donde hay emisores', () => {
    expect(nodoAdmiteCamara(red, 'F')).toBe(false)
    expect(nodoAdmiteCamara(red, 'C')).toBe(false)
    expect(nodoAdmiteCamara(red, red.emisores[0]!.nodo)).toBe(false)
    expect(() => colocarCamara(red, 'F')).toThrow()
  })

  it('lo que no aguanta con las válvulas cerradas se detecta, y la clase que propone la alerta lo corrige', () => {
    // Una columna de 200 m sin cámara, con la clase más delgada: regando no se nota, cerrada revienta (CE5).
    const alta = generarRed(entrada({ fuente: { x: -400, y: 50, z: 3120, presionInicialM: 1 } }))
    const debil = cambiarTramo(alta.red, 'conduccion', { clase: 'C-5' })
    const analisis = analisisDeLaRed({ red: debil, sectores: alta.sectores, presionNominalEmisorM: nominal })
    const roto = analisis.presiones.find((p) => p.tramo === 'conduccion')!
    expect(roto.cumpleClase).toBe(false)
    expect(roto.estado).toBe('cerrada')
    expect(analisis.funciona).toBe(false)
    const alerta = analisis.alertas.find((a) => a.codigo === 'clase-excedida' && a.tramo === 'conduccion')!
    const corregida = cambiarTramo(debil, 'conduccion', { clase: alerta.cambio!.clase! })
    expect(presionesMaximas(corregida, alta.sectores).find((p) => p.tramo === 'conduccion')!.cumpleClase).toBe(true)
  })

  it('la cámara corta la columna aguas abajo y nunca sube la presión', () => {
    const nodo = lugarParaCamara(red, 'J1')!
    expect(nodo).toBeDefined()
    const antes = presionesEstaticas(red)
    const despues = presionesEstaticas(colocarCamara(red, nodo))
    expect(despues[nodo]).toBeCloseTo(0, 9)
    for (const id of Object.keys(antes)) expect(despues[id]!).toBeLessThanOrEqual(antes[id]! + 1e-9)
  })

  it('quitar la cámara devuelve la red de antes y no toca la que recibe', () => {
    const nodo = lugarParaCamara(red, 'J1')!
    const con = colocarCamara(red, nodo)
    expect(quitarCamara(con, nodo).elementos).toEqual(red.elementos)
    expect(con.elementos![nodo]).toEqual({ tipo: 'crp' })
    expect(() => quitarCamara(red, nodo)).toThrow()
  })

  it('la lista de cambios rehace el diseño, en orden', () => {
    const nodo = lugarParaCamara(red, 'J1')!
    const final = aplicarCambios(red, [
      { tipo: 'tramo', tramo: 'conduccion', clase: 'C-15' },
      { tipo: 'poner-camara', nodo },
      { tipo: 'quitar-camara', nodo },
    ])
    expect(final.elementos).toEqual(red.elementos)
    expect(final.tramos.find((t) => t.id === 'conduccion')!.presionMaximaM).toBe(150)
  })

  it('la alerta de una columna rota propone dónde poner la cámara, y lo que propone se puede aplicar', () => {
    const debil = cambiarTramo(red, 'm2', { clase: 'C-5' })
    const presiones = presionesMaximas(debil, sectores).map((p) => (p.tramo === 'm2' ? { ...p, cumpleClase: false, presionMaximaM: 200 } : p))
    const alerta = alertasDelDiseno({ red: debil, turnos: regarPorSectores(debil, sectores), presiones, presionNominalEmisorM: nominal }).find(
      (a) => a.tramo === 'm2' && a.codigo === 'clase-excedida',
    )!
    expect(alerta.camaraEn).toBeDefined()
    expect(() => colocarCamara(debil, alerta.camaraEn!)).not.toThrow()
  })
})

describe('el diseño que funciona', () => {
  it('lo que solo avisa no lo detiene; lo que hay que corregir, sí', () => {
    expect(disenoFunciona([])).toBe(true)
    expect(disenoFunciona([{ codigo: 'velocidad-baja', gravedad: 'avisa', causa: '', correccion: '' }])).toBe(true)
    expect(disenoFunciona([{ codigo: 'clase-excedida', gravedad: 'corrige', causa: '', correccion: '' }])).toBe(false)
    expect(disenoFunciona([{ codigo: 'no-convergio', gravedad: 'impide', causa: '', correccion: '' }])).toBe(false)
  })

  it('analizar la red tras un cambio tarda menos de 200 ms', () => {
    const { red, sectores } = generarRed(entrada())
    const inicio = performance.now()
    analisisDeLaRed({ red: cambiarTramo(red, 'conduccion', { diametroInternoMm: 110 }), sectores, presionNominalEmisorM: nominal })
    expect(performance.now() - inicio).toBeLessThan(200)
  })
})

describe('el recorrido del agua', () => {
  const { red, sectores } = generarRed(entrada())
  const turno = regarPorSectores(red, sectores)[0]!
  const presiones = Object.fromEntries(Object.values(turno.resultado.nodos).map((n) => [n.id, n.presionM]))

  it('va de la fuente al nodo, con la presión como distancia entre el terreno y la línea', () => {
    const extremo = extremoAguasAbajo(red, 'C')
    const puntos = recorridoHasta(red, extremo, presiones)
    expect(puntos[0]!.nodo).toBe('F')
    expect(puntos.at(-1)!.nodo).toBe(extremo)
    for (const p of puntos) expect(p.cotaPiezometrica - p.cota).toBeCloseTo(p.presionM, 9)
    for (let i = 1; i < puntos.length; i++) expect(puntos[i]!.distanciaM).toBeGreaterThanOrEqual(puntos[i - 1]!.distanciaM)
  })

  it('con las válvulas cerradas y sin elementos que corten, la línea es horizontal: sin caudal no hay pérdida', () => {
    // Hasta la última junta del portalateral: más allá, la válvula reguladora del lateral recorta la presión.
    const ultimaJunta = red.tramos.filter((t) => t.id.startsWith('m')).at(-1)!.hasta
    const niveles = recorridoHasta(red, ultimaJunta, presionesEstaticas(red)).map((p) => p.cotaPiezometrica)
    expect(Math.max(...niveles) - Math.min(...niveles)).toBeCloseTo(0, 6)
  })

  it('solo avanza por los tramos que llevan agua en ese turno', () => {
    const { tramos, totalM } = avanceDelAgua(red, turno.resultado.tramos)
    expect(tramos.length).toBeGreaterThan(0)
    expect(tramos.length).toBeLessThan(red.tramos.length)
    expect(totalM).toBeGreaterThan(0)
    for (const t of tramos) {
      expect(turno.resultado.tramos[t.tramo]!.caudalLps).toBeGreaterThan(0)
      expect(t.hastaM).toBeGreaterThanOrEqual(t.desdeM)
    }
  })
})

describe('la uniformidad cuando los emisores equivalentes no representan a los mismos', () => {
  it('con pesos iguales es la uniformidad de siempre', () => {
    const caudales = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(uniformidadPonderada(caudales.map((caudal) => ({ caudal, peso: 3 })))).toBeCloseTo(uniformidadDistribucion(caudales), 12)
  })

  it('un emisor solo al final de un lateral corto no hunde la uniformidad', () => {
    expect(uniformidadPonderada([{ caudal: 2, peso: 1 }, { caudal: 2, peso: 40 }])).toBeCloseTo(1, 12)
  })

  it('cuenta cada emisor una vez: el cuarto inferior se toma sobre los emisores, no sobre las filas', () => {
    // 10 emisores: 4 a 1 l/h y 6 a 2 l/h. El cuarto son 2.5 emisores, todos a 1 l/h; la media es 1.6.
    expect(uniformidadPonderada([{ caudal: 1, peso: 4 }, { caudal: 2, peso: 6 }])).toBeCloseTo(1 / 1.6, 12)
  })

  it('siempre da entre 0 y 1', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ caudal: fc.double({ min: 0, max: 100, noNaN: true }), peso: fc.double({ min: 0.5, max: 50, noNaN: true }) }), { minLength: 1, maxLength: 30 }), (filas) => {
        const du = uniformidadPonderada(filas)
        expect(du).toBeGreaterThanOrEqual(0)
        expect(du).toBeLessThanOrEqual(1 + 1e-9)
      }),
    )
  })

  it('una parcela cuadrada riega parejo en todos sus sectores', () => {
    const { red, sectores } = generarRed(entrada())
    for (const turno of regarPorSectores(red, sectores)) expect(turno.uniformidad).toBeGreaterThan(0.85)
  })
})

describe('lo que entrega cada emisor y lo que un cambio afecta', () => {
  const { red, sectores, resumen } = generarRed(entrada())
  const turnos = regarPorSectores(red, sectores)

  it('vuelve del emisor equivalente al emisor real, cerca de su caudal nominal', () => {
    const filas = turnos.flatMap((t) => caudalesPorEmisor(red, t, gotero.coeficienteK))
    expect(filas.reduce((s, f) => s + f.emisores, 0)).toBeCloseTo(resumen.emisores, -1)
    for (const f of filas) {
      expect(f.caudalPorEmisorLph).toBeGreaterThan(0.5 * gotero.caudalNominalLph)
      expect(f.caudalPorEmisorLph).toBeLessThan(1.5 * gotero.caudalNominalLph)
    }
  })

  it('un cambio resalta los tramos de aguas abajo, y sin cambios no resalta nada', () => {
    expect(tramosAfectados(turnos, turnos)).toEqual([])
    const cambiada = regarPorSectores(cambiarTramo(red, 'conduccion', { diametroInternoMm: 25.4 }), sectores)
    const afectados = tramosAfectados(turnos, cambiada)
    expect(afectados).toContain('conduccion')
    expect(afectados.length).toBeGreaterThan(1)
  })
})

describe('presupuesto de la red', () => {
  const { red, resumen } = generarRed(entrada())
  const emisor = { codigo: 'gotero-2', coeficienteK: gotero.coeficienteK }

  it('cuenta los emisores reales, no los equivalentes', () => {
    expect(emisoresDeLaRed(red, gotero.coeficienteK)).toBe(resumen.emisores)
  })

  it('el total es la suma de las partidas, y lleva la longitud inclinada', () => {
    const p = presupuestoDeLaRed({ red, emisor, precios: PRECIOS })
    expect(p.total).toBeCloseTo(p.partidas.reduce((s, x) => s + x.subtotal, 0), 2)
    const metros = p.partidas.filter((x) => x.tipo === 'tuberia').reduce((s, x) => s + x.cantidad, 0)
    expect(metros).toBeCloseTo(resumen.longitudTuberiaM, 0)
    expect(p.sinPrecio).toEqual([])
    expect(p.provisional).toBe(true)
  })

  it('cambia con el diseño, y con los precios sin tocar el código', () => {
    const base = presupuestoDeLaRed({ red, emisor, precios: PRECIOS }).total
    expect(presupuestoDeLaRed({ red: cambiarTramo(red, 'conduccion', { diametroInternoMm: 110 }), emisor, precios: PRECIOS }).total).toBeGreaterThan(base)
    const caros = { ...PRECIOS, emisores: [{ codigo: 'gotero-2', precioUnidad: 5 }] }
    expect(presupuestoDeLaRed({ red, emisor, precios: caros }).total).toBeGreaterThan(base)
  })

  it('lo que no tiene precio se dice, no se cuenta como cero en silencio', () => {
    const p = presupuestoDeLaRed({ red, emisor, precios: { ...PRECIOS, emisores: [] } })
    expect(p.sinPrecio).toEqual(['Emisor gotero-2'])
  })

  it('la reguladora única del cabezal se lista como del cabezal, no como de lateral', () => {
    const conVc = { ...red, elementos: { ...red.elementos, VC: { tipo: 'vrp' as const, consignaM: 20 }, X1: { tipo: 'vrp' as const, consignaM: 10 } } }
    const nombres = presupuestoDeLaRed({ red: conVc, emisor, precios: PRECIOS }).partidas.map((x) => `${x.descripcion}:${x.cantidad}`)
    expect(nombres).toContain('Válvula reguladora del cabezal:1')
    expect(nombres.filter((n) => n.startsWith('Válvula reguladora de los laterales'))).toEqual([
      `Válvula reguladora de los laterales de una curva de nivel:${Object.values(conVc.elementos).filter((e) => e.tipo === 'vrp').length - 1}`,
    ])
  })

  it('nunca es negativo y crece si se agrega una cámara', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DIAMETROS_INTERNOS_MM), (mm) => {
        const cambiada = cambiarTramo(red, 'conduccion', { diametroInternoMm: mm })
        const p = presupuestoDeLaRed({ red: cambiada, emisor, precios: PRECIOS })
        const con = presupuestoDeLaRed({ red: colocarCamara(cambiada, lugarParaCamara(cambiada, 'J1')!), emisor, precios: PRECIOS })
        return p.total > 0 && con.total > p.total
      }),
      { numRuns: DIAMETROS_INTERNOS_MM.length },
    )
  })
})
