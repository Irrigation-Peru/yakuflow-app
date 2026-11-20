// Geometría del lugar: área de la parcela, coordenadas locales, pendiente, perfil y desnivel.

/** Radio medio de la Tierra, m (IUGG). */
export const RADIO_TERRESTRE_M = 6_371_008.8

const RADIANES_POR_GRADO = Math.PI / 180

export interface PuntoGeografico {
  lat: number
  lon: number
}

export interface PuntoLocal {
  x: number
  y: number
  z: number
}

/**
 * Área de un contorno sobre la esfera, m², por la fórmula de Chamberlain y Duquette (2007), la misma que
 * usa Turf: R² / 2 · |Σ (λ2 − λ1) · (2 + sen φ1 + sen φ2)|. El contorno se cierra solo.
 */
export function areaDePoligono(contorno: readonly PuntoGeografico[]) {
  if (contorno.length < 3) throw new Error('Un contorno necesita al menos tres vértices')
  let suma = 0
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]!
    const b = contorno[(i + 1) % contorno.length]!
    suma +=
      (b.lon - a.lon) * RADIANES_POR_GRADO * (2 + Math.sin(a.lat * RADIANES_POR_GRADO) + Math.sin(b.lat * RADIANES_POR_GRADO))
  }
  return (Math.abs(suma) * RADIO_TERRESTRE_M ** 2) / 2
}

/**
 * Coordenadas locales en metros, hacia el este (x) y el norte (y) desde un origen, por proyección
 * equirectangular. En una parcela de unos cientos de metros el error es despreciable frente al del relieve.
 */
export function proyectarLocal(origen: PuntoGeografico, punto: PuntoGeografico) {
  return {
    x: RADIO_TERRESTRE_M * (punto.lon - origen.lon) * RADIANES_POR_GRADO * Math.cos(origen.lat * RADIANES_POR_GRADO),
    y: RADIO_TERRESTRE_M * (punto.lat - origen.lat) * RADIANES_POR_GRADO,
  }
}

/** Lo inverso de proyectarLocal: de metros al este y al norte del origen, a latitud y longitud. */
export function desproyectarLocal(origen: PuntoGeografico, punto: { x: number; y: number }) {
  return {
    lat: origen.lat + punto.y / RADIO_TERRESTRE_M / RADIANES_POR_GRADO,
    lon: origen.lon + punto.x / (RADIO_TERRESTRE_M * Math.cos(origen.lat * RADIANES_POR_GRADO)) / RADIANES_POR_GRADO,
  }
}

/** Por debajo de un metro cuadrado, el contorno es una línea mal cerrada y no una parcela. */
const AREA_MINIMA_M2 = 1

/** Centroide del área del contorno (no el promedio de sus vértices), en coordenadas geográficas. */
export function centroideDePoligono(contorno: readonly PuntoGeografico[]) {
  if (contorno.length < 3) throw new Error('Un contorno necesita al menos tres vértices')
  const origen = contorno[0]!
  const local = contorno.map((p) => proyectarLocal(origen, p))
  let dobleArea = 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < local.length; i++) {
    const a = local[i]!
    const b = local[(i + 1) % local.length]!
    const cruz = a.x * b.y - b.x * a.y
    dobleArea += cruz
    sx += (a.x + b.x) * cruz
    sy += (a.y + b.y) * cruz
  }
  if (dobleArea === 0) throw new Error('El contorno no encierra área: revisa que los vértices no estén alineados')
  return desproyectarLocal(origen, { x: sx / (3 * dobleArea), y: sy / (3 * dobleArea) })
}

function dentroDelContorno(contorno: readonly { x: number; y: number }[], x: number, y: number) {
  let dentro = false
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const a = contorno[i]!
    const b = contorno[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro
  }
  return dentro
}

/**
 * Puntos donde se consulta la cota para medir el relieve de la parcela: sus vértices y una cuadrícula regular
 * dentro del contorno, sin pasar de `maximo` en total. El servidor y el navegador muestrean igual, así que la
 * pendiente que ve el estudiante es la que se guarda.
 */
