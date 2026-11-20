import type { Etapa } from '@riego/calculo'
import { scaleBand, scaleLinear } from 'd3-scale'
import { useEffect, useRef, useState } from 'react'
import { nombreDeEtapa } from '../condiciones.ts'
import { conDecimales } from '../formato.ts'
import { Desplazable } from './Desplazable.tsx'

// Lo que consume el cultivo semana a semana contra lo que da la fuente (HU0013), en Canvas 2D con las escalas de
// d3-scale. Cada barra es todo lo que el cultivo consume esa semana, en l/s de riego durante las horas de riego, partido
// en lo que hay que regar (abajo), lo que pone la lluvia de un año normal (celeste) y, en la maduración, lo que se deja
// de regar a propósito (rayado). La barra entera es lo que habría que regar si no lloviera: con la más alta se diseña
// el riego (paso 4), porque la lluvia no cae pareja. La fuente es una línea discontinua; lo que hay que regar por encima
// de ella va en ámbar (falta) o, con el reservorio, en azul. El detalle al pasar el cursor y la tabla dicen lo mismo.

export interface SemanaDeLaCurva {
  semana: number
  /** Lo que hay que regar esa semana, con la lluvia de un año normal, l/s. */
  necesidadLps: number
  /** Todo lo que consume el cultivo, como si no lloviera, l/s. */
  consumoLps: number
  /** Lo que pone la lluvia de un año normal, l/s. */
  lluviaLps: number
  /** En la maduración, lo que se deja de regar a propósito, l/s. */
  sinRegarLps: number
  cubre: boolean
  etapa: Etapa
}

const ALTO = 360
const MARGEN = { arriba: 80, derecha: 16, abajo: 54, izquierda: 48 }
const COLOR = {
  riego: '#9aa3ae',
  riegoCritico: '#4b5563',
  lluvia: '#a9d4f0',
  sinRegar: '#d6dbe1',
  sinCubrir: '#e8a33d',
  reservorio: '#4f86c6',
  tinta: '#111827',
  texto: '#374151',
  suave: '#6b7280',
  rejilla: '#eef0f3',
  fondo: '#ffffff',
}
/** Separación entre barras, px: el fondo entre una y otra. */
const ESPACIO = 2

function rayado(ctx: CanvasRenderingContext2D) {
  const muestra = document.createElement('canvas')
  muestra.width = 6
  muestra.height = 6
  const m = muestra.getContext('2d')!
  m.fillStyle = COLOR.fondo
  m.fillRect(0, 0, 6, 6)
  m.strokeStyle = COLOR.sinRegar
  m.lineWidth = 2
  m.beginPath()
  m.moveTo(0, 6)
  m.lineTo(6, 0)
  m.stroke()
  return ctx.createPattern(muestra, 'repeat') ?? COLOR.sinRegar
}

