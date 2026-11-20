import { generadorConSemilla, KR, type Elemento, type Red } from '@riego/calculo'

// Redes al azar para comparar contra EPANET, siempre las mismas para la misma semilla. Son árboles en ladera
// con goteros o aspersores, pérdidas locales, cabezal, cámaras rompe-presión y válvulas reductoras, y cada
// tramo se declara en el sentido del agua.

const DIAMETROS_GOTEO_MM = [13.6, 16, 20, 25.4, 32, 40.8, 50.8, 63.5]
const DIAMETROS_ASPERSION_MM = [50.8, 63.5, 75.4, 90.4, 110]
const ACCESORIOS = Object.values(KR)

export function redDeVerificacion(semilla: number): Red {
  const g = generadorConSemilla(semilla)
  const cantidad = g.entero(4, 40)
  const nodos = [{ id: 'F', x: 0, y: 0, z: 3000 + g.real(0, 60) }]
  const tramos: Red['tramos'][number][] = []
  const emisores: Red['emisores'][number][] = []
  const elementos: Record<string, Elemento> = {}
  const aspersion = g.siguiente() < 0.3
  const exponente = g.elegir([0.5, 0.5, 0.46, 0.55])

  for (let i = 1; i < cantidad; i++) {
    const padre = nodos[g.entero(0, i - 1)]!
    const id = `N${i}`
    const azar = g.siguiente()
    const cabezal = i === 1 && azar < 0.5
    // En bajada, como una red por gravedad; una de cada diez veces sube un poco. Bajo el cabezal, la
    // bajada alcanza para pagar su pérdida.
    const desnivel = cabezal ? g.real(15, 30) : g.siguiente() < 0.1 ? -g.real(0, 1.5) : g.real(2, 15)
    nodos.push({ id, x: padre.x + g.real(5, 80), y: padre.y + g.real(-40, 40), z: padre.z - desnivel })
    tramos.push({
      id: `t${i}`,
      desde: padre.id,
      hasta: id,
      diametroInternoMm: g.elegir(aspersion ? DIAMETROS_ASPERSION_MM : DIAMETROS_GOTEO_MM),
      c: g.elegir([140, 150]),
      coeficientesKr: g.siguiente() < 0.4 ? [g.elegir(ACCESORIOS), g.elegir(ACCESORIOS)] : undefined,
    })
    if (cabezal) elementos[id] = { tipo: 'cabezal', perdidaM: g.real(5, 12) }
    else if (azar < 0.08) elementos[id] = { tipo: 'crp' }
    else if (azar < 0.14) elementos[id] = { tipo: 'vrp', consignaM: g.real(4, 10) }
    else if (azar < 0.75) {
      emisores.push({ nodo: id, k: aspersion ? g.real(80, 200) : g.real(0.5, 4), x: exponente })
    }
  }
  // Cada rama termina en un emisor, como en el campo: ningún tramo ni válvula queda sin caudal.
  const tienenHijos = new Set(tramos.map((t) => t.desde))
  const conEmisor = new Set(emisores.map((e) => e.nodo))
  for (const n of nodos.slice(1)) {
    if (tienenHijos.has(n.id) || conEmisor.has(n.id)) continue
    delete elementos[n.id]
    emisores.push({ nodo: n.id, k: aspersion ? g.real(80, 200) : g.real(0.5, 4), x: exponente })
  }
  return { nodos, tramos, emisores, elementos, fuente: { nodo: 'F', presionInicialM: g.real(0, 5) } }
}
