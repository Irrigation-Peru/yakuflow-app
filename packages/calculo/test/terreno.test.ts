import { describe, expect, it } from 'vitest'
import {
  areaDePoligono,
  centroideDePoligono,
  desnivelDisponible,
  desproyectarLocal,
  muestrasDeLaParcela,
  pendienteMedia,
  perfilDelTerreno,
  proyectarLocal,
  RADIO_TERRESTRE_M,
} from '../src/terreno/terreno'

describe('área de la parcela', () => {
  it('es exacta para un rectángulo de meridianos y paralelos', () => {
    // Sobre la esfera: R² · Δλ · (sen φ2 − sen φ1)
    const grado = Math.PI / 180
    const esperado = RADIO_TERRESTRE_M ** 2 * grado * Math.sin(grado)
    const area = areaDePoligono([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 1, lon: 0 },
    ])
    expect(Math.abs(area - esperado) / esperado).toBeLessThan(1e-12)
  })

  it('no depende del sentido en que se dibuja el contorno', () => {
    const contorno = [
      { lat: -10.68, lon: -76.26 },
      { lat: -10.68, lon: -76.259 },
      { lat: -10.679, lon: -76.2595 },
    ]
    expect(areaDePoligono(contorno)).toBeCloseTo(areaDePoligono([...contorno].reverse()), 6)
  })

  it('en una parcela chica coincide con la proyección plana', () => {
    // 0.001° de lado en Cerro de Pasco: unos 110 m por 109 m
    const contorno = [
      { lat: -10.68, lon: -76.26 },
      { lat: -10.68, lon: -76.259 },
      { lat: -10.679, lon: -76.259 },
      { lat: -10.679, lon: -76.26 },
    ]
    const grado = Math.PI / 180
    const plana = (RADIO_TERRESTRE_M * 0.001 * grado) ** 2 * Math.cos(-10.6795 * grado)
    expect(Math.abs(areaDePoligono(contorno) - plana) / plana).toBeLessThan(1e-6)
  })

  it('un contorno necesita al menos tres vértices', () => {
    expect(() => areaDePoligono([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }])).toThrow(/tres/)
  })
})

describe('coordenadas locales', () => {
  it('pone el origen en (0, 0) y mide en metros hacia el este y el norte', () => {
    const origen = { lat: -10.68, lon: -76.26 }
    expect(proyectarLocal(origen, origen)).toEqual({ x: 0, y: 0 })
    const norte = proyectarLocal(origen, { lat: -10.679, lon: -76.26 })
    expect(norte.x).toBeCloseTo(0, 9)
    expect(norte.y).toBeCloseTo(RADIO_TERRESTRE_M * 0.001 * (Math.PI / 180), 6)
    expect(proyectarLocal(origen, { lat: -10.68, lon: -76.259 }).x).toBeGreaterThan(0)
  })
})

describe('pendiente media', () => {
  it('ajusta un plano a las cotas y devuelve su inclinación', () => {
    // z = 100 + 0.05 x − 0.02 y: pendiente √(0.05² + 0.02²) = 5.385 %
    const puntos = [
      [0, 0],
      [10, 0],
      [0, 10],
      [10, 10],
      [5, 3],
    ].map(([x, y]) => ({ x: x!, y: y!, z: 100 + 0.05 * x! - 0.02 * y! }))
    expect(pendienteMedia(puntos)).toBeCloseTo(Math.hypot(0.05, 0.02), 12)
  })

  it('un terreno plano no tiene pendiente', () => {
    const puntos = [
      { x: 0, y: 0, z: 3000 },
      { x: 30, y: 0, z: 3000 },
      { x: 0, y: 30, z: 3000 },
    ]
    expect(pendienteMedia(puntos)).toBeCloseTo(0, 14)
  })

  it('con puntos alineados no se puede ajustar un plano', () => {
    const puntos = [0, 1, 2].map((i) => ({ x: i, y: i, z: i }))
    expect(() => pendienteMedia(puntos)).toThrow(/alineados/)
  })
})

describe('perfil del terreno', () => {
  it('acumula la distancia horizontal entre puntos', () => {
    const perfil = perfilDelTerreno([
      { x: 0, y: 0, z: 3050 },
      { x: 30, y: 40, z: 3040 },
      { x: 30, y: 52, z: 3045 },
    ])
    expect(perfil).toEqual([
      { distanciaM: 0, cota: 3050 },
      { distanciaM: 50, cota: 3040 },
      { distanciaM: 62, cota: 3045 },
    ])
  })
})

