import { scaleLinear } from 'd3-scale'
import { useEffect, useRef, useState } from 'react'
import { conDecimales } from '../formato.ts'

// Perfil del terreno en Canvas 2D, con las escalas y las marcas de los ejes de d3-scale. En la conducción lleva
// además el nivel libre del agua, que baja en escalones, y las cámaras rompe-presión donde baja.

const ALTO = 170
const MARGEN = { arriba: 12, derecha: 12, abajo: 34, izquierda: 52 }

const COLOR_DEL_NIVEL = '#1f6fb2'
const COLOR_DE_LAS_MARCAS = '#5b5bd6'
const SIN_TRAMOS: { desdeM: number; hastaM: number; cota: number }[] = []
const SIN_MARCAS: { distanciaM: number; cota: number; rotulo: string }[] = []

export function Perfil({
  puntos,
  nombre = 'Perfil del terreno',
  nivel = SIN_TRAMOS,
  marcas = SIN_MARCAS,
}: {
  puntos: { distanciaM: number; cota: number }[]
  /** Con qué empieza la descripción para quien no ve el gráfico. */
  nombre?: string
  /** El nivel libre del agua, por tramos. */
  nivel?: { desdeM: number; hastaM: number; cota: number }[]
  marcas?: { distanciaM: number; cota: number; rotulo: string }[]
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [ancho, setAncho] = useState(320)

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
    if (!canvas || !ctx || puntos.length < 2) return
    const escala = window.devicePixelRatio || 1
    canvas.width = ancho * escala
    canvas.height = ALTO * escala
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.clearRect(0, 0, ancho, ALTO)

    const cotas = [...puntos.map((p) => p.cota), ...nivel.map((t) => t.cota)]
    const x = scaleLinear()
      .domain([0, puntos.at(-1)!.distanciaM])
      .range([MARGEN.izquierda, ancho - MARGEN.derecha])
    const y = scaleLinear()
      .domain([Math.min(...cotas), Math.max(...cotas)])
      .nice(4)
      .range([ALTO - MARGEN.abajo, MARGEN.arriba])

    ctx.font = '11px system-ui, sans-serif'
    ctx.fillStyle = '#6b7280'
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const marca of y.ticks(4)) {
      ctx.beginPath()
      ctx.moveTo(MARGEN.izquierda, y(marca))
      ctx.lineTo(ancho - MARGEN.derecha, y(marca))
      ctx.stroke()
      ctx.fillText(conDecimales(marca, 0), MARGEN.izquierda - 6, y(marca))
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const marca of x.ticks(5)) ctx.fillText(conDecimales(marca, 0), x(marca), ALTO - MARGEN.abajo + 6)
    ctx.fillText('distancia (m)', (MARGEN.izquierda + ancho - MARGEN.derecha) / 2, ALTO - 14)

    ctx.beginPath()
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.distanciaM), y(p.cota)) : ctx.lineTo(x(p.distanciaM), y(p.cota))))
    ctx.lineTo(x(puntos.at(-1)!.distanciaM), ALTO - MARGEN.abajo)
    ctx.lineTo(x(0), ALTO - MARGEN.abajo)
    ctx.closePath()
    ctx.fillStyle = 'rgba(17, 24, 39, 0.08)'
    ctx.fill()

    ctx.beginPath()
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.distanciaM), y(p.cota)) : ctx.lineTo(x(p.distanciaM), y(p.cota))))
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.setLineDash([6, 4])
    ctx.strokeStyle = COLOR_DEL_NIVEL
    for (const tramo of nivel) {
      ctx.beginPath()
      ctx.moveTo(x(tramo.desdeM), y(tramo.cota))
      ctx.lineTo(x(tramo.hastaM), y(tramo.cota))
      ctx.stroke()
    }
    ctx.setLineDash([])

    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    for (const marca of marcas) {
      ctx.fillStyle = COLOR_DE_LAS_MARCAS
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.rect(x(marca.distanciaM) - 5, y(marca.cota) - 5, 10, 10)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#374151'
      ctx.fillText(marca.rotulo, x(marca.distanciaM), y(marca.cota) - 8)
    }
  }, [puntos, nivel, marcas, ancho])

  return (
    <canvas
      ref={lienzo}
      style={{ width: ancho, height: ALTO }}
      role="img"
      aria-label={`${nombre} a lo largo de ${conDecimales(puntos.at(-1)?.distanciaM ?? 0, 0)} m, entre ${conDecimales(
        Math.min(...puntos.map((p) => p.cota)),
        0,
      )} y ${conDecimales(Math.max(...puntos.map((p) => p.cota)), 0)} m s. n. m.${marcas.length > 0 ? `, con ${marcas.length} cámaras rompe-presión` : ''}`}
    />
  )
}
