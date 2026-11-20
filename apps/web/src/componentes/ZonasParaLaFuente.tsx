import { desnivelDisponible, mapaDeZonas, ZONAS_PARA_LA_FUENTE } from '@riego/calculo'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleMarker, ImageOverlay, Pane, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { RelieveDelProyecto } from '../api/tipos.ts'
import { conDecimales } from '../formato.ts'
import { ZONA, zonaEn } from '../zonas.ts'

// Lo que el mapa muestra mientras el estudiante ubica la fuente: el terreno alrededor pintado por zonas, el
// punto más alto de la parcela y, bajo el cursor, la cota y la zona de ese punto. Las zonas las decide el
// módulo de cálculo; aquí solo se pintan.

/** Cada celda de la cuadrícula (unos 92 m) se pinta con 12 × 12 píxeles, para que los bordes no salgan en escalones. */
const PIXELES_POR_CELDA = 12

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

function imagenDeZonas({ grilla, parcela }: RelieveDelProyecto) {
  const ancho = (grilla.columnas - 1) * PIXELES_POR_CELDA
  const alto = (grilla.filas - 1) * PIXELES_POR_CELDA
  const zonas = mapaDeZonas(grilla, { cotaMasAlta: parcela.masAlto.cota, cotaMasBaja: parcela.masBajo.cota }, ancho, alto)
  const colores = ZONAS_PARA_LA_FUENTE.map((z) => [...rgb(ZONA[z].color), 255])
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const contexto = lienzo.getContext('2d')!
  const imagen = contexto.createImageData(ancho, alto)
  zonas.forEach((z, i) => imagen.data.set(colores[z]!, i * 4))
  contexto.putImageData(imagen, 0, 0)
  return lienzo.toDataURL()
}

/**
 * La cota y la zona del punto bajo el cursor, en una caja que lo sigue. React Leaflet solo abre un Tooltip
 * colgado de una capa, así que la caja va directo sobre el contenedor del mapa y no recibe clics.
 */
function LecturaBajoElCursor({ relieve }: { relieve: RelieveDelProyecto }) {
  const mapa = useMap()
  const [cursor, setCursor] = useState<{ lat: number; lon: number; x: number; y: number } | null>(null)
  useMapEvents({
    mousemove: (e) => setCursor({ lat: e.latlng.lat, lon: e.latlng.lng, x: e.containerPoint.x, y: e.containerPoint.y }),
    mouseout: () => setCursor(null),
  })
  const lectura = cursor && zonaEn(relieve, cursor)
  if (!cursor || !lectura) return null
  const { masAlto, masBajo } = relieve.parcela
  const { cota } = lectura
  const { disponibleM } = desnivelDisponible(cota, [masAlto.cota, masBajo.cota])
  const zona = ZONA[lectura.zona]
  return createPortal(
    <div className="lectura-del-cursor" style={{ left: cursor.x + 16, top: cursor.y }}>
      <span className="lectura-zona">
        <span className="muestra" style={{ background: zona.color }} />
        {zona.nombre}
      </span>
      <span className="lectura-cifras">
        {conDecimales(cota, 0)} m · {conDecimales(Math.abs(disponibleM), 0)} m {disponibleM >= 0 ? 'sobre el' : 'debajo del'} punto más alto
      </span>
    </div>,
    mapa.getContainer(),
  )
}

export function ZonasParaLaFuente({ relieve }: { relieve: RelieveDelProyecto }) {
  const imagen = useMemo(() => imagenDeZonas(relieve), [relieve])
  const { grilla, parcela } = relieve
  const limites: [[number, number], [number, number]] = [
    [grilla.latSur, grilla.lonOeste],
    [grilla.latSur + (grilla.filas - 1) * grilla.pasoGrados, grilla.lonOeste + (grilla.columnas - 1) * grilla.pasoGrados],
  ]
  return (
    <>
      {/* Debajo de la parcela y de los vértices, que se dibujan en el panel de capas de Leaflet (400). */}
      <Pane name="zonas" style={{ zIndex: 350 }}>
        <ImageOverlay url={imagen} bounds={limites} opacity={0.4} />
      </Pane>
      <CircleMarker
        center={[parcela.masAlto.lat, parcela.masAlto.lon]}
        radius={5}
        interactive={false}
        pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#111827', fillOpacity: 1 }}
      >
        <Tooltip permanent direction="bottom" offset={[0, 6]} className="rotulo-del-mapa">
          punto más alto · {conDecimales(parcela.masAlto.cota, 0)} m
        </Tooltip>
      </CircleMarker>
      <LecturaBajoElCursor relieve={relieve} />
    </>
  )
}
