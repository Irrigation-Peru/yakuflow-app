import {
  emisorDelCatalogo,
  generarRedDelProyecto,
  presionesEstaticas,
  presupuestoDeLaRed,
  redConCambios,
  type CambioDeRed,
  type CatalogoDePrecios,
  type Grilla,
  type PuntoGeografico,
} from '@riego/calculo'
import { riegoDeLaCampana, type EleccionDelRiego } from './campana.ts'

// Los pasos 5 y 6: generar la red del proyecto y ponerla a funcionar. Corre en el hilo del cálculo, no en la pantalla,
// porque una red de una hectárea son varios cientos de nodos y la pantalla tiene que seguir respondiendo mientras se
// resuelve. La red generada se recuerda: mientras no cambie lo decidido en los pasos 1 a 4, un cambio de diámetro solo
// vuelve a calcular la red, no a trazarla.

export type PlanteamientoDeLaRed = Parameters<typeof riegoDeLaCampana>[0] & {
  eleccion: EleccionDelRiego
  /** El contorno de la parcela tal como el estudiante lo marcó en el paso 1. */
  contorno: readonly PuntoGeografico[]
  /** La fuente, con la cota que le dio el relieve. */
  puntoDeLaFuente: PuntoGeografico & { cotaMsnm: number }
  /** Las cámaras de la conducción que calculó el paso 1. */
  camaras?: readonly (PuntoGeografico & { cota: number })[]
  grilla: Grilla
}

let ultima: { clave: string; generada: ReturnType<typeof generarRedDelProyecto> } | null = null

function redGenerada(planteamiento: PlanteamientoDeLaRed) {
  const clave = JSON.stringify(planteamiento)
  if (ultima?.clave === clave) return ultima.generada
  const { contorno, puntoDeLaFuente, camaras, grilla, ...campana } = planteamiento
  const { diseno } = riegoDeLaCampana(campana)
  if (!diseno) throw new Error('Falta el diseño agronómico del paso 4')
  if (diseno.turnos < 1) throw new Error('El diseño agronómico no dejó turnos de riego: vuelve al paso 4')
  const generada = generarRedDelProyecto({
    contorno,
    fuente: puntoDeLaFuente,
    camaras: camaras ? [...camaras] : undefined,
    grilla,
    metodo: campana.eleccion.metodo,
    emisor: campana.eleccion.emisor,
    separacionM: campana.eleccion.separacionM,
    separacionLateralesM: campana.eleccion.separacionLateralesM,
    turnos: diseno.turnos,
  })
  ultima = { clave, generada }
  return generada
}

/**
 * El diseño del estudiante: la red generada de lo que decidió en los pasos 1 a 4 (HU0017), con lo que le cambió encima
 * (HU0019), funcionando por sectores y con las válvulas cerradas (HU0020, HU0021), con sus alertas (HU0023) y su costo.
 */
export function laRedDelEstudiante(planteamiento: PlanteamientoDeLaRed, cambios: readonly CambioDeRed[], precios: CatalogoDePrecios | null) {
  const generada = redGenerada(planteamiento)
  const { red, analisis } = redConCambios(generada, cambios)
  const emisor = emisorDelCatalogo(planteamiento.eleccion.emisor)
  const camarasRompePresion = Object.values(red.elementos ?? {}).filter((e) => e.tipo === 'crp').length
  return {
    red,
    analisis,
    sectores: generada.sectores,
    laterales: generada.laterales,
    resumen: { ...generada.resumen, camarasRompePresion },
    origen: generada.origen,
    contornoLocal: generada.contornoLocal,
    presionNominalEmisorM: generada.presionNominalEmisorM,
    coeficienteK: emisor.coeficienteK,
    cerrada: presionesEstaticas(red),
    presupuesto: precios && presupuestoDeLaRed({ red, emisor: { codigo: emisor.codigo, coeficienteK: emisor.coeficienteK }, precios }),
  }
}

export type LaRedDelEstudiante = ReturnType<typeof laRedDelEstudiante>
