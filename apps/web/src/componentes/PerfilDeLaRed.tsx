import type { PuntoDelRecorrido } from '@riego/calculo'
import { scaleLinear } from 'd3-scale'
import { useEffect, useRef, useState } from 'react'
import { conDecimales } from '../formato.ts'

// El perfil de la red (HU0018): el terreno a lo largo de un recorrido, de la fuente a un extremo, con la línea de
// presión encima. La distancia entre las dos líneas es la presión en cada punto; donde se tocan, el agua ya no empuja.
// Es lo que el estudiante tiene que aprender a leer (C5). Tocar un tramo aquí lo selecciona también en la planta.

const ALTO = 230
/** En una columna angosta, junto a la planta, el perfil crece en alto para no quedar como una franja. */
const altoDelPerfil = (ancho: number) => (ancho < 700 ? Math.round(Math.min(380, Math.max(ALTO, ancho * 0.6))) : ALTO)
const MARGEN = { arriba: 16, derecha: 12, abajo: 34, izquierda: 56 }
const COLOR_DE_LA_LINEA = '#1f6fb2'
const COLOR_ELEGIDO = '#111827'
const COLOR_ROTO = '#b42318'
const COLOR_DE_LA_PRESION = 'rgba(42, 120, 214, 0.18)'
const SIN_ROTOS: ReadonlySet<string> = new Set()

