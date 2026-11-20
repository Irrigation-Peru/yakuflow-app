import { describe, expect, it } from 'vitest'
import { calcularRed } from '../src/hidraulica/red'
import type { Red } from '../src/hidraulica/tipos'

// HU0003: la red completa con Hazen-Williams y pérdidas locales. Criterio 1, la longitud inclinada; criterio 2, la
// pérdida del cabezal descontada de la presión disponible; criterio 3, el caudal de cada emisor sale de su curva
// con la presión de su nodo.

// Los valores esperados se derivaron aparte, en Python, con las fórmulas del método escritas de nuevo.
// Un emisor con x = 0 entrega un caudal constante: así el resultado se puede calcular a mano.

const errorRelativo = (obtenido: number, esperado: number) => Math.abs(obtenido - esperado) / Math.abs(esperado)

function tramo(id: string, desde: string, hasta: string, diametroInternoMm: number) {
  return { id, desde, hasta, diametroInternoMm, c: 140 }
}

describe('un tramo inclinado hasta un emisor', () => {
  const red: Red = {
    nodos: [
      { id: 'F', x: 0, y: 0, z: 100 },
      { id: 'E', x: 30, y: 0, z: 90 },
    ],
    tramos: [tramo('t1', 'F', 'E', 50.8)],
    emisores: [{ nodo: 'E', k: 7200, x: 0 }],
    fuente: { nodo: 'F', presionInicialM: 2.5 },
  }
  const r = calcularRed(red)

  it('calcula la pérdida con la longitud inclinada', () => {
    expect(r.tramos.t1!.longitudInclinadaM).toBeCloseTo(31.622776601683793, 12)
    expect(errorRelativo(r.nodos.E!.presionM, 11.783211986107183)).toBeLessThan(1e-12)
  })

  it('el caudal del tramo es el del emisor que alimenta', () => {
    expect(r.tramos.t1!.caudalLps).toBeCloseTo(2, 12)
    expect(r.caudalFuenteLps).toBeCloseTo(2, 12)
  })

  it('la cota piezométrica es la cota más la presión', () => {
    expect(r.nodos.E!.cotaPiezometrica).toBeCloseTo(90 + 11.783211986107183, 10)
  })
})

describe('cabezal de filtrado', () => {
  const red: Red = {
    nodos: [
      { id: 'F', x: 0, y: 0, z: 100 },
      { id: 'C', x: 10, y: 0, z: 100 },
      { id: 'E', x: 20, y: 0, z: 100 },
    ],
    tramos: [tramo('t1', 'F', 'C', 25.4), tramo('t2', 'C', 'E', 25.4)],
    emisores: [{ nodo: 'E', k: 3600, x: 0 }],
    elementos: { C: { tipo: 'cabezal', perdidaM: 7 } },
    fuente: { nodo: 'F', presionInicialM: 30 },
  }
  const r = calcularRed(red)

  it('descuenta su pérdida antes de repartir la presión', () => {
    expect(errorRelativo(r.nodos.C!.presionLlegadaM, 28.16134045193795)).toBeLessThan(1e-12)
    expect(errorRelativo(r.nodos.C!.presionM, 21.16134045193795)).toBeLessThan(1e-12)
    expect(errorRelativo(r.nodos.E!.presionM, 19.3226809038759)).toBeLessThan(1e-12)
  })
})

