import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDePrueba, CODIGO_CURSO, configuracionDePrueba, DOMINIO, navegador } from './app-de-prueba.ts'

// La web en Render y la API en Railway son sitios distintos: para el navegador, la cookie de sesión es de otro sitio.
// Safari la descarta si no pide partición (CHIPS, desde Safari 26.2): el inicio de sesión respondía bien, la cookie no
// se guardaba y la aplicación volvía a mostrar el formulario, como si recargara. Con la partición, la cookie queda
// guardada para el sitio de la web y vuelve en cada llamada que la web hace a la API.

const cuenta = (correo: string) => ({ correo, contrasena: 'una clave larga', nombres: 'Cora', codigoCurso: CODIGO_CURSO })
/** Las cabeceras Set-Cookie de una respuesta: supertest las tipa como texto, pero llegan como lista. */
const cookiesDe = (respuesta: { headers: Record<string, unknown> }) => [respuesta.headers['set-cookie'] ?? []].flat() as string[]

describe('la cookie de sesión con la web y la API en sitios distintos', () => {
  let prueba: Awaited<ReturnType<typeof appDePrueba>>
  beforeAll(async () => {
    prueba = await appDePrueba({ config: configuracionDePrueba({ cookieEntreSitios: true }) })
  })
  afterAll(() => prueba.cerrar())

  it('se abre particionada, con SameSite=None y Secure', async () => {
    const respuesta = await navegador(prueba.app).post('/api/cuenta').send(cuenta(`cora@${DOMINIO}`))
    expect(respuesta.status).toBe(201)
    const cookie = cookiesDe(respuesta)[0] ?? ''
    expect(cookie).toMatch(/^sesion=[^;]+;/)
    expect(cookie).toContain('; HttpOnly')
    expect(cookie).toContain('; Secure')
    expect(cookie).toContain('; SameSite=None')
    expect(cookie).toContain('; Partitioned')
  })

  it('al cerrar la sesión borra la cookie particionada y también la de antes, que no lo estaba', async () => {
    // Quien inició sesión antes de este cambio tiene la cookie sin partición, y vale hasta ocho horas: si solo se
    // borrara la particionada, seguiría con la sesión abierta después de salir.
    const respuesta = await navegador(prueba.app).delete('/api/sesion')
    expect(respuesta.status).toBe(204)
    const cookies = cookiesDe(respuesta)
    expect(cookies).toHaveLength(2)
    for (const c of cookies) expect(c).toMatch(/^sesion=; .*Expires=Thu, 01 Jan 1970 00:00:00 GMT/)
    expect(cookies.filter((c) => c.includes('; Partitioned'))).toHaveLength(1)
  })
})

describe('la cookie de sesión con la web y la API en el mismo sitio', () => {
  let prueba: Awaited<ReturnType<typeof appDePrueba>>
  beforeAll(async () => {
    prueba = await appDePrueba()
  })
  afterAll(() => prueba.cerrar())

  it('es SameSite=Lax y sin partición: para el navegador es del propio sitio', async () => {
    const respuesta = await navegador(prueba.app).post('/api/cuenta').send(cuenta(`dora@${DOMINIO}`))
    expect(respuesta.status).toBe(201)
    const cookie = cookiesDe(respuesta)[0] ?? ''
    expect(cookie).toContain('; SameSite=Lax')
    expect(cookie).not.toContain('Partitioned')
  })

  it('al cerrar la sesión manda una sola cookie vencida', async () => {
    const respuesta = await navegador(prueba.app).delete('/api/sesion')
    expect(cookiesDe(respuesta)).toHaveLength(1)
  })
})
