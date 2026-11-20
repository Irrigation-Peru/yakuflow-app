// Generación de la red a partir de lo que el estudiante ya decidió (HU0017). El estudiante no dibuja la red:
// pone la parcela, la fuente y el diseño agronómico, y de ahí sale la red completa con sus diámetros, sus
// clases, sus cámaras rompe-presión y sus sectores.
//
// El trazado sigue la práctica del método: los laterales van sobre las curvas de nivel, de modo que cada uno
// trabaja casi a la misma cota y la presión varía poco a lo largo del lateral; el portalateral baja por la
// línea de máxima pendiente, por el centro de la parcela, y entrega a un lateral a cada lado. Así cada lateral mide
// la mitad del ancho y puede ser de la manguera de 16 mm que se usa en campo, en lugar de un lateral del ancho
// entero que, para no perder presión, tendría que engrosarse.
//
// Los emisores no se modelan uno por uno. Un gotero cada 30 cm en una hectárea son decenas de miles de nodos,
// que ni el navegador resuelve ni la pantalla muestra. Cada lateral se parte en unos pocos tramos y los
// emisores de cada tramo se representan con un emisor equivalente en su extremo de aguas abajo, sumando los
// coeficientes k porque trabajan en paralelo. Se ponen aguas abajo —donde la presión del tramo es la menor—
// para que el reparto quede del lado seguro.

import { DESNIVEL_MAXIMO_SIN_CRP_M, KR, LONGITUD_MAXIMA_TRAMO_M, MARGEN_POR_PRECISION_DEL_RELIEVE_M } from '../constantes'
import { planoDelTerreno, type PuntoLocal } from '../terreno/terreno'
import { C_PVC, clasePorPresion, diametroPorPresion, diametroPorVelocidad } from './tuberias'
import type { Elemento, Emisor, Nodo, Red, Tramo } from './tipos'

const LPH_POR_LPS = 3600

export interface EmisorParaLaRed {
  caudalNominalLph: number
  /** Presión a la que el emisor entrega su caudal nominal, m.c.a. */
  presionNominalM: number
  coeficienteK: number
  exponenteX: number
  /** Regula su caudal: los laterales no llevan válvula reguladora, y la red no le da más de `presionMaximaM`. */
  autocompensado?: boolean
  presionMaximaM?: number
}

/**
 * Cuánto por encima de la nominal se regula el arranque del lateral. El emisor más lejano recibe menos por
 * la pérdida del lateral, así que se entra algo por encima para que el promedio quede en la nominal. El 10 %
 * es la mitad del 20 % de variación de presión que el método admite dentro de un lateral.
 */
export const HOLGURA_DE_REGULACION = 1.1

/**
 * Qué parte de la presión nominal se puede perder a lo largo de un lateral. Es el 20 % que el método admite dentro de un
 * sector: con Δp ≤ 20 % de la nominal, la uniformidad queda alrededor de 90 %.
 */
export const VARIACION_ADMITIDA_EN_EL_LATERAL = 0.2

/**
 * Velocidad con que se dimensionan la conducción, la matriz y los ramales, m/s. Es menor que los 3 m/s que el método
 * admite: el tubo se elige con el caudal nominal, pero en operación los emisores reciben algo más que la nominal —sobre
 * todo donde el lateral baja— y entregan más agua. Dimensionar justo en el límite deja tramos a 3.2 o 3.7 m/s.
 */
export const VELOCIDAD_DE_DISENO = 2.5

/** Lo mínimo que se reserva para la fricción de la matriz cuando la carga está justa, como parte de la nominal. */
const RESERVA_PARA_LA_MATRIZ = 0.1

/**
 * Pérdida típica del cabezal de filtrado, m, según el método: el goteo necesita filtrado fino porque el
 * emisor se tapa con partículas que al aspersor no le hacen nada. Son valores de referencia, del mismo orden
 * que los del banco de verificación; quedan pendientes los del catálogo comercial, que es el mismo pendiente
 * del catálogo de emisores y de tuberías.
 */
export const PERDIDA_CABEZAL_TIPICA_M: Readonly<Record<'goteo' | 'aspersion', number>> = { goteo: 10, aspersion: 5 }

/**
 * Presión con la que el agua sale de la fuente, m: la lámina sobre la salida del reservorio o de la cámara.
 * Es pequeña al lado del desnivel, y es la que usa el banco de verificación.
 */
export const SUMERGENCIA_DE_LA_SALIDA_M = 0.5

