import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  analisisDeLaRed,
  aplicarCambios,
  emisorDelCatalogo,
  generarRed,
  modificacionesPosibles,
  PERDIDA_CABEZAL_TIPICA_M,
  RASGOS_DE_LA_MODIFICACION,
  SUMERGENCIA_DE_LA_SALIDA_M,
  valorDelDiseno,
  type CatalogoDePrecios,
  type DisenoAValorar,
} from '@riego/calculo'
import { describe, expect, it } from 'vitest'
import { ordenDelModelo, proponerAlternativas, type MetadatosDelSustituto, type PredecirSustituto } from '../src/alternativas'

// HU0026: el modelo ordena, el módulo decide. Con un modelo falso se comprueba lo que importa de verdad: que lo que no
// funciona no aparece aunque el modelo diga que es buenísimo.

const PRECIOS: CatalogoDePrecios = JSON.parse(readFileSync(join(import.meta.dirname, '../../../apps/api/catalogo/precios-provisionales.json'), 'utf8'))
const METADATOS: MetadatosDelSustituto = {
  nombre: 'sustituto',
  version: 'de-prueba',
  rasgos: RASGOS_DE_LA_MODIFICACION,
  salidas: ['costoPct', 'uniformidad', 'margenM', 'funciona'],
  metricas: {},
  conjunto: 'De prueba',
  entrenadoEn: '2026-11-07T00:00:00+00:00',
  archivo: 'sustituto.onnx',
}

function disenoDePrueba(): DisenoAValorar {
  const emisor = emisorDelCatalogo('gotero-2')
  const cota = (_x: number, y: number) => 3000 + 0.05 * y
  const contorno = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 80 },
    { x: 0, y: 80 },
  ].map((p) => ({ ...p, z: cota(p.x, p.y) }))
  const { red, sectores } = generarRed({
    contorno,
    fuente: { x: 40, y: 400, z: 3024, presionInicialM: SUMERGENCIA_DE_LA_SALIDA_M },
    camarasDeLaConduccion: [],
    cotaEn: cota,
    emisor: { caudalNominalLph: emisor.caudalNominalLph, presionNominalM: emisor.presionNominalM, coeficienteK: emisor.coeficienteK, exponenteX: emisor.exponenteX },
    separacionM: 0.3,
    separacionLateralesM: 0.9,
    turnos: 2,
    perdidaCabezalM: PERDIDA_CABEZAL_TIPICA_M.goteo,
  })
  return { red, sectores, presionNominalEmisorM: emisor.presionNominalM, emisor: { codigo: emisor.codigo, coeficienteK: emisor.coeficienteK }, precios: PRECIOS }
}

const diseno = disenoDePrueba()
/** Un modelo que estima lo mismo para todo y dice que todo funciona: el peor caso para el filtro del módulo. */
const optimista: PredecirSustituto = async (filas) => filas.map((_, i) => [-i, i, i, 1])

// Cada propuesta recalcula una red completa: con todo el repositorio probándose a la vez tarda más de los 5 s por defecto.
describe('proponer alternativas (HU0026)', { timeout: 60_000 }, () => {
  it('toda alternativa funciona y mejora en algo según el módulo, diga lo que diga el modelo', async () => {
    const { alternativas, partida, estadisticas } = await proponerAlternativas({ diseno, metadatos: METADATOS, predecir: optimista })
    expect(estadisticas.recalculadas).toBeGreaterThan(0)
    expect(estadisticas.recalculadas).toBeLessThanOrEqual(18)
    for (const a of alternativas) {
      expect(a.valor.funciona).toBe(true)
      const recalculada = valorDelDiseno({ ...diseno, red: a.red })
      expect(recalculada).toEqual(a.valor)
      expect(analisisDeLaRed({ ...diseno, red: a.red }).funciona).toBe(true)
      expect(a.diferencia.costoPct).toBeCloseTo(((a.valor.costo - partida.costo) / partida.costo) * 100, 6)
    }
  })

  it('cada alternativa describe qué cambió tramo por tramo', async () => {
    const { alternativas } = await proponerAlternativas({ diseno, metadatos: METADATOS, predecir: optimista })
    expect(alternativas.length).toBeGreaterThan(0)
    for (const a of alternativas) {
      expect(a.descripcion).not.toBe('')
      expect(a.porTramo.length).toBeGreaterThan(0)
      for (const c of a.porTramo) {
        const distinto = c.antes.diametroInternoMm !== c.ahora.diametroInternoMm || c.antes.clase !== c.ahora.clase
        expect(distinto, c.tramo).toBe(true)
      }
    }
  })

  it('un modelo que estima que nada funciona no deja proponer nada', async () => {
    const pesimista: PredecirSustituto = async (filas) => filas.map(() => [0, 0, 0, 0])
    const { alternativas, estadisticas } = await proponerAlternativas({ diseno, metadatos: METADATOS, predecir: pesimista })
    expect(alternativas).toEqual([])
    expect(estadisticas.recalculadas).toBe(0)
  })

  it('no se proponen alternativas a un diseño que no funciona', async () => {
    const red = aplicarCambios(diseno.red, [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 13.6 }])
    expect(analisisDeLaRed({ ...diseno, red }).funciona).toBe(false)
    await expect(proponerAlternativas({ diseno: { ...diseno, red }, metadatos: METADATOS, predecir: optimista })).rejects.toThrow('ya funciona')
  })

  it('un modelo con otros rasgos se rechaza en vez de dar basura', async () => {
    await expect(proponerAlternativas({ diseno, metadatos: { ...METADATOS, rasgos: ['otro'] }, predecir: optimista })).rejects.toThrow('rasgos')
  })

  it('el orden sigue a lo que estima el modelo y deja fuera lo que estima que no funciona', () => {
    const m = modificacionesPosibles(diseno.red).slice(0, 3)
    const orden = ordenDelModelo(
      m,
      [
        [-5, 0, 0, 1],
        [-9, 3, 0, 0],
        [-1, 2, 7, 1],
      ],
      METADATOS,
    )
    expect(orden.costo.map((f) => f.modificacion)).toEqual([m[0], m[2]])
    expect(orden.uniformidad[0]!.modificacion).toBe(m[2])
    expect(orden.margen[0]!.modificacion).toBe(m[2])
  })
})
