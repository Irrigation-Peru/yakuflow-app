import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { ErrorDeApi } from '../errores.ts'

// Teselas del mapa base de OpenStreetMap, a través del servidor (D13). La política de uso de OSM pide
// identificarse con un User-Agent que tenga un contacto, respetar la caché y no descargar por adelantado:
// cada tesela se pide cuando un estudiante la mira, y se guarda en memoria para el resto del curso.

// El Perú, con un margen: el proxy no sirve de puerta a OSM para cualquier lugar del mundo.
const PERU = { latSur: -18.6, latNorte: 0.2, lonOeste: -81.6, lonEste: -68.4 }
const ZOOM_MAXIMO = 19
const SEMANA_S = 7 * 24 * 60 * 60

const lonDe = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const latDe = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI

function dentroDelPeru(z: number, x: number, y: number) {
  if (z > ZOOM_MAXIMO || x >= 2 ** z || y >= 2 ** z) return false
  // La tesela va de y (norte) a y + 1 (sur) y de x (oeste) a x + 1 (este).
  return latDe(y + 1, z) <= PERU.latNorte && latDe(y, z) >= PERU.latSur && lonDe(x, z) <= PERU.lonEste && lonDe(x + 1, z) >= PERU.lonOeste
}

export function rutasDeTeselas({
  contacto,
  obtener = fetch,
  capacidad = 2000,
  limitePorMinuto = 3000,
}: {
  contacto: string
  obtener?: typeof fetch
  capacidad?: number
  limitePorMinuto?: number
}) {
  const rutas = Router()
  // Map recuerda el orden de inserción: la primera clave es la que se usó hace más tiempo.
  const memoria = new Map<string, Uint8Array>()
  const agente = `SimuladorDeRiegoUPC/0.1 (tesis de la UPC; ${contacto})`

  // Una sección entera mira el mapa desde la misma IP del laboratorio.
  rutas.use(rateLimit({ windowMs: 60_000, limit: limitePorMinuto, standardHeaders: 'draft-8', legacyHeaders: false }))

  rutas.get('/:z/:x/:y.png', async (req, res) => {
    const [z, x, y] = [req.params.z, req.params.x, req.params.y].map((v) => (/^\d{1,7}$/.test(v) ? Number(v) : NaN))
    if (![z, x, y].every(Number.isInteger) || !dentroDelPeru(z!, x!, y!)) {
      throw new ErrorDeApi(404, 'tesela_fuera_de_cobertura', 'El mapa solo cubre el Perú')
    }
    const clave = `${z}/${x}/${y}`
    let imagen = memoria.get(clave)
    if (imagen) {
      memoria.delete(clave)
    } else {
      const respuesta = await obtener(`https://tile.openstreetmap.org/${clave}.png`, { headers: { 'User-Agent': agente } })
      if (!respuesta.ok) throw new ErrorDeApi(502, 'mapa_no_disponible', 'El servicio del mapa no respondió; intenta de nuevo')
      imagen = new Uint8Array(await respuesta.arrayBuffer())
      if (memoria.size >= capacidad) memoria.delete(memoria.keys().next().value!)
    }
    memoria.set(clave, imagen)
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${SEMANA_S}`,
      // La web está en otro origen: sin esto, helmet impediría que el navegador muestre la imagen.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    res.send(Buffer.from(imagen))
  })

  return rutas
}
