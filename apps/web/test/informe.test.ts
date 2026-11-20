import { describe, expect, it } from 'vitest'
import { informeEnPdf, type ContenidoDelInforme } from '../src/informe/informe-en-pdf.ts'
import { cambiosAgrupados } from '../src/red-en-pantalla.ts'

const CONTENIDO: ContenidoDelInforme = {
  proyecto: 'Ladera de Cerro de Pasco, año húmedo',
  fechaDeEmision: '7 de noviembre de 2026',
  avisos: ['el paso 6 quedó desactualizado: revísalo antes de entregar.'],
  terreno: [['Área de la parcela', '1,00 ha']],
  cultivo: [['Cultivo', 'Papa']],
  balance: [['Resultado', 'La fuente cubre todas las semanas']],
  diseno: [['Método', 'Goteo']],
  red: [['Emisores', '36 000']],
  presupuesto: {
    partidas: [{ tipo: 'tuberia', descripcion: 'Tubería PVC 40,8 mm C-7.5', cantidad: 120.5, unidad: 'm', precioUnitario: 6.5, subtotal: 783.25 }],
    total: 783.25,
    moneda: 'PEN',
    provisional: true,
    versionDelCatalogo: 'provisional-1',
    sinPrecio: [],
  },
  plan: [{ etapa: 'media', desde: '2027-01-01', hasta: '2027-02-01', dias: 32, consumoMedioMmDia: 4.6, lluviaEfectivaMediaMmDia: 0.4, demandaNetaMediaMmDia: 4.2, laminaNetaMm: 12.6, intervaloDias: 3, riegos: 11, soloSiNoLlueve: false, aguaNetaMm: 134 }],
  intervaloDeDisenoDias: 3,
}

const texto = (doc: ReturnType<typeof informeEnPdf>) => doc.output()

describe('el informe en PDF (HU0028)', () => {
  it('es un PDF', () => {
    expect(texto(informeEnPdf(CONTENIDO)).startsWith('%PDF-')).toBe(true)
  })

  it('lleva terreno, cultivo, balance, diseño, costo y plan de riego por etapa', () => {
    const pdf = texto(informeEnPdf(CONTENIDO))
    for (const parte of ['1. Terreno', '2. Cultivo', '3. Balance de agua', '4. Dise', '5. Costo referencial', '6. Plan de riego por etapa', 'Papa', 'Total referencial', 'Cada 3 d']) {
      expect(pdf, parte).toContain(parte)
    }
  })

  it('dice si los precios son provisionales y si hay pasos desactualizados', () => {
    const pdf = texto(informeEnPdf(CONTENIDO))
    expect(pdf).toContain('precios provisionales')
    expect(pdf).toContain('desactualizado')
    const alDia = texto(informeEnPdf({ ...CONTENIDO, avisos: [], presupuesto: { ...CONTENIDO.presupuesto!, provisional: false } }))
    expect(alDia).not.toContain('precios provisionales')
    expect(alDia).not.toContain('Aviso:')
  })

  it('una etapa sin riego se dice, y un plan largo pasa de página sin perderse', () => {
    const plan = Array.from({ length: 60 }, (_, i) => ({ ...CONTENIDO.plan[0]!, desde: '2027-01-01', intervaloDias: i % 2 ? null : 3, riegos: i % 2 ? 0 : 3 }))
    const doc = informeEnPdf({ ...CONTENIDO, plan })
    expect(texto(doc)).toContain('Sin riego')
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})

describe('qué cambió tramo por tramo (HU0026)', () => {
  const medida = (diametroInternoMm: number, clase = 'C-7.5') => ({ diametroInternoMm, clase })

  it('junta los tramos que cambiaron igual, sin perder ninguno', () => {
    const grupos = cambiosAgrupados([
      { tramo: 'L1', antes: medida(13.6), ahora: medida(17.4) },
      { tramo: 'L2', antes: medida(13.6), ahora: medida(17.4) },
      { tramo: 'conduccion', antes: medida(40.8), ahora: medida(40.8, 'C-10') },
    ])
    expect(grupos).toHaveLength(2)
    expect(grupos[0]!.tramos).toEqual(['L1', 'L2'])
    expect(grupos.flatMap((g) => g.tramos)).toHaveLength(3)
  })
})
