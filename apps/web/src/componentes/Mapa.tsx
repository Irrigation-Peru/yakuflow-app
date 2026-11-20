import { useEffect, useRef } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { URL_DE_TESELAS } from '../api/cliente.ts'
import type { PuntoDeReferencia, RelieveDelProyecto } from '../api/tipos.ts'
import type { Modo, Punto } from '../estado/lugar.ts'
import { rotuloDeReferencia } from '../referencias.ts'
import { ZonasParaLaFuente } from './ZonasParaLaFuente.tsx'

// El mapa del paso 1 (React Leaflet). Las teselas de OpenStreetMap llegan por el servidor; los vértices y la
// fuente son círculos, así no hace falta empaquetar las imágenes de los marcadores de Leaflet.

// Cerro de Pasco: donde abre el mapa cuando el proyecto todavía no tiene parcela.
const CENTRO_INICIAL: [number, number] = [-10.68, -76.26]

const aLeaflet = (p: Punto): [number, number] => [p.lat, p.lon]

function Clics({ alHacerClic }: { alHacerClic: (p: Punto) => void }) {
  useMapEvents({ click: (e) => alHacerClic({ lat: e.latlng.lat, lon: e.latlng.lng }) })
  return null
}

/**
 * Encuadra lo que estaba guardado al abrir el proyecto, una sola vez. Nunca sigue a lo que el estudiante dibuja:
 * si el mapa se moviera con su primer clic, el segundo caería en otro lugar.
 */
function Encuadre({ puntos }: { puntos: Punto[] }) {
  const mapa = useMap()
  const alAbrir = useRef(puntos)
  useEffect(() => {
    const guardados = alAbrir.current
    if (guardados.length === 1) mapa.setView(aLeaflet(guardados[0]!), 16, { animate: false })
    else if (guardados.length > 1) mapa.fitBounds(guardados.map(aLeaflet), { padding: [40, 40], maxZoom: 17, animate: false })
  }, [mapa])
  return null
}

export function Mapa({
  modo,
  vertices,
  cerrado,
  fuente,
  centroide,
  guardados,
  relieve,
  camaras,
  referencias,
  alHacerClic,
  alCerrar,
  alElegirReferencia,
}: {
  modo: Modo
  vertices: Punto[]
  cerrado: boolean
  fuente: Punto | null
  centroide: Punto | null
  /** La parcela y la fuente tal como estaban guardadas al abrir el proyecto: lo que se encuadra. */
  guardados: Punto[]
  /** El relieve alrededor de la parcela: mientras se ubica la fuente, el mapa lo pinta por zonas. */
  relieve: RelieveDelProyecto | null
  /** Las cámaras rompe-presión de la conducción guardada. */
  camaras: Punto[]
  /** Bocatomas, tomas y lagunas de la ANA cerca de la parcela, como referencia para ubicar la fuente. */
  referencias: PuntoDeReferencia[]
  alHacerClic: (p: Punto) => void
  alCerrar: () => void
  /** Mientras se ubica la fuente, un clic en un punto de referencia la pone justo ahí. */
  alElegirReferencia: (p: PuntoDeReferencia) => void
}) {
  const dibujando = modo === 'parcela'
  return (
    <MapContainer center={CENTRO_INICIAL} zoom={14} className={`mapa ${modo ? 'marcando' : ''}`} doubleClickZoom={false}>
      <TileLayer url={URL_DE_TESELAS} maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <Clics alHacerClic={alHacerClic} />
      <Encuadre puntos={guardados} />
      {modo === 'fuente' && relieve && <ZonasParaLaFuente relieve={relieve} />}

      {/* Mientras se dibuja la parcela no reciben clics: cada clic es una esquina. Leaflet fija `interactive` al crear el
          círculo, así que la clave cambia con el modo y el círculo se vuelve a crear. */}
      {referencias.map((r) => (
        <CircleMarker
          key={`ref-${dibujando}-${r.tipo}-${r.lat}-${r.lon}`}
          center={aLeaflet(r)}
          radius={modo === 'fuente' ? 7 : 5}
          interactive={!dibujando}
          bubblingMouseEvents={false}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: r.tipo === 'laguna' ? '#0284c7' : '#0f766e', fillOpacity: 0.9 }}
          eventHandlers={{ click: () => modo === 'fuente' && alElegirReferencia(r) }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {rotuloDeReferencia(r)}
            {modo === 'fuente' && <><br />Haz clic para ubicar aquí la fuente</>}
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Las líneas no reciben clics: se dibujan encima del primer vértice y se quedarían con el clic que cierra. */}
      {cerrado ? (
        <Polygon positions={vertices.map(aLeaflet)} interactive={false} pathOptions={{ color: '#111827', weight: 2, dashArray: '6 4', fillOpacity: 0.12 }} />
      ) : (
        vertices.length > 1 && (
          <Polyline positions={vertices.map(aLeaflet)} interactive={false} pathOptions={{ color: '#111827', weight: 2, dashArray: '6 4' }} />
        )
      )}
      {vertices.map((v, i) => (
        <CircleMarker
          key={`${i}-${v.lat}-${v.lon}`}
          center={aLeaflet(v)}
          radius={i === 0 && dibujando && vertices.length >= 3 ? 9 : 5}
          bubblingMouseEvents={false}
          pathOptions={{ color: '#111827', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
          eventHandlers={{ click: () => (i === 0 && dibujando ? alCerrar() : undefined) }}
        >
          {i === 0 && dibujando && vertices.length >= 3 && <Tooltip direction="top">Haz clic aquí para cerrar el contorno</Tooltip>}
        </CircleMarker>
      ))}

      {fuente && centroide && cerrado && (
        <Polyline positions={[aLeaflet(fuente), aLeaflet(centroide)]} interactive={false} pathOptions={{ color: '#6b7280', weight: 1.5, dashArray: '3 5' }} />
      )}
      {camaras.map((c, i) => (
        <CircleMarker
          key={`crp-${i}-${c.lat}-${c.lon}`}
          center={aLeaflet(c)}
          radius={6}
          interactive={false}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#5b5bd6', fillOpacity: 1 }}
        >
          {/* Debajo: el rótulo de la fuente va arriba, y la primera cámara suele quedar cerca de ella. */}
          <Tooltip permanent direction="bottom" offset={[0, 6]} className="rotulo-del-mapa">
            CRP {i + 1}
          </Tooltip>
        </CircleMarker>
      ))}
      {fuente && (
        <CircleMarker center={aLeaflet(fuente)} radius={8} bubblingMouseEvents={false} pathOptions={{ color: '#111827', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>
            fuente
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  )
}
