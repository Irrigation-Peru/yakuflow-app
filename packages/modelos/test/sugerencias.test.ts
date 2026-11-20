import { RASGOS_DEL_LUGAR } from '@riego/calculo'
import { describe, expect, it } from 'vitest'
import { MES_DE_LA_CAMPANA, mesDeLaCampana, sugerirCultivos, type MetadatosDelModelo, type Predecir } from '../src/sugerencias'

// HU0011: tres cultivos con su probabilidad y la condición que más pesó. La condición se mide por oclusión: se lleva
// cada rasgo a la mediana del entrenamiento y se ve cuánto baja la probabilidad.

const metadatos: MetadatosDelModelo = {
  nombre: 'cultivos',
  version: 'prueba',
  rasgos: RASGOS_DEL_LUGAR,
  clases: ['Papa', 'Avena', 'Cebada', 'Maíz, grano'],
  medianas: RASGOS_DEL_LUGAR.map(() => 0),
  metricas: {},
  conjunto: 'de prueba',
  entrenadoEn: '2026-10-29T00:00:00Z',
  archivo: 'cultivos.onnx',
}

// Un modelo de juguete: la papa depende de la altitud (rasgo 0) y la avena del pH (rasgo 7).
const juguete: Predecir = async (filas) =>
  filas.map((f) => {
    const papa = f[0]! > 0 ? 0.5 : 0.1
    const avena = f[7]! > 0 ? 0.3 : 0.05
    return [papa, avena, 0.15, 1 - papa - avena - 0.15]
  })

const rasgos = RASGOS_DEL_LUGAR.map(() => 1)

describe('sugerencias del modelo de cultivos', () => {
  it('devuelve los tres más probables en orden, con su probabilidad', async () => {
    const sugerencias = await sugerirCultivos({ rasgos, metadatos, predecir: juguete })
    expect(sugerencias.map((s) => [s.orden, s.cultivo, s.probabilidad])).toEqual([
      [1, 'Papa', 0.5],
      [2, 'Avena', 0.3],
      [3, 'Cebada', 0.15],
    ])
  })

  it('la condición más influyente es la que más baja la probabilidad al llevarla a la mediana', async () => {
    const [papa, avena] = await sugerirCultivos({ rasgos, metadatos, predecir: juguete })
    expect(papa!.rasgoMasInfluyente).toBe('altitudM')
    expect(papa!.pesos.altitudM).toBeCloseTo(0.4, 12)
    expect(avena!.rasgoMasInfluyente).toBe('phDelSuelo')
    expect(avena!.pesos.altitudM).toBe(0)
  })

  it('toma por nombre los rasgos que el modelo usa, aunque sean menos que los del lugar', async () => {
    const pedidas: (readonly number[])[] = []
    const delLugar = RASGOS_DEL_LUGAR.map((_, i) => i * 10)
    const [primera] = await sugerirCultivos({
      rasgos: delLugar,
      metadatos: { ...metadatos, rasgos: ['phDelSuelo', 'altitudM'], medianas: [-1, -2] },
      predecir: async (filas) => {
        pedidas.push(...filas)
        return filas.map(() => [0.4, 0.3, 0.2, 0.1])
      },
    })
    expect(pedidas).toEqual([
      [70, 0],
      [-1, 0],
      [70, -2],
    ])
    expect(Object.keys(primera!.pesos)).toEqual(['phDelSuelo', 'altitudM'])
  })

  it('pide todo al modelo de una vez: el lugar y una fila por rasgo ocluido', async () => {
    const pedidos: number[] = []
    await sugerirCultivos({
      rasgos,
      metadatos,
      predecir: async (filas) => {
        pedidos.push(filas.length)
        return juguete(filas)
      },
    })
    expect(pedidos).toEqual([1 + RASGOS_DEL_LUGAR.length])
  })

  it('rechaza rasgos que no son los que el modelo espera', async () => {
    await expect(sugerirCultivos({ rasgos: [1, 2], metadatos, predecir: juguete })).rejects.toThrow(/tiene 9 rasgos/)
  })

  it('sin el mes entre sus entradas, no sugiere mes de siembra', async () => {
    const sugerencias = await sugerirCultivos({ rasgos, metadatos, predecir: juguete })
    expect(sugerencias.map((s) => s.mesDeSiembra)).toEqual([null, null, null])
  })
})

