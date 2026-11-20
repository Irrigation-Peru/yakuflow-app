import {
  areaDePoligono,
  camarasRompePresion,
  centroideDePoligono,
  cuadriculaAlrededor,
  desnivelDisponible,
  extremosDeLaParcela,
  muestrasDeLaParcela,
  pendienteMedia,
  perfilDelTerreno,
  proyectarLocal,
  type PuntoGeografico,
} from '@riego/calculo'
import { ErrorDeApi } from './errores.ts'
import type { ProveedorDeElevacion } from './servicios/elevacion.ts'

// El lugar del proyecto (paso 1): área, pendiente, altitud y perfil de la parcela, cota de la fuente y desnivel
// entre las dos. Los números salen del módulo de cálculo; aquí solo se juntan las cotas que necesita.

const MUESTRAS_DE_LA_PARCELA = 100
const PUNTOS_DEL_PERFIL = 21

/**
 * El perfil se traza a lo largo del eje mayor de la parcela, entre sus dos vértices más alejados: se conoce
 * antes de pedir las cotas, así que todas salen en un solo pedido y de una sola fuente.
 */
function lineaDelPerfil(contorno: readonly PuntoGeografico[]) {
  let [a, b, mayor] = [contorno[0]!, contorno[1]!, -1]
  for (const p of contorno) {
    for (const q of contorno) {
      const { x, y } = proyectarLocal(p, q)
      if (Math.hypot(x, y) > mayor) [a, b, mayor] = [p, q, Math.hypot(x, y)]
    }
  }
  return Array.from({ length: PUNTOS_DEL_PERFIL }, (_, i) => {
    const t = i / (PUNTOS_DEL_PERFIL - 1)
    return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }
  })
}

const promedio = (valores: readonly number[]) => valores.reduce((s, v) => s + v, 0) / valores.length

/** Un punto cada 25 m en la conducción, entre 21 y 101 puntos: el SRTM tiene 30 m de resolución. */
const PASO_DE_LA_CONDUCCION_M = 25
const PUNTOS_DE_LA_CONDUCCION = { minimo: 21, maximo: 101 }

const entre = (a: PuntoGeografico, b: PuntoGeografico, t: number) => ({ lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) })

/** La conducción, en línea recta de la fuente al centro de la parcela (la misma línea que dibuja el mapa). */
function lineaDeLaConduccion(fuente: PuntoGeografico, centroide: PuntoGeografico) {
  const { x, y } = proyectarLocal(fuente, centroide)
  const n = Math.min(
    PUNTOS_DE_LA_CONDUCCION.maximo,
    Math.max(PUNTOS_DE_LA_CONDUCCION.minimo, Math.ceil(Math.hypot(x, y) / PASO_DE_LA_CONDUCCION_M) + 1),
  )
  return Array.from({ length: n }, (_, i) => entre(fuente, centroide, i / (n - 1)))
}

