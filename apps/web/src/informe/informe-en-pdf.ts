import type { Presupuesto, RiegoDeLaEtapa } from '@riego/calculo'
import { jsPDF } from 'jspdf'
import { cifra, conDecimales, diaDelCalendario } from '../formato.ts'
import { duracionDeLaEtapa, frecuenciaDeLaEtapa, notaDelPlan, riegosDeLaEtapa } from '../plan-de-riego.ts'

// El informe técnico en PDF (HU0028). Se arma en el navegador con lo registrado en el recorrido: el estudiante no escribe
// nada y el archivo no se guarda en ningún servidor. jsPDF se carga recién al pedir el informe, porque pesa.

export interface ContenidoDelInforme {
  proyecto: string
  fechaDeEmision: string
  avisos: readonly string[]
  terreno: readonly (readonly [string, string])[]
  cultivo: readonly (readonly [string, string])[]
  balance: readonly (readonly [string, string])[]
  diseno: readonly (readonly [string, string])[]
  red: readonly (readonly [string, string])[]
  imagenDeLaRed?: string | null
  presupuesto: Presupuesto | null
  plan: readonly RiegoDeLaEtapa[]
  /** El intervalo del diseño, el de la semana de más consumo: lo cita la nota del plan. */
  intervaloDeDisenoDias: number
}

const MARGEN = 18
const ANCHO_UTIL = 210 - 2 * MARGEN
const ALTO_UTIL = 297 - MARGEN
const NOMBRE_DE_LA_ETAPA = { inicial: 'Inicial', desarrollo: 'Desarrollo', media: 'Media', final: 'Final' } as const

export function informeEnPdf(c: ContenidoDelInforme) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = MARGEN

  const hayEspacio = (alto: number) => {
    if (y + alto > ALTO_UTIL) {
      doc.addPage()
      y = MARGEN
    }
  }
  const parrafo = (texto: string, tamano = 10, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal')
    doc.setFontSize(tamano)
    const lineas = doc.splitTextToSize(texto, ANCHO_UTIL) as string[]
    const alto = lineas.length * tamano * 0.45
    hayEspacio(alto)
    doc.text(lineas, MARGEN, y + tamano * 0.35)
    y += alto + 1.5
  }
  const seccion = (titulo: string) => {
    hayEspacio(14)
    y += 4
    parrafo(titulo, 13, true)
  }
  /** Una tabla con columnas de ancho relativo; la primera, a la izquierda y las demás, cifras a la derecha. */
  const tabla = (filas: readonly (readonly string[])[], anchos: readonly number[], cabecera?: readonly string[]) => {
    const suma = anchos.reduce((a, b) => a + b, 0)
    const columnas = anchos.map((a) => (a / suma) * ANCHO_UTIL)
    const dibujar = (fila: readonly string[], negrita: boolean) => {
      doc.setFont('helvetica', negrita ? 'bold' : 'normal')
      doc.setFontSize(9)
      const celdas = fila.map((t, i) => doc.splitTextToSize(t, columnas[i]! - 2) as string[])
      const alto = Math.max(...celdas.map((l) => l.length)) * 4 + 1.5
      hayEspacio(alto)
      let x = MARGEN
      celdas.forEach((lineas, i) => {
        if (i === 0) doc.text(lineas, x, y + 3.2)
        else doc.text(lineas, x + columnas[i]! - 1, y + 3.2, { align: 'right' })
        x += columnas[i]!
      })
      y += alto
      doc.setDrawColor(200)
      doc.line(MARGEN, y, MARGEN + ANCHO_UTIL, y)
    }
    if (cabecera) dibujar(cabecera, true)
    for (const fila of filas) dibujar(fila, false)
    y += 2
  }
  const datos = (filas: readonly (readonly [string, string])[]) => tabla(filas, [3, 2])

  parrafo('Informe técnico del proyecto de campaña de cultivo', 16, true)
  parrafo(c.proyecto, 12)
  parrafo(`Emitido el ${c.fechaDeEmision}. Armado por la aplicación con lo registrado en el recorrido.`, 9)
  for (const aviso of c.avisos) parrafo(`Aviso: ${aviso}`, 10, true)

  seccion('1. Terreno')
  datos(c.terreno)
  seccion('2. Cultivo')
  datos(c.cultivo)
  seccion('3. Balance de agua')
  datos(c.balance)
  seccion('4. Diseño')
  datos(c.diseno)
  datos(c.red)
  if (c.imagenDeLaRed) {
    const alto = ANCHO_UTIL * 0.6
    hayEspacio(alto + 8)
    doc.addImage(c.imagenDeLaRed, 'PNG', MARGEN, y, ANCHO_UTIL, alto)
    y += alto + 2
    parrafo('La red en planta, regando el primer sector.', 9)
  }

  seccion('5. Costo referencial')
  if (c.presupuesto) {
    const { partidas, total, moneda, provisional, versionDelCatalogo, sinPrecio } = c.presupuesto
    tabla(
      [
        ...partidas.map((p) => [p.descripcion, `${cifra(p.cantidad, p.unidad === 'm' ? 1 : 0)} ${p.unidad}`, conDecimales(p.precioUnitario, 2), conDecimales(p.subtotal, 2)]),
        ['Total referencial', '', '', conDecimales(total, 2)],
      ],
      [5, 2, 2, 2],
      ['Material', 'Cantidad', `P. unitario (${moneda})`, `Subtotal (${moneda})`],
    )
    if (provisional) parrafo(`Con precios provisionales (${versionDelCatalogo}): son una estimación, no una cotización.`, 10, true)
    if (sinPrecio.length > 0) parrafo(`Sin precio en el catálogo, y fuera del total: ${sinPrecio.join(', ')}.`)
  } else {
    parrafo('No hay un catálogo de precios cargado.')
  }

  seccion('6. Plan de riego por etapa')
  parrafo(`${notaDelPlan(c.intervaloDeDisenoDias)} En la maduración de la papa y los granos secos se riega menos y se deja de regar antes de la cosecha.`, 9)
  tabla(
    c.plan.map((e) => [
      NOMBRE_DE_LA_ETAPA[e.etapa],
      `${diaDelCalendario(e.desde)} al ${diaDelCalendario(e.hasta)}`,
      conDecimales(e.consumoMedioMmDia, 1),
      conDecimales(e.lluviaEfectivaMediaMmDia, 1),
      frecuenciaDeLaEtapa(e),
      conDecimales(e.laminaNetaMm, 1),
      duracionDeLaEtapa(e),
      riegosDeLaEtapa(e),
    ]),
    [1.7, 3, 1.4, 1.4, 2.6, 1.3, 1.4, 1.8],
    ['Etapa', 'Fechas', 'Consume (mm/día)', 'Lluvia (mm/día)', 'Si no llueve, regar', 'Lámina (mm)', 'Cada riego dura', 'Riegos en un año normal'],
  )

  return doc
}
