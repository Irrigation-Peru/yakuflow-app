import type { PuntoLocal, Red, ResultadoRed } from '@riego/calculo'
import { scaleLinear } from 'd3-scale'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { conDecimales } from '../formato.ts'
import { useAguaEnMovimiento } from '../agua-en-movimiento.ts'
import { bandaDePresion, colorDePresion, TRAZO_DE_LA_BANDA } from '../presion.ts'
import { LeyendaDeLaRed } from './LeyendaDeLaRed.tsx'
import { dibujarCabezal, dibujarCamara, dibujarEscala, dibujarFuente, dibujarHilera, dibujarNorte, dibujarParcela, dibujarTerreno, dibujarValvula } from './dibujo-de-la-red.ts'

// La red en planta (HU0018): la parcela, el portalateral, los laterales y las cámaras, con cada tramo pintado
// según la presión con la que el agua llega a su extremo. Se dibuja en Canvas 2D porque una red de una
// hectárea tiene varios cientos de tramos y otros tantos elementos del DOM no haría falta.
//
// El tramo que el estudiante toca queda seleccionado: es por donde entra HU0019, cambiarle el diámetro o la
// clase y ver al instante qué pasa.

// El alto sigue la forma de lo que se dibuja: una parcela cuadrada ocupa todo el ancho de la columna en vez de quedar en
// una esquina. Entre estos dos topes, para que una parcela muy angosta no quede diminuta ni una muy alargada sin fin.
const ALTO_MINIMO = 360
const ALTO_MAXIMO = 680
const MARGEN = 28
const COLOR_DE_LA_PARCELA = '#9ca3af'
// 3,2:1 sobre blanco (WCAG 1.4.11): un tramo sin agua se distingue del fondo. Es el mismo gris de --borde-campo.
const COLOR_SIN_AGUA = '#8a919c'
const COLOR_SELECCIONADO = '#111827'
const COLOR_ROTO = '#b42318'
const COLOR_AFECTADO = '#f5c518'
const SIN_TRAMOS: ReadonlySet<string> = new Set()

/** A qué distancia en pixeles de un tramo cuenta como que le dieron. */
const RADIO_DEL_CLIC = 8

interface Punto2D {
  x: number
  y: number
}

/** Distancia de un punto al segmento ab, en las mismas unidades que entran. */
function distanciaAlSegmento(p: Punto2D, a: Punto2D, b: Punto2D) {
  const largo = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (largo === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / largo))
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)))
}

