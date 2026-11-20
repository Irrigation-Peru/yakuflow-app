import type { Red } from '@riego/calculo'
import { useState } from 'react'
import { cifra, conDecimales } from '../formato.ts'

// Las partes de la red en el orden en que pasa el agua, con lo que mide cada una en esta red. Para qué sirve cada parte
// aparece al pasar el cursor, al llegar con el teclado o al hacer clic; el clic además elige su primer tramo en la planta
// y en el perfil.

interface Parte {
  clave: string
  nombre: string
  cifras: string
  paraQue: string
  color: string
  tramo?: string
}

const LATERAL = /^l(\d+)/

function medir(red: Red, prefijo: (id: string) => boolean) {
  const porId = new Map(red.nodos.map((n) => [n.id, n]))
  const tramos = red.tramos.filter((t) => prefijo(t.id))
  let largo = 0
  for (const t of tramos) {
    const a = porId.get(t.desde)
    const b = porId.get(t.hasta)
    if (a && b) largo += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  const diametros = [...new Set(tramos.map((t) => t.diametroInternoMm))].sort((x, y) => y - x)
  return { tramos, largo, diametros }
}

const enMm = (diametros: readonly number[]) =>
  diametros.length === 0 ? '' : diametros.length === 1 ? `de ${diametros[0]} mm` : `de ${diametros[0]} a ${diametros.at(-1)} mm`

export function EsquemaDeLaRed({
  red,
  emisores,
  sectores,
  presionNominalM,
  alElegir,
}: {
  red: Red
  /** Cuántos emisores de verdad tiene la red (los de `red.emisores` pueden ser equivalentes). */
  emisores: number
  sectores: number
  presionNominalM: number
  alElegir?: (tramo: string) => void
}) {
  const elementos = Object.entries(red.elementos ?? {})
  const camaras = elementos.filter(([, e]) => e.tipo === 'crp').length
  const reguladoraDelCabezal = elementos.some(([id, e]) => id === 'VC' && e.tipo === 'vrp')
  const reguladorasDeLateral = elementos.filter(([id, e]) => id !== 'VC' && e.tipo === 'vrp').length
  const conduccion = medir(red, (id) => id.startsWith('conduccion'))
  const portalateral = medir(red, (id) => id.startsWith('m'))
  const laterales = medir(red, (id) => id.startsWith('l'))
  const cuantosLaterales = new Set(laterales.tramos.map((t) => LATERAL.exec(t.id)?.[1])).size

  const partes: Parte[] = [
    { clave: 'fuente', nombre: 'Fuente', cifras: `sale con ${conDecimales(red.fuente.presionInicialM, 1)} m de presión`, paraQue: 'de donde sale el agua', color: '#1f6fb2' },
    ...(conduccion.tramos.length > 0
      ? [
          {
            clave: 'conduccion',
            nombre: 'Conducción',
            cifras: `${cifra(conduccion.largo, 0)} m ${enMm(conduccion.diametros)}`,
            paraQue: 'lleva el agua de la fuente a la parcela',
            color: '#9aa4b1',
            tramo: conduccion.tramos[0]!.id,
          },
        ]
      : []),
    ...(camaras > 0
      ? [{ clave: 'crp', nombre: camaras === 1 ? 'Cámara rompe-presión' : 'Cámaras rompe-presión', cifras: `${camaras}`, paraQue: 'bajan la presión cuando el desnivel es mucho', color: '#a8a29e' }]
      : []),
    {
      clave: 'cabezal',
      nombre: 'Cabezal',
      cifras: reguladoraDelCabezal ? 'con filtro y válvula reguladora' : 'con filtro',
      paraQue: 'limpia el agua y abre un sector a la vez',
      color: '#374151',
    },
    {
      clave: 'portalateral',
      nombre: 'Portalateral',
      cifras: `${cifra(portalateral.largo, 0)} m ${enMm(portalateral.diametros)}`,
      paraQue: 'reparte el agua a los laterales',
      color: '#6b7280',
      tramo: portalateral.tramos[0]?.id,
    },
    {
      clave: 'laterales',
      nombre: 'Laterales',
      cifras: `${cifra(cuantosLaterales, 0)} en ${sectores} ${sectores === 1 ? 'sector' : 'sectores'}, ${enMm(laterales.diametros)}${reguladorasDeLateral > 0 ? ` · ${reguladorasDeLateral} con reguladora` : ''}`,
      paraQue: 'una manguera por hilera del cultivo',
      color: '#1f2937',
      tramo: laterales.tramos[0]?.id,
    },
    {
      clave: 'emisores',
      nombre: 'Emisores',
      cifras: `${cifra(emisores, 0)}, trabajan a ${conDecimales(presionNominalM, 1)} m`,
      paraQue: 'mojan el suelo junto a cada planta',
      color: '#1f8a4c',
    },
  ]

  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <ol className="esquema-de-la-red" aria-label="Las partes de la red, en el orden en que pasa el agua">
      {partes.map((parte) => (
        <li key={parte.clave} className={abierta === parte.clave ? 'abierta' : undefined}>
          <button
            type="button"
            aria-expanded={abierta === parte.clave}
            aria-describedby={`para-que-${parte.clave}`}
            onClick={() => {
              setAbierta(abierta === parte.clave ? null : parte.clave)
              if (parte.tramo && alElegir) alElegir(parte.tramo)
            }}
          >
            <span className="punto" style={{ background: parte.color }} aria-hidden="true" />
            <strong>{parte.nombre}</strong>
            <span className="cifras">{parte.cifras}</span>
          </button>
          <span className="para-que" id={`para-que-${parte.clave}`} role="tooltip">
            {parte.paraQue[0]!.toUpperCase() + parte.paraQue.slice(1)}.
          </span>
        </li>
      ))}
    </ol>
  )
}
