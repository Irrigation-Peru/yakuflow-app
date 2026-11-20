import './entorno.ts'
import { join } from 'node:path'
import { pino } from 'pino'
import { crearApp } from './app.ts'
import { crearBd } from './bd.ts'
import { leerConfiguracion } from './configuracion.ts'
import { climaEnLinea } from './servicios/clima.ts'
import { cargarEscenarios, elevacionCompuesta, elevacionDeOpenTopoData } from './servicios/elevacion.ts'
import { fuentesDeLaAna } from './servicios/fuentes-de-referencia.ts'
import { sueloDeSoilGrids } from './servicios/suelo.ts'

const registro = pino({ level: process.env.NIVEL_REGISTRO ?? 'info' })
const url = process.env.DATABASE_URL
if (!url) {
  registro.fatal('Falta DATABASE_URL')
  process.exit(1)
}

const config = leerConfiguracion()
const bd = crearBd(url, config.conexionesBd)
const escenarios = cargarEscenarios(join(import.meta.dirname, '..', 'escenarios'))
const vigenciaMs = config.vigenciaCacheMs
const app = crearApp({
  bd,
  config,
  elevacion: elevacionCompuesta(escenarios, elevacionDeOpenTopoData({ bd, vigenciaMs })),
  clima: climaEnLinea({ bd, vigenciaMs }),
  suelo: sueloDeSoilGrids({ bd, vigenciaMs }),
  fuentesDeReferencia: fuentesDeLaAna({ bd, vigenciaMs }),
  registro,
})

const puerto = Number(process.env.PORT ?? 3000)
app.listen(puerto, () => registro.info({ puerto, escenarios: escenarios.length }, 'API escuchando'))