export function RedEnPlanta({
  red,
  resultado,
  contorno,
  presionNominalEmisorM,
  tramoSeleccionado,
  alSeleccionarTramo,
  presionesCerradas,
  rotos = SIN_TRAMOS,
  afectados = SIN_TRAMOS,
  aguaEnElTramo,
  conLeyenda = true,
}: {
  red: Red
  /** El resultado del turno que se está viendo. Sirve también para las cifras con las válvulas cerradas. */
  resultado: ResultadoRed
  contorno: readonly PuntoLocal[]
  presionNominalEmisorM: number
  tramoSeleccionado?: string
  alSeleccionarTramo?: (tramo: string) => void
  /** Con las válvulas cerradas la presión de cada nodo es la estática, y toda la red está llena de agua. */
  presionesCerradas?: Readonly<Record<string, number>>
  /** Los tramos que no aguantan: se ven marcados aunque el color de la presión diga otra cosa (HU0021). */
  rotos?: ReadonlySet<string>
  /** Los tramos a los que les cambió la presión con el último cambio (HU0019). */
  afectados?: ReadonlySet<string>
  /** Qué parte de cada tramo ya tiene agua, de 0 a 1, mientras el agua avanza; sin esto, todo (HU0020). */
  aguaEnElTramo?: (tramo: string) => number
  /** Cuando van dos planos lado a lado, la leyenda va una sola vez. */
  conLeyenda?: boolean
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [ancho, setAncho] = useState(480)
  // El fondo (terreno, parcela e hileras del cultivo) se pinta una vez por red y tamaño: mientras el agua avanza, el
  // dibujo se repinta muchas veces por segundo y solo cambian las tuberías.
  const fondo = useRef<{ clave: readonly unknown[]; lienzo: HTMLCanvasElement } | null>(null)
  // El agua corriendo va en una capa aparte, encima: se repinta a 30 cuadros por segundo sin tocar el dibujo de abajo.
  const capaDelAgua = useRef<HTMLCanvasElement>(null)
  const [aguaCorriendo, setAguaCorriendo] = useAguaEnMovimiento()
  const hastaDondeLlega = useRef(aguaEnElTramo)
  useEffect(() => {
    hastaDondeLlega.current = aguaEnElTramo
  }, [aguaEnElTramo])

  const porId = useMemo(() => new Map(red.nodos.map((n) => [n.id, n])), [red])

  // Por omisión se encuadra la parcela: una conducción larga la dejaría como un punto. La conducción se ve a pedido, y
  // también cuando el tramo elegido es de ella.
  const [conConduccion, setConConduccion] = useState(false)
  const verConduccion = conConduccion || (tramoSeleccionado?.startsWith('conduccion') ?? false)

  const escalas = useMemo(() => {
    const puntos = verConduccion ? [...red.nodos, ...contorno] : contorno
    const xs = puntos.map((p) => p.x)
    const ys = puntos.map((p) => p.y)
    // La misma escala en los dos ejes: en planta, un metro al este mide igual que un metro al norte.
    const anchoM = Math.max(1e-6, Math.max(...xs) - Math.min(...xs))
    const altoM = Math.max(1e-6, Math.max(...ys) - Math.min(...ys))
    const alto = Math.round(Math.min(ALTO_MAXIMO, Math.max(ALTO_MINIMO, ((ancho - 2 * MARGEN) * altoM) / anchoM + 2 * MARGEN)))
    const porPixel = Math.min((ancho - 2 * MARGEN) / anchoM, (alto - 2 * MARGEN) / altoM)
    // Lo que sobra a los lados se reparte: el dibujo queda centrado en la columna.
    const sobra = (ancho - 2 * MARGEN - anchoM * porPixel) / 2
    const x = scaleLinear()
      .domain([Math.min(...xs), Math.min(...xs) + anchoM])
      .range([MARGEN + sobra, MARGEN + sobra + anchoM * porPixel])
    // El norte va hacia arriba, así que el rango de y se invierte.
    const y = scaleLinear()
      .domain([Math.min(...ys), Math.min(...ys) + altoM])
      .range([alto - MARGEN, alto - MARGEN - altoM * porPixel])
    return { x, y, alto }
  }, [red, contorno, ancho, verConduccion])

  useEffect(() => {
    const elemento = lienzo.current?.parentElement
    if (!elemento) return
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada!.contentRect.width)))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const escala = window.devicePixelRatio || 1
    const { x, y, alto } = escalas
    canvas.width = ancho * escala
    canvas.height = alto * escala
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.clearRect(0, 0, ancho, alto)

    // El fondo: el terreno, la parcela y las hileras del cultivo junto a cada lateral.
    const clave = [red, contorno, escalas, ancho, escala] as const
    if (!fondo.current || fondo.current.clave.some((v, i) => v !== clave[i])) {
      const otro = document.createElement('canvas')
      otro.width = ancho * escala
      otro.height = alto * escala
      const f = otro.getContext('2d')
      if (f) {
        f.setTransform(escala, 0, 0, escala, 0, 0)
        dibujarTerreno(f, ancho, alto)
        if (contorno.length >= 3) {
          const camino = () => {
            f.beginPath()
            contorno.forEach((p, i) => (i === 0 ? f.moveTo(x(p.x), y(p.y)) : f.lineTo(x(p.x), y(p.y))))
            f.closePath()
          }
          dibujarParcela(f, camino)
          camino()
          f.setLineDash([5, 4])
          f.strokeStyle = COLOR_DE_LA_PARCELA
          f.lineWidth = 1.5
          f.stroke()
          f.setLineDash([])
        }
        red.tramos.forEach((tramo, i) => {
          if (!tramo.id.startsWith('l')) return
          const a = porId.get(tramo.desde)
          const b = porId.get(tramo.hasta)
          if (a && b) dibujarHilera(f, x(a.x), y(a.y), x(b.x), y(b.y), 4, 977 + i)
        })
      }
      fondo.current = { clave, lienzo: otro }
    }
    ctx.drawImage(fondo.current.lienzo, 0, 0, ancho, alto)

    // Los tramos, del más delgado al más gordo para que el portalateral quede encima de los laterales.
    const ordenados = [...red.tramos].sort((a, b) => a.diametroInternoMm - b.diametroInternoMm)
    for (const tramo of ordenados) {
      const a = porId.get(tramo.desde)
      const b = porId.get(tramo.hasta)
      if (!a || !b) continue
      const calculado = resultado.tramos[tramo.id]
      const presion = presionesCerradas ? presionesCerradas[tramo.hasta] : resultado.nodos[tramo.hasta]?.presionM
      const conAgua = presion !== undefined && (presionesCerradas !== undefined || (calculado !== undefined && calculado.caudalLps > 0))
      const grosor = 1 + tramo.diametroInternoMm / 28
      const trazar = (fraccion: number, color: string, ancho: number) => {
        ctx.beginPath()
        ctx.moveTo(x(a.x), y(a.y))
        ctx.lineTo(x(a.x + fraccion * (b.x - a.x)), y(a.y + fraccion * (b.y - a.y)))
        ctx.strokeStyle = color
        ctx.lineWidth = ancho
        ctx.stroke()
      }
      if (afectados.has(tramo.id)) trazar(1, COLOR_AFECTADO, grosor + 4)
      // Los laterales van muy juntos (uno por hilera): sin borde, y los que no riegan en este turno, finos y a medias,
      // para que entre ellos se vea el cultivo. Las tuberías de distribución llevan un borde claro y otro oscuro: se leen
      // como un tubo sobre la tierra.
      const esLateral = tramo.id.startsWith('l')
      if (!esLateral) {
        ctx.lineCap = 'round'
        trazar(1, 'rgba(255, 255, 255, 0.75)', grosor + 2.5)
        if (tramo.diametroInternoMm >= 25) trazar(1, 'rgba(31, 41, 55, 0.55)', grosor + 1.2)
        ctx.lineCap = 'butt'
      }
      // El grosor dice el diámetro, el color dice la presión: dos cosas distintas, dos canales distintos.
      if (esLateral && !conAgua) {
        ctx.globalAlpha = 0.45
        trazar(1, COLOR_SIN_AGUA, Math.max(1, grosor * 0.7))
        ctx.globalAlpha = 1
      } else trazar(1, COLOR_SIN_AGUA, grosor)
      const fraccion = !conAgua ? 0 : presionesCerradas ? 1 : (aguaEnElTramo?.(tramo.id) ?? 1)
      if (fraccion > 0) {
        ctx.setLineDash([...TRAZO_DE_LA_BANDA[bandaDePresion(presion!, presionNominalEmisorM).banda]])
        trazar(fraccion, colorDePresion(presion!, presionNominalEmisorM), grosor)
        ctx.setLineDash([])
      }
      if (!esLateral) {
        // El brillo a lo largo del tubo: así se lee redondo, no como una raya.
        if (grosor >= 2.5) trazar(1, 'rgba(255, 255, 255, 0.4)', Math.max(0.8, grosor * 0.28))
        // Las uniones de los tubos de PVC, cada 6 m, si hay sitio para verlas.
        const largoM = Math.hypot(b.x - a.x, b.y - a.y)
        const pxPorM = Math.hypot(x(b.x) - x(a.x), y(b.y) - y(a.y)) / Math.max(1e-9, largoM)
        if (6 * pxPorM >= 9 && largoM > 6) {
          const [ux, uy] = [(x(b.x) - x(a.x)) / (largoM * pxPorM), (y(b.y) - y(a.y)) / (largoM * pxPorM)]
          ctx.strokeStyle = 'rgba(31, 41, 55, 0.6)'
          ctx.lineWidth = 1.3
          for (let m = 6; m < largoM - 0.5; m += 6) {
            const cx = x(a.x) + ux * m * pxPorM
            const cy = y(a.y) + uy * m * pxPorM
            const media = grosor / 2 + 1.5
            ctx.beginPath()
            ctx.moveTo(cx - uy * media, cy + ux * media)
            ctx.lineTo(cx + uy * media, cy - ux * media)
            ctx.stroke()
          }
        }
      }
      if (rotos.has(tramo.id)) {
        ctx.setLineDash([6, 4])
        trazar(1, COLOR_ROTO, grosor + 2)
        ctx.setLineDash([])
      }
      if (tramo.id === tramoSeleccionado) trazar(1, COLOR_SELECCIONADO, 5)
    }

    // Los elementos, dibujados como lo que son: lo que el estudiante tiene que poder ubicar de un vistazo.
    const dentro = (px: number, py: number) => px >= -20 && px <= ancho + 20 && py >= -20 && py <= alto + 20
    for (const [id, elemento] of Object.entries(red.elementos ?? {})) {
      const nodo = porId.get(id)
      if (!nodo || !dentro(x(nodo.x), y(nodo.y))) continue
      if (elemento.tipo === 'cabezal') dibujarCabezal(ctx, x(nodo.x), y(nodo.y))
      else if (elemento.tipo === 'crp') dibujarCamara(ctx, x(nodo.x), y(nodo.y))
      else if (elemento.tipo === 'vrp') dibujarValvula(ctx, x(nodo.x), y(nodo.y), id === 'VC')
    }
    const nodoDeLaFuente = porId.get(red.fuente.nodo)
    if (nodoDeLaFuente && dentro(x(nodoDeLaFuente.x), y(nodoDeLaFuente.y))) dibujarFuente(ctx, x(nodoDeLaFuente.x), y(nodoDeLaFuente.y))

    // Para leerlo como un plano: el norte y la escala.
    dibujarNorte(ctx, ancho - 22, alto - 24)
    dibujarEscala(ctx, 14, alto - 12, Math.abs(x(1) - x(0)))
  }, [red, resultado, contorno, presionNominalEmisorM, tramoSeleccionado, escalas, porId, ancho, presionesCerradas, rotos, afectados, aguaEnElTramo])

  // El agua corriendo: rayas claras que avanzan por cada tramo que lleva agua, de aguas arriba a aguas abajo, más rápido
  // donde el agua va más rápido. Con las válvulas cerradas no corre nada.
  const hayCorriente = !presionesCerradas && Object.values(resultado.tramos).some((t) => t.caudalLps > 0)
  useEffect(() => {
    const canvas = capaDelAgua.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const escala = window.devicePixelRatio || 1
    const { x, y, alto } = escalas
    canvas.width = ancho * escala
    canvas.height = alto * escala
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.clearRect(0, 0, ancho, alto)
    if (!aguaCorriendo || !hayCorriente) return
    const corrientes = red.tramos.flatMap((tramo) => {
      const calculado = resultado.tramos[tramo.id]
      const a = porId.get(tramo.desde)
      const b = porId.get(tramo.hasta)
      if (!calculado || calculado.caudalLps <= 0 || !a || !b) return []
      const grosor = 1 + tramo.diametroInternoMm / 28
      return [{ id: tramo.id, ax: x(a.x), ay: y(a.y), bx: x(b.x), by: y(b.y), ancho: Math.max(0.9, grosor * 0.45), rapidez: 8 + calculado.velocidadMs * 28 }]
    })
    let cuadro = 0
    let anterior = 0
    const pintar = (ms: number) => {
      cuadro = requestAnimationFrame(pintar)
      if (ms - anterior < 33) return
      anterior = ms
      ctx.clearRect(0, 0, ancho, alto)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.setLineDash([2, 8])
      ctx.lineCap = 'round'
      for (const c of corrientes) {
        const fraccion = hastaDondeLlega.current?.(c.id) ?? 1
        if (fraccion <= 0) continue
        ctx.lineDashOffset = -(ms / 1000) * c.rapidez
        ctx.lineWidth = c.ancho
        ctx.beginPath()
        ctx.moveTo(c.ax, c.ay)
        ctx.lineTo(c.ax + fraccion * (c.bx - c.ax), c.ay + fraccion * (c.by - c.ay))
        ctx.stroke()
      }
    }
    cuadro = requestAnimationFrame(pintar)
    return () => cancelAnimationFrame(cuadro)
  }, [aguaCorriendo, hayCorriente, red, resultado, escalas, ancho, porId])

  const alHacerClic = useCallback(
    (evento: React.MouseEvent<HTMLCanvasElement>) => {
      if (!alSeleccionarTramo) return
      const caja = evento.currentTarget.getBoundingClientRect()
      const punto = { x: evento.clientX - caja.left, y: evento.clientY - caja.top }
      const { x, y } = escalas
      let masCerca: { tramo: string; distancia: number } | null = null
      for (const tramo of red.tramos) {
        const a = porId.get(tramo.desde)
        const b = porId.get(tramo.hasta)
        if (!a || !b) continue
        const distancia = distanciaAlSegmento(punto, { x: x(a.x), y: y(a.y) }, { x: x(b.x), y: y(b.y) })
        if (!masCerca || distancia < masCerca.distancia) masCerca = { tramo: tramo.id, distancia }
      }
      if (masCerca && masCerca.distancia <= RADIO_DEL_CLIC) alSeleccionarTramo(masCerca.tramo)
    },
    [alSeleccionarTramo, escalas, porId, red],
  )

  // Lo mismo que dice el dibujo, para quien no lo ve: cuántos emisores caen en cada banda de presión.
  const porBanda = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const emisor of red.emisores) {
      const presion = resultado.nodos[emisor.nodo]?.presionM
      if (presion === undefined || (resultado.nodos[emisor.nodo]?.caudalEmisorLph ?? 0) === 0) continue
      const banda = bandaDePresion(presion, presionNominalEmisorM)
      cuenta.set(banda.nombre, (cuenta.get(banda.nombre) ?? 0) + 1)
    }
    return [...cuenta.entries()]
  }, [red, resultado, presionNominalEmisorM])

  return (
    <div className="red-en-planta">
      <div className="acciones izquierda">
        <button type="button" aria-pressed={verConduccion} onClick={() => setConConduccion(!verConduccion)}>
          {verConduccion ? 'Encuadrar la parcela' : 'Ver también la conducción'}
        </button>
        {hayCorriente && (
          <button type="button" aria-pressed={aguaCorriendo} onClick={() => setAguaCorriendo(!aguaCorriendo)}>
            {aguaCorriendo ? 'Pausar el agua' : 'Ver el agua correr'}
          </button>
        )}
      </div>
      <div className="lienzo-con-agua">
      <canvas
        ref={lienzo}
        onClick={alHacerClic}
        style={{ width: ancho, height: escalas.alto, cursor: alSeleccionarTramo ? 'pointer' : 'default' }}
        role="img"
        aria-label={
          `Red en planta con ${red.tramos.length} tramos y ${red.emisores.length} emisores. ` +
          (porBanda.length === 0
            ? 'Ningún emisor está entregando agua en este turno.'
            : `Emisores que riegan, por presión: ${porBanda.map(([nombre, cuantos]) => `${cuantos} ${nombre.toLowerCase()}`).join(', ')}.`) +
          ` Caudal de la fuente, ${conDecimales(resultado.caudalFuenteLps, 2)} litros por segundo.` +
          (rotos.size > 0 ? ` ${rotos.size} tramos no aguantan la presión.` : '')
        }
      />
      <canvas ref={capaDelAgua} className="capa-del-agua" style={{ width: ancho, height: escalas.alto }} aria-hidden="true" />
      </div>
      {conLeyenda && <LeyendaDeLaPlanta presionNominalM={presionNominalEmisorM} conRotos={rotos.size > 0} conAfectados={afectados.size > 0} conCorriente={hayCorriente && aguaCorriendo} />}
    </div>
  )
}

