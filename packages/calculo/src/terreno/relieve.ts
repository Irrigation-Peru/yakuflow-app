// El relieve alrededor de la parcela (paso 1): dónde puede estar la fuente para que el agua llegue por gravedad.
// Sin bombeo, la presión la da el desnivel entre la fuente y la parcela.

import { DESNIVEL_MAXIMO_SIN_CRP_M, DESNIVEL_MINIMO_GOTEO_M } from '../constantes'
import { RADIO_TERRESTRE_M, type PuntoGeografico } from './terreno'

const RADIANES_POR_GRADO = Math.PI / 180

/** Cuadrícula regular de cotas en grados: esquina suroeste, paso, y cotas por filas de sur a norte, de oeste a este. */
export interface Grilla {
  latSur: number
  lonOeste: number
  pasoGrados: number
  filas: number
  columnas: number
  cotas: readonly number[]
}

/**
 * Paso de la cuadrícula: tres segundos de arco, unos 92 m. Alcanza para leer laderas y quebradas, y una parcela
 * con su margen queda en unos 600 puntos: con el respaldo en línea, siete pedidos la primera vez.
 */
export const PASO_DEL_RELIEVE_GRADOS = 1 / 1200

/** Cuánto terreno se muestra alrededor de la parcela, m: la fuente suele estar a menos de un kilómetro. */
export const MARGEN_DEL_RELIEVE_M = 1000

/**
 * Los puntos donde se pide la cota alrededor de la parcela. Caen siempre en la misma red (múltiplos del paso),
 * así dos parcelas vecinas comparten las cotas que el servidor ya guardó. Si el lado pasa de `ladoMaximo`, el
 * paso se agranda a un múltiplo del de la red.
 */
export function cuadriculaAlrededor(
  contorno: readonly PuntoGeografico[],
  { margenM = MARGEN_DEL_RELIEVE_M, ladoMaximo = 50 }: { margenM?: number; ladoMaximo?: number } = {},
) {
  if (contorno.length < 3) throw new Error('Un contorno necesita al menos tres vértices')
  const lats = contorno.map((p) => p.lat)
  const lons = contorno.map((p) => p.lon)
  const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2
  const margenLat = margenM / RADIO_TERRESTRE_M / RADIANES_POR_GRADO
  const margenLon = margenLat / Math.cos(latMedia * RADIANES_POR_GRADO)

  for (let multiplo = 1; ; multiplo++) {
    const paso = PASO_DEL_RELIEVE_GRADOS * multiplo
    // Índices enteros en la red: el mismo índice da siempre el mismo número de coma flotante.
    const [sur, norte] = [Math.floor((Math.min(...lats) - margenLat) / paso), Math.ceil((Math.max(...lats) + margenLat) / paso)]
    const [oeste, este] = [Math.floor((Math.min(...lons) - margenLon) / paso), Math.ceil((Math.max(...lons) + margenLon) / paso)]
    const [filas, columnas] = [norte - sur + 1, este - oeste + 1]
    if (filas > ladoMaximo || columnas > ladoMaximo) continue
    const puntos: PuntoGeografico[] = []
    for (let f = 0; f < filas; f++) for (let c = 0; c < columnas; c++) puntos.push({ lat: (sur + f) * paso, lon: (oeste + c) * paso })
    return { latSur: sur * paso, lonOeste: oeste * paso, pasoGrados: paso, filas, columnas, puntos }
  }
}

/** Cota en un punto por interpolación bilineal; fuera de la cuadrícula, null. */
export function cotaEnGrilla(grilla: Grilla, punto: PuntoGeografico): number | null {
  const { latSur, lonOeste, pasoGrados, filas, columnas, cotas } = grilla
  const f = (punto.lat - latSur) / pasoGrados
  const c = (punto.lon - lonOeste) / pasoGrados
  if (!(f >= 0 && f <= filas - 1 && c >= 0 && c <= columnas - 1)) return null
  const [f0, c0] = [Math.min(Math.floor(f), filas - 2), Math.min(Math.floor(c), columnas - 2)]
  const [tf, tc] = [f - f0, c - c0]
  const z = (i: number, j: number) => cotas[(f0 + i) * columnas + c0 + j]!
  return (1 - tf) * ((1 - tc) * z(0, 0) + tc * z(0, 1)) + tf * ((1 - tc) * z(1, 0) + tc * z(1, 1))
}

export type ZonaParaLaFuente = 'no_llega' | 'poca_presion' | 'adecuada' | 'necesita_crp'

/** En orden de cota: de la que queda más abajo a la que queda más arriba. */
export const ZONAS_PARA_LA_FUENTE: readonly ZonaParaLaFuente[] = ['no_llega', 'poca_presion', 'adecuada', 'necesita_crp']

export interface ExtremosDeLaParcela {
  cotaMasAlta: number
  cotaMasBaja: number
}

/**
 * Qué pasaría con la fuente a esa cota. El desnivel hasta el punto más alto de la parcela es el que le queda al
 * emisor más desfavorecido; hasta el más bajo, la presión estática que tiene que aguantar la red al cerrar las
 * válvulas. Si a la parte alta le falta presión, eso manda: las cámaras rompe-presión no la dan.
 */
export function zonaParaLaFuente(cota: number, { cotaMasAlta, cotaMasBaja }: ExtremosDeLaParcela): ZonaParaLaFuente {
  const disponible = cota - cotaMasAlta
  if (disponible <= 0) return 'no_llega'
  if (disponible < DESNIVEL_MINIMO_GOTEO_M) return 'poca_presion'
  if (cota - cotaMasBaja > DESNIVEL_MAXIMO_SIN_CRP_M) return 'necesita_crp'
  return 'adecuada'
}

/**
 * La zona de cada píxel de una imagen de `ancho` × `alto` que cubre la cuadrícula de nodo a nodo, por filas de
 * norte a sur (como se dibuja una imagen). Cada valor es el índice de la zona en ZONAS_PARA_LA_FUENTE.
 */
export function mapaDeZonas(grilla: Grilla, extremos: ExtremosDeLaParcela, ancho: number, alto: number) {
  const { latSur, lonOeste, pasoGrados, filas, columnas } = grilla
  const altoGrados = (filas - 1) * pasoGrados
  const anchoGrados = (columnas - 1) * pasoGrados
  const mapa = new Uint8Array(ancho * alto)
  for (let i = 0; i < alto; i++) {
    const lat = latSur + altoGrados - ((i + 0.5) / alto) * altoGrados
    for (let j = 0; j < ancho; j++) {
      const cota = cotaEnGrilla(grilla, { lat, lon: lonOeste + ((j + 0.5) / ancho) * anchoGrados })!
      mapa[i * ancho + j] = ZONAS_PARA_LA_FUENTE.indexOf(zonaParaLaFuente(cota, extremos))
    }
  }
  return mapa
}

/** La muestra más alta y la más baja de la parcela, con su cota. */
export function extremosDeLaParcela(muestras: readonly PuntoGeografico[], cotas: readonly number[]) {
  if (muestras.length === 0 || muestras.length !== cotas.length) throw new Error('Cada muestra necesita su cota')
  let [alto, bajo] = [0, 0]
  cotas.forEach((z, i) => {
    if (z > cotas[alto]!) alto = i
    if (z < cotas[bajo]!) bajo = i
  })
  return {
    masAlto: { lat: muestras[alto]!.lat, lon: muestras[alto]!.lon, cota: cotas[alto]! },
    masBajo: { lat: muestras[bajo]!.lat, lon: muestras[bajo]!.lon, cota: cotas[bajo]! },
  }
}