describe('caudal de cada emisor', () => {
  // Aspersor con q = 300 · P^0.5 (l/h): el caudal depende de la presión y la presión del caudal.
  const red: Red = {
    nodos: [
      { id: 'F', x: 0, y: 0, z: 100 },
      { id: 'E', x: 50, y: 0, z: 80 },
    ],
    tramos: [tramo('t1', 'F', 'E', 25.4)],
    emisores: [{ nodo: 'E', k: 300, x: 0.5 }],
    fuente: { nodo: 'F', presionInicialM: 0 },
  }
  const r = calcularRed(red)

  it('converge al punto donde caudal y presión son coherentes', () => {
    expect(r.convergio).toBe(true)
    expect(errorRelativo(r.nodos.E!.presionM, 18.515165519568797)).toBeLessThan(1e-9)
    expect(errorRelativo(r.nodos.E!.caudalEmisorLph!, 1290.8775684630948)).toBeLessThan(1e-9)
  })

  it('sale de la ecuación del emisor con la presión de su nodo', () => {
    const p = r.nodos.E!.presionM
    expect(errorRelativo(r.nodos.E!.caudalEmisorLph!, 300 * p ** 0.5)).toBeLessThan(1e-9)
  })
})

describe('red ramificada', () => {
  const red: Red = {
    nodos: [
      { id: 'F', x: 0, y: 0, z: 100 },
      { id: 'A', x: 20, y: 0, z: 100 },
      { id: 'B', x: 20, y: 15, z: 100 },
      { id: 'C', x: 20, y: -10, z: 100 },
    ],
    tramos: [tramo('t1', 'F', 'A', 38.1), tramo('t2', 'A', 'B', 38.1), tramo('t3', 'A', 'C', 38.1)],
    emisores: [
      { nodo: 'B', k: 3600, x: 0 },
      { nodo: 'C', k: 1800, x: 0 },
    ],
    fuente: { nodo: 'F', presionInicialM: 20 },
  }
  const r = calcularRed(red)

  it('el caudal de un tramo es la suma de los emisores aguas abajo', () => {
    expect(r.tramos.t1!.caudalLps).toBeCloseTo(1.5, 12)
    expect(r.tramos.t2!.caudalLps).toBeCloseTo(1, 12)
    expect(r.tramos.t3!.caudalLps).toBeCloseTo(0.5, 12)
  })

  it('cada rama pierde según su propio caudal', () => {
    expect(errorRelativo(r.nodos.A!.presionM, 18.919223943721217)).toBeLessThan(1e-12)
    expect(errorRelativo(r.nodos.B!.presionM, 18.536374386798055)).toBeLessThan(1e-12)
    expect(errorRelativo(r.nodos.C!.presionM, 18.848424246928445)).toBeLessThan(1e-12)
  })
})

describe('elementos de control de presión', () => {
  it('la cámara rompe-presión deja la presión en cero y la reconstruye aguas abajo', () => {
    const r = calcularRed({
      nodos: [
        { id: 'F', x: 0, y: 0, z: 200 },
        { id: 'R', x: 100, y: 0, z: 150 },
        { id: 'E', x: 150, y: 0, z: 120 },
      ],
      tramos: [tramo('t1', 'F', 'R', 25.4), tramo('t2', 'R', 'E', 25.4)],
      emisores: [{ nodo: 'E', k: 2880, x: 0 }],
      elementos: { R: { tipo: 'crp' } },
      fuente: { nodo: 'F', presionInicialM: 0 },
    })
    expect(errorRelativo(r.nodos.R!.presionLlegadaM, 36.39580639713283)).toBeLessThan(1e-12)
    expect(r.nodos.R!.presionM).toBe(0)
    expect(errorRelativo(r.nodos.E!.presionM, 22.90492066746767)).toBeLessThan(1e-12)
  })

  it('la válvula reductora recorta la presión a su consigna', () => {
    const r = calcularRed({
      nodos: [
        { id: 'F', x: 0, y: 0, z: 150 },
        { id: 'V', x: 100, y: 0, z: 100 },
        { id: 'E', x: 120, y: 0, z: 100 },
      ],
      tramos: [tramo('t1', 'F', 'V', 25.4), tramo('t2', 'V', 'E', 25.4)],
      emisores: [{ nodo: 'E', k: 1800, x: 0 }],
      elementos: { V: { tipo: 'vrp', consignaM: 20 } },
      fuente: { nodo: 'F', presionInicialM: 0 },
    })
    expect(errorRelativo(r.nodos.V!.presionLlegadaM, 44.297689838300364)).toBeLessThan(1e-12)
    expect(r.nodos.V!.presionM).toBe(20)
    expect(errorRelativo(r.nodos.E!.presionM, 18.979939747972143)).toBeLessThan(1e-12)
  })

  it('la válvula reductora no sube una presión que ya está bajo su consigna', () => {
    const r = calcularRed({
      nodos: [
        { id: 'F', x: 0, y: 0, z: 110 },
        { id: 'V', x: 50, y: 0, z: 100 },
      ],
      tramos: [tramo('t1', 'F', 'V', 50.8)],
      emisores: [],
      elementos: { V: { tipo: 'vrp', consignaM: 20 } },
      fuente: { nodo: 'F', presionInicialM: 0 },
    })
    expect(r.nodos.V!.presionM).toBeCloseTo(10, 12)
  })
})

