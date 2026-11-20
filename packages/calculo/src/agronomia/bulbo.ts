// Lo que pasa con el agua dentro del suelo (paso 4): el bulbo húmedo bajo un gotero y el escurrimiento bajo un
// aspersor que aplica más rápido de lo que el suelo infiltra.

import type { TexturaGruesa } from './cultivo'

/**
 * Profundidad del bulbo sobre su radio, por textura: en arena el agua baja más de lo que se abre, en arcilla se abre
 * más de lo que baja (Keller y Bliesner, 1990, describen las formas). Valores provisionales, por validar.
 */
export const RELACION_PROFUNDIDAD_RADIO: Readonly<Record<TexturaGruesa, number>> = { ligera: 1.5, media: 1, pesada: 0.6 }

export interface SueloDelBulbo {
  capacidadDeCampo: number
  puntoDeMarchitez: number
  gruesa: TexturaGruesa
}

/**
 * Humedad que el suelo puede ganar: se riega cuando el cultivo ya agotó la fracción p del agua útil, así que al regar
 * el suelo está en θcc − p · (θcc − θpmp) y el riego lo devuelve a capacidad de campo.
 */
const humedadQueGana = ({ capacidadDeCampo, puntoDeMarchitez }: SueloDelBulbo, fraccionAgotamiento: number) =>
  fraccionAgotamiento * (capacidadDeCampo - puntoDeMarchitez)

/**
 * Bulbo bajo un gotero, como un semielipsoide de revolución: el volumen de suelo que moja es el agua aplicada sobre
 * la humedad que el suelo gana, V = 2/3 · π · r² · z, con z = k · r según la textura.
 */
export function bulboHumedo({
  caudalLph,
  tiempoH,
  suelo,
  fraccionAgotamiento,
}: {
  caudalLph: number
  tiempoH: number
  suelo: SueloDelBulbo
  fraccionAgotamiento: number
}) {
  const aguaM3 = (caudalLph * tiempoH) / 1000
  const volumenDeSueloM3 = aguaM3 / humedadQueGana(suelo, fraccionAgotamiento)
  const k = RELACION_PROFUNDIDAD_RADIO[suelo.gruesa]
  const radioM = Math.cbrt((3 * volumenDeSueloM3) / (2 * Math.PI * k))
  return { aguaM3, volumenDeSueloM3, radioM, profundidadM: k * radioM }
}

export type FormaDelCorte = 'bulbos' | 'franja' | 'capa'

/**
 * Lo que mojan los goteros de un lateral. Mientras los bulbos no se juntan, cada gotero moja el suyo. Cuando se juntan,
 * el agua de un gotero ya no puede abrirse hacia el vecino y baja: el lateral moja una franja de sección semielíptica,
 * π/2 · r · z con z = k · r, con el agua por metro de lateral. Cuando las franjas de dos laterales también se juntan,
 * se moja una capa pareja y el frente baja con la lámina, como bajo un aspersor. De los tres se toma el que llega más
 * hondo: la franja pasa al bulbo solo después de que los bulbos se tocan, y la capa a la franja solo después de que las
 * franjas se tocan, así que el corte nunca retrocede al regar más tiempo.
 */
export function corteDelGoteo({
  caudalLph,
  tiempoH,
  separacionM,
  separacionLateralesM,
  suelo,
  fraccionAgotamiento,
}: {
  caudalLph: number
  tiempoH: number
  /** Entre goteros de un lateral, m. */
  separacionM: number
  separacionLateralesM: number
  suelo: SueloDelBulbo
  fraccionAgotamiento: number
}): { forma: FormaDelCorte; aguaM3: number; radioM: number; profundidadM: number } {
  const bulbo = bulboHumedo({ caudalLph, tiempoH, suelo, fraccionAgotamiento })
  const k = RELACION_PROFUNDIDAD_RADIO[suelo.gruesa]
  const seccionM2 = bulbo.aguaM3 / separacionM / humedadQueGana(suelo, fraccionAgotamiento)
  const radioDeLaFranjaM = Math.sqrt((2 * seccionM2) / (Math.PI * k))
  const profundidadDeLaCapaM = seccionM2 / separacionLateralesM
  if (profundidadDeLaCapaM > k * radioDeLaFranjaM) {
    return { forma: 'capa', aguaM3: bulbo.aguaM3, radioM: radioDeLaFranjaM, profundidadM: profundidadDeLaCapaM }
  }
  if (radioDeLaFranjaM > bulbo.radioM) {
    return { forma: 'franja', aguaM3: bulbo.aguaM3, radioM: radioDeLaFranjaM, profundidadM: k * radioDeLaFranjaM }
  }
  return { forma: 'bulbos', aguaM3: bulbo.aguaM3, radioM: bulbo.radioM, profundidadM: bulbo.profundidadM }
}

/** Bajo un aspersor: lo que no alcanza a infiltrar escurre; lo que entra baja hasta donde el suelo lo guarda. */
export function escurrimientoDeAspersion({
  intensidadMmH,
  infiltracionBasicaMmH,
  laminaAplicadaMm,
  suelo,
  fraccionAgotamiento,
}: {
  intensidadMmH: number
  infiltracionBasicaMmH: number
  laminaAplicadaMm: number
  suelo: SueloDelBulbo
  fraccionAgotamiento: number
}) {
  const fraccionEscurrida = intensidadMmH > infiltracionBasicaMmH ? 1 - infiltracionBasicaMmH / intensidadMmH : 0
  const laminaInfiltradaMm = laminaAplicadaMm * (1 - fraccionEscurrida)
  return {
    fraccionEscurrida,
    laminaInfiltradaMm,
    profundidadDelFrenteM: laminaInfiltradaMm / 1000 / humedadQueGana(suelo, fraccionAgotamiento),
  }
}
