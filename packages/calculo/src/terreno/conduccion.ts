// La conducción de la fuente a la parcela (paso 1): dónde van las cámaras rompe-presión. Sin bombeo, la presión
// estática en un punto es el desnivel entre ese punto y el último nivel libre del agua aguas arriba: la fuente o
// la última cámara. Solo la cámara rompe-presión lo baja (al cerrar las válvulas, es lo único que protege la
// tubería: CE5).

import { DESNIVEL_MAXIMO_SIN_CRP_M, DESNIVEL_MINIMO_ASPERSION_M, MARGEN_POR_PRECISION_DEL_RELIEVE_M } from '../constantes'
import type { ExtremosDeLaParcela } from './relieve'

export interface PuntoDelPerfil {
  distanciaM: number
  cota: number
}

/**
 * La carga que a lo alto de la parcela le tiene que quedar para que la última cámara de la conducción pueda anclarse a
 * lo bajo, sin cámaras dentro: la de la aspersión, que es el método que más pide, más lo que se pierde en el cabezal.
 * Con menos, se ancla a lo alto y la red pone sus pisos dentro de la parcela (paso 5).
 */
export const CARGA_PARA_ANCLAR_A_LO_BAJO_M = DESNIVEL_MINIMO_ASPERSION_M + 5

/**
 * Desnivel que cubre cada piso de la red dentro de la parcela, m: de lo que el lateral de goteo necesita sobre él
 * (unos 14 m) a los 49 m del límite con su margen. Con él se estima en el paso 1 cuántas cámaras irán dentro; las que
 * van de verdad las pone la red en el paso 5, según el método y el emisor.
 */
export const FRANJA_DE_UN_PISO_M = 35

/**
 * Cámaras rompe-presión a lo largo del perfil de la conducción, que va de la fuente (primer punto) a la parcela
 * (último). Si la parcela tiene poco desnivel, la última cámara deja el agua a 50 m sobre su punto más bajo, lo más
 * alto que se puede sin pasar el límite y sin cámaras dentro. Si con eso a lo alto le quedaría menos de lo que la
 * aspersión pide, ninguna altura sirve a la vez a lo alto y a lo bajo: la última cámara deja el agua a lo alto con esa
 * carga, la que cualquier método necesita, y la parte baja se riega por pisos, cada uno con su cámara dentro de la
 * parcela (paso 5). Más carga a lo alto no ayuda: lo que sobra es desnivel que el primer piso ya no puede cubrir. Anclarla
 * siempre a lo bajo dejaba lo alto sin presión, o por encima del agua, aunque la fuente estuviera más arriba que toda
 * la parcela. Las dos anclas dejan un metro de margen por la precisión del relieve. Las demás cámaras van cada 50 m
 * por encima de la última, donde el terreno baja hasta su nivel. Las que quedan por debajo del final de la línea, y
 * las que pide el desnivel de la parcela, se cuentan aparte: son parte de la red.
 */
export function camarasRompePresion(perfil: readonly PuntoDelPerfil[], { cotaMasAlta, cotaMasBaja }: ExtremosDeLaParcela) {
  if (perfil.length < 2) throw new Error('La conducción necesita al menos dos puntos')
  const fuente = perfil[0]!.cota
  const relieveM = cotaMasAlta - cotaMasBaja
  const tope = DESNIVEL_MAXIMO_SIN_CRP_M - MARGEN_POR_PRECISION_DEL_RELIEVE_M
  const sirveSinCamarasDentro = tope - relieveM >= CARGA_PARA_ANCLAR_A_LO_BAJO_M
  // El metro de margen se toma solo si no cuesta una cámara más: poner una a un metro de la fuente para ganarlo abajo no
  // tiene sentido, y si un lateral queda unas décimas sobre los 50 m, la red lo resuelve con un piso dentro (paso 5).
  const camarasHasta = (nivel: number) => Math.ceil((fuente - nivel) / DESNIVEL_MAXIMO_SIN_CRP_M - 1e-9)
  const aLoBajo = camarasHasta(cotaMasBaja + tope) > camarasHasta(cotaMasBaja + DESNIVEL_MAXIMO_SIN_CRP_M) ? cotaMasBaja + DESNIVEL_MAXIMO_SIN_CRP_M : cotaMasBaja + tope
  const nivelFinalM = Math.min(fuente, sirveSinCamarasDentro ? aLoBajo : cotaMasAlta + CARGA_PARA_ANCLAR_A_LO_BAJO_M)
  const niveles: number[] = []
  for (let nivel = nivelFinalM; nivel < fuente; nivel += DESNIVEL_MAXIMO_SIN_CRP_M) niveles.unshift(nivel)

  const camaras: PuntoDelPerfil[] = []
  let camarasDentroDeLaParcela = 0
  let i = 1
  for (const nivel of niveles) {
    while (i < perfil.length && perfil[i]!.cota > nivel) i++
    if (i === perfil.length) {
      camarasDentroDeLaParcela++
      continue
    }
    const [a, b] = [perfil[i - 1]!, perfil[i]!]
    const t = a.cota === b.cota ? 0 : (a.cota - nivel) / (a.cota - b.cota)
    camaras.push({ distanciaM: a.distanciaM + t * (b.distanciaM - a.distanciaM), cota: nivel })
  }
  // Del nivel con que el agua entra a la parcela hasta su punto más bajo, una cámara cada 50 m.
  // Debajo de lo que alcanza el nivel de entrada, un piso por cada franja que la red puede cubrir desde su cámara.
  camarasDentroDeLaParcela += Math.max(0, Math.ceil((nivelFinalM - DESNIVEL_MAXIMO_SIN_CRP_M - cotaMasBaja) / FRANJA_DE_UN_PISO_M - 1e-9))

  // Donde el terreno sube por encima del nivel libre del agua, la conducción en línea recta no pasa por
  // gravedad. Se dice cuánto y dónde es lo peor: un metro se salva con la zanja; veinte, con un rodeo.
  let sobreElNivel: { alturaM: number; distanciaM: number } | null = null
  for (const p of perfil) {
    const alturaM = p.cota - (camaras.findLast((c) => c.distanciaM <= p.distanciaM)?.cota ?? fuente)
    if (alturaM > 1e-6 && alturaM > (sobreElNivel?.alturaM ?? 0)) sobreElNivel = { alturaM, distanciaM: p.distanciaM }
  }

  return { camaras, nivelFinalM, camarasDentroDeLaParcela, sobreElNivel }
}
