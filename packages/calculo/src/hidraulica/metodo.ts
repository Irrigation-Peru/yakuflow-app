import { CONSTANTE_PERDIDA, G, K_HAZEN_WILLIAMS, METROS_POR_PULGADA, PI_METODO } from '../constantes'

// Cálculo de un tramo tal como lo hace el método de diseño normalizado, en sus unidades:
// Q en l/s · Ø en pulgadas · L en km · hf en m/km · cotas en m.s.n.m.

export interface EntradaTramoMetodo {
  caudalLps: number
  c: number
  diametroPulg: number
  cotaInicio: number
  cotaFin: number
  progresivaInicioM: number
  progresivaFinM: number
  /** Presión residual con la que llega el agua al inicio del tramo, m. */
  presionAnteriorM: number
}

export interface ResultadoTramoMetodo {
  longitudInclinadaM: number
  velocidadMs: number
  perdidaUnitariaMKm: number
  perdidaCargaM: number
  presionResidualM: number
  cotaPiezometricaFinal: number
}

/** L = √(H² + Dt²): la longitud inclinada, no la horizontal. */
export function longitudInclinada(desnivelM: number, distanciaHorizontalM: number) {
  return Math.sqrt(desnivelM ** 2 + distanciaHorizontalM ** 2)
}

/** v = Q / A, con π = 3.1416. */
export function velocidad(caudalLps: number, diametroPulg: number) {
  const diametroM = diametroPulg * METROS_POR_PULGADA
  return caudalLps / 1000 / ((PI_METODO * diametroM ** 2) / 4)
}

/** hf = (1/0.0004264)^1.85 · Q^1.85 / C^1.85 / D^4.87, en m/km. */
export function perdidaUnitaria(caudalLps: number, c: number, diametroPulg: number) {
  return (CONSTANTE_PERDIDA * caudalLps ** 1.85) / c ** 1.85 / diametroPulg ** 4.87
}

/** Hr = (v²/2g) · ΣKr. */
export function perdidaLocal(velocidadMs: number, coeficientesKr: readonly number[]) {
  const sumaKr = coeficientesKr.reduce((suma, kr) => suma + kr, 0)
  return (velocidadMs ** 2 / (2 * G)) * sumaKr
}

/** D = (Q / (0.0004264 · C · S^0.54))^(1/2.63), con S = (H + Pr anterior) / L en m/km. */
export function diametroPreliminar(entrada: {
  caudalLps: number
  c: number
  desnivelM: number
  presionAnteriorM: number
  longitudKm: number
}) {
  const s = (entrada.desnivelM + entrada.presionAnteriorM) / entrada.longitudKm
  return (entrada.caudalLps / (K_HAZEN_WILLIAMS * entrada.c * s ** 0.54)) ** (1 / 2.63)
}

export function tramoDelMetodo(e: EntradaTramoMetodo): ResultadoTramoMetodo {
  const desnivel = e.cotaInicio - e.cotaFin
  const longitudInclinadaM = longitudInclinada(desnivel, e.progresivaFinM - e.progresivaInicioM)
  const perdidaUnitariaMKm = perdidaUnitaria(e.caudalLps, e.c, e.diametroPulg)
  const perdidaCargaM = perdidaUnitariaMKm * (longitudInclinadaM / 1000)
  const presionResidualM = e.presionAnteriorM + desnivel - perdidaCargaM
  return {
    longitudInclinadaM,
    velocidadMs: velocidad(e.caudalLps, e.diametroPulg),
    perdidaUnitariaMKm,
    perdidaCargaM,
    presionResidualM,
    cotaPiezometricaFinal: e.cotaFin + presionResidualM,
  }
}