export interface EntradaDisenoDeRed {
  /** Contorno de la parcela en coordenadas locales, m, con la cota de cada vértice. */
  contorno: readonly PuntoLocal[]
  /** La fuente, en las mismas coordenadas locales, y la presión con la que entrega el agua. */
  fuente: { x: number; y: number; z: number; presionInicialM: number }
  /**
   * Las cámaras rompe-presión de la conducción que calculó el paso 1, en orden desde la fuente y en las mismas
   * coordenadas locales. Sin ellas, la conducción es un solo tramo de la fuente al cabezal.
   */
  camarasDeLaConduccion?: readonly { x: number; y: number; z: number }[]
  /** Cota del terreno en un punto local, m.s.n.m. Por omisión, el plano que ajusta el contorno. */
  cotaEn?: (x: number, y: number) => number
  emisor: EmisorParaLaRed
  /** Separación entre emisores sobre el lateral, m. */
  separacionM: number
  /** Separación entre laterales, m. */
  separacionLateralesM: number
  /** Turnos del diseño agronómico: cada turno es un sector con su válvula. */
  turnos: number
  /** Pérdida del cabezal de filtrado, m. */
  perdidaCabezalM: number
  /** En cuántos tramos se parte cada lateral; más tramos, más fino el reparto de presión. */
  tramosPorLateral?: number
  /**
   * Con gotero común, una sola válvula reguladora a la entrada del cabezal en lugar de una por lateral. Sirve cuando el
   * terreno es suave: el portalateral pierde por fricción lo que el terreno cae y la presión llega pareja a los laterales.
   * `generarRedDelProyecto` la prueba y se queda con ella solo si la red funciona y riega parejo.
   */
  reguladorUnico?: boolean
  /** Con una sola válvula, cuánto se corre su consigna respecto de la que se calcula, m: para centrar los sectores. */
  ajusteDelRegulador?: number
  /**
   * Por dónde baja el portalateral. Por el centro, con un lateral a cada lado, cada lateral mide la mitad del ancho: es
   * lo que se hace en campo para usar manguera de 16 mm. Por el borde, un solo lateral del ancho entero. En una ladera
   * muy empinada el borde puede pedir menos cámaras rompe-presión: `generarRedDelProyecto` prueba los dos.
   */
  portalateral?: 'centro' | 'borde'
}

export interface LateralDelDiseno {
  id: string
  sector: string
  emisores: number
  largoM: number
  /** Cota del arranque del lateral en el portalateral, m.s.n.m. */
  cota: number
}

export interface DisenoDeRed {
  red: Red
  /** Los sectores, en el orden en que se riegan. */
  sectores: readonly string[]
  laterales: readonly LateralDelDiseno[]
  resumen: {
    emisores: number
    /** Caudal que pide el sector de mayor demanda, l/s: es el que la red tiene que llevar. */
    caudalDisenoLps: number
    longitudTuberiaM: number
    camarasRompePresion: number
  }
}

/** Eje que baja por la máxima pendiente y su perpendicular, en coordenadas locales. */
interface EjesDeLadera {
  origen: { x: number; y: number }
  abajo: { x: number; y: number }
  cruzado: { x: number; y: number }
}

/**
 * Los ejes de la ladera. El gradiente del plano ajustado apunta cuesta arriba, así que `abajo` es el opuesto.
 * En terreno plano el gradiente es casi nulo y no hay dirección de bajada: se toma el eje x, porque con la
 * parcela a nivel el trazado da igual en cualquier dirección.
 */
function ejesDeLadera(contorno: readonly PuntoLocal[]): EjesDeLadera {
  const { b, c, centro } = planoDelTerreno(contorno)
  const modulo = Math.hypot(b, c)
  const abajo = modulo < 1e-9 ? { x: 1, y: 0 } : { x: -b / modulo, y: -c / modulo }
  return { origen: { x: centro.x, y: centro.y }, abajo, cruzado: { x: -abajo.y, y: abajo.x } }
}

const aLadera = (p: { x: number; y: number }, e: EjesDeLadera) => {
  const dx = p.x - e.origen.x
  const dy = p.y - e.origen.y
  return { u: dx * e.abajo.x + dy * e.abajo.y, v: dx * e.cruzado.x + dy * e.cruzado.y }
}

const aLocal = (p: { u: number; v: number }, e: EjesDeLadera) => ({
  x: e.origen.x + p.u * e.abajo.x + p.v * e.cruzado.x,
  y: e.origen.y + p.u * e.abajo.y + p.v * e.cruzado.y,
})

/**
 * Hasta dónde llega la parcela sobre la recta de cota constante `u`. Se toman el primer y el último cruce con
 * el contorno: en una parcela convexa es el lateral completo, y en una con entrantes el lateral pasa por
 * encima del entrante, que es como se traza en campo.
 */
