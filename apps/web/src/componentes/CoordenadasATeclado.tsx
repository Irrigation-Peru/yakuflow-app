import { useId, useState } from 'react'
import type { Modo, Punto } from '../estado/lugar.ts'

/**
 * La misma acción que un clic en el mapa, escribiendo las coordenadas: para quien no usa el mouse o tiene los puntos
 * medidos con GPS (WCAG 2.1.1). No calcula nada: entrega el punto como si se hubiera hecho clic ahí.
 */
export function CoordenadasATeclado({ modo, alAgregar }: { modo: Modo; alAgregar: (p: Punto) => void }) {
  const id = useId()
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (modo !== 'parcela' && modo !== 'fuente') return null

  const agregar = (e: React.FormEvent) => {
    e.preventDefault()
    const la = Number(lat.replace(',', '.'))
    const lo = Number(lon.replace(',', '.'))
    if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      setError('Escribe la latitud (entre −90 y 90) y la longitud (entre −180 y 180) en grados decimales, por ejemplo −12.12154 y −75.24893.')
      return
    }
    setError(null)
    alAgregar({ lat: la, lon: lo })
    setLat('')
    setLon('')
  }

  return (
    <details className="coordenadas">
      <summary>Escribir las coordenadas en lugar de hacer clic</summary>
      <form onSubmit={agregar} noValidate aria-describedby={error ? `${id}-e` : undefined}>
        <div className="campos dos">
          <label className="campo">
            <span className="campo-etiqueta">Latitud</span>
            <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="−12.12154" aria-invalid={Boolean(error)} />
          </label>
          <label className="campo">
            <span className="campo-etiqueta">Longitud</span>
            <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="−75.24893" aria-invalid={Boolean(error)} />
          </label>
        </div>
        {error && (
          <p className="error" id={`${id}-e`} role="alert">
            {error}
          </p>
        )}
        <div className="acciones izquierda">
          <button type="submit">{modo === 'parcela' ? 'Agregar esta esquina' : 'Ubicar la fuente aquí'}</button>
        </div>
      </form>
    </details>
  )
}
