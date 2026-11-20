import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDePrueba, configuracionDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// La documentación de la API, solo en desarrollo: el contrato en OpenAPI 3.1 y Swagger UI para probarlo, en /api/docs.
// Estas pruebas cuidan que el contrato no se desfase de las rutas: cada operación documentada existe en la API y
// ninguna ruta del código queda sin documentar.

const METODOS = ['get', 'post', 'put', 'delete', 'patch'] as const
type Metodo = (typeof METODOS)[number]

interface Documento {
  openapi: string
  tags: { name: string; description: string }[]
  paths: Record<string, Partial<Record<Metodo, Record<string, any>>>>
}

let prueba: Awaited<ReturnType<typeof appDePrueba>>
let documento: Documento
beforeAll(async () => {
  prueba = await appDePrueba()
  await cargarItemsDePrueba(prueba.bd)
  documento = (await request(prueba.app).get('/api/docs/openapi.json')).body
})
afterAll(() => prueba.cerrar())

const operaciones = () =>
  Object.entries(documento.paths).flatMap(([ruta, porMetodo]) =>
    METODOS.filter((m) => porMetodo[m]).map((metodo) => ({ ruta, metodo, operacion: porMetodo[metodo]! })),
  )

describe('en desarrollo', () => {
  it('sirve el contrato en OpenAPI 3.1', async () => {
    const respuesta = await request(prueba.app).get('/api/docs/openapi.json')
    expect(respuesta.status).toBe(200)
    expect(respuesta.body.openapi).toBe('3.1.0')
  })

  it('sirve Swagger UI desde el mismo origen; sin la barra final, redirige', async () => {
    const pagina = await request(prueba.app).get('/api/docs/')
    expect(pagina.status).toBe(200)
    expect(pagina.text).toContain('./swagger-ui-bundle.js')
    expect((await request(prueba.app).get('/api/docs/swagger-ui-bundle.js')).status).toBe(200)
    expect((await request(prueba.app).get('/api/docs/inicio.js')).text).toContain("'X-Riego'")
    const sinBarra = await request(prueba.app).get('/api/docs')
    expect(sinBarra.status).toBe(301)
    expect(sinBarra.headers.location).toBe('/api/docs/')
  })

  it('la página carga sus archivos por http en localhost: su política de contenido no los pasa a https', async () => {
    const politica = (await request(prueba.app).get('/api/docs/')).headers['content-security-policy']
    expect(politica).toContain("script-src 'self'")
    expect(politica).not.toContain('upgrade-insecure-requests')
  })

  it('solo sirve los archivos de Swagger UI que usa la página, no todo el paquete', async () => {
    expect((await request(prueba.app).get('/api/docs/index.html')).body.codigo).toBe('ruta_desconocida')
  })

  it('los cuerpos salen de los mismos esquemas con que validan las rutas', () => {
    const cuerpo = (ruta: string, metodo: Metodo) => documento.paths[ruta]![metodo]!.requestBody.content['application/json'].schema
    expect(cuerpo('/api/proyectos/{id}/fuente', 'put').properties.tipo.enum).toEqual(['canal', 'manantial', 'reservorio'])
    expect(cuerpo('/api/proyectos/{id}/campania', 'put').properties.cultivo.enum).toContain('Papa')
    expect(cuerpo('/api/proyectos/{id}/balance', 'put').required).toEqual(['ajuste'])
  })

  it('agrupa las rutas por contexto: los de la capa de negocio y los módulos M1 a M4', () => {
    const grupo = (ruta: string, metodo: Metodo) => documento.paths[ruta]![metodo]!.tags[0]
    expect(grupo('/api/sesion', 'post')).toBe('Cuentas y permisos')
    expect(grupo('/api/consentimiento', 'post')).toBe('Cuentas y permisos')
    expect(grupo('/api/evaluaciones/entrada', 'post')).toBe('Evaluación')
    expect(grupo('/api/proyectos', 'post')).toBe('Proyectos')
    expect(grupo('/api/proyectos/{id}/fuente', 'put')).toBe('Estudios básicos')
    expect(grupo('/api/proyectos/{id}/datos-del-lugar', 'get')).toBe('Estudios básicos')
    expect(grupo('/api/teselas/{z}/{x}/{y}.png', 'get')).toBe('Estudios básicos')
    expect(grupo('/api/proyectos/{id}/recomendaciones', 'post')).toBe('Selección del cultivo')
    expect(grupo('/api/proyectos/{id}/balance', 'put')).toBe('Balance hídrico')
    expect(grupo('/api/proyectos/{id}/diseno-agronomico', 'put')).toBe('Diseño agronómico')
  })
})