describe('válvulas cerradas', () => {
  // Con todos los sectores cerrados no circula agua: la presión sube a todo el desnivel (CE5).
  const red: Red = {
    nodos: [
      { id: 'F', x: 0, y: 0, z: 200 },
      { id: 'A', x: 80, y: 0, z: 160 },
      { id: 'E', x: 120, y: 0, z: 130 },
    ],
    tramos: [tramo('t1', 'F', 'A', 25.4), tramo('t2', 'A', 'E', 25.4)],
    emisores: [{ nodo: 'E', k: 3600, x: 0, sector: 's1' }],
    fuente: { nodo: 'F', presionInicialM: 1.5 },
  }

  it('la presión estática es todo el desnivel desde la fuente', () => {
    const r = calcularRed(red, { sectoresAbiertos: [] })
    expect(r.caudalFuenteLps).toBe(0)
    expect(r.nodos.A!.presionM).toBeCloseTo(41.5, 12)
    expect(r.nodos.E!.presionM).toBeCloseTo(71.5, 12)
  })

  it('regando, la presión es menor que la estática', () => {
    const regando = calcularRed(red, { sectoresAbiertos: ['s1'] })
    expect(regando.nodos.E!.presionM).toBeLessThan(71.5)
    expect(regando.caudalFuenteLps).toBeCloseTo(1, 12)
  })

  it('una cámara rompe-presión corta la presión estática', () => {
    const r = calcularRed({ ...red, elementos: { A: { tipo: 'crp' } } }, { sectoresAbiertos: [] })
    expect(r.nodos.E!.presionM).toBeCloseTo(30, 12)
  })
})

