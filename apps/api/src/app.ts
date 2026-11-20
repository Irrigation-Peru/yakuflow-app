import cookieParser from 'cookie-parser'
import express, { type RequestHandler } from 'express'
import helmet from 'helmet'
import { pino, type Logger } from 'pino'
import { pinoHttp } from 'pino-http'
import { z } from 'zod'
import type { Bd } from './bd.ts'
import type { Configuracion } from './configuracion.ts'
import { rutasDeDocumentacion } from './documentacion.ts'
import { ErrorDeApi, manejarErrores } from './errores.ts'
import { requiereRecorrido } from './recorrido.ts'
import { rutasDeConsentimiento } from './rutas/consentimiento.ts'
import { rutasDeCuenta } from './rutas/cuenta.ts'
import { catalogoVigente } from './catalogo.ts'
import { rutasDeEvaluaciones } from './rutas/evaluaciones.ts'
import { rutasDeEventos } from './rutas/eventos.ts'
import { rutasDeLaCampana } from './rutas/campana.ts'
import { rutasDeFuentesDeReferencia } from './rutas/fuentes-de-referencia.ts'
import { rutasDeProyectos } from './rutas/proyectos.ts'
import type { ProveedorDeFuentesDeReferencia } from './servicios/fuentes-de-referencia.ts'
import type { ProveedorDeClima } from './servicios/clima.ts'
import type { ProveedorDeElevacion } from './servicios/elevacion.ts'
import type { ProveedorDeSuelo } from './servicios/suelo.ts'
import { rutasDeTeselas } from './servicios/teselas.ts'
import { requiereSesion } from './sesion.ts'

z.config(z.locales.es())

export interface Dependencias {
  bd: Bd
  config: Configuracion
  elevacion: ProveedorDeElevacion
  clima: ProveedorDeClima
  suelo: ProveedorDeSuelo
  /** Bocatomas, tomas y lagunas cerca de la parcela, para ubicar la fuente. */
  fuentesDeReferencia: ProveedorDeFuentesDeReferencia
  /** Cómo se piden las teselas a OpenStreetMap; las pruebas ponen uno falso. */
  obtenerTesela?: typeof fetch
  registro?: Logger
}

/** Solo la web propia llama a la API con la cookie de sesión. */
function cors(origen: string): RequestHandler {
  return (req, res, siguiente) => {
    if (req.headers.origin === origen) {
      res.setHeader('Access-Control-Allow-Origin', origen)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.vary('Origin')
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Riego')
        res.setHeader('Access-Control-Max-Age', '600')
        res.status(204).end()
        return
      }
    }
    siguiente()
  }
}

/**
 * Contra la falsificación de solicitudes: todo lo que no es lectura tiene que traer la cabecera X-Riego. Un sitio
 * ajeno no puede ponerla sin pasar antes por CORS, y CORS solo deja pasar a la web propia.
 */
const soloDesdeLaAplicacion: RequestHandler = (req, _res, siguiente) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-riego'] !== '1') {
    throw new ErrorDeApi(403, 'origen_no_permitido', 'La solicitud no viene de la aplicación')
  }
  siguiente()
}

export function crearApp({ bd, config, elevacion, clima, suelo, fuentesDeReferencia, obtenerTesela, registro = pino({ level: 'silent' }) }: Dependencias) {
  const app = express()
  // En Railway la API está detrás de un proxy: la IP del cliente viene en X-Forwarded-For.
  if (config.produccion) app.set('trust proxy', config.saltosDeProxy)
  app.disable('x-powered-by')

  app.use(
    pinoHttp({
      logger: registro,
      // El registro técnico nunca guarda la sesión ni lo que escribe el estudiante.
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    }),
  )
  app.use(helmet())
  app.use(cors(config.origenWeb))
  // Un proyecto exportado lleva todas las versiones de la red; el resto de la API no necesita tanto.
  app.use('/api/proyectos/importacion', express.json({ limit: '4mb' }))
  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())
  app.use(soloDesdeLaAplicacion)

  const conSesion = requiereSesion(config)
  app.get('/api/salud', (_req, res) => {
    res.json({ estado: 'ok' })
  })
  // El contrato de la API y Swagger UI para probarla: en desarrollo siempre, en producción solo si se pide.
  if (config.documentacionPublica) app.use('/api/docs', rutasDeDocumentacion())
  app.use('/api/teselas', rutasDeTeselas({ contacto: config.contactoOsm, obtener: obtenerTesela, limitePorMinuto: config.limites.teselasPorMinuto }))
  app.use('/api', rutasDeCuenta(bd, config))
  app.use('/api/consentimiento', rutasDeConsentimiento(bd, conSesion))
  app.use('/api/evaluaciones', conSesion, rutasDeEvaluaciones(bd))
  app.use('/api/eventos', conSesion, rutasDeEventos(bd))
  app.get('/api/catalogo/precios', conSesion, async (_req, res) => {
    res.json(await catalogoVigente(bd))
  })
  app.use(
    '/api/proyectos',
    conSesion,
    requiereRecorrido(bd),
    rutasDeProyectos(bd, elevacion),
    rutasDeFuentesDeReferencia(bd, fuentesDeReferencia, registro),
    rutasDeLaCampana(bd, { clima, suelo, elevacion }),
  )

  app.use('/api', (_req, _res) => {
    throw new ErrorDeApi(404, 'ruta_desconocida', 'Esa ruta no existe')
  })
  app.use(manejarErrores)
  return app
}