it('en producción no se monta, salvo que se pida', async () => {
  const cerrada = await appDePrueba({ config: configuracionDePrueba({ produccion: true, documentacionPublica: false }) })
  const abierta = await appDePrueba({ config: configuracionDePrueba({ produccion: true, documentacionPublica: true }) })
  try {
    const respuesta = await request(cerrada.app).get('/api/docs/openapi.json')
    expect(respuesta.status).toBe(404)
    expect(respuesta.body.codigo).toBe('ruta_desconocida')
    expect((await request(abierta.app).get('/api/docs/openapi.json')).status).toBe(200)
  } finally {
    await cerrada.cerrar()
    await abierta.cerrar()
  }
})

describe('el contrato y las rutas no se desfasan', () => {
  it('cada operación dice qué hace, a qué grupo pertenece y qué responde, y declara sus parámetros', () => {
    for (const { ruta, operacion } of operaciones()) {
      expect(operacion.summary, ruta).toBeTruthy()
      expect(operacion.tags, ruta).toHaveLength(1)
      expect(Object.keys(operacion.responses).length, ruta).toBeGreaterThan(0)
      const parametros = [...ruta.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      expect(operacion.parameters?.map((p: { name: string }) => p.name) ?? [], ruta).toEqual(parametros)
    }
  })

  it('cada grupo declarado tiene rutas, y cada ruta está en un grupo declarado', () => {
    const usados = new Set(operaciones().map(({ operacion }) => operacion.tags[0]))
    expect([...usados].sort()).toEqual(documento.tags.map((t) => t.name).sort())
  })

  it('todo lo que no es lectura declara la cabecera X-Riego', () => {
    for (const { ruta, metodo, operacion } of operaciones()) {
      const conCabecera = (operacion.security ?? []).some((requisito: Record<string, unknown>) => 'cabeceraRiego' in requisito)
      expect(conCabecera, `${metodo} ${ruta}`).toBe(metodo !== 'get')
    }
  })

  it('cada operación documentada existe en la API', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    // Retirar el consentimiento y cerrar la sesión van al final: las demás piden el recorrido abierto.
    const alFinal = (o: { ruta: string; metodo: Metodo }) => Number(o.ruta === '/api/consentimiento/retiro' || (o.ruta === '/api/sesion' && o.metodo === 'delete'))
    const EJEMPLO: Record<string, string> = { id: '00000000-0000-4000-8000-000000000000', itemId: '00000000-0000-4000-8000-000000000000', z: '1', x: '5', y: '5' }
    const sinRuta: string[] = []
    for (const { ruta, metodo } of operaciones().sort((a, b) => alFinal(a) - alFinal(b))) {
      const url = ruta.replace(/\{(\w+)\}/g, (_, nombre: string) => EJEMPLO[nombre]!)
      const respuesta = metodo === 'get' ? await agente.get(url) : await agente[metodo](url).send({})
      if (respuesta.body?.codigo === 'ruta_desconocida') sinRuta.push(`${metodo.toUpperCase()} ${ruta}`)
    }
    expect(sinRuta).toEqual([])
  })

  it('ninguna ruta del código queda sin documentar', () => {
    // Las rutas se declaran como rutas.get(…) o app.get(…); la documentación misma no es parte del contrato.
    const carpeta = join(import.meta.dirname, '..', 'src')
    const declaradas = readdirSync(carpeta, { recursive: true, encoding: 'utf8' })
      .filter((archivo) => archivo.endsWith('.ts') && !archivo.startsWith('generado') && !archivo.endsWith('documentacion.ts'))
      .flatMap((archivo) => [...readFileSync(join(carpeta, archivo), 'utf8').matchAll(/\b(?:rutas|app)\.(get|post|put|delete|patch)\(/g)].map((m) => m[1]))
    expect(operaciones().map((o) => o.metodo).sort()).toEqual(declaradas.sort())
  })
})