function cruceDelContorno(contorno: readonly { u: number; v: number }[], u: number) {
  const cruces: number[] = []
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i]!
    const b = contorno[(i + 1) % contorno.length]!
    if (a.u === b.u) continue
    const t = (u - a.u) / (b.u - a.u)
    if (t >= 0 && t < 1) cruces.push(a.v + t * (b.v - a.v))
  }
  if (cruces.length < 2) return null
  return { desde: Math.min(...cruces), hasta: Math.max(...cruces) }
}

/** Reparte los laterales en sectores contiguos de demanda parecida: en campo un sector es una zona, no una lista. */
function repartirEnSectores(emisoresPorLateral: readonly number[], turnos: number) {
  const total = emisoresPorLateral.reduce((s, n) => s + n, 0)
  let acumulado = 0
  return emisoresPorLateral.map((n) => {
    const indice = total === 0 ? 0 : Math.min(turnos - 1, Math.floor((acumulado / total) * turnos))
    acumulado += n
    return `S${indice + 1}`
  })
}

/** Parte un tramo más largo que el máximo del método en partes iguales que sí lo cumplen. */
const partesDelTramo = (largoM: number) => Math.max(1, Math.ceil(largoM / LONGITUD_MAXIMA_TRAMO_M))

export function generarRed(entrada: EntradaDisenoDeRed): DisenoDeRed {
  const {
    contorno,
    fuente,
    emisor,
    separacionM,
    separacionLateralesM,
    turnos,
    perdidaCabezalM,
    tramosPorLateral = 5,
    reguladorUnico = false,
    ajusteDelRegulador = 0,
    portalateral = 'centro',
  } = entrada
  // Con gotero autocompensado no hay válvula al arranque de cada lateral: el emisor ya regula. Basta con que el lateral
  // reciba al menos su presión nominal y nunca más de lo que su rango admite; los pisos se cortan en ese tope.
  const regulaElEmisor = emisor.autocompensado === true
  const unaSolaValvula = reguladorUnico && !regulaElEmisor
  const consignaDelLateral = regulaElEmisor ? emisor.presionNominalM : emisor.presionNominalM * HOLGURA_DE_REGULACION
  const limiteDelLateralM = regulaElEmisor ? Math.min(DESNIVEL_MAXIMO_SIN_CRP_M, emisor.presionMaximaM ?? DESNIVEL_MAXIMO_SIN_CRP_M) : DESNIVEL_MAXIMO_SIN_CRP_M
  if (contorno.length < 3) throw new Error('La parcela necesita al menos tres vértices')
  if (!(turnos >= 1)) throw new Error(`El diseño agronómico no dejó turnos de riego: ${turnos}`)
  if (!(separacionM > 0) || !(separacionLateralesM > 0)) throw new Error('Las separaciones tienen que ser positivas')
  if (!(tramosPorLateral >= 1)) throw new Error(`Cada lateral necesita al menos un tramo: ${tramosPorLateral}`)

  const ejes = ejesDeLadera(contorno)
  const plano = planoDelTerreno(contorno)
  const cotaEn =
    entrada.cotaEn ?? ((x: number, y: number) => plano.centro.z + plano.b * (x - plano.centro.x) + plano.c * (y - plano.centro.y))
  const contornoLadera = contorno.map((p) => aLadera(p, ejes))
  const uMin = Math.min(...contornoLadera.map((p) => p.u))
  const uMax = Math.max(...contornoLadera.map((p) => p.u))

  // Los laterales, de arriba hacia abajo, a media separación del borde para que el primero y el último rieguen.
  const franjas: { u: number; desde: number; hasta: number }[] = []
  for (let u = uMin + separacionLateralesM / 2; u <= uMax; u += separacionLateralesM) {
    const cruce = cruceDelContorno(contornoLadera, u)
    if (!cruce) continue
    if (cruce.hasta - cruce.desde < separacionM) continue
    franjas.push({ u, desde: cruce.desde, hasta: cruce.hasta })
  }
  if (franjas.length === 0) throw new Error('La parcela es más chica que la separación entre laterales')

  // El portalateral baja por el centro de la parcela; en una franja que no llega al centro, por su punto más cercano.
  const vMin = Math.min(...contornoLadera.map((p) => p.v))
  const vMax = Math.max(...contornoLadera.map((p) => p.v))
  const vCentro = (vMin + vMax) / 2
  const centroDe = (f: { desde: number; hasta: number }) =>
    portalateral === 'borde' ? f.desde : Math.min(f.hasta, Math.max(f.desde, vCentro))
  // Las dos mitades de cada franja, una a cada lado del portalateral; la que no alcanza un emisor no lleva lateral.
  const mitades = franjas.map((f) => {
    const c = centroDe(f)
    return [
      { lado: -1, largoM: c - f.desde },
      { lado: 1, largoM: f.hasta - c },
    ]
      .filter((m) => m.largoM >= separacionM)
      .map((m) => ({ ...m, emisores: Math.floor(m.largoM / separacionM) }))
  })
  const emisoresPorLateral = mitades.map((ms) => ms.reduce((s, m) => s + m.emisores, 0))
  // Lo que cada lateral sube y baja en el terreno real. Sobre el plano ajustado irían a nivel, pero el relieve real
  // ondula: un lateral de 100 m puede subir 20 m. El piso se decide con lo más bajo del lateral, la toma con lo más
  // alto, y la válvula del lateral entrega lo que el emisor necesita más lo que el lateral sube.
  // Las cotas se toman en los mismos puntos donde van los nodos de los laterales, para que el piso y la válvula se
  // decidan con la cota que el cálculo después verá.
  const perfiles = franjas.map((f, i) => {
    const c = centroDe(f)
    const centroQ = aLocal({ u: f.u, v: c }, ejes)
    const cotas = [cotaEn(centroQ.x, centroQ.y)]
    for (const m of mitades[i]!) {
      for (let j = 1; j <= tramosPorLateral; j++) {
        const q = aLocal({ u: f.u, v: c + (m.lado * m.largoM * j) / tramosPorLateral }, ejes)
        cotas.push(cotaEn(q.x, q.y))
      }
    }
    return { minima: Math.min(...cotas), maxima: Math.max(...cotas), arranque: cotas[0]! }
  })
  const sectores = repartirEnSectores(emisoresPorLateral, turnos)

  const nodos: Nodo[] = []
  const tramos: Tramo[] = []
  const emisores: Emisor[] = []
  const elementos: Record<string, Elemento> = {}
  const laterales: LateralDelDiseno[] = []

  const porId = new Map<string, Nodo>()
  const ponerNodo = (id: string, x: number, y: number, z: number) => {
    const nodo = { id, x, y, z }
    nodos.push(nodo)
    porId.set(id, nodo)
    return id
  }
  const nodo = (id: string) => porId.get(id) ?? (() => { throw new Error(`No hay nodo ${id}`) })()

  // La fuente y el cabezal, en el arranque del portalateral.
  ponerNodo('F', fuente.x, fuente.y, fuente.z)
  const arranque = aLocal({ u: franjas[0]!.u, v: centroDe(franjas[0]!) }, ejes)
  const cotaArranque = cotaEn(arranque.x, arranque.y)
  ponerNodo('C', arranque.x, arranque.y, cotaArranque)
  elementos['C'] = { tipo: 'cabezal', perdidaM: perdidaCabezalM }

  // Caudal que pide cada lateral y, por sector, el que pide el sector entero.
  const caudalLateralLps = emisoresPorLateral.map((n) => (n * emisor.caudalNominalLph) / LPH_POR_LPS)
  const caudalPorSector = new Map<string, number>()
  sectores.forEach((s, i) => caudalPorSector.set(s, (caudalPorSector.get(s) ?? 0) + caudalLateralLps[i]!))
  const caudalDisenoLps = Math.max(...caudalPorSector.values())

  // La conducción, de la fuente al cabezal, pasando por las cámaras del paso 1. Entre dos puntos conocidos la cota
  // se interpola en línea recta: la conducción puede salir de la cuadrícula del relieve, y su perfil detallado ya
  // se usó en el paso 1 para ubicar las cámaras. Los tramos más largos que el máximo del método se parten.
  //
  // El diámetro sale de la pérdida que el tramo se puede permitir. Hasta una cámara, casi toda la caída: el agua solo
  // tiene que llegar. De la última cámara al cabezal, lo que sobre después de la presión que los laterales necesitan.
  const pendienteMPorKm = (perdidaM: number, largoM: number) => (largoM > 0 ? (1000 * Math.max(perdidaM, 0)) / largoM : Infinity)
  const reservaDeLaMatrizM = RESERVA_PARA_LA_MATRIZ * emisor.presionNominalM
  let nivelDeLaConduccion = fuente.z + fuente.presionInicialM
  let anteriorDeLaConduccion = 'F'
  let tramosDeLaConduccion = 0
  const paradas = [...(entrada.camarasDeLaConduccion ?? []).map((c, i) => ({ ...c, id: `R${i + 1}`, camara: true })), { ...nodo('C'), camara: false }]
  for (const parada of paradas) {
    const desde = nodo(anteriorDeLaConduccion)
    const largo = Math.hypot(parada.x - desde.x, parada.y - desde.y)
    const partes = partesDelTramo(largo)
    const cargaM = nivelDeLaConduccion - parada.z
    const perdidaPermitidaM = parada.camara ? 0.8 * cargaM : Math.max(cargaM - perdidaCabezalM - consignaDelLateral, reservaDeLaMatrizM)
    const diametroDeLaConduccion = diametroPorPresion(caudalDisenoLps, pendienteMPorKm(perdidaPermitidaM, largo), VELOCIDAD_DE_DISENO)
    for (let p = 1; p <= partes; p++) {
      const t = p / partes
      const id = p < partes ? `${parada.id}p${p}` : parada.id
      const z = desde.z + t * (parada.z - desde.z)
      if (p < partes) ponerNodo(id, desde.x + t * (parada.x - desde.x), desde.y + t * (parada.y - desde.y), z)
      else if (parada.camara) ponerNodo(id, parada.x, parada.y, parada.z)
      tramos.push({
        id: tramosDeLaConduccion === 0 ? 'conduccion' : `conduccion${tramosDeLaConduccion + 1}`,
        desde: anteriorDeLaConduccion,
        hasta: id,
        diametroInternoMm: diametroDeLaConduccion,
        c: C_PVC,
        coeficientesKr: tramosDeLaConduccion === 0 ? [KR.entrada] : undefined,
        presionMaximaM: clasePorPresion(nivelDeLaConduccion - z).presionMaximaM,
      })
      tramosDeLaConduccion++
      anteriorDeLaConduccion = id
    }
    if (parada.camara) {
      elementos[parada.id] = { tipo: 'crp' }
      nivelDeLaConduccion = parada.z
    }
  }
  // Con una sola válvula, va a la entrada del cabezal: regula la presión de toda la parcela. Su consigna deja a cada
  // lateral su presión después de lo que pierde el cabezal, también al que arranca más arriba que el cabezal.
  let consignaDeLaValvulaUnica = 0
  if (unaSolaValvula) {
    const cotaC = nodo('C').z
    consignaDeLaValvulaUnica = consignaDelLateral + perdidaCabezalM + Math.max(0, ...perfiles.map((perfil) => perfil.maxima - cotaC)) + ajusteDelRegulador
    const llegada = tramos.find((t) => t.hasta === 'C')
    if (llegada) {
      const c = nodo('C')
      ponerNodo('VC', c.x, c.y, c.z)
      elementos['VC'] = { tipo: 'vrp', consignaM: consignaDeLaValvulaUnica }
      llegada.hasta = 'VC'
      tramos.push({ id: 'vc', desde: 'VC', hasta: 'C', diametroInternoMm: llegada.diametroInternoMm, c: C_PVC, presionMaximaM: llegada.presionMaximaM })
    }
  }

  // Los nodos de la conducción desde su último nivel libre: de ellos también puede salir el ramal de un piso.
  const conduccionDelPiso0: string[] = []
  {
    let id: string | undefined = 'C'
    while (id) {
      conduccionDelPiso0.unshift(id)
      if (elementos[id]?.tipo === 'crp' || id === 'F') break
      id = tramos.find((t) => t.hasta === id)?.desde
    }
  }
  const ultimaCamara = entrada.camarasDeLaConduccion?.at(-1)

  // El portalateral: el caudal de cada uno de sus tramos es el del sector más exigente que quede aguas abajo.
  const caudalDelPortalateral = (desdeIndice: number) => {
    let mayor = 0
    for (const [s, caudal] of caudalPorSector) {
      const alcanza = sectores.some((sector, i) => sector === s && i >= desdeIndice)
      if (alcanza) mayor = Math.max(mayor, caudal)
    }
    return mayor
  }

  let nodoAnterior = 'C'
  // Dos referencias distintas, que antes estaban confundidas en una:
  // - `referenciaDelDesnivel` es la cota desde la que se mide la caída acumulada, para decidir la cámara
  //   rompe-presión. Es la misma que usa la guarda de `calcularRed`, así que el generador no pone cámaras
  //   que el cálculo no pide ni se salta las que sí. Lo que el método limita ahí es el desnivel.
  // - `nivelDelAgua` es la cota de la superficie libre, para elegir la clase de la tubería. Ahí sí entra la
  //   presión con la que la fuente entrega, porque la clase la decide la presión y no el desnivel.
  // Las dos vuelven a la cota del nodo en cada cámara.
  let referenciaDelDesnivel = ultimaCamara?.z ?? fuente.z
  let nivelDelAgua = nivelDeLaConduccion
  let camaras = entrada.camarasDeLaConduccion?.length ?? 0
  // Con una sola válvula, los laterales que cuelgan de ella no llevan la suya; desde la primera cámara dentro de la
  // parcela la presión vuelve a cero y la válvula del cabezal ya no los regula: esos llevan la propia.
  let enZonaDelRegulador = unaSolaValvula
  let diametroAnterior = 0

  // La red por pisos. Cuando un lateral quedaría a más de 50 m bajo el nivel libre, una cámara en la misma línea lo
  // resolvería para él, pero dejaría sin presión a los laterales que caen justo debajo de ella: la cámara deja el agua a
  // su propia cota. En campo se hace otra cosa: la cámara se pone más arriba, donde la línea todavía está a la altura
  // que el lateral necesita sobre él, y de ella baja un ramal propio, el del piso nuevo, que alimenta a ese lateral y
  // a los que siguen. Así todo lateral queda entre lo que su válvula necesita y los 50 m. Debajo de una cámara el
  // cabezal ya no cuenta: la cámara devuelve el agua a la presión de la atmósfera.
  const cargaDelPiso = consignaDelLateral + 2 * reservaDeLaMatrizM + MARGEN_POR_PRECISION_DEL_RELIEVE_M
  // La línea del piso, en orden desde su nivel libre: la tubería por la que baja el agua de ese piso.
  let lineaDelPiso: string[] = [...conduccionDelPiso0]
  let pisos = 0
  let tomas = 0
  /** El punto más bajo de la línea del piso que todavía está a `cota` o más arriba; si cae entre dos nodos, parte el tramo. */
  const tomaEnLaLinea = (cota: number) => {
    for (let k = lineaDelPiso.length - 1; k >= 0; k--) {
      const a = nodo(lineaDelPiso[k]!)
      if (a.z < cota) continue
      const siguiente = lineaDelPiso[k + 1]
      if (siguiente === undefined) return a.id
      const b = nodo(siguiente)
      const indice = tramos.findIndex((t) => t.desde === a.id && t.hasta === b.id)
      if (indice < 0 || a.z - b.z < 0.5) return a.id
      const f = (a.z - cota) / (a.z - b.z)
      const id = `T${++tomas}`
      ponerNodo(id, a.x + f * (b.x - a.x), a.y + f * (b.y - a.y), cota)
      const original = tramos[indice]!
      tramos.splice(indice, 1, { ...original, hasta: id }, { ...original, id: `${original.id}t${tomas}`, desde: id, coeficientesKr: undefined })
      lineaDelPiso.splice(k + 1, 0, id)
      return id
    }
    return undefined
  }

  let numeroDeLateral = 0
  franjas.forEach((franja, i) => {
    const junta = aLocal({ u: franja.u, v: centroDe(franja) }, ejes)
    const cotaJunta = cotaEn(junta.x, junta.y)
    const idJunta = i === 0 ? 'C' : `J${i}`

    if (i > 0) {
      const caudalLps = caudalDelPortalateral(i)
      const { minima: zMinima, maxima: zMaxima } = perfiles[i]!
      if (referenciaDelDesnivel - Math.min(cotaJunta, zMinima) > limiteDelLateralM) {
        const toma = tomaEnLaLinea(Math.max(cotaJunta, zMaxima) + cargaDelPiso)
        if (toma) {
          pisos++
          const desde = nodo(toma)
          const idCamara = `P${pisos}`
          ponerNodo(idCamara, desde.x + 0.6 * ejes.cruzado.x, desde.y + 0.6 * ejes.cruzado.y, desde.z)
          elementos[idCamara] = { tipo: 'crp' }
          tramos.push({
            id: `p${pisos}`,
            desde: toma,
            hasta: idCamara,
            diametroInternoMm: diametroPorVelocidad(caudalLps, VELOCIDAD_DE_DISENO),
            c: C_PVC,
            presionMaximaM: clasePorPresion(nivelDelAgua - desde.z).presionMaximaM,
          })
          referenciaDelDesnivel = desde.z
          nivelDelAgua = desde.z
          camaras++
          enZonaDelRegulador = false
          nodoAnterior = idCamara
          diametroAnterior = 0
          lineaDelPiso = [idCamara]
        }
      }
      const anterior = nodo(nodoAnterior)
      // El portalateral baja: se puede perder lo que el terreno cae, y la presión se mantiene pareja de lateral a lateral.
      const largoDelTramo = Math.hypot(junta.x - anterior.x, junta.y - anterior.y)
      // Si el tramo arranca en una cámara, el agua parte sin presión: puede perder solo lo que sobre después de lo que
      // la válvula del lateral necesita. Si no, lo que el terreno cae, y la presión se mantiene de lateral a lateral.
      const necesitaLaValvulaM = consignaDelLateral + Math.max(0, perfiles[i]!.maxima - cotaJunta) + reservaDeLaMatrizM
      const perdidaPermitidaM =
        elementos[nodoAnterior]?.tipo === 'crp' ? anterior.z - cotaJunta - necesitaLaValvulaM : anterior.z - cotaJunta
      const diametroMm = diametroPorPresion(caudalLps, pendienteMPorKm(Math.max(perdidaPermitidaM, reservaDeLaMatrizM / franjas.length), largoDelTramo), VELOCIDAD_DE_DISENO)
      // Además del largo, ninguna parte baja más que el límite: así siempre hay un nodo aguas arriba para la cámara.
      const partes = Math.max(
        partesDelTramo(Math.hypot(junta.x - anterior.x, junta.y - anterior.y)),
        Math.ceil(Math.abs(anterior.z - cotaJunta) / DESNIVEL_MAXIMO_SIN_CRP_M),
      )
      // Los tramos largos se parten; las partes intermedias son nodos de paso, sin emisor ni elemento.
      for (let p = 1; p <= partes; p++) {
        const t = p / partes
        const x = anterior.x + t * (junta.x - anterior.x)
        const y = anterior.y + t * (junta.y - anterior.y)
        const id = p === partes ? idJunta : `${idJunta}p${p}`
        const cota = p === partes ? cotaJunta : cotaEn(x, y)
        // Una cámara aguas arriba del nodo que pasaría el límite del método: es lo que pide la guarda de
        // `calcularRed`. La cámara abre una zona de presión nueva, y los laterales que quedan justo debajo trabajan
        // con la poca carga que ella deja; es el análisis de alertas el que tiene que decirlo. Si el nodo de arriba
        // ya tiene un elemento (el cabezal), la cámara va en un nodo propio, donde la caída llega justo al límite.
        if (referenciaDelDesnivel - cota > DESNIVEL_MAXIMO_SIN_CRP_M) {
          let lugarDeLaCamara = nodoAnterior
          if (elementos[nodoAnterior]) {
            const arriba = nodo(nodoAnterior)
            const cotaLimite = referenciaDelDesnivel - DESNIVEL_MAXIMO_SIN_CRP_M
            const fraccion = arriba.z === cota ? 0.5 : Math.min(1, Math.max(0, (arriba.z - cotaLimite) / (arriba.z - cota)))
            lugarDeLaCamara = `${id}c`
            ponerNodo(lugarDeLaCamara, arriba.x + fraccion * (x - arriba.x), arriba.y + fraccion * (y - arriba.y), cotaLimite)
            tramos.push({
              id: `m${i}c${p}`,
              desde: nodoAnterior,
              hasta: lugarDeLaCamara,
              diametroInternoMm: diametroMm,
              c: C_PVC,
              presionMaximaM: clasePorPresion(nivelDelAgua - cotaLimite).presionMaximaM,
            })
            nodoAnterior = lugarDeLaCamara
          }
          elementos[lugarDeLaCamara] = { tipo: 'crp' }
          lineaDelPiso = [lugarDeLaCamara]
          referenciaDelDesnivel = nodo(lugarDeLaCamara).z
          nivelDelAgua = referenciaDelDesnivel
          camaras++
          enZonaDelRegulador = false
        }
        ponerNodo(id, x, y, cota)
        lineaDelPiso.push(id)
        const presionEstaticaM = nivelDelAgua - cota
        tramos.push({
          id: `m${i}${p === partes ? '' : `p${p}`}`,
          desde: nodoAnterior,
          hasta: id,
          diametroInternoMm: diametroMm,
          c: C_PVC,
          coeficientesKr: diametroAnterior !== 0 && diametroAnterior !== diametroMm ? [KR.reduccion] : undefined,
          presionMaximaM: clasePorPresion(presionEstaticaM).presionMaximaM,
        })
        nodoAnterior = id
        diametroAnterior = diametroMm
      }
    }

    // Los laterales de la franja, uno a cada lado de la junta. Cada uno se parte en tramos y los emisores de cada tramo van
    // en su extremo de aguas abajo.
    const sector = sectores[i]!
    const centro = centroDe(franja)
    // Con gotero común, una válvula reguladora en la junta, antes de que el agua se reparta a los dos laterales de la
    // curva de nivel: los dos trabajan a la misma cota y piden la misma consigna. Sin ella el emisor trabaja con la presión
    // que le toque por su cota —en una ladera, varias veces la nominal— y entrega mucho más agua que la que el diseño
    // agronómico calculó. Va en un nodo propio, aguas abajo de la junta, para no recortar también el portalateral que
    // sigue bajando. Con autocompensado, los laterales arrancan de la junta.
    const consignaDeEsteLateral = consignaDelLateral + Math.max(0, perfiles[i]!.maxima - cotaJunta)
    let arranqueDelLateral = idJunta
    // Una franja tan angosta que ninguna de sus mitades alcanza un emisor no lleva lateral, ni válvula.
    const conValvulaPropia = !regulaElEmisor && !enZonaDelRegulador && mitades[i]!.length > 0
    if (conValvulaPropia) {
      // Lleva el número del primer lateral que alimenta: así la pantalla la nombra y la ubica en su sector.
      const idValvula = `V${numeroDeLateral + 1}`
      ponerNodo(idValvula, nodo(idJunta).x, nodo(idJunta).y, cotaJunta)
      elementos[idValvula] = { tipo: 'vrp', consignaM: consignaDeEsteLateral }
      tramos.push({
        id: `v${numeroDeLateral + 1}`,
        desde: idJunta,
        hasta: idValvula,
        diametroInternoMm: diametroPorVelocidad(caudalLateralLps[i]!, VELOCIDAD_DE_DISENO),
        c: C_PVC,
        presionMaximaM: clasePorPresion(nivelDelAgua - cotaJunta).presionMaximaM,
      })
      arranqueDelLateral = idValvula
    }
    for (const mitad of mitades[i]!) {
      const n = ++numeroDeLateral
      const emisoresDelLateral = mitad.emisores
      const largoM = mitad.largoM
      laterales.push({ id: `L${n}`, sector, emisores: emisoresDelLateral, largoM, cota: cotaJunta })

      // La presión más alta que ve el lateral: la consigna de su válvula o, sin ella, la estática hasta su punto más bajo.
      const presionDelLateralM = regulaElEmisor
        ? nivelDelAgua - perfiles[i]!.minima
        : conValvulaPropia
          ? consignaDeEsteLateral + Math.max(0, cotaJunta - perfiles[i]!.minima)
          : consignaDeLaValvulaUnica + Math.max(0, nodo('C').z - perfiles[i]!.minima)

      let nodoDelLateral = arranqueDelLateral
      let diametroDelLateralAnterior = 0
      for (let j = 1; j <= tramosPorLateral; j++) {
        const hasta = Math.round((emisoresDelLateral * j) / tramosPorLateral)
        const desde = Math.round((emisoresDelLateral * (j - 1)) / tramosPorLateral)
        const enEsteTramo = hasta - desde
        const punto = aLocal({ u: franja.u, v: centro + (mitad.lado * largoM * j) / tramosPorLateral }, ejes)
        const id = `L${n}-${j}`
        const cota = cotaEn(punto.x, punto.y)
        ponerNodo(id, punto.x, punto.y, cota)
        // Lo que falta por entregar aguas abajo de este tramo, incluido él.
        const caudalLps = ((emisoresDelLateral - desde) * emisor.caudalNominalLph) / LPH_POR_LPS
        const diametroMm = diametroPorPresion(caudalLps, pendienteMPorKm(VARIACION_ADMITIDA_EN_EL_LATERAL * emisor.presionNominalM, largoM))
        tramos.push({
          id: `l${n}-${j}`,
          desde: nodoDelLateral,
          hasta: id,
          diametroInternoMm: diametroMm,
          c: C_PVC,
          coeficientesKr:
            j === 1 ? [KR.entrada] : diametroDelLateralAnterior !== diametroMm ? [KR.reduccion] : undefined,
          presionMaximaM: clasePorPresion(presionDelLateralM).presionMaximaM,
        })
        if (enEsteTramo > 0) {
          emisores.push({ nodo: id, k: enEsteTramo * emisor.coeficienteK, x: emisor.exponenteX, sector })
        }
        nodoDelLateral = id
        diametroDelLateralAnterior = diametroMm
      }
    }
  })

  const longitudTuberiaM = tramos.reduce((suma, t) => {
    const a = nodo(t.desde)
    const b = nodo(t.hasta)
    return suma + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  }, 0)

  return {
    red: { nodos, tramos, emisores, elementos, fuente: { nodo: 'F', presionInicialM: fuente.presionInicialM } },
    sectores: [...caudalPorSector.keys()],
    laterales,
    resumen: {
      emisores: emisoresPorLateral.reduce((s, n) => s + n, 0),
      caudalDisenoLps,
      longitudTuberiaM,
      camarasRompePresion: camaras,
    },
  }
}
