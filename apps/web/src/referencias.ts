import type { PuntoDeReferencia } from './api/tipos.ts'
import { conDecimales } from './formato.ts'

// Cómo se nombra en el mapa cada punto de referencia de la ANA. Solo texto: dónde va la fuente lo decide el
// estudiante, y el caudal es el que mide.

const TIPO = { bocatoma: 'Bocatoma', toma: 'Toma', laguna: 'Laguna' } as const

export function rotuloDeReferencia(punto: PuntoDeReferencia) {
  const nombre = punto.nombre ? `${TIPO[punto.tipo]} ${punto.nombre}` : `${TIPO[punto.tipo]} sin nombre`
  const detalles = [
    punto.fuenteNatural && `capta de ${punto.fuenteNatural}`,
    punto.altitudMsnm !== null && `a ${conDecimales(punto.altitudMsnm, 0)} m`,
    punto.anioInventario && `inventario ANA ${punto.anioInventario}`,
  ].filter(Boolean)
  return detalles.length > 0 ? `${nombre} · ${detalles.join(' · ')}` : nombre
}
