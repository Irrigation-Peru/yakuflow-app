import { DESNIVEL_MAXIMO_SIN_CRP_M, LONGITUD_MAXIMA_TRAMO_M, VELOCIDAD_MAXIMA, VELOCIDAD_MINIMA } from '../constantes'
import {
  caudalDeEmisor,
  derivadaCaudalDeEmisor,
  derivadaPresionParaCaudal,
  energiaDeEmisor,
  EXPONENTE_MAXIMO_EMISOR,
  EXPONENTE_MINIMO_EMISOR,
  presionParaCaudal,
  TOLERANCIA_PRESION_M,
} from './emisor'
import { friccionEpanet, localEpanet, velocidadEpanet } from './epanet'
import { longitudInclinada, perdidaLocal, perdidaUnitaria, velocidad } from './metodo'
import type {
  Elemento,
  EstadoVelocidad,
  OpcionesCalculo,
  Rechazo,
  Red,
  ResultadoNodo,
  ResultadoRed,
  ResultadoTramo,
} from './tipos'

const PULGADAS_POR_MM = 1 / 25.4

/** La red ya orientada desde la fuente: cada nodo sabe por qué tramo le llega el agua. */
interface Topologia {
  /** Índices de nodo en preorden: cada nodo aparece después del nodo que lo alimenta. */
  orden: number[]
  padre: Int32Array
  /** Índice del tramo por el que llega el agua a cada nodo; -1 en la fuente. */
  tramoDeLlegada: Int32Array
}

function orientar(red: Red, indiceNodo: Map<string, number>): Topologia {
  const n = red.nodos.length
  const vecinos: { nodo: number; tramo: number }[][] = Array.from({ length: n }, () => [])
  red.tramos.forEach((t, i) => {
    const a = indiceNodo.get(t.desde)
    const b = indiceNodo.get(t.hasta)
    if (a === undefined) throw new Error(`El tramo ${t.id} sale del nodo ${t.desde}, que no existe`)
    if (b === undefined) throw new Error(`El tramo ${t.id} llega al nodo ${t.hasta}, que no existe`)
    vecinos[a]!.push({ nodo: b, tramo: i })
    vecinos[b]!.push({ nodo: a, tramo: i })
  })

  const raiz = indiceNodo.get(red.fuente.nodo)
  if (raiz === undefined) throw new Error(`La fuente está en el nodo ${red.fuente.nodo}, que no existe`)

  const padre = new Int32Array(n).fill(-1)
  const tramoDeLlegada = new Int32Array(n).fill(-1)
  const visitado = new Uint8Array(n)
  const orden = [raiz]
  visitado[raiz] = 1
  for (let i = 0; i < orden.length; i++) {
    const actual = orden[i]!
    for (const { nodo, tramo } of vecinos[actual]!) {
      if (tramo === tramoDeLlegada[actual]) continue
      if (visitado[nodo]) {
        throw new Error(`La red forma una malla en el tramo ${red.tramos[tramo]!.id}: solo se calculan redes abiertas`)
      }
      visitado[nodo] = 1
      padre[nodo] = actual
      tramoDeLlegada[nodo] = tramo
      orden.push(nodo)
    }
  }
  const suelto = red.nodos.find((_, i) => !visitado[i])
  if (suelto) throw new Error(`El nodo ${suelto.id} no está conectado a la fuente`)
  return { orden, padre, tramoDeLlegada }
}

function aplicarElemento(elemento: Elemento | undefined, presionLlegada: number) {
  if (!elemento) return presionLlegada
  switch (elemento.tipo) {
    case 'crp':
      // Si el agua llega sin presión, la cámara queda seca: no puede devolverle presión.
      return Math.min(presionLlegada, 0)
    case 'vrp':
      return Math.min(presionLlegada, elemento.consignaM)
    case 'cabezal':
      return presionLlegada - elemento.perdidaM
  }
}

function estadoDeVelocidad(v: number): EstadoVelocidad {
  if (v < VELOCIDAD_MINIMA) return 'sedimentacion'
  if (v > VELOCIDAD_MAXIMA) return 'vibracion'
  return 'adecuada'
}