export function CurvaSemanal({
  semanas,
  caudalLps,
  semanaCritica,
  semanaDeMayorConsumo,
  techoLps = 0,
}: {
  semanas: readonly SemanaDeLaCurva[]
  caudalLps: number
  /** La que más riego pide con la lluvia de un año normal. */
  semanaCritica: number
  /** La que más consume sin contar la lluvia: con ella se diseña el riego. */
  semanaDeMayorConsumo: number
  /** Lo más alto que debe alcanzar el eje: con un ajuste aplicado, la escala sigue siendo la de antes y se ve bajar. */
  techoLps?: number
}) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const [ancho, setAncho] = useState(640)
  const [encima, setEncima] = useState<number | null>(null)

  useEffect(() => {
    const elemento = lienzo.current?.parentElement
    if (!elemento) return
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada!.contentRect.width)))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  const x = scaleBand<number>()
    .domain(semanas.map((s) => s.semana))
    .range([MARGEN.izquierda, ancho - MARGEN.derecha])
    .paddingInner(0.25)
    .paddingOuter(0.15)
  const y = scaleLinear()
    .domain([0, Math.max(techoLps, caudalLps, ...semanas.map((s) => Math.max(s.consumoLps, s.necesidadLps))) * 1.12])
    .nice(5)
    .range([ALTO - MARGEN.abajo, MARGEN.arriba])

  const mayorConsumo = semanas.find((s) => s.semana === semanaDeMayorConsumo)
  const sinLluviaNoAlcanza = mayorConsumo !== undefined && mayorConsumo.consumoLps > caudalLps

  useEffect(() => {
    const canvas = lienzo.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || semanas.length === 0) return
    const escala = window.devicePixelRatio || 1
    canvas.width = ancho * escala
    canvas.height = ALTO * escala
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    ctx.clearRect(0, 0, ancho, ALTO)
    ctx.font = '11px system-ui, sans-serif'
    const base = y(0)
    const rayas = rayado(ctx)

    // Rejilla y eje y.
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1
    for (const marca of y.ticks(5)) {
      ctx.strokeStyle = COLOR.rejilla
      ctx.beginPath()
      ctx.moveTo(MARGEN.izquierda, y(marca))
      ctx.lineTo(ancho - MARGEN.derecha, y(marca))
      ctx.stroke()
      ctx.fillStyle = COLOR.suave
      ctx.fillText(conDecimales(marca, 1), MARGEN.izquierda - 6, y(marca))
    }
    ctx.save()
    ctx.translate(12, (MARGEN.arriba + base) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillText('l/s', 0, 0)
    ctx.restore()

    // Las barras, de abajo arriba: lo que hay que regar, lo que pone la lluvia y lo que no se riega en la maduración.
    const anchoDeBarra = Math.max(1, x.bandwidth() - ESPACIO)
    const radio = Math.min(4, anchoDeBarra / 2)
    for (const s of semanas) {
      const izquierda = x(s.semana)! + ESPACIO / 2
      const tope = Math.max(s.consumoLps, s.necesidadLps)
      // El contorno de toda la barra, redondeado arriba.
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(izquierda, y(tope), anchoDeBarra, base - y(tope), base - y(tope) > 4 ? [radio, radio, 0, 0] : 0)
      ctx.clip()
      const tramo = (desde: number, hasta: number, relleno: string | CanvasPattern) => {
        if (hasta <= desde) return
        ctx.fillStyle = relleno
        ctx.fillRect(izquierda, y(hasta), anchoDeBarra, y(desde) - y(hasta))
      }
      tramo(0, s.necesidadLps, s.semana === semanaCritica ? COLOR.riegoCritico : COLOR.riego)
      // Lo que hay que regar por encima de la fuente: falta, o lo pone el reservorio.
      if (s.necesidadLps > caudalLps) tramo(caudalLps, s.necesidadLps, s.cubre ? COLOR.reservorio : COLOR.sinCubrir)
      tramo(s.necesidadLps, s.necesidadLps + s.lluviaLps, COLOR.lluvia)
      tramo(s.necesidadLps + s.lluviaLps, tope, rayas)
      ctx.restore()
      if (s.semana === semanaDeMayorConsumo || s.semana === encima) {
        ctx.strokeStyle = s.semana === semanaDeMayorConsumo && sinLluviaNoAlcanza ? COLOR.sinCubrir : COLOR.tinta
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(izquierda, y(tope), anchoDeBarra, base - y(tope), base - y(tope) > 4 ? [radio, radio, 0, 0] : 0)
        ctx.stroke()
      }
    }
    // La base.
    ctx.strokeStyle = COLOR.suave
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MARGEN.izquierda, base + 0.5)
    ctx.lineTo(ancho - MARGEN.derecha, base + 0.5)
    ctx.stroke()

    // Lo que da la fuente.
    ctx.setLineDash([7, 5])
    ctx.strokeStyle = COLOR.tinta
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(MARGEN.izquierda, y(caudalLps))
    ctx.lineTo(ancho - MARGEN.derecha, y(caudalLps))
    ctx.stroke()
    ctx.setLineDash([])
    // El rótulo de la fuente va debajo de la línea, a la derecha: los de las semanas van encima, y así no se montan.
    const rotuloDeLaFuente = `lo que da la fuente · ${conDecimales(caudalLps, 2)} l/s`
    const xDelRotulo = ancho - MARGEN.derecha
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.strokeStyle = COLOR.fondo
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.strokeText(rotuloDeLaFuente, xDelRotulo, y(caudalLps) + 5)
    ctx.fillStyle = COLOR.texto
    ctx.fillText(rotuloDeLaFuente, xDelRotulo, y(caudalLps) + 5)

    // Los dos rótulos: la semana que más riego pide en un año normal y la que más consume si no llueve.
    const rotular = (semana: number, texto: string, subtitulo: string, fila: number) => {
      const s = semanas.find((q) => q.semana === semana)
      if (!s) return
      const centro = x(semana)! + x.bandwidth() / 2
      const arriba = Math.min(y(Math.max(s.consumoLps, s.necesidadLps)), y(caudalLps)) - 6 - fila * 30
      ctx.font = '600 11px ui-monospace, Consolas, monospace'
      const anchoDelTexto = ctx.measureText(texto).width + 10
      const izquierda = Math.min(Math.max(centro - anchoDelTexto / 2, MARGEN.izquierda), ancho - MARGEN.derecha - anchoDelTexto)
      ctx.fillStyle = COLOR.tinta
      ctx.fillRect(izquierda, arriba - 30, anchoDelTexto, 16)
      ctx.fillStyle = COLOR.fondo
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(texto, izquierda + 5, arriba - 22)
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = COLOR.texto
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(subtitulo, Math.min(Math.max(centro, MARGEN.izquierda + 50), ancho - MARGEN.derecha - 50), arriba)
    }
    if (semanaCritica === semanaDeMayorConsumo) {
      rotular(semanaCritica, `sem ${semanaCritica}`, 'la que más pide', 0)
    } else {
      rotular(semanaDeMayorConsumo, `sem ${semanaDeMayorConsumo}`, 'más consumo', 0)
      // Si quedan a menos de un rótulo de distancia, el segundo va una fila más arriba.
      const separados = Math.abs(x(semanaCritica)! - x(semanaDeMayorConsumo)!) > 130
      rotular(semanaCritica, `sem ${semanaCritica}`, 'más riego con lluvia', separados ? 0 : 1)
    }

    // Eje x: algunas semanas y las etapas del cultivo debajo.
    ctx.fillStyle = COLOR.suave
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const cada = Math.max(1, Math.ceil(semanas.length / Math.max(1, Math.floor((ancho - MARGEN.izquierda) / 34))))
    semanas.forEach((s, i) => {
      if (i % cada === 0 || s.semana === semanaCritica || s.semana === semanaDeMayorConsumo) {
        ctx.fillText(String(s.semana), x(s.semana)! + x.bandwidth() / 2, base + 5)
      }
    })
    const tramos: { etapa: Etapa; desde: number; hasta: number }[] = []
    for (const s of semanas) {
      const ultimo = tramos.at(-1)
      if (ultimo?.etapa === s.etapa) ultimo.hasta = s.semana
      else tramos.push({ etapa: s.etapa, desde: s.semana, hasta: s.semana })
    }
    ctx.strokeStyle = COLOR.rejilla
    for (const t of tramos) {
      const desde = x(t.desde)!
      const hasta = x(t.hasta)! + x.bandwidth()
      ctx.strokeStyle = COLOR.suave
      ctx.beginPath()
      ctx.moveTo(desde + 1, base + 22)
      ctx.lineTo(hasta - 1, base + 22)
      ctx.stroke()
      ctx.fillStyle = COLOR.suave
      if (hasta - desde > 40) ctx.fillText(nombreDeEtapa(t.etapa).toLowerCase(), (desde + hasta) / 2, base + 26)
    }
  }, [semanas, caudalLps, semanaCritica, semanaDeMayorConsumo, sinLluviaNoAlcanza, ancho, encima, x, y])

  const enfocada = semanas.find((s) => s.semana === encima)
  const sinCubrir = semanas.filter((s) => !s.cubre).length
  const conReservorio = semanas.some((s) => s.cubre && s.necesidadLps > caudalLps)
  const conMaduracion = semanas.some((s) => s.sinRegarLps > 1e-9)
  const conLluvia = semanas.some((s) => s.lluviaLps > 1e-9)

  return (
    <div className="curva">
      <canvas
        ref={lienzo}
        style={{ width: ancho, height: ALTO }}
        role="img"
        aria-label={`Lo que consume el cultivo en ${semanas.length} semanas contra ${conDecimales(caudalLps, 2)} l/s de la fuente. Con la lluvia de un año normal, la semana ${semanaCritica} es la que más riego pide${
          sinCubrir > 0 ? ` y ${sinCubrir} semanas quedan sin cubrir` : ' y la fuente cubre todas'
        }. Si no llueve, la semana ${semanaDeMayorConsumo} es la que más consume: ${conDecimales(mayorConsumo?.consumoLps ?? 0, 2)} l/s${
          sinLluviaNoAlcanza ? ', más de lo que da la fuente' : ', y la fuente lo da'
        }. La tabla de abajo tiene los valores.`}
        onMouseMove={(e) => {
          const izquierda = e.currentTarget.getBoundingClientRect().left
          const posicion = e.clientX - izquierda
          // La zona sensible de cada semana es toda su franja, no solo la barra.
          const paso = x.step()
          const semana = semanas.find((s) => posicion >= x(s.semana)! - (paso - x.bandwidth()) / 2 && posicion < x(s.semana)! + x.bandwidth() + (paso - x.bandwidth()) / 2)
          setEncima(semana?.semana ?? null)
        }}
        onMouseLeave={() => setEncima(null)}
      />
      {enfocada && (
        <div
          className="detalle-de-la-curva"
          style={{ left: Math.min(x(enfocada.semana)! + x.bandwidth() + 8, ancho - 210), top: y(Math.max(enfocada.consumoLps, enfocada.necesidadLps)) }}
        >
          <strong>
            Semana {enfocada.semana} · {nombreDeEtapa(enfocada.etapa).toLowerCase()}
          </strong>
          <span className="cifra">consume {conDecimales(enfocada.consumoLps, 2)} l/s</span>
          {enfocada.lluviaLps > 0 && <span className="cifra">la lluvia pone {conDecimales(enfocada.lluviaLps, 2)} l/s</span>}
          {enfocada.sinRegarLps > 1e-9 && <span className="cifra">no se riega {conDecimales(enfocada.sinRegarLps, 2)} l/s (maduración)</span>}
          <span className="cifra">hay que regar {conDecimales(enfocada.necesidadLps, 2)} l/s</span>
          <span className="cifra">la fuente da {conDecimales(caudalLps, 2)} l/s</span>
          <span>{enfocada.cubre ? (enfocada.necesidadLps > caudalLps ? '✓ se cubre con el reservorio' : '✓ se cubre') : '✕ no se cubre'}</span>
        </div>
      )}
      <ul className="leyenda-de-la-curva" aria-label="Leyenda">
        <li>
          <span className="muestra" style={{ background: COLOR.riego }} /> lo que hay que regar
        </li>
        {conLluvia && (
          <li>
            <span className="muestra" style={{ background: COLOR.lluvia }} /> lo que pone la lluvia (año normal)
          </li>
        )}
        {conMaduracion && (
          <li>
            <span className="muestra" style={{ background: `repeating-linear-gradient(135deg, ${COLOR.fondo} 0 2px, ${COLOR.sinRegar} 2px 4px)` }} /> no se
            riega: maduración
          </li>
        )}
        {sinCubrir > 0 && (
          <li>
            <span className="muestra" style={{ background: COLOR.sinCubrir }} /> ✕ lo que la fuente no cubre
          </li>
        )}
        {conReservorio && (
          <li>
            <span className="muestra" style={{ background: COLOR.reservorio }} /> lo que pone el reservorio
          </li>
        )}
        <li>
          <span className="muestra linea-discontinua" /> lo que da la fuente
        </li>
      </ul>
      <details>
        <summary>Ver como tabla</summary>
        <Desplazable nombre="Lo que consume el cultivo semana a semana">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Etapa</th>
                <th scope="col">Consume · l/s</th>
                <th scope="col">Lluvia · l/s</th>
                <th scope="col">Regar · l/s</th>
                <th scope="col">¿Se cubre?</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((s) => (
                <tr key={s.semana} className={s.semana === semanaCritica || s.semana === semanaDeMayorConsumo ? 'destacada' : undefined}>
                  <th scope="row">
                    {s.semana}
                    {s.semana === semanaDeMayorConsumo && <span className="rotulo"> · más consumo</span>}
                    {s.semana === semanaCritica && s.semana !== semanaDeMayorConsumo && <span className="rotulo"> · más riego con lluvia</span>}
                  </th>
                  <td>{nombreDeEtapa(s.etapa)}</td>
                  <td className="cifra">{conDecimales(s.consumoLps, 2)}</td>
                  <td className="cifra">{conDecimales(s.lluviaLps, 2)}</td>
                  <td className="cifra">{conDecimales(s.necesidadLps, 2)}</td>
                  <td>{s.cubre ? (s.necesidadLps > caudalLps ? '✓ sí, con el reservorio' : '✓ sí') : '✕ no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Desplazable>
      </details>
    </div>
  )
}
