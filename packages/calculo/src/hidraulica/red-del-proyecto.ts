// La red de un proyecto, a partir de lo que el estudiante decidió en los pasos 1 a 4 y lo que cambió después. El
// navegador la arma para responder al instante y el servidor la vuelve a armar con esta misma función antes de
// guardar: por eso vive en el módulo y no en una de las dos aplicaciones.

import { emisorDelCatalogo } from '../agronomia/emisores'
import { cotaEnGrilla, type Grilla } from '../terreno/relieve'
import { centroideDePoligono, desproyectarLocal, proyectarLocal, type PuntoGeografico, type PuntoLocal } from '../terreno/terreno'
import { alertasDelDiseno, disenoFunciona, type Alerta } from './alertas'
import { generarRed, PERDIDA_CABEZAL_TIPICA_M, SUMERGENCIA_DE_LA_SALIDA_M } from './diseno-de-red'
import { aplicarCambios, presionesMaximas, regarPorSectores, type CambioDeRed, type PresionDelTramo, type RiegoDelSector } from './operacion'
import type { Red } from './tipos'

/** Lo que el caudal medio de los emisores de un sector puede apartarse del nominal, fracción (Keller y Bliesner, 1990). */
export const VARIACION_DE_CAUDAL_ADMISIBLE = 0.1

export interface PlanteamientoDeLaRedDelProyecto {
  contorno: readonly PuntoGeografico[]
  fuente: PuntoGeografico & { cotaMsnm: number }
  /** Las cámaras de la conducción que calculó el paso 1, desde la fuente. */
  camaras?: readonly (PuntoGeografico & { cota: number })[]
  grilla: Grilla
  metodo: 'goteo' | 'aspersion'
  emisor: string
  separacionM: number
  separacionLateralesM: number
  turnos: number
  perdidaCabezalM?: number
}

export interface AnalisisDeLaRed {
  turnos: RiegoDelSector[]
  presiones: PresionDelTramo[]
  alertas: Alerta[]
  /** Ninguna alerta lo impide ni pide corregirlo: se puede pasar al paso 7. */
  funciona: boolean
}

/** Pone la red a funcionar sector por sector y saca de ahí las alertas (HU0020, HU0021, HU0023). */
export function analisisDeLaRed({
  red,
  sectores,
  presionNominalEmisorM,
}: {
  red: Red
  sectores: readonly string[]
  presionNominalEmisorM: number
}): AnalisisDeLaRed {
  const turnos = regarPorSectores(red, sectores)
  const presiones = presionesMaximas(red, sectores)
  const alertas = alertasDelDiseno({ red, turnos, presiones, presionNominalEmisorM })
  return { turnos, presiones, alertas, funciona: disenoFunciona(alertas) }
}

/**
 * Cuánto se aparta del nominal el caudal medio de los emisores de un sector, fracción. Cada nodo agrupa varios emisores
 * (su k), y cada uno entrega el nominal por (P / P nominal)^x: se promedia eso, pesado por k.
 */
export function razonDeCaudalDelSector(red: Red, turno: RiegoDelSector, presionNominalM: number, conSigno = false) {
  let suma = 0
  let peso = 0
  for (const e of red.emisores) {
    if (e.sector !== turno.sector) continue
    const presion = Math.max(0, turno.resultado.nodos[e.nodo]?.presionM ?? 0)
    suma += e.k * (presion / presionNominalM) ** e.x
    peso += e.k
  }
  const razon = peso > 0 ? suma / peso - 1 : 0
  return conSigno ? razon : Math.abs(razon)
}