export function PerfilDeLaRed({
  puntos,
  tramoSeleccionado,
  alSeleccionarTramo,
  rotos = SIN_ROTOS,
}: {
  puntos: readonly PuntoDelRecorrido[]
  tramoSeleccionado?: string
  alSeleccionarTramo?: (tramo: string) => void
  rotos?: ReadonlySet<string>
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [ancho, setAncho] = useState(480)

  useEffect(() => {
    const elemento = lienzo.current?.parentElement
    if (!elemento) return
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada!.contentRect.width)))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  const alto = altoDelPerfil(ancho)
  const largo = Math.max(1e-6, puntos.at(-1)?.distanciaM ?? 1)
  const x = scaleLinear().domain([0, largo]).range([MARGEN.izquierda, ancho - MARGEN.derecha])

  useEffect(() => {
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || puntos.length < 2) return
    const escala = window.devicePixelRatio || 1
    canvas.width = ancho * escala
    canvas.height = alto * escala
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.clearRect(0, 0, ancho, alto)

    const cotas = puntos.flatMap((p) => [p.cota, p.cotaPiezometrica])
    const y = scaleLinear()
      .domain([Math.min(...cotas), Math.max(...cotas)])
      .nice(5)
      .range([alto - MARGEN.abajo, MARGEN.arriba])

    // El cielo, de fondo.
    const cielo = ctx.createLinearGradient(0, MARGEN.arriba, 0, alto - MARGEN.abajo)
    cielo.addColorStop(0, '#e4f1fb')
    cielo.addColorStop(1, '#fbfdff')
    ctx.fillStyle = cielo
    ctx.fillRect(MARGEN.izquierda, MARGEN.arriba, ancho - MARGEN.izquierda - MARGEN.derecha, alto - MARGEN.abajo - MARGEN.arriba)

    ctx.font = '11px system-ui, sans-serif'
    ctx.fillStyle = '#6b7280'
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
    ctx.lineWidth = 1
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const marca of y.ticks(5)) {
      ctx.beginPath()
      ctx.moveTo(MARGEN.izquierda, y(marca))
      ctx.lineTo(ancho - MARGEN.derecha, y(marca))
      ctx.stroke()
      ctx.fillText(conDecimales(marca, 0), MARGEN.izquierda - 6, y(marca))
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const marca of x.ticks(5)) ctx.fillText(conDecimales(marca, 0), x(marca), alto - MARGEN.abajo + 6)
    ctx.fillText('distancia desde la fuente (m)', (MARGEN.izquierda + ancho - MARGEN.derecha) / 2, alto - 14)

    // La presión, pintada: el agua que empuja entre la tubería y la línea de presión.
    ctx.beginPath()
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.distanciaM), y(p.cotaPiezometrica)) : ctx.lineTo(x(p.distanciaM), y(p.cotaPiezometrica))))
    for (let i = puntos.length - 1; i >= 0; i--) ctx.lineTo(x(puntos[i]!.distanciaM), y(puntos[i]!.cota))
    ctx.closePath()
    ctx.fillStyle = COLOR_DE_LA_PRESION
    ctx.fill()

    // El terreno: tierra más oscura arriba, con el pasto en la superficie.
    ctx.beginPath()
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.distanciaM), y(p.cota)) : ctx.lineTo(x(p.distanciaM), y(p.cota))))
    ctx.lineTo(x(largo), alto - MARGEN.abajo)
    ctx.lineTo(x(0), alto - MARGEN.abajo)
    ctx.closePath()
    const tierra = ctx.createLinearGradient(0, MARGEN.arriba, 0, alto - MARGEN.abajo)
    tierra.addColorStop(0, '#b8946c')
    tierra.addColorStop(1, '#e2d0b4')
    ctx.fillStyle = tierra
    ctx.fill()
    ctx.strokeStyle = '#6f9a4a'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.distanciaM), y(p.cota)) : ctx.lineTo(x(p.distanciaM), y(p.cota))))
    ctx.stroke()

    // La tubería, enterrada apenas bajo la superficie: el elegido y los rotos se distinguen.
    const enterrada = 4
    ctx.lineCap = 'round'
    puntos.forEach((p, i) => {
      if (i === 0) return
      const anterior = puntos[i - 1]!
      const roto = p.tramo !== undefined && rotos.has(p.tramo)
      const elegido = p.tramo === tramoSeleccionado
      const tramo = (color: string, grosor: number) => {
        ctx.beginPath()
        ctx.moveTo(x(anterior.distanciaM), y(anterior.cota) + enterrada)
        ctx.lineTo(x(p.distanciaM), y(p.cota) + enterrada)
        ctx.strokeStyle = color
        ctx.lineWidth = grosor
        ctx.stroke()
      }
      tramo(roto ? COLOR_ROTO : COLOR_ELEGIDO, elegido ? 7 : 4.5)
      tramo(roto ? '#f4b4ae' : elegido ? '#f3f4f6' : '#cbd5e1', elegido ? 3.5 : 2)
      // Las uniones de los tubos de 6 m, si caben sin amontonarse.
      const largoM = p.distanciaM - anterior.distanciaM
      const pxPorM = (x(p.distanciaM) - x(anterior.distanciaM)) / Math.max(1e-9, largoM)
      if (6 * pxPorM >= 8) {
        ctx.strokeStyle = roto ? COLOR_ROTO : COLOR_ELEGIDO
        ctx.lineWidth = 1.2
        for (let m = 6 - (anterior.distanciaM % 6); m < largoM; m += 6) {
          const t = m / largoM
          const ux = x(anterior.distanciaM) + t * (x(p.distanciaM) - x(anterior.distanciaM))
          const uy = y(anterior.cota) + t * (y(p.cota) - y(anterior.cota)) + enterrada
          ctx.beginPath()
          ctx.moveTo(ux, uy - 3.5)
          ctx.lineTo(ux, uy + 3.5)
          ctx.stroke()
        }
      }
    })
    ctx.lineCap = 'butt'

    // La línea de presión.
    ctx.setLineDash([6, 4])
    ctx.strokeStyle = COLOR_DE_LA_LINEA
    ctx.lineWidth = 2
    ctx.beginPath()
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.distanciaM), y(p.cotaPiezometrica)) : ctx.lineTo(x(p.distanciaM), y(p.cotaPiezometrica))))
    ctx.stroke()
    ctx.setLineDash([])

    // La presión del tramo elegido, como la separación entre las dos líneas.
    const elegido = puntos.find((p) => p.tramo === tramoSeleccionado)
    if (elegido) {
      ctx.strokeStyle = COLOR_ELEGIDO
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x(elegido.distanciaM), y(elegido.cota))
      ctx.lineTo(x(elegido.distanciaM), y(elegido.cotaPiezometrica))
      ctx.stroke()
      ctx.fillStyle = COLOR_ELEGIDO
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(`${conDecimales(elegido.presionM, 1)} m`, Math.min(x(elegido.distanciaM) + 4, ancho - 44), y(elegido.cotaPiezometrica) - 2)
    }
  }, [puntos, tramoSeleccionado, rotos, ancho]) // oxlint-disable-line react-hooks/exhaustive-deps

  function alHacerClic(evento: React.MouseEvent<HTMLCanvasElement>) {
    if (!alSeleccionarTramo) return
    const distancia = x.invert(evento.clientX - evento.currentTarget.getBoundingClientRect().left)
    const punto = puntos.find((p, i) => i > 0 && distancia >= puntos[i - 1]!.distanciaM && distancia <= p.distanciaM)
    if (punto?.tramo) alSeleccionarTramo(punto.tramo)
  }

  const presiones = puntos.map((p) => p.presionM)
  return (
    <div>
      <canvas
        ref={lienzo}
        onClick={alHacerClic}
        style={{ width: ancho, height: alto, cursor: alSeleccionarTramo ? 'pointer' : 'default' }}
        role="img"
        aria-label={`Perfil de la red a lo largo de ${conDecimales(largo, 0)} m. La presión va de ${conDecimales(presiones.length > 0 ? Math.min(...presiones) : 0, 1)} a ${conDecimales(
          presiones.length > 0 ? Math.max(...presiones) : 0,
          1,
        )} metros de columna de agua.`}
      />
      <ul className="leyenda-de-presion">
        <li>
          <span aria-hidden="true" style={{ background: COLOR_DE_LA_LINEA }} /> Línea de presión
        </li>
        <li>
          <span aria-hidden="true" style={{ background: '#cbd5e1', boxShadow: `inset 0 0 0 2px ${COLOR_ELEGIDO}` }} /> Tubería, enterrada bajo el terreno
        </li>
        <li>
          <span aria-hidden="true" style={{ background: COLOR_DE_LA_PRESION }} /> Presión: lo que hay entre la tubería y la línea
        </li>
      </ul>
    </div>
  )
}