export async function calcularLugar(
  elevacion: ProveedorDeElevacion,
  contorno: readonly PuntoGeografico[] | null,
  fuente: PuntoGeografico | null,
) {
  if (contorno && !(areaDePoligono(contorno) >= 1)) {
    throw new ErrorDeApi(400, 'contorno_sin_area', 'El contorno no encierra área: revisa que los vértices no estén alineados')
  }
  if (!contorno && !fuente) return { parcela: null, cotaFuente: null, desnivel: null, conduccion: null, cargaDisponibleM: null, elevacion: null }

  const muestras = contorno ? muestrasDeLaParcela(contorno, MUESTRAS_DE_LA_PARCELA) : []
  const perfil = contorno ? lineaDelPerfil(contorno) : []
  const centroide = contorno && centroideDePoligono(contorno)
  const conduccion = fuente && centroide ? lineaDeLaConduccion(fuente, centroide) : []
  const puntos = [...(fuente ? [fuente] : []), ...muestras, ...perfil, ...conduccion]
  const { cotas, fuente: fuenteDeElevacion } = await elevacion.cotas(puntos)
  const desde = fuente ? 1 : 0
  const cotaFuente = fuente ? cotas[0]! : null
  const cotasDeMuestras = cotas.slice(desde, desde + muestras.length)
  const cotasDelPerfil = cotas.slice(desde + muestras.length, desde + muestras.length + perfil.length)
  const cotasDeLaConduccion = cotas.slice(desde + muestras.length + perfil.length)

  let parcela = null
  if (contorno) {
    const origen = contorno[0]!
    const enMetros = (p: PuntoGeografico, z: number) => ({ ...proyectarLocal(origen, p), z })
    parcela = {
      areaHa: areaDePoligono(contorno) / 10_000,
      pendienteMediaPct: 100 * pendienteMedia(muestras.map((p, i) => enMetros(p, cotasDeMuestras[i]!))),
      altitudMsnm: promedio(cotasDeMuestras),
      centroide: centroide!,
      perfil: perfilDelTerreno(perfil.map((p, i) => enMetros(p, cotasDelPerfil[i]!))),
    }
  }
  const desnivel = contorno && cotaFuente !== null ? desnivelDisponible(cotaFuente, cotasDeMuestras) : null
  const datosDeLaConduccion =
    fuente && centroide ? calcularConduccion(fuente, centroide, conduccion, cotasDeLaConduccion, muestras, cotasDeMuestras) : null
  return {
    parcela,
    cotaFuente,
    desnivel,
    conduccion: datosDeLaConduccion,
    // La carga con que el agua llega al punto más alto de la parcela se mide desde el nivel libre: el de la fuente o,
    // si la conducción lleva cámaras rompe-presión, el de la última. Es la que decide el método de riego (paso 4).
    cargaDisponibleM:
      desnivel && datosDeLaConduccion ? datosDeLaConduccion.nivelFinalM - (cotaFuente! - desnivel.disponibleM) : null,
    elevacion: fuenteDeElevacion,
  }
}

/** El perfil de la conducción y sus cámaras rompe-presión, ubicadas en el mapa. */
function calcularConduccion(
  fuente: PuntoGeografico,
  centroide: PuntoGeografico,
  linea: readonly PuntoGeografico[],
  cotasDeLaLinea: readonly number[],
  muestras: readonly PuntoGeografico[],
  cotasDeMuestras: readonly number[],
) {
  const perfil = perfilDelTerreno(linea.map((p, i) => ({ ...proyectarLocal(fuente, p), z: cotasDeLaLinea[i]! })))
  const { masAlto, masBajo } = extremosDeLaParcela(muestras, cotasDeMuestras)
  const largo = perfil.at(-1)!.distanciaM
  const { camaras, ...resto } = camarasRompePresion(perfil, { cotaMasAlta: masAlto.cota, cotaMasBaja: masBajo.cota })
  return {
    perfil,
    camaras: camaras.map((c) => ({ ...entre(fuente, centroide, largo > 0 ? c.distanciaM / largo : 0), ...c })),
    ...resto,
  }
}

/**
 * El relieve alrededor de la parcela, para ubicar la fuente: las cotas de una cuadrícula con un kilómetro de
 * margen y los puntos más alto y más bajo de la parcela. Todo sale de un solo pedido, así la cuadrícula y la
 * parcela se miden con la misma fuente de elevación.
 */
export async function calcularRelieve(elevacion: ProveedorDeElevacion, contorno: readonly PuntoGeografico[]) {
  const { puntos, ...cuadricula } = cuadriculaAlrededor(contorno)
  const muestras = muestrasDeLaParcela(contorno, MUESTRAS_DE_LA_PARCELA)
  const { cotas, fuente } = await elevacion.cotas([...muestras, ...puntos])
  return {
    grilla: { ...cuadricula, cotas: cotas.slice(muestras.length) },
    parcela: extremosDeLaParcela(muestras, cotas.slice(0, muestras.length)),
    elevacion: fuente,
  }
}
