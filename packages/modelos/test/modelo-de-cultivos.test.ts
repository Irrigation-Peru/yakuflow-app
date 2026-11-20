import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOGO_FAO56, RASGOS_DEL_LUGAR } from '@riego/calculo'
import * as ort from 'onnxruntime-web'
import { beforeAll, describe, expect, it } from 'vitest'
import { MES_DE_LA_CAMPANA, sugerirCultivos, type MetadatosDelModelo, type Predecir } from '../src/sugerencias'

// El modelo exportado, tal como lo carga el navegador: el mismo archivo, con onnxruntime-web. Sus cifras con los datos
// reales se miden en crop-ml, por validación cruzada por zona (HU0024); aquí se comprueba lo que la aplicación necesita.

const raiz = join(import.meta.dirname, '..')
const metadatos = JSON.parse(readFileSync(join(raiz, 'cultivos.json'), 'utf8')) as MetadatosDelModelo

let predecir: Predecir
beforeAll(async () => {
  ort.env.wasm.numThreads = 1
  const sesion = await ort.InferenceSession.create(readFileSync(join(raiz, metadatos.archivo)))
  predecir = async (filas) => {
    const entrada = new ort.Tensor('float32', Float32Array.from(filas.flat()), [filas.length, metadatos.rasgos.length])
    const salida = await sesion.run({ [sesion.inputNames[0]!]: entrada })
    const probabilidades = salida[sesion.outputNames[1]!]!.data as Float32Array
    const clases = metadatos.clases.length
    return filas.map((_, i) => Array.from(probabilidades.subarray(i * clases, (i + 1) * clases)))
  }
})

describe('modelo de cultivos exportado', () => {
  it('sus rasgos son del módulo de cálculo y sus clases, cultivos del catálogo', () => {
    for (const rasgo of metadatos.rasgos) if (rasgo !== MES_DE_LA_CAMPANA) expect(RASGOS_DEL_LUGAR).toContain(rasgo)
    // Además del lugar, el mes de siembra, con la parte de las siembras de cada mes por banda de altitud.
    expect(metadatos.rasgos).toContain(MES_DE_LA_CAMPANA)
    for (const fila of metadatos.siembrasPorMes!.proporciones) {
      expect(fila).toHaveLength(12)
      expect(fila.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 2)
    }
    // Ni la oferta de agua ni la conductividad tienen dato real en la ENA 2024.
    expect(metadatos.rasgos).not.toContain('ofertaDeAguaMmDia')
    expect(metadatos.rasgos).not.toContain('conductividadDelAguaDsM')
    const catalogo = CATALOGO_FAO56.map((c) => c.nombre)
    for (const clase of metadatos.clases) expect(catalogo).toContain(clase)
    expect(metadatos.medianas).toHaveLength(metadatos.rasgos.length)
  })

  it('las probabilidades de cada lugar suman uno', async () => {
    const [fila] = await predecir([metadatos.medianas])
    expect(fila!.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 5)
  })

  it('supera a la línea base y da lo mismo en ONNX que en scikit-learn', () => {
    const m = metadatos.metricas as {
      modelo: Record<string, number>
      lineaBaseRegionYMes: Record<string, number>
      diferenciaMaximaConOnnx: number
    }
    for (const medida of ['exactitudTop3', 'f1Macro', 'primeroSeSiembraEseMes', 'primeroSeCosechaEnElLugar']) {
      expect(m.modelo[medida]).toBeGreaterThan(m.lineaBaseRegionYMes[medida]!)
    }
    expect(m.diferenciaMaximaConOnnx).toBeLessThan(1e-4)
  })

  it('en la puna sugiere primero lo que ahí se cosecha, y en la costa no sugiere lo mismo', async () => {
    const lugar = (valores: Partial<Record<(typeof RASGOS_DEL_LUGAR)[number], number>>) => RASGOS_DEL_LUGAR.map((r) => valores[r] ?? 0)
    const puna = lugar({ altitudM: 3900, temperaturaMediaAnualC: 7, minimaDelMesMasFrioC: -1, et0MediaMmDia: 3.4, lluviaAnualMm: 800, phDelSuelo: 5.5, texturaGruesa: 1 })
    const costa = lugar({ altitudM: 300, temperaturaMediaAnualC: 21, minimaDelMesMasFrioC: 14, et0MediaMmDia: 4.2, lluviaAnualMm: 30, phDelSuelo: 7.8, texturaGruesa: 1 })
    const [enLaPuna] = await sugerirCultivos({ rasgos: puna, metadatos, predecir })
    const [enLaCosta] = await sugerirCultivos({ rasgos: costa, metadatos, predecir })
    expect(enLaPuna!.cultivo).toBe('Papa')
    expect(enLaCosta!.cultivo).not.toBe('Papa')
    // En la sierra, la papa se siembra con las primeras lluvias, de septiembre a noviembre.
    expect([9, 10, 11]).toContain(enLaPuna!.mesDeSiembra)
  })
})
