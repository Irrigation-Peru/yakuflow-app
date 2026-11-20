// Catálogo provisional de tuberías (HU0017). Los diámetros internos son los que ya usa el banco de
// verificación contra EPANET; las clases son las nominales del PVC (C-5, C-7.5, C-10 y C-15), por la presión
// de trabajo que cada una admite.
//
// Dos límites que hay que decir: el diámetro interno se toma igual en todas las clases, cuando en la tubería
// real la pared más gruesa deja menos paso; y no hay precios. Queda pendiente el catálogo comercial peruano
// con el diámetro interno de cada clase y su precio, que es el mismo pendiente que tiene el catálogo de
// emisores.

import { VELOCIDAD_MAXIMA } from '../constantes'
import { perdidaUnitaria, velocidad } from './metodo'

export interface ClaseDeTuberia {
  codigo: string
  /** Presión de trabajo que admite la clase, m.c.a. */
  presionMaximaM: number
}

export const CLASES_DE_TUBERIA: readonly ClaseDeTuberia[] = [
  { codigo: 'C-5', presionMaximaM: 50 },
  { codigo: 'C-7.5', presionMaximaM: 75 },
  { codigo: 'C-10', presionMaximaM: 100 },
  { codigo: 'C-15', presionMaximaM: 150 },
]

/** Diámetros internos del catálogo, mm, de menor a mayor. */
export const DIAMETROS_INTERNOS_MM: readonly number[] = [13.6, 16, 20, 25.4, 32, 40.8, 50.8, 63.5, 75.4, 90.4, 110]

/** Coeficiente de Hazen-Williams del PVC. */
export const C_PVC = 150

export function claseDeTuberia(codigo: string) {
  const encontrada = CLASES_DE_TUBERIA.find((c) => c.codigo === codigo)
  if (!encontrada) throw new Error(`La clase ${codigo} no está en el catálogo`)
  return encontrada
}

/**
 * La clase más delgada que aguanta la presión dada. Si ninguna la aguanta, devuelve la mayor: el diseño queda
 * mal y el cálculo de la red lo marca en `cumpleClase`, que es donde el estudiante tiene que verlo.
 */
export function clasePorPresion(presionM: number): ClaseDeTuberia {
  return CLASES_DE_TUBERIA.find((c) => c.presionMaximaM >= presionM) ?? CLASES_DE_TUBERIA[CLASES_DE_TUBERIA.length - 1]!
}

/**
 * El diámetro más delgado del catálogo con el que el agua no pasa de la velocidad máxima. Es el criterio de
 * velocidad del método: más delgado vibra y desgasta, más gordo cuesta de más. Si ninguno alcanza, devuelve
 * el mayor y el cálculo de la red lo marca en `estadoVelocidad`.
 */
export function diametroPorVelocidad(caudalLps: number, velocidadMaxima = VELOCIDAD_MAXIMA) {
  if (!(caudalLps > 0)) return DIAMETROS_INTERNOS_MM[0]!
  const alcanza = DIAMETROS_INTERNOS_MM.find((mm) => velocidad(caudalLps, mm / 25.4) <= velocidadMaxima)
  return alcanza ?? DIAMETROS_INTERNOS_MM[DIAMETROS_INTERNOS_MM.length - 1]!
}

/**
 * El diámetro más delgado que cumple las dos cosas: no pasa de la velocidad máxima y no pierde más que la pendiente
 * dada, m por km. Es el criterio del método para el diámetro: la velocidad sola deja el tubo más delgado posible, y a
 * 3 m/s la fricción se come la presión que el emisor necesita. Si ninguno alcanza, devuelve el mayor y la alerta de
 * presión lo dice.
 */
export function diametroPorPresion(caudalLps: number, pendienteMaximaMPorKm: number, velocidadMaxima = VELOCIDAD_MAXIMA) {
  if (!(caudalLps > 0)) return DIAMETROS_INTERNOS_MM[0]!
  const alcanza = DIAMETROS_INTERNOS_MM.find((mm) => {
    const pulgadas = mm / 25.4
    return velocidad(caudalLps, pulgadas) <= velocidadMaxima && perdidaUnitaria(caudalLps, C_PVC, pulgadas) <= pendienteMaximaMPorKm
  })
  return alcanza ?? DIAMETROS_INTERNOS_MM[DIAMETROS_INTERNOS_MM.length - 1]!
}

/** El siguiente diámetro del catálogo, hacia arriba o hacia abajo; `undefined` si ya es el extremo. */
export function diametroVecino(diametroMm: number, hacia: 'arriba' | 'abajo') {
  const i = DIAMETROS_INTERNOS_MM.indexOf(diametroMm)
  if (i < 0) throw new Error(`El diámetro ${diametroMm} mm no está en el catálogo`)
  return DIAMETROS_INTERNOS_MM[hacia === 'arriba' ? i + 1 : i - 1]
}