/**
 * Calcula presiones y caudales de una red abierta.
 *
 * El caudal de cada tramo es la suma de los emisores aguas abajo, y el de cada emisor depende de la presión
 * de su nodo (q = k · P^x). Una CRP o una VRP activa fija la presión de todo lo que tiene aguas abajo, así que,
 * con el estado de cada válvula supuesto, la red se parte en subredes que se resuelven por separado, de las
 * más bajas a la fuente: cada una le pide a la de arriba un caudal fijo. Después se revisa que cada válvula
 * esté en el estado supuesto y, si no, se corrige y se vuelve a resolver.
 *
 * Cada subred se resuelve con el método de Newton amortiguado: en cada paso se linealiza y, por ser un árbol,
 * el sistema lineal se resuelve en un solo recorrido de las hojas a la raíz. El amortiguamiento es la
 * sub-relajación del lazo entre emisor y presión: el paso se acorta hasta que baja la energía de la subred.
 * Se probó primero una sub-relajación de factor fijo y no convergía en 8 de cada 10 redes al azar.
 */
export function calcularRed(red: Red, opciones: OpcionesCalculo = {}): ResultadoRed {
  const { sectoresAbiertos = 'todos', formulacion = 'metodo', tolerancia = 1e-12, iteracionesMaximas = 100 } = opciones

  const indiceNodo = new Map(red.nodos.map((nodo, i) => [nodo.id, i]))
  const { orden, padre, tramoDeLlegada } = orientar(red, indiceNodo)
  const n = red.nodos.length
  const z = red.nodos.map((nodo) => nodo.z)
  const elementos = red.nodos.map((nodo) => red.elementos?.[nodo.id])

  // Geometría y pérdidas de cada tramo: no cambian entre iteraciones.
  const longitud = red.tramos.map((t) => {
    const a = red.nodos[indiceNodo.get(t.desde)!]!
    const b = red.nodos[indiceNodo.get(t.hasta)!]!
    return longitudInclinada(a.z - b.z, Math.hypot(a.x - b.x, a.y - b.y))
  })
  const sumaKr = red.tramos.map((t) => (t.coeficientesKr ?? []).reduce((s, kr) => s + kr, 0))
  const exponenteFriccion = formulacion === 'epanet' ? 1.852 : 1.85
  const friccion = (i: number, q: number) => {
    const t = red.tramos[i]!
    if (q === 0) return 0
    return formulacion === 'epanet'
      ? friccionEpanet(q, t.c, t.diametroInternoMm, longitud[i]!)
      : perdidaUnitaria(q, t.c, t.diametroInternoMm * PULGADAS_POR_MM) * (longitud[i]! / 1000)
  }
  const velocidadDe = (i: number, q: number) => {
    const t = red.tramos[i]!
    return formulacion === 'epanet'
      ? velocidadEpanet(q, t.diametroInternoMm)
      : velocidad(q, t.diametroInternoMm * PULGADAS_POR_MM)
  }
  const local = (i: number, q: number) => {
    if (sumaKr[i] === 0 || q === 0) return 0
    const t = red.tramos[i]!
    return formulacion === 'epanet'
      ? localEpanet(q, sumaKr[i]!, t.diametroInternoMm)
      : perdidaLocal(velocidadDe(i, q), t.coeficientesKr ?? [])
  }

  // Emisores, con el índice de su nodo. Los de un sector cerrado no entregan agua.
  const abierto = (sector?: string) =>
    sectoresAbiertos === 'todos' || (sector !== undefined && sectoresAbiertos.includes(sector))
  const emisores = red.emisores.map((e) => {
    const nodo = indiceNodo.get(e.nodo)
    if (nodo === undefined) throw new Error(`Un emisor está en el nodo ${e.nodo}, que no existe`)
    if (!(e.k > 0)) throw new Error(`El emisor del nodo ${e.nodo} tiene un coeficiente de caudal k = ${e.k}: debe ser positivo`)
    if (!(e.x === 0 || (e.x >= EXPONENTE_MINIMO_EMISOR && e.x <= EXPONENTE_MAXIMO_EMISOR))) {
      throw new Error(
        `El emisor del nodo ${e.nodo} tiene un exponente x = ${e.x}: debe ser 0 (autocompensante) o estar entre ${EXPONENTE_MINIMO_EMISOR} y ${EXPONENTE_MAXIMO_EMISOR}`,
      )
    }
    return { nodo, k: e.k, x: e.x, abierto: abierto(e.sector) }
  })
  const m = emisores.length

  const caudalNodo = new Float64Array(n) // l/s que pasan por el nodo hacia aguas abajo
  const caudalTramo = new Float64Array(red.tramos.length)
  const presionLlegada = new Float64Array(n)
  const presion = new Float64Array(n)

  /** Recorrido exacto de toda la red: con los caudales de los emisores, el de cada tramo y la presión de cada nodo. */
  const recorrer = (caudalEmisorLph: Float64Array) => {
    caudalNodo.fill(0)
    emisores.forEach((e, i) => (caudalNodo[e.nodo]! += caudalEmisorLph[i]! / 3600))
    for (let i = orden.length - 1; i > 0; i--) {
      const nodo = orden[i]!
      caudalTramo[tramoDeLlegada[nodo]!] = caudalNodo[nodo]!
      caudalNodo[padre[nodo]!]! += caudalNodo[nodo]!
    }
    const raiz = orden[0]!
    presionLlegada[raiz] = red.fuente.presionInicialM
    presion[raiz] = aplicarElemento(elementos[raiz], red.fuente.presionInicialM)
    for (let i = 1; i < orden.length; i++) {
      const nodo = orden[i]!
      const arriba = padre[nodo]!
      const t = tramoDeLlegada[nodo]!
      const q = caudalTramo[t]!
      presionLlegada[nodo] = presion[arriba]! + (z[arriba]! - z[nodo]!) - friccion(t, q) - local(t, q)
      presion[nodo] = aplicarElemento(elementos[nodo], presionLlegada[nodo]!)
    }
  }

  // Válvulas. Una CRP o una VRP está activa si le llega más presión que su umbral (cero o la consigna):
  // entonces fija la presión de todo lo que tiene aguas abajo, y la red se parte ahí en subredes.
  const fuente = orden[0]!
  const hijos: number[][] = Array.from({ length: n }, () => [])
  for (const nodo of orden) if (nodo !== fuente) hijos[padre[nodo]!]!.push(nodo)
  const umbral = (nodo: number) => {
    const e = elementos[nodo]
    if (nodo === fuente || !e || e.tipo === 'cabezal') return undefined
    return e.tipo === 'crp' ? 0 : e.consignaM
  }
  const valvulas = orden.filter((nodo) => umbral(nodo) !== undefined) // en preorden: cada una después de las de arriba
  const activa = new Uint8Array(n)
  /** Caudal que pide cada subred a la de arriba, l/s, por el nodo de su válvula. */
  const caudalDeSubred = new Float64Array(n)
  const emisoresDelNodo: number[][] = Array.from({ length: n }, () => [])
  emisores.forEach((e, i) => {
    if (e.abierto) emisoresDelNodo[e.nodo]!.push(i)
  })

  interface Subred {
    raiz: number
    presionRaiz: number
    /** Nodos en preorden, desde la raíz hasta las hojas o hasta la próxima válvula activa, que queda en el borde. */
    nodos: number[]
    emisores: number[]
  }

  /** Lo que el agua recorre desde `inicio` sin pasar por otra válvula activa. Los emisores de esa válvula son de la subred que ella alimenta. */
  const armarSubred = (inicio: number): Subred => {
    const nodos = [inicio]
    for (let i = 0; i < nodos.length; i++) {
      const nodo = nodos[i]!
      if (nodo === inicio || !activa[nodo]) nodos.push(...hijos[nodo]!)
    }
    return {
      raiz: inicio,
      presionRaiz: inicio === fuente ? aplicarElemento(elementos[fuente], red.fuente.presionInicialM) : umbral(inicio)!,
      nodos,
      emisores: nodos.filter((nodo) => nodo === inicio || !activa[nodo]).flatMap((nodo) => emisoresDelNodo[nodo]!),
    }
  }
  const enElBorde = (s: Subred, nodo: number) => nodo !== s.raiz && activa[nodo] === 1

  /**
   * Recorrido exacto de una subred. Cada válvula activa de su borde pide el caudal fijo de la subred que
   * alimenta; sin `conDemandaFija`, la subred se recorre como si esas válvulas estuvieran cerradas.
   */
  const recorrerSubred = (s: Subred, q: Float64Array, conDemandaFija = true) => {
    for (const nodo of s.nodos) caudalNodo[nodo] = conDemandaFija && enElBorde(s, nodo) ? caudalDeSubred[nodo]! : 0
    for (const i of s.emisores) caudalNodo[emisores[i]!.nodo]! += q[i]! / 3600
    for (let k = s.nodos.length - 1; k > 0; k--) {
      const nodo = s.nodos[k]!
      caudalTramo[tramoDeLlegada[nodo]!] = caudalNodo[nodo]!
      caudalNodo[padre[nodo]!]! += caudalNodo[nodo]!
    }
    presion[s.raiz] = s.presionRaiz
    for (let k = 1; k < s.nodos.length; k++) {
      const nodo = s.nodos[k]!
      const arriba = padre[nodo]!
      const t = tramoDeLlegada[nodo]!
      const caudal = caudalTramo[t]!
      presionLlegada[nodo] = presion[arriba]! + (z[arriba]! - z[nodo]!) - friccion(t, caudal) - local(t, caudal)
      // La presión de una válvula del borde la fija ella misma, como raíz de su subred. Dentro de la subred,
      // una válvula pasiva deja pasar la presión.
      if (enElBorde(s, nodo)) continue
      const e = elementos[nodo]
      presion[nodo] = e?.tipo === 'cabezal' ? presionLlegada[nodo]! - e.perdidaM : presionLlegada[nodo]!
    }
  }

  /** Caudal que entregaría cada emisor de la subred con la presión del último recorrido. */
  const segunPresion = (s: Subred, destino: Float64Array) => {
    for (const i of s.emisores) {
      const e = emisores[i]!
      destino[i] = caudalDeEmisor(e.k, e.x, presion[e.nodo]!)
    }
  }

  /** Cada emisor coincide con su presión, en términos relativos o dentro del redondeo de la presión. */
  const coherente = (s: Subred, q: Float64Array, g: Float64Array) =>
    s.emisores.every((i) => {
      const e = emisores[i]!
      const margen = derivadaCaudalDeEmisor(e.k, e.x, presion[e.nodo]!) * TOLERANCIA_PRESION_M
      return Math.abs(q[i]! - g[i]!) <= tolerancia * Math.max(Math.abs(q[i]!), Math.abs(g[i]!)) + margen
    })

  // Medida del avance. Sin válvulas activas, el equilibrio de tuberías y emisores es el mínimo de una energía
  // convexa (principio de contenido): la integral de las pérdidas más la de la ley inversa de cada emisor,
  // menos la carga estática por el caudal. Su gradiente es, emisor por emisor, la presión que el emisor
  // necesita menos la que le llega, así que el paso de Newton siempre la hace bajar.
  const cargaEstatica = new Float64Array(m)

  /** La energía y la suma de los valores absolutos de sus términos, que da la escala de su redondeo. */
  const energia = (s: Subred, q: Float64Array) => {
    let total = 0
    let magnitud = 0
    const sumar = (termino: number) => {
      total += termino
      magnitud += Math.abs(termino)
    }
    for (let k = 1; k < s.nodos.length; k++) {
      const t = tramoDeLlegada[s.nodos[k]!]!
      const caudal = caudalTramo[t]!
      sumar((friccion(t, caudal) * caudal) / (exponenteFriccion + 1) + (local(t, caudal) * caudal) / 3)
    }
    for (const i of s.emisores) {
      const e = emisores[i]!
      sumar(energiaDeEmisor(e.k, e.x, q[i]!) / 3600)
      sumar((-cargaEstatica[i]! * q[i]!) / 3600)
    }
    return { valor: total, ruido: 1e-12 * magnitud }
  }
  const desajuste = (s: Subred, q: Float64Array, g: Float64Array) => {
    let suma = 0
    for (const i of s.emisores) suma += ((q[i]! - g[i]!) / emisores[i]!.k) ** 2
    return suma
  }

  // Subred linealizada. Cada subárbol se resume en una recta: el caudal que pide en función de la presión.
  const a = new Float64Array(n) // caudal = a + b · presión del nodo
  const b = new Float64Array(n)
  const alfa = new Float64Array(n) // caudal = alfa + beta · presión con la que llega el agua
  const beta = new Float64Array(n)
  const presionLineal = new Float64Array(n)
  const derivada = new Float64Array(m) // dq/dP de cada emisor, en l/s por m
  const ordenada = new Float64Array(m)

  const linealizarTramo = (t: number) => {
    const q = caudalTramo[t]!
    const r = q === 0 ? 0 : (exponenteFriccion * friccion(t, q) + 2 * local(t, q)) / q
    return { r, constante: friccion(t, q) + local(t, q) - r * q }
  }

  /**
   * Cada emisor, como recta q = ordenada + derivada · P, sacada de su ley inversa en el caudal actual.
   * Un emisor que está en uno de sus límites y al que la presión empuja hacia afuera queda fijo en ese límite:
   * apagado si casi no entrega agua y la presión no le alcanza, o en su caudal máximo si es autocompensante
   * (x = 0) y la presión le sobra. «Casi» es a una parte en mil millones de k. Si no, se linealiza aunque esté
   * en un extremo, para que Newton pueda sacarlo de ahí.
   */
  const linealizarEmisor = (i: number, q: number) => {
    const e = emisores[i]!
    const p = presion[e.nodo]!
    const maximo = e.x === 0 ? e.k : Infinity
    const necesaria = presionParaCaudal(e.k, e.x, Math.min(q, maximo))
    if (q <= 1e-9 * e.k && p <= necesaria) {
      derivada[i] = 0
      ordenada[i] = 0
    } else if (q >= maximo * (1 - 1e-9) && p >= necesaria) {
      derivada[i] = 0
      ordenada[i] = maximo / 3600
    } else {
      const qLineal = Math.min(q, maximo * (1 - 1e-12))
      const pendiente = 1 / derivadaPresionParaCaudal(e.k, e.x, qLineal) // dq/dP, l/h por m
      derivada[i] = pendiente / 3600
      ordenada[i] = (qLineal - presionParaCaudal(e.k, e.x, qLineal) * pendiente) / 3600
    }
  }

  /** Resuelve la subred linealizada: de las hojas a la raíz se arman las rectas, de la raíz a las hojas las presiones. */
  const resolverLineal = (s: Subred) => {
    for (const nodo of s.nodos) {
      a[nodo] = 0
      b[nodo] = 0
    }
    for (const i of s.emisores) {
      a[emisores[i]!.nodo]! += ordenada[i]!
      b[emisores[i]!.nodo]! += derivada[i]!
    }
    for (let k = s.nodos.length - 1; k > 0; k--) {
      const nodo = s.nodos[k]!
      const e = elementos[nodo]
      if (enElBorde(s, nodo)) {
        // La subred de abajo pide su caudal sin importar la presión que le llega.
        alfa[nodo] = caudalDeSubred[nodo]!
        beta[nodo] = 0
      } else {
        alfa[nodo] = a[nodo]! - (e?.tipo === 'cabezal' ? b[nodo]! * e.perdidaM : 0)
        beta[nodo] = b[nodo]!
      }
      const arriba = padre[nodo]!
      const { r, constante } = linealizarTramo(tramoDeLlegada[nodo]!)
      const desnivel = z[arriba]! - z[nodo]!
      const denominador = 1 + beta[nodo]! * r
      a[arriba]! += (alfa[nodo]! + beta[nodo]! * (desnivel - constante)) / denominador
      b[arriba]! += beta[nodo]! / denominador
    }
    presionLineal[s.raiz] = s.presionRaiz
    for (let k = 1; k < s.nodos.length; k++) {
      const nodo = s.nodos[k]!
      const arriba = padre[nodo]!
      const { r, constante } = linealizarTramo(tramoDeLlegada[nodo]!)
      const disponible = presionLineal[arriba]! + (z[arriba]! - z[nodo]!) - constante
      const q = (alfa[nodo]! + beta[nodo]! * disponible) / (1 + beta[nodo]! * r)
      const e = elementos[nodo]
      presionLineal[nodo] = disponible - r * q - (e?.tipo === 'cabezal' && !enElBorde(s, nodo) ? e.perdidaM : 0)
    }
  }

  /** Caudales de los emisores que resuelven la subred linealizada alrededor del último recorrido. */
  const pasoDeNewton = (s: Subred, q: Float64Array, destino: Float64Array) => {
    for (const i of s.emisores) linealizarEmisor(i, q[i]!)
    resolverLineal(s)
    for (const i of s.emisores) destino[i] = (ordenada[i]! + derivada[i]! * presionLineal[emisores[i]!.nodo]!) * 3600
  }

  /** Lo que el emisor puede entregar: nunca menos de cero, y un autocompensante nunca más que su k. */
  const acotar = (i: number, q: number) => {
    const e = emisores[i]!
    return Math.min(Math.max(q, 0), e.x === 0 ? e.k : Infinity)
  }

  const ceros = new Float64Array(m)
  const caudalEmisor = new Float64Array(m)
  const segunLaPresion = new Float64Array(m)
  const propuesta = new Float64Array(m)
  const prueba = new Float64Array(m)

  /** Newton amortiguado sobre la energía de una subred, desde los caudales que traiga `q`. */
  const resolverSubred = (s: Subred, q: Float64Array) => {
    recorrerSubred(s, ceros, false)
    for (const i of s.emisores) cargaEstatica[i] = presion[emisores[i]!.nodo]!
    recorrerSubred(s, q)
    segunPresion(s, segunLaPresion)

    let iteraciones = 0
    let convergio = coherente(s, q, segunLaPresion)
    let actual = energia(s, q)
    let desajusteActual = desajuste(s, q, segunLaPresion)
    while (!convergio && iteraciones < iteracionesMaximas) {
      iteraciones++
      pasoDeNewton(s, q, propuesta)
      // Amortiguamiento: el paso se acorta a la mitad hasta que la energía baje. Cerca de la solución lo que
      // baja se pierde en el redondeo de la suma; dentro de ese ruido, basta con que el desajuste baje.
      let paso = 1
      let aceptado = false
      while (!aceptado && paso > 1e-12) {
        for (const i of s.emisores) prueba[i] = acotar(i, q[i]! + paso * (propuesta[i]! - q[i]!))
        recorrerSubred(s, prueba)
        segunPresion(s, segunLaPresion)
        const nuevo = energia(s, prueba)
        const nuevoDesajuste = desajuste(s, prueba, segunLaPresion)
        const ruido = Math.max(nuevo.ruido, actual.ruido)
        const baja = nuevo.valor < actual.valor - ruido
        const empate = Math.abs(nuevo.valor - actual.valor) <= ruido
        if (baja || (empate && nuevoDesajuste < desajusteActual)) {
          aceptado = true
          actual = nuevo
          desajusteActual = nuevoDesajuste
          for (const i of s.emisores) q[i] = prueba[i]!
        } else paso /= 2
      }
      if (!aceptado) break
      convergio = coherente(s, q, segunLaPresion)
    }
    recorrerSubred(s, q)
    caudalDeSubred[s.raiz] = caudalNodo[s.raiz]!
    return { convergio, iteraciones }
  }

  // Estado inicial de cada válvula: activa si, sin caudal, le llega más presión que su umbral. Con caudal la
  // presión solo baja, así que una válvula que empieza pasiva ya no se activa salvo que cambie otra de arriba.
  recorrer(ceros)
  for (const v of valvulas) activa[v] = presionLlegada[v]! > umbral(v)! ? 1 : 0

  let iteraciones = 0
  let convergio = false
  let primeraRonda = true
  for (let ronda = 0; ronda <= 4 * valvulas.length + 1; ronda++) {
    // Primero las subredes de más abajo: cada una le pide a la de arriba un caudal fijo.
    const raices = [fuente, ...valvulas.filter((v) => activa[v])]
    let todas = true
    for (let k = raices.length - 1; k >= 0; k--) {
      const s = armarSubred(raices[k]!)
      if (primeraRonda) {
        // Punto de partida: lo que entregarían los emisores con la presión de la subred sin caudal.
        recorrerSubred(s, ceros)
        segunPresion(s, caudalEmisor)
      }
      const r = resolverSubred(s, caudalEmisor)
      iteraciones += r.iteraciones
      todas &&= r.convergio
    }
    primeraRonda = false

    // ¿Cada válvula quedó en el estado que se supuso? Si no, se corrige la de más arriba y se vuelve a resolver.
    recorrer(caudalEmisor)
    const equivocada = valvulas.find((v) => {
      const sobra = presionLlegada[v]! - umbral(v)!
      return activa[v] ? sobra < -TOLERANCIA_PRESION_M : sobra > TOLERANCIA_PRESION_M
    })
    if (equivocada === undefined) {
      convergio = todas
      break
    }
    activa[equivocada] = activa[equivocada] ? 0 : 1
  }

  // Resultado final coherente: presiones y caudales calculados con los mismos caudales de emisor.
  recorrer(caudalEmisor)

  const nodos: Record<string, ResultadoNodo> = {}
  red.nodos.forEach((nodo, i) => {
    nodos[nodo.id] = {
      id: nodo.id,
      presionM: presion[i]!,
      presionLlegadaM: presionLlegada[i]!,
      cotaPiezometrica: nodo.z + presion[i]!,
    }
  })
  emisores.forEach((e, i) => {
    const resultado = nodos[red.nodos[e.nodo]!.id]!
    resultado.caudalEmisorLph = (resultado.caudalEmisorLph ?? 0) + caudalEmisor[i]!
  })

  const tramos: Record<string, ResultadoTramo> = {}
  const rechazos: Rechazo[] = []
  red.tramos.forEach((t, i) => {
    // El tramo se recorre en el sentido del agua, que puede ser el contrario al que se declaró.
    const abajo = tramoDeLlegada[indiceNodo.get(t.hasta)!] === i ? indiceNodo.get(t.hasta)! : indiceNodo.get(t.desde)!
    const arriba = padre[abajo]!
    const q = caudalTramo[i]!
    const v = velocidadDe(i, q)
    const presionEntradaM = presion[arriba]!
    const presionSalidaM = presionLlegada[abajo]!
    tramos[t.id] = {
      id: t.id,
      caudalLps: q,
      velocidadMs: v,
      longitudInclinadaM: longitud[i]!,
      perdidaFriccionM: friccion(i, q),
      perdidaLocalM: local(i, q),
      presionEntradaM,
      presionSalidaM,
      estadoVelocidad: estadoDeVelocidad(v),
      cumpleClase: t.presionMaximaM === undefined || Math.max(presionEntradaM, presionSalidaM) <= t.presionMaximaM,
    }
    if (longitud[i]! > LONGITUD_MAXIMA_TRAMO_M) rechazos.push({ tipo: 'tramo-largo', tramo: t.id, longitudM: longitud[i]! })
  })

  // Desnivel acumulado desde la fuente o desde la última cámara rompe-presión. Se informa el primer nodo
  // de cada camino que pasa el límite, no todos los que siguen.
  const cotaReferencia = new Float64Array(n)
  const excedido = new Uint8Array(n)
  for (const nodo of orden) {
    const arriba = padre[nodo]!
    const referencia = arriba < 0 ? z[nodo]! : cotaReferencia[arriba]!
    const desnivel = referencia - z[nodo]!
    excedido[nodo] = arriba >= 0 && (excedido[arriba] || desnivel > DESNIVEL_MAXIMO_SIN_CRP_M) ? 1 : 0
    if (excedido[nodo] && !(arriba >= 0 && excedido[arriba])) {
      rechazos.push({ tipo: 'desnivel-sin-crp', nodo: red.nodos[nodo]!.id, desnivelM: desnivel })
    }
    cotaReferencia[nodo] = elementos[nodo]?.tipo === 'crp' ? z[nodo]! : referencia
    if (elementos[nodo]?.tipo === 'crp') excedido[nodo] = 0
  }

  return { nodos, tramos, caudalFuenteLps: caudalNodo[orden[0]!]!, convergio, iteraciones, rechazos }
}