describe('desnivel disponible entre la fuente y la parcela', () => {
  it('se mide hasta el punto más alto de la parcela, que es el más desfavorable', () => {
    const d = desnivelDisponible(3050, [3000, 3010, 3005])
    expect(d.disponibleM).toBe(40)
    expect(d.maximoM).toBe(50)
  })

  it('es negativo si la parcela queda por encima de la fuente', () => {
    expect(desnivelDisponible(3000, [3002, 2990]).disponibleM).toBe(-2)
  })
})

describe('muestras de la parcela', () => {
  const origen = { lat: -10.68, lon: -76.25 }
  const enMetros = (x: number, y: number) => desproyectarLocal(origen, { x, y })
  const local = (p: { lat: number; lon: number }) => proyectarLocal(origen, p)

  it('desproyectar deshace la proyección local', () => {
    const p = local(desproyectarLocal(origen, { x: 123.4, y: -56.7 }))
    expect(p.x).toBeCloseTo(123.4, 9)
    expect(p.y).toBeCloseTo(-56.7, 9)
  })

  it('incluye los vértices y reparte el resto dentro del contorno, sin pasar del máximo', () => {
    const cuadrado = [enMetros(0, 0), enMetros(100, 0), enMetros(100, 100), enMetros(0, 100)]
    const muestras = muestrasDeLaParcela(cuadrado, 50)
    expect(muestras.slice(0, 4)).toEqual(cuadrado)
    expect(muestras.length).toBeLessThanOrEqual(50)
    // La cuadrícula es cuadrada: con 46 puntos libres pasa de 7 × 7, que no entra, a 6 × 6.
    expect(muestras.length).toBeGreaterThanOrEqual(25)
    for (const m of muestras.slice(4)) {
      const { x, y } = local(m)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(100)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(100)
    }
  })

  it('deja fuera el entrante de una parcela cóncava', () => {
    // Una L: el cuadrado de 100 m sin su cuarto superior derecho.
    const ele = [enMetros(0, 0), enMetros(100, 0), enMetros(100, 50), enMetros(50, 50), enMetros(50, 100), enMetros(0, 100)]
    const interiores = muestrasDeLaParcela(ele, 60).slice(ele.length).map(local)
    expect(interiores.length).toBeGreaterThan(30)
    expect(interiores.filter((p) => p.x > 50 && p.y > 50)).toEqual([])
  })

  it('siempre devuelve lo mismo para el mismo contorno', () => {
    const triangulo = [enMetros(0, 0), enMetros(80, 10), enMetros(30, 70)]
    expect(muestrasDeLaParcela(triangulo, 30)).toEqual(muestrasDeLaParcela(triangulo, 30))
  })
})

describe('contornos sin área', () => {
  const origen = { lat: -10.68, lon: -76.25 }
  const enMetros = (x: number, y: number) => desproyectarLocal(origen, { x, y })

  it('no se muestrean: un contorno de vértices alineados no encierra nada', () => {
    const alineados = [enMetros(0, 0), enMetros(50, 0), enMetros(100, 0)]
    expect(() => muestrasDeLaParcela(alineados, 50)).toThrow(/no encierra área/)
  })
})

describe('centroide de la parcela', () => {
  const origen = { lat: -10.68, lon: -76.25 }
  const enMetros = (x: number, y: number) => desproyectarLocal(origen, { x, y })

  it('es el centro de un cuadrado', () => {
    const c = proyectarLocal(origen, centroideDePoligono([enMetros(0, 0), enMetros(100, 0), enMetros(100, 100), enMetros(0, 100)]))
    expect(c.x).toBeCloseTo(50, 6)
    expect(c.y).toBeCloseTo(50, 6)
  })

  it('pesa por el área y no por los vértices', () => {
    // Un rectángulo de 100 × 20 m con muchos vértices amontonados en un extremo.
    const contorno = [enMetros(0, 0), enMetros(1, 0), enMetros(2, 0), enMetros(3, 0), enMetros(100, 0), enMetros(100, 20), enMetros(0, 20)]
    const c = proyectarLocal(origen, centroideDePoligono(contorno))
    expect(c.x).toBeCloseTo(50, 6)
    expect(c.y).toBeCloseTo(10, 6)
  })
})
