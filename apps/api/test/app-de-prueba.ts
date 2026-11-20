import type { Application } from 'express'
import request from 'supertest'
import { crearApp, type Dependencias } from '../src/app.ts'
import { PARAMETROS_POR_OMISION, type Configuracion } from '../src/configuracion.ts'
import type { ProveedorDeClima } from '../src/servicios/clima.ts'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import type { ProveedorDeFuentesDeReferencia } from '../src/servicios/fuentes-de-referencia.ts'
import type { ProveedorDeSuelo } from '../src/servicios/suelo.ts'
import { bdDePrueba } from './bd-de-prueba.ts'

export const DOMINIO = 'undac.edu.pe'
export const CODIGO_CURSO = 'AGR-2027-1'

export function configuracionDePrueba(cambios: Partial<Configuracion> = {}): Configuracion {
  return {
    dominioCorreo: DOMINIO,
    codigosCurso: [CODIGO_CURSO],
    secretoJwt: new TextEncoder().encode('un secreto de prueba con más de treinta y dos caracteres'),
    origenWeb: 'http://localhost:5173',
    contactoOsm: 'equipo@ejemplo.pe',
    produccion: false,
    cookieEntreSitios: false,
    documentacionPublica: true,
    costoBcrypt: 4,
    ...PARAMETROS_POR_OMISION,
    ...cambios,
  }
}

// Sin servicios inyectados, cualquier consulta al terreno, al clima o al suelo falla: ninguna prueba sale a internet.
const sinElevacion: ProveedorDeElevacion = {
  cotas: async () => {
    throw new Error('Esta prueba no tiene servicio de elevación')
  },
}
const sinClima: ProveedorDeClima = {
  normales: async () => {
    throw new Error('Esta prueba no tiene servicio de clima')
  },
}
const sinSuelo: ProveedorDeSuelo = {
  suelo: async () => {
    throw new Error('Esta prueba no tiene servicio de suelo')
  },
}

const sinFuentesDeReferencia: ProveedorDeFuentesDeReferencia = {
  cerca: async () => {
    throw new Error('Esta prueba no tiene servicio de fuentes de referencia')
  },
}

export async function appDePrueba(dependencias: Partial<Omit<Dependencias, 'bd'>> = {}) {
  const prueba = await bdDePrueba()
  const app = crearApp({
    bd: prueba.bd,
    config: configuracionDePrueba(),
    elevacion: sinElevacion,
    clima: sinClima,
    suelo: sinSuelo,
    fuentesDeReferencia: sinFuentesDeReferencia,
    ...dependencias,
  })
  return { ...prueba, app }
}

/** Un navegador: guarda la cookie de sesión y manda la cabecera que la API exige en todo lo que no es lectura. */
export function navegador(app: Application) {
  const agente = request.agent(app)
  agente.set('X-Riego', '1')
  return agente
}

let siguiente = 0
export async function estudianteRegistrado(app: Application) {
  const agente = navegador(app)
  siguiente += 1
  const datos = {
    correo: `estudiante${siguiente}@${DOMINIO}`,
    contrasena: 'una clave larga',
    nombres: `Estudiante ${siguiente}`,
    codigoCurso: CODIGO_CURSO,
  }
  const respuesta = await agente.post('/api/cuenta').send(datos)
  if (respuesta.status !== 201) throw new Error(`No se pudo registrar: ${respuesta.status} ${JSON.stringify(respuesta.body)}`)
  return { agente, datos }
}

/** Un estudiante con el consentimiento aceptado y la prueba de entrada terminada: el recorrido ya está abierto. */
export async function estudianteHabilitado(app: Application) {
  const registrado = await estudianteRegistrado(app)
  const { agente } = registrado
  const { version } = (await agente.get('/api/consentimiento')).body
  await agente.post('/api/consentimiento').send({ version })
  const { items } = (await agente.post('/api/evaluaciones/entrada')).body
  for (const item of items) await agente.put(`/api/evaluaciones/entrada/respuestas/${item.id}`).send({ alternativa: 'a' })
  const fin = await agente.post('/api/evaluaciones/entrada/fin')
  if (fin.status !== 200) throw new Error(`No se pudo terminar la prueba: ${fin.status} ${JSON.stringify(fin.body)}`)
  return registrado
}
