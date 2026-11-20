import { scaleLinear } from 'd3-scale'
import { useEffect, useRef, useState } from 'react'
import type { RiegoDeLaCampana } from '../calculo/campana.ts'
import { conDecimales } from '../formato.ts'
import { dibujarCielo, dibujarPlanta, dibujarRaices, dibujarSuelo, formaDePlanta } from './dibujo-del-campo.ts'

// El corte del suelo bajo el emisor (HU0016), en Canvas 2D: con goteo, un corte de través a tres laterales, a escala
// real en los dos ejes, con lo que moja cada uno contra la profundidad de la raíz: el bulbo de un gotero, la franja
// cuando los bulbos de un lateral se juntan o la capa pareja cuando también se juntan las franjas. Con aspersión, el
// frente húmedo y, si el aspersor aplica más rápido de lo que el suelo infiltra, el agua que escurre por encima (C5: lo
// que pasa dentro del suelo no se ve).

type Corte = NonNullable<RiegoDeLaCampana['diseno']>['corte']

const ALTO = 380
const MARGEN = { arriba: 92, derecha: 160, abajo: 36, izquierda: 70 }
const COLOR = {
  suelo: '#f3f4f6',
  borde: '#9ca3af',
  tinta: '#111827',
  texto: '#374151',
  suave: '#6b7280',
  agua: 'rgba(30, 96, 190, 0.40)',
  aguaBorde: '#1f6fb2',
  costra: '#9ca3af',
  raices: 'rgba(22, 134, 106, 0.09)',
  raiz: '#16866a',
}

const NOMBRE_DE_LA_FORMA = { bulbos: 'bulbo', franja: 'franja', capa: 'frente' } as const

