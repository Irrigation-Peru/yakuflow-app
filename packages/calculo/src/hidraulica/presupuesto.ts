// El presupuesto referencial de la red (HU0019, HU0027). El módulo no conoce ningún precio: los recibe como dato,
// para que el catálogo se reemplace sin tocar el código. Las cantidades sí salen de aquí: la longitud es la inclinada,
// la misma con que se calcula la pérdida, y los emisores se cuentan a partir de los equivalentes de cada tramo.

import type { Red } from './tipos'
import { CLASES_DE_TUBERIA } from './tuberias'

export interface PrecioDeTuberia {
  diametroInternoMm: number
  clase: string
  precioPorM: number
}

export interface CatalogoDePrecios {
  version: string
  /** Los precios son estimados y todavía no salen de un catálogo comercial: se dice en pantalla y en el informe. */
  provisional: boolean
  fuente: string
  moneda: string
  tuberias: readonly PrecioDeTuberia[]
  emisores: readonly { codigo: string; precioUnidad: number }[]
  /**
   * En goteo, el lateral se compra como manguera (o cinta) con el gotero integrado: se cobra por metro y el gotero ya
   * está incluido. Sin precio para el emisor elegido, el lateral se cobra como tubería y cada emisor por unidad.
   */
  lateralesDeGoteo?: readonly { codigo: string; diametroInternoMm: number; precioPorM: number }[]
  accesorios: {
    camaraRompePresion: number
    valvulaReguladora: number
    cabezal: number
  }
}

export type TipoDePartida = 'tuberia' | 'emisor' | 'accesorio'

export interface Partida {
  tipo: TipoDePartida
  descripcion: string
  cantidad: number
  unidad: string
  precioUnitario: number
  subtotal: number
}

export interface Presupuesto {
  partidas: readonly Partida[]
  total: number
  moneda: string
  provisional: boolean
  versionDelCatalogo: string
  /** Lo que la red usa y el catálogo no tiene precio: no entra al total, y el total no se debe leer como completo. */
  sinPrecio: readonly string[]
}

const centimos = (n: number) => Math.round(n * 100) / 100

export const claseDelTramo = (presionMaximaM: number | undefined) =>
  CLASES_DE_TUBERIA.find((c) => c.presionMaximaM === presionMaximaM)?.codigo ?? CLASES_DE_TUBERIA[0]!.codigo

/** Cuántos emisores reales hay en la red: cada emisor equivalente suma las k de los que representa. */
export const emisoresDeLaRed = (red: Red, coeficienteK: number) =>
  Math.round(red.emisores.reduce((suma, e) => suma + e.k, 0) / coeficienteK)

export function presupuestoDeLaRed({
  red,
  emisor,
  precios,
}: {
  red: Red
  emisor: { codigo: string; coeficienteK: number }
  precios: CatalogoDePrecios
}): Presupuesto {
  const porId = new Map(red.nodos.map((n) => [n.id, n]))
  const metros = new Map<string, { diametroInternoMm: number; clase: string; metros: number }>()
  // Las mangueras con gotero integrado para este emisor, de la más delgada a la más gruesa.
  const mangueras = (precios.lateralesDeGoteo ?? [])
    .filter((m) => m.codigo === emisor.codigo)
    .sort((a, b) => a.diametroInternoMm - b.diametroInternoMm)
  const conManguera = mangueras.length > 0
  const manguera = new Map<number, { diametroInternoMm: number; metros: number; precio: number | undefined }>()
  for (const tramo of red.tramos) {
    const a = porId.get(tramo.desde)
    const b = porId.get(tramo.hasta)
    if (!a || !b) continue
    const largo = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
    if (conManguera && tramo.id.startsWith('l')) {
      // La manguera más delgada que no estrecha el tramo; si ninguna alcanza, el tramo queda sin precio.
      const elegida = mangueras.find((m) => m.diametroInternoMm >= tramo.diametroInternoMm - 1e-9)
      const d = elegida?.diametroInternoMm ?? tramo.diametroInternoMm
      const fila = manguera.get(d) ?? { diametroInternoMm: d, metros: 0, precio: elegida?.precioPorM }
      fila.metros += largo
      manguera.set(d, fila)
      continue
    }
    const clase = claseDelTramo(tramo.presionMaximaM)
    const clave = `${tramo.diametroInternoMm}|${clase}`
    const fila = metros.get(clave) ?? { diametroInternoMm: tramo.diametroInternoMm, clase, metros: 0 }
    fila.metros += largo
    metros.set(clave, fila)
  }

  const partidas: Partida[] = []
  const sinPrecio: string[] = []
  const agregar = (tipo: TipoDePartida, descripcion: string, cantidad: number, unidad: string, precio: number | undefined) => {
    if (cantidad <= 0) return
    if (precio === undefined) {
      sinPrecio.push(descripcion)
      return
    }
    partidas.push({ tipo, descripcion, cantidad, unidad, precioUnitario: precio, subtotal: centimos(cantidad * precio) })
  }

  for (const f of [...metros.values()].sort((a, b) => b.diametroInternoMm - a.diametroInternoMm || a.clase.localeCompare(b.clase))) {
    const precio = precios.tuberias.find((t) => t.diametroInternoMm === f.diametroInternoMm && t.clase === f.clase)?.precioPorM
    agregar('tuberia', `Tubería de ${f.diametroInternoMm} mm, clase ${f.clase}`, centimos(f.metros), 'm', precio)
  }
  for (const f of [...manguera.values()].sort((a, b) => b.diametroInternoMm - a.diametroInternoMm)) {
    agregar('emisor', `Manguera de goteo de ${f.diametroInternoMm} mm con gotero integrado (${emisor.codigo})`, centimos(f.metros), 'm', f.precio)
  }
  // Con manguera, el gotero ya está en su precio por metro: no se cobra otra vez por unidad.
  if (!conManguera) {
    agregar(
      'emisor',
      `Emisor ${emisor.codigo}`,
      emisoresDeLaRed(red, emisor.coeficienteK),
      'unidad',
      precios.emisores.find((e) => e.codigo === emisor.codigo)?.precioUnidad,
    )
  }
  const elementos = Object.values(red.elementos ?? {})
  const contar = (tipo: string) => elementos.filter((e) => e.tipo === tipo).length
  agregar('accesorio', 'Cabezal de filtrado', contar('cabezal'), 'unidad', precios.accesorios.cabezal)
  agregar('accesorio', 'Cámara rompe-presión', contar('crp'), 'unidad', precios.accesorios.camaraRompePresion)
  // La reguladora única del cabezal (id 'VC', ver diseno-de-red.ts) no es de lateral: se lista aparte para no confundir.
  const delCabezal = red.elementos?.['VC']?.tipo === 'vrp' ? 1 : 0
  agregar('accesorio', 'Válvula reguladora del cabezal', delCabezal, 'unidad', precios.accesorios.valvulaReguladora)
  agregar('accesorio', 'Válvula reguladora de los laterales de una curva de nivel', contar('vrp') - delCabezal, 'unidad', precios.accesorios.valvulaReguladora)

  return {
    partidas,
    total: centimos(partidas.reduce((suma, p) => suma + p.subtotal, 0)),
    moneda: precios.moneda,
    provisional: precios.provisional,
    versionDelCatalogo: precios.version,
    sinPrecio,
  }
}