/** Qué significa cada color y cada símbolo de la planta. Los pasos la ponen a todo el ancho, debajo de las vistas. */
export function LeyendaDeLaPlanta({
  presionNominalM,
  conRotos = false,
  conAfectados = false,
  conCorriente = false,
}: {
  presionNominalM: number
  conRotos?: boolean
  conAfectados?: boolean
  conCorriente?: boolean
}) {
  return (
    <LeyendaDeLaRed
        presionNominalM={presionNominalM}
        colorSinAgua={COLOR_SIN_AGUA}
        conRotos={conRotos}
        colorRoto={COLOR_ROTO}
        conAfectados={conAfectados}
        colorAfectado={COLOR_AFECTADO}
        conCorriente={conCorriente}
        extra={
          <>
            <li>
              <span className="muestra-plana" style={{ background: '#1f6fb2', borderRadius: '50%' }} aria-hidden="true" />
              <span>
                <strong>Poza azul</strong> · la fuente. <strong>Caseta gris</strong> · el cabezal, con su filtro. <strong>Caja gris</strong> · una cámara
                rompe-presión. <strong>Dos triángulos</strong> · una válvula reguladora.
              </span>
            </li>
            <li>
              <span className="muestra-plana" style={{ background: 'repeating-linear-gradient(90deg, #8a919c 0 9px, #1f2937 9px 10px)' }} aria-hidden="true" />
              <span>
                <strong>Rayitas sobre el tubo</strong> · las uniones de los tubos de PVC, cada 6 m. El grosor del tubo dice su diámetro; el
                fondo verde, las hileras del cultivo.
              </span>
            </li>
          </>
        }
    />
  )
}