describe('sugerencias con el mes de siembra', () => {
  // A cada mes le toca una parte de las siembras; los que no se nombran se reparten lo que queda.
  const calendario = (partes: Record<number, number>) => {
    const resto = (1 - Object.values(partes).reduce((s, p) => s + p, 0)) / (12 - Object.keys(partes).length)
    return Array.from({ length: 12 }, (_, i) => partes[i + 1] ?? resto)
  }
  const conMes: MetadatosDelModelo = {
    ...metadatos,
    rasgos: ['altitudM', MES_DE_LA_CAMPANA],
    clases: ['Papa', 'Avena'],
    medianas: [0, 0],
    // Hasta 1000 m se siembra sobre todo en marzo; más arriba, en octubre y diciembre.
    siembrasPorMes: { bandaM: 1000, proporciones: [calendario({ 3: 0.5 }), calendario({ 10: 0.4, 12: 0.3 })] },
  }
  // La papa se siembra en octubre y la avena en diciembre (meses 3 y 5 de la campaña); en los demás, mitad y mitad.
  const juguete: Predecir = async (filas) =>
    filas.map((f) => {
      const papa = f[1] === mesDeLaCampana(10) ? 0.9 : f[1] === mesDeLaCampana(12) ? 0.1 : 0.5
      return [papa, 1 - papa]
    })
  const lugar = (altitudM: number) => RASGOS_DEL_LUGAR.map((r) => (r === 'altitudM' ? altitudM : 1))

  it('cuenta los meses desde agosto, como la campaña agrícola', () => {
    expect([8, 9, 12, 1, 7].map(mesDeLaCampana)).toEqual([1, 2, 5, 6, 12])
  })

  it('prueba los doce meses y a cada cultivo le sugiere el mes en que más se siembra', async () => {
    const [papa, avena] = await sugerirCultivos({ rasgos: lugar(3500), metadatos: conMes, predecir: juguete })
    expect([papa!.cultivo, papa!.mesDeSiembra]).toEqual(['Papa', 10])
    expect([avena!.cultivo, avena!.mesDeSiembra]).toEqual(['Avena', 12])
    // La de sembrarlo en algún mes: octubre 0.4 × 0.9, diciembre 0.3 × 0.1 y los otros diez, 0.03 × 0.5.
    expect(papa!.probabilidad).toBeCloseTo(0.36 + 0.03 + 10 * 0.015, 12)
    expect(papa!.probabilidad + avena!.probabilidad).toBeCloseTo(1, 12)
  })

  it('a otra altitud, otro calendario: sobre la última banda se usa la última', async () => {
    const [enElValle] = await sugerirCultivos({ rasgos: lugar(500), metadatos: conMes, predecir: juguete })
    const [muyAlto] = await sugerirCultivos({ rasgos: lugar(9000), metadatos: conMes, predecir: juguete })
    expect(enElValle!.mesDeSiembra).toBe(3)
    expect(muyAlto!.mesDeSiembra).toBe(10)
  })

  it('sin las siembras por mes, los doce meses pesan lo mismo', async () => {
    const { siembrasPorMes: _, ...sinCalendario } = conMes
    const [papa] = await sugerirCultivos({ rasgos: lugar(3500), metadatos: sinCalendario, predecir: juguete })
    expect(papa!.probabilidad).toBeCloseTo((0.9 + 0.1 + 10 * 0.5) / 12, 12)
  })

  it('el mes no entra en la condición que más pesó', async () => {
    const [papa] = await sugerirCultivos({ rasgos: lugar(3500), metadatos: conMes, predecir: juguete })
    expect(Object.keys(papa!.pesos)).toEqual(['altitudM'])
    expect(papa!.rasgoMasInfluyente).toBe('altitudM')
  })

  it('pide en una sola vez los doce meses del lugar y los de cada rasgo ocluido', async () => {
    const pedidas: (readonly number[])[] = []
    await sugerirCultivos({
      rasgos: lugar(3500),
      metadatos: conMes,
      predecir: async (filas) => {
        pedidas.push(...filas)
        return juguete(filas)
      },
    })
    expect(pedidas).toHaveLength(2 * 12)
    expect(pedidas.slice(0, 12).map((f) => f[1])).toEqual([6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5])
    expect(pedidas.slice(12).every((f) => f[0] === 0)).toBe(true)
  })
})