/** El paso 5: de la parcela, la fuente y el diseño agronómico sale la red completa. No recibe nada dibujado (HU0017). */
export function generarRedDelProyecto(p: PlanteamientoDeLaRedDelProyecto) {
  const origen = centroideDePoligono(p.contorno)
  const local: PuntoLocal[] = p.contorno.map((punto, i) => {
    const cota = cotaEnGrilla(p.grilla, punto)
    if (cota === null) throw new Error(`El relieve no cubre el vértice ${i + 1} de la parcela: vuelve al paso 1 y ajusta el contorno`)
    return { ...proyectarLocal(origen, punto), z: cota }
  })
  const cotaDeRespaldo = local.reduce((s, q) => s + q.z, 0) / local.length
  const emisor = emisorDelCatalogo(p.emisor)
  const entrada: Parameters<typeof generarRed>[0] = {
    contorno: local,
    fuente: { ...proyectarLocal(origen, p.fuente), z: p.fuente.cotaMsnm, presionInicialM: SUMERGENCIA_DE_LA_SALIDA_M },
    camarasDeLaConduccion: (p.camaras ?? []).map((c) => ({ ...proyectarLocal(origen, c), z: c.cota })),
    // Fuera de la grilla se usa la cota media del contorno, que ya se comprobó que la grilla cubre.
    cotaEn: (x, y) => cotaEnGrilla(p.grilla, desproyectarLocal(origen, { x, y })) ?? cotaDeRespaldo,
    emisor: {
      caudalNominalLph: emisor.caudalNominalLph,
      presionNominalM: emisor.presionNominalM,
      coeficienteK: emisor.coeficienteK,
      exponenteX: emisor.exponenteX,
      autocompensado: emisor.autocompensado,
      presionMaximaM: emisor.presionMaximaM,
    },
    separacionM: p.separacionM,
    separacionLateralesM: p.separacionLateralesM,
    turnos: p.turnos,
    perdidaCabezalM: p.perdidaCabezalM ?? PERDIDA_CABEZAL_TIPICA_M[p.metodo],
  }
  let generado = generarRed(entrada)
  // El portalateral va por el centro, con laterales de la mitad del ancho. En una ladera muy empinada, bajar por el centro
  // puede cruzar el relieve de modo que pida más cámaras rompe-presión que por el borde, y cada cámara es una obra de
  // concreto: si el borde pide menos y la red funciona igual, se queda con el borde.
  const camarasDe = (d: ReturnType<typeof generarRed>) => Object.values(d.red.elementos ?? {}).filter((e) => e.tipo === 'crp').length
  const porElBorde = generarRed({ ...entrada, portalateral: 'borde' })
  if (camarasDe(porElBorde) < camarasDe(generado)) {
    const funciona = (d: ReturnType<typeof generarRed>) => analisisDeLaRed({ red: d.red, sectores: d.sectores, presionNominalEmisorM: emisor.presionNominalM }).funciona
    if (funciona(porElBorde) || !funciona(generado)) {
      entrada.portalateral = 'borde'
      generado = porElBorde
    }
  }
  // Una válvula reguladora por lateral es lo seguro en ladera, pero en terreno suave sobra: el portalateral pierde lo que
  // el terreno cae y basta una sola a la entrada del cabezal. Se prueba y se queda solo si la red riega como el diseño:
  // sin alertas que la impidan o pidan corregirla, con la uniformidad mínima en cada sector y con el caudal medio de sus
  // emisores a ±10 % del nominal (Keller y Bliesner, 1990). Lo último importa: un sector entero con presión de más riega
  // parejo, pero con más agua que la del diseño, y la uniformidad no lo ve.
  if (!emisor.autocompensado) {
    // La vara es la red con una válvula por lateral: la de una sola tiene que regar al menos tan cerca del caudal del
    // diseño, o dentro de lo admisible, sin alertas que la impidan o pidan corregirla.
    const delaDeSiempre = analisisDeLaRed({ red: generado.red, sectores: generado.sectores, presionNominalEmisorM: emisor.presionNominalM })
    const razones = (red: Red, a: AnalisisDeLaRed) => a.turnos.map((t) => razonDeCaudalDelSector(red, t, emisor.presionNominalM, true))
    const peor = (r: number[]) => Math.max(0, ...r.map(Math.abs))
    const tope = Math.max(VARIACION_DE_CAUDAL_ADMISIBLE, peor(razones(generado.red, delaDeSiempre)))
    // La consigna se corre hasta que los sectores quedan centrados en el caudal del diseño: los diámetros del catálogo
    // son discretos y el portalateral pierde algo menos de lo que el terreno cae, así que los sectores de abajo reciben
    // algo de más. La respuesta no es lineal (la válvula deja de regular cuando la carga no le alcanza): unos pocos pasos.
    let ajusteDelRegulador = 0
    for (let paso = 0; paso < 4; paso++) {
      const conUna = generarRed({ ...entrada, reguladorUnico: true, ajusteDelRegulador })
      const analisis = analisisDeLaRed({ red: conUna.red, sectores: conUna.sectores, presionNominalEmisorM: emisor.presionNominalM })
      const r = razones(conUna.red, analisis)
      if (analisis.funciona && peor(r) <= tope + 1e-9) {
        generado = conUna
        break
      }
      if (r.length === 0) break
      const centro = 1 + (Math.max(...r) + Math.min(...r)) / 2
      if (!(centro > 0)) break
      ajusteDelRegulador += emisor.presionNominalM * (1 - centro ** (1 / emisor.exponenteX))
    }
  }
  return { ...generado, origen, contornoLocal: local, presionNominalEmisorM: emisor.presionNominalM, emisor }
}

export type RedGenerada = ReturnType<typeof generarRedDelProyecto>

/** La red del estudiante: la generada con sus cambios encima, con su análisis. */
export function redConCambios(generada: Pick<RedGenerada, 'red' | 'sectores' | 'presionNominalEmisorM'>, cambios: readonly CambioDeRed[]) {
  const red = aplicarCambios(generada.red, cambios)
  return { red, analisis: analisisDeLaRed({ red, sectores: generada.sectores, presionNominalEmisorM: generada.presionNominalEmisorM }) }
}