describe('comprobaciones del método', () => {
  const base = (largoM: number, caidaM: number, diametroInternoMm: number, k: number, presionInicialM = 0): Red => ({
    nodos: [
      { id: 'F', x: 0, y: 0, z: 100 + caidaM },
      { id: 'E', x: largoM, y: 0, z: 100 },
    ],
    tramos: [{ ...tramo('t1', 'F', 'E', diametroInternoMm), presionMaximaM: 50 }],
    emisores: [{ nodo: 'E', k, x: 0 }],
    fuente: { nodo: 'F', presionInicialM },
  })

  it('clasifica la velocidad: sedimenta bajo 0.6 m/s, vibra sobre 3 m/s', () => {
    // 1 l/s en 2": v = 0.49 m/s · 1 l/s en 1": v = 1.97 m/s · 2 l/s en 3/4": v = 7.0 m/s, en un tramo
    // corto y con carga suficiente para que el agua llegue (pierde 2.7 m en 1 m).
    expect(calcularRed(base(100, 10, 50.8, 3600)).tramos.t1!.estadoVelocidad).toBe('sedimentacion')
    expect(calcularRed(base(100, 10, 25.4, 3600)).tramos.t1!.estadoVelocidad).toBe('adecuada')
    expect(calcularRed(base(1, 0, 19.05, 7200, 50)).tramos.t1!.estadoVelocidad).toBe('vibracion')
  })

  it('marca el tramo cuya presión supera la clase de la tubería', () => {
    expect(calcularRed(base(100, 40, 50.8, 3600)).tramos.t1!.cumpleClase).toBe(true)
    expect(calcularRed(base(100, 49, 50.8, 3600), { sectoresAbiertos: [] }).tramos.t1!.cumpleClase).toBe(true)
    expect(calcularRed(base(100, 55, 50.8, 3600)).tramos.t1!.cumpleClase).toBe(false)
  })

  it('rechaza un tramo de más de 500 m', () => {
    const r = calcularRed(base(520, 10, 50.8, 3600))
    expect(r.rechazos).toContainEqual({ tipo: 'tramo-largo', tramo: 't1', longitudM: expect.closeTo(520.096, 3) })
  })

  it('rechaza un desnivel de más de 50 m sin cámara rompe-presión', () => {
    const r = calcularRed(base(200, 60, 50.8, 3600))
    expect(r.rechazos).toContainEqual({ tipo: 'desnivel-sin-crp', nodo: 'E', desnivelM: 60 })
  })

  it('acepta el mismo desnivel si una cámara lo parte', () => {
    const r = calcularRed({
      nodos: [
        { id: 'F', x: 0, y: 0, z: 160 },
        { id: 'R', x: 100, y: 0, z: 130 },
        { id: 'E', x: 200, y: 0, z: 100 },
      ],
      tramos: [tramo('t1', 'F', 'R', 50.8), tramo('t2', 'R', 'E', 50.8)],
      emisores: [{ nodo: 'E', k: 3600, x: 0 }],
      elementos: { R: { tipo: 'crp' } },
      fuente: { nodo: 'F', presionInicialM: 0 },
    })
    expect(r.rechazos).toEqual([])
  })
})

describe('validación de la red', () => {
  const nodos = [
    { id: 'F', x: 0, y: 0, z: 100 },
    { id: 'A', x: 10, y: 0, z: 100 },
    { id: 'B', x: 20, y: 0, z: 100 },
  ]
  const fuente = { nodo: 'F', presionInicialM: 10 }

  it('rechaza una malla: solo se admiten redes abiertas', () => {
    const malla: Red = {
      nodos,
      tramos: [tramo('t1', 'F', 'A', 25.4), tramo('t2', 'A', 'B', 25.4), tramo('t3', 'B', 'F', 25.4)],
      emisores: [],
      fuente,
    }
    expect(() => calcularRed(malla)).toThrow(/malla/)
  })

  it('rechaza un nodo que no está conectado a la fuente', () => {
    expect(() => calcularRed({ nodos, tramos: [tramo('t1', 'F', 'A', 25.4)], emisores: [], fuente })).toThrow(/B/)
  })

  it('rechaza un tramo que apunta a un nodo inexistente', () => {
    expect(() =>
      calcularRed({ nodos, tramos: [tramo('t1', 'F', 'A', 25.4), tramo('t2', 'A', 'X', 25.4)], emisores: [], fuente }),
    ).toThrow(/X/)
  })

  const conEmisor = (k: number, x: number): Red => ({
    nodos,
    tramos: [tramo('t1', 'F', 'A', 25.4), tramo('t2', 'A', 'B', 25.4)],
    emisores: [{ nodo: 'B', k, x }],
    fuente,
  })

  it('acepta el exponente de un autocompensante (0) y los de catálogo, entre 0.01 y 1', () => {
    for (const x of [0, 0.01, 0.5, 1]) expect(calcularRed(conEmisor(2, x)).convergio).toBe(true)
  })

  it('rechaza un exponente de emisor que ningún catálogo da', () => {
    for (const x of [5e-323, 0.005, 1.2, -0.1, Number.NaN]) expect(() => calcularRed(conEmisor(2, x))).toThrow(/exponente/)
  })

  it('rechaza un emisor sin coeficiente de caudal', () => {
    for (const k of [0, -1, Number.NaN]) expect(() => calcularRed(conEmisor(k, 0.5))).toThrow(/coeficiente/)
  })
})