export function CorteDelSuelo({
  corte,
  profundidadRadicularM,
  separacionM,
  separacionLateralesM,
  cultivo,
}: {
  corte: Corte
  profundidadRadicularM: number
  separacionM: number
  separacionLateralesM: number
  /** Para dibujar encima la planta que es: maíz, una gramínea o una mata. */
  cultivo?: string
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [ancho, setAncho] = useState(640)

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
    canvas.width = ancho * escala
    canvas.height = ALTO * escala
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.clearRect(0, 0, ancho, ALTO)
    ctx.font = '12px system-ui, sans-serif'

    const alcance = corte.tipo === 'bulbo' ? corte.profundidadM : corte.profundidadDelFrenteM
    const fondo = Math.max(profundidadRadicularM, alcance) * 1.3
    const util = { ancho: ancho - MARGEN.izquierda - MARGEN.derecha, alto: ALTO - MARGEN.arriba - MARGEN.abajo }
    // Con goteo el corte va a escala real en los dos ejes, para que la forma del bulbo sea la que es.
    const extension = corte.tipo === 'bulbo' && corte.forma !== 'capa' ? separacionLateralesM + corte.radioM : separacionLateralesM * 1.5
    const mitad = corte.tipo === 'bulbo' ? Math.max(extension * 1.15, (fondo * util.ancho) / util.alto / 2) : 1
    const pxPorM = Math.min(util.ancho / (2 * mitad), util.alto / fondo)
    const centroX = MARGEN.izquierda + util.ancho / 2
    const x = (m: number) => centroX + m * (corte.tipo === 'bulbo' ? pxPorM : util.ancho / 2)
    const y = scaleLinear().domain([0, fondo]).range([MARGEN.arriba, MARGEN.arriba + fondo * pxPorM])
    const izquierda = MARGEN.izquierda
    const derecha = ancho - MARGEN.derecha
    const piso = y(fondo)

    // El cielo y el suelo, con su color y su grano.
    dibujarCielo(ctx, { izquierda, derecha, arriba: 0, abajo: y(0) })
    dibujarSuelo(ctx, { izquierda, derecha, arriba: y(0), abajo: piso })
    const forma = formaDePlanta(cultivo)
    // Dónde van las plantas: con goteo, una hilera junto a cada lateral; con aspersión, parejas en todo el ancho.
    const plantas =
      corte.tipo === 'bulbo'
        ? [-separacionLateralesM, 0, separacionLateralesM].map((c) => x(c)).filter((px) => px > izquierda + 8 && px < derecha - 8)
        : (() => {
            const cuantas = Math.max(2, Math.floor((derecha - izquierda) / 90))
            return Array.from({ length: cuantas }, (_, i) => izquierda + ((i + 0.5) * (derecha - izquierda)) / cuantas)
          })()
    const separacionEnPx = plantas.length > 1 ? plantas[1]! - plantas[0]! : derecha - izquierda
    ctx.fillStyle = COLOR.suave
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const marca of y.ticks(4)) ctx.fillText(`${conDecimales(marca, 1)} m`, izquierda - 6, y(marca))
    ctx.save()
    ctx.translate(16, (y(0) + piso) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('profundidad', 0, 0)
    ctx.restore()

    // La zona de las raíces, en verde, debajo del agua: lo que queda verde sin azul es raíz sin agua.
    ctx.fillStyle = COLOR.raices
    ctx.fillRect(izquierda, y(0), derecha - izquierda, y(Math.min(profundidadRadicularM, fondo)) - y(0))

    const laterales = [-separacionLateralesM, 0, separacionLateralesM]
    if (corte.tipo === 'bulbo') {
      // Lo mojado, recortado al suelo del dibujo y pintado de una vez para que donde se juntan no se vea más oscuro.
      ctx.save()
      ctx.beginPath()
      ctx.rect(izquierda, y(0), derecha - izquierda, piso - y(0))
      ctx.clip()
      ctx.beginPath()
      if (corte.forma === 'capa') {
        ctx.rect(izquierda, y(0), derecha - izquierda, y(corte.profundidadM) - y(0))
      } else {
        for (const centro of laterales) {
          ctx.moveTo(x(centro) + corte.radioM * pxPorM, y(0))
          ctx.ellipse(x(centro), y(0), corte.radioM * pxPorM, corte.profundidadM * pxPorM, 0, 0, Math.PI)
        }
      }
      ctx.fillStyle = COLOR.agua
      ctx.fill()
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = COLOR.aguaBorde
      ctx.lineWidth = 1.5
      if (corte.forma === 'capa') {
        ctx.beginPath()
        ctx.moveTo(izquierda, y(corte.profundidadM))
        ctx.lineTo(derecha, y(corte.profundidadM))
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    } else {
      ctx.fillStyle = COLOR.agua
      ctx.fillRect(izquierda, y(0), derecha - izquierda, y(corte.profundidadDelFrenteM) - y(0))
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = COLOR.aguaBorde
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(izquierda, y(corte.profundidadDelFrenteM))
      ctx.lineTo(derecha, y(corte.profundidadDelFrenteM))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Las raíces de cada planta, hasta la profundidad que da el cálculo.
    ctx.save()
    ctx.beginPath()
    ctx.rect(izquierda, y(0), derecha - izquierda, piso - y(0))
    ctx.clip()
    plantas.forEach((px, i) => dibujarRaices(ctx, px, y(0), y(Math.min(profundidadRadicularM, fondo)), separacionEnPx * 0.45, forma, 101 + i * 17))
    ctx.restore()
    // Y la planta encima.
    plantas.forEach((px, i) => dibujarPlanta(ctx, px, y(0), Math.min(58, MARGEN.arriba - 34), forma, 211 + i * 13))

    // El fondo de la raíz.
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = COLOR.raiz
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(izquierda, y(profundidadRadicularM))
    ctx.lineTo(derecha, y(profundidadRadicularM))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = COLOR.raiz
    ctx.textAlign = 'left'
    ctx.fillText(`fondo de la raíz · ${conDecimales(profundidadRadicularM, 2)} m`, derecha + 6, y(profundidadRadicularM))

    // La superficie y el borde del corte.
    ctx.strokeStyle = COLOR.borde
    ctx.lineWidth = 1
    ctx.strokeRect(izquierda, y(0), derecha - izquierda, piso - y(0))

    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    if (corte.tipo === 'bulbo') {
      // Cada lateral, cortado de través: la manguera negra sobre el suelo, al pie de la planta, con su gota.
      for (const centro of laterales) {
        if (x(centro) < izquierda || x(centro) > derecha) continue
        const mx = x(centro) + 9
        ctx.fillStyle = COLOR.tinta
        ctx.beginPath()
        ctx.arc(mx, y(0) - 4, 5, 0, 2 * Math.PI)
        ctx.fill()
        ctx.fillStyle = '#3b82c4'
        ctx.beginPath()
        ctx.moveTo(mx, y(0) + 1)
        ctx.quadraticCurveTo(mx + 3, y(0) + 5, mx, y(0) + 7)
        ctx.quadraticCurveTo(mx - 3, y(0) + 5, mx, y(0) + 1)
        ctx.fill()
      }
      ctx.fillStyle = COLOR.texto
      ctx.textBaseline = 'top'
      ctx.fillText(
        `laterales cada ${conDecimales(separacionLateralesM, 2)} m · un gotero cada ${conDecimales(separacionM, 2)} m en cada uno`,
        centroX,
        6,
      )
      ctx.textBaseline = 'bottom'
      // La distancia de través, debajo de cada lateral.
      ctx.fillStyle = COLOR.suave
      ctx.textBaseline = 'top'
      for (const centro of laterales) {
        if (x(centro) < izquierda || x(centro) > derecha) continue
        ctx.fillText(centro === 0 ? '0 m' : `${centro < 0 ? '−' : ''}${conDecimales(Math.abs(centro), 2)} m`, x(centro), piso + 6)
      }
      ctx.fillText('distancia de través a los laterales', centroX, piso + 20)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = COLOR.aguaBorde
      ctx.fillText(`hasta aquí moja · ${conDecimales(corte.profundidadM, 2)} m`, derecha + 6, y(corte.profundidadM))
    } else {
      // El aspersor sobre su elevador, entre dos plantas, con el chorro que se abre a los dos lados.
      const ax = plantas.length > 1 ? (plantas[Math.floor(plantas.length / 2) - 1]! + plantas[Math.floor(plantas.length / 2)]!) / 2 : centroX
      ctx.strokeStyle = '#4b5563'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(ax, y(0))
      ctx.lineTo(ax, 20)
      ctx.stroke()
      ctx.fillStyle = COLOR.tinta
      ctx.fillRect(ax - 6, 14, 12, 7)
      ctx.strokeStyle = 'rgba(31, 111, 178, 0.55)'
      ctx.lineWidth = 1.3
      ctx.setLineDash([2, 4])
      for (const lado of [-1, 1]) {
        for (const alcance of [0.35, 0.65, 0.95]) {
          const fin = ax + lado * (lado < 0 ? ax - izquierda : derecha - ax) * alcance
          ctx.beginPath()
          ctx.moveTo(ax, 17)
          ctx.quadraticCurveTo((ax + fin) / 2, 2, fin, y(0) - 2)
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
      if (corte.fraccionEscurrida > 0) {
        ctx.fillStyle = COLOR.costra
        ctx.fillRect(izquierda, y(0), derecha - izquierda, 7)
        ctx.strokeStyle = COLOR.tinta
        ctx.lineWidth = 2
        for (const inicio of [derecha - 130, derecha - 60]) {
          ctx.beginPath()
          ctx.moveTo(inicio, y(0) + 18)
          ctx.lineTo(inicio + 40, y(0) + 18)
          ctx.lineTo(inicio + 33, y(0) + 13)
          ctx.moveTo(inicio + 40, y(0) + 18)
          ctx.lineTo(inicio + 33, y(0) + 23)
          ctx.stroke()
        }
        ctx.fillStyle = COLOR.texto
        ctx.textAlign = 'right'
        ctx.fillText(`el agua escurre · ${conDecimales(corte.fraccionEscurrida * 100, 0)} %`, derecha, y(0) - 26)
      }
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = COLOR.aguaBorde
      ctx.fillText(`hasta aquí moja · ${conDecimales(corte.profundidadDelFrenteM, 2)} m`, derecha + 6, y(corte.profundidadDelFrenteM))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = COLOR.texto
      ctx.fillText(
        `${conDecimales(corte.intensidadMmH, 1)} mm/h de precipitación contra ${conDecimales(corte.infiltracionBasicaMmH, 1)} mm/h de infiltración`,
        centroX,
        piso + 8,
      )
    }
  }, [corte, profundidadRadicularM, separacionM, separacionLateralesM, ancho, cultivo])

  const descripcion =
    corte.tipo === 'bulbo'
      ? `Corte del suelo de través a tres laterales separados ${conDecimales(separacionLateralesM, 2)} m: ${
          corte.forma === 'capa' ? 'el agua moja una capa pareja que' : `cada ${NOMBRE_DE_LA_FORMA[corte.forma]} se abre ${conDecimales(corte.radioM, 2)} m y`
        } baja ${conDecimales(corte.profundidadM, 2)} m; la raíz llega a ${conDecimales(profundidadRadicularM, 2)} m.`
      : `Corte del suelo bajo el aspersor: el agua llega a ${conDecimales(corte.profundidadDelFrenteM, 2)} m, la raíz a ${conDecimales(profundidadRadicularM, 2)} m${
          corte.fraccionEscurrida > 0 ? ` y escurre el ${conDecimales(corte.fraccionEscurrida * 100, 0)} % del agua` : ''
        }.`

  return <canvas ref={lienzo} style={{ width: ancho, height: ALTO }} role="img" aria-label={descripcion} />
}