export function muestrasDeLaParcela(contorno: readonly PuntoGeografico[], maximo = 100): PuntoGeografico[] {
  if (contorno.length < 3) throw new Error('Un contorno necesita al menos tres vértices')
  const origen = contorno[0]!
  const local = contorno.map((p) => proyectarLocal(origen, p))
  const xs = local.map((p) => p.x)
  const ys = local.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const area = areaDePoligono(contorno)
  if (!(area >= AREA_MINIMA_M2)) throw new Error('El contorno no encierra área: revisa que los vértices no estén alineados')
  const libres = maximo - contorno.length
  let interiores: { x: number; y: number }[] = []
  if (libres > 0) {
    // El paso mínimo acota la cuadrícula a 200 × 200 celdas aunque la parcela sea una franja muy delgada.
    let paso = Math.max(Math.sqrt(area / libres), Math.max(x1 - x0, y1 - y0) / 200)
    for (;;) {
      interiores = []
      for (let x = x0 + paso / 2; x < x1; x += paso) {
        for (let y = y0 + paso / 2; y < y1; y += paso) if (dentroDelContorno(local, x, y)) interiores.push({ x, y })
      }
      if (interiores.length <= libres) break
      paso *= 1.05
    }
  }
  return [...contorno, ...interiores.map((p) => desproyectarLocal(origen, p))]
}

/**
 * Plano z = a + b·x + c·y que mejor ajusta las cotas por mínimos cuadrados. Devuelve el gradiente (b, c),
 * que apunta cuesta arriba, y el centro de los puntos. Las coordenadas se centran antes de sumar para no
 * perder cifras con cotas de 3000 m.
 */
export function planoDelTerreno(puntos: readonly PuntoLocal[]) {
  const n = puntos.length
  const media = (eje: 'x' | 'y' | 'z') => puntos.reduce((s, p) => s + p[eje], 0) / n
  const [mx, my, mz] = [media('x'), media('y'), media('z')]
  let sxx = 0
  let syy = 0
  let sxy = 0
  let sxz = 0
  let syz = 0
  for (const p of puntos) {
    const [x, y, z] = [p.x - mx, p.y - my, p.z - mz]
    sxx += x * x
    syy += y * y
    sxy += x * y
    sxz += x * z
    syz += y * z
  }
  const determinante = sxx * syy - sxy * sxy
  if (n < 3 || !(determinante > 1e-12 * sxx * syy)) throw new Error('Los puntos están alineados: no definen un plano')
  const b = (sxz * syy - syz * sxy) / determinante
  const c = (syz * sxx - sxz * sxy) / determinante
  return { b, c, centro: { x: mx, y: my, z: mz } }
}

/** Pendiente media del terreno, m/m: el módulo del gradiente del plano ajustado, √(b² + c²). */
export function pendienteMedia(puntos: readonly PuntoLocal[]) {
  const { b, c } = planoDelTerreno(puntos)
  return Math.hypot(b, c)
}

/** Perfil a lo largo de una línea de puntos: distancia horizontal acumulada y cota de cada punto. */
export function perfilDelTerreno(puntos: readonly PuntoLocal[]) {
  let distanciaM = 0
  return puntos.map((p, i) => {
    if (i > 0) distanciaM += Math.hypot(p.x - puntos[i - 1]!.x, p.y - puntos[i - 1]!.y)
    return { distanciaM, cota: p.z }
  })
}

/**
 * Desnivel entre la fuente y la parcela, m. El disponible se mide hasta el punto más alto de la parcela, que
 * es el que recibe menos presión; el máximo, hasta el más bajo, que es donde la presión estática es mayor.
 */
export function desnivelDisponible(cotaFuente: number, cotasParcela: readonly number[]) {
  if (cotasParcela.length === 0) throw new Error('La parcela necesita al menos una cota')
  return { disponibleM: cotaFuente - Math.max(...cotasParcela), maximoM: cotaFuente - Math.min(...cotasParcela) }
}
