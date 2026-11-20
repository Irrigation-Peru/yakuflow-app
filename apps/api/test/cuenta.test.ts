import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDePrueba, CODIGO_CURSO, DOMINIO, estudianteRegistrado, navegador } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// HU0006: crear la cuenta, aceptar el consentimiento y responder la prueba de entrada.

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba()
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

async function conConsentimiento() {
  const registrado = await estudianteRegistrado(prueba.app)
  const { version } = (await registrado.agente.get('/api/consentimiento')).body
  await registrado.agente.post('/api/consentimiento').send({ version })
  return registrado
}

describe('creación de la cuenta (criterio 1)', () => {
  const datos = (cambios: Record<string, string> = {}) => ({
    correo: `ana@${DOMINIO}`,
    contrasena: 'una clave larga',
    nombres: 'Ana',
    codigoCurso: CODIGO_CURSO,
    ...cambios,
  })

  it('crea la cuenta con el correo institucional y la vincula con el código del curso', async () => {
    const respuesta = await navegador(prueba.app).post('/api/cuenta').send(datos())
    expect(respuesta.status).toBe(201)
    expect(respuesta.headers['set-cookie']?.[0]).toMatch(/^sesion=.+HttpOnly/)
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { correoInstitucional: `ana@${DOMINIO}` } })
    expect(usuario.codigoCurso).toBe(CODIGO_CURSO)
    expect(usuario.contrasenaHash).not.toContain('una clave larga')
  })

  it('rechaza un correo que no es de la universidad', async () => {
    const respuesta = await navegador(prueba.app).post('/api/cuenta').send(datos({ correo: 'ana@gmail.com' }))
    expect(respuesta.status).toBe(400)
    expect(respuesta.body.mensaje).toContain(DOMINIO)
  })

  it('rechaza un código de curso que no existe', async () => {
    const respuesta = await navegador(prueba.app)
      .post('/api/cuenta')
      .send(datos({ correo: `beto@${DOMINIO}`, codigoCurso: 'OTRO' }))
    expect(respuesta.status).toBe(400)
    expect(respuesta.body.codigo).toBe('curso_desconocido')
  })

  it('rechaza un correo que ya tiene cuenta, escrito con mayúsculas o no', async () => {
    const respuesta = await navegador(prueba.app).post('/api/cuenta').send(datos({ correo: `ANA@${DOMINIO.toUpperCase()}` }))
    expect(respuesta.status).toBe(409)
  })

  it('rechaza una contraseña de menos de diez caracteres', async () => {
    const respuesta = await navegador(prueba.app)
      .post('/api/cuenta')
      .send(datos({ correo: `ciro@${DOMINIO}`, contrasena: 'corta' }))
    expect(respuesta.status).toBe(400)
  })

  it('inicia sesión con la contraseña correcta y no con otra', async () => {
    const agente = navegador(prueba.app)
    const mala = await agente.post('/api/sesion').send({ correo: `ana@${DOMINIO}`, contrasena: 'otra clave larga' })
    expect(mala.status).toBe(401)
    const buena = await agente.post('/api/sesion').send({ correo: `ana@${DOMINIO}`, contrasena: 'una clave larga' })
    expect(buena.status).toBe(200)
    expect((await agente.get('/api/estado')).status).toBe(200)
    expect((await agente.delete('/api/sesion')).status).toBe(204)
    expect((await agente.get('/api/estado')).status).toBe(401)
  })

  it('responde igual si el correo no tiene cuenta, para no revelar quién está registrado', async () => {
    const respuesta = await navegador(prueba.app).post('/api/sesion').send({ correo: `nadie@${DOMINIO}`, contrasena: 'una clave larga' })
    expect(respuesta.status).toBe(401)
  })

  it('rechaza lo que no es lectura si no viene de la aplicación', async () => {
    const respuesta = await navegador(prueba.app)
      .post('/api/cuenta')
      .unset('X-Riego')
      .send(datos({ correo: `dora@${DOMINIO}` }))
    expect(respuesta.status).toBe(403)
  })
})

describe('recorrido bloqueado (criterio 2)', () => {
  it('mantiene el recorrido bloqueado hasta aceptar el consentimiento y terminar la prueba', async () => {
    const { agente } = await estudianteRegistrado(prueba.app)
    let estado = (await agente.get('/api/estado')).body
    expect(estado).toMatchObject({ consentimiento: false, pruebaDeEntrada: 'pendiente', recorridoHabilitado: false })
    let proyectos = await agente.get('/api/proyectos')
    expect(proyectos.status).toBe(403)
    expect(proyectos.body).toMatchObject({ codigo: 'recorrido_bloqueado', falta: ['consentimiento', 'prueba_de_entrada'] })

    // La prueba no se abre sin consentimiento.
    expect((await agente.post('/api/evaluaciones/entrada')).status).toBe(403)

    const { version } = (await agente.get('/api/consentimiento')).body
    expect((await agente.post('/api/consentimiento').send({ version: 'otra' })).status).toBe(409)
    expect((await agente.post('/api/consentimiento').send({ version })).status).toBe(201)
    proyectos = await agente.get('/api/proyectos')
    expect(proyectos.body.falta).toEqual(['prueba_de_entrada'])

    const { items } = (await agente.post('/api/evaluaciones/entrada')).body
    for (const item of items) {
      const respuesta = await agente.put(`/api/evaluaciones/entrada/respuestas/${item.id}`).send({ alternativa: 'a', segundos: 30 })
      expect(respuesta.status).toBe(204)
    }
    expect((await agente.post('/api/evaluaciones/entrada/fin')).status).toBe(200)

    estado = (await agente.get('/api/estado')).body
    expect(estado).toMatchObject({ consentimiento: true, pruebaDeEntrada: 'terminada', recorridoHabilitado: true })
    expect((await agente.get('/api/proyectos')).status).toBe(200)
  })

  it('vuelve a bloquear el recorrido si el estudiante retira su consentimiento', async () => {
    const { agente } = await conConsentimiento()
    expect((await agente.post('/api/consentimiento/retiro')).status).toBe(204)
    expect((await agente.get('/api/estado')).body.consentimiento).toBe(false)
  })

  it('muestra el texto del consentimiento antes de crear la cuenta, pero solo lo acepta con sesión', async () => {
    const anonimo = navegador(prueba.app)
    const texto = await anonimo.get('/api/consentimiento')
    expect(texto.status).toBe(200)
    expect(texto.body.texto).toContain('29733')
    expect((await anonimo.post('/api/consentimiento').send({ version: texto.body.version })).status).toBe(401)
  })

  it('identifica al estudiante con un código opaco, para separar lo pendiente de cada uno en un equipo compartido', async () => {
    const { agente } = await estudianteRegistrado(prueba.app)
    expect((await agente.get('/api/estado')).body.usuario.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('pide iniciar sesión a quien no la tiene', async () => {
    expect((await navegador(prueba.app).get('/api/proyectos')).status).toBe(401)
  })
})

describe('prueba sin respuestas (criterio 3)', () => {
  it('entrega los ítems de la forma A sin la clave', async () => {
    const { agente } = await conConsentimiento()
    const respuesta = await agente.post('/api/evaluaciones/entrada')
    expect(respuesta.status).toBe(200)
    expect(respuesta.body.items.map((i: { enunciado: string }) => i.enunciado)).toEqual(['¿A1?', '¿A2?'])
    expect(JSON.stringify(respuesta.body)).not.toMatch(/clave|correct|puntaje/i)
  })

  it('no deja terminar con ítems sin responder', async () => {
    const { agente } = await conConsentimiento()
    const { items } = (await agente.post('/api/evaluaciones/entrada')).body
    await agente.put(`/api/evaluaciones/entrada/respuestas/${items[0].id}`).send({ alternativa: 'b' })
    const fin = await agente.post('/api/evaluaciones/entrada/fin')
    expect(fin.status).toBe(400)
    expect(fin.body.codigo).toBe('prueba_incompleta')
  })

  it('guarda las respuestas al terminar sin decir cuáles eran correctas', async () => {
    const { agente, datos } = await conConsentimiento()
    const { items } = (await agente.post('/api/evaluaciones/entrada')).body
    await agente.put(`/api/evaluaciones/entrada/respuestas/${items[0].id}`).send({ alternativa: 'a' })
    await agente.put(`/api/evaluaciones/entrada/respuestas/${items[1].id}`).send({ alternativa: 'c' })
    const fin = await agente.post('/api/evaluaciones/entrada/fin')
    expect(fin.status).toBe(200)
    expect(JSON.stringify(fin.body)).not.toMatch(/clave|correct|puntaje/i)
    expect(JSON.stringify((await agente.get('/api/estado')).body)).not.toMatch(/clave|correct|puntaje/i)

    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { correoInstitucional: datos.correo } })
    const evaluacion = await prueba.bd.evaluacion.findFirstOrThrow({ where: { usuarioId: usuario.id }, include: { respuestas: true } })
    expect(evaluacion.puntaje).toBe(0.5)
    expect(evaluacion.respuestas.map((r) => r.esCorrecta).sort()).toEqual([false, true])

    // Terminada, ya no se cambia.
    const otra = await agente.put(`/api/evaluaciones/entrada/respuestas/${items[1].id}`).send({ alternativa: 'b' })
    expect(otra.status).toBe(409)
  })

  it('rechaza una alternativa que el ítem no tiene', async () => {
    const { agente } = await conConsentimiento()
    const { items } = (await agente.post('/api/evaluaciones/entrada')).body
    expect((await agente.put(`/api/evaluaciones/entrada/respuestas/${items[0].id}`).send({ alternativa: 'z' })).status).toBe(400)
  })

  it('rechaza responder un ítem de la otra forma', async () => {
    const { agente } = await conConsentimiento()
    await agente.post('/api/evaluaciones/entrada')
    const deLaB = await prueba.bd.itemInstrumento.findUniqueOrThrow({ where: { codigo: 'B1' } })
    expect((await agente.put(`/api/evaluaciones/entrada/respuestas/${deLaB.id}`).send({ alternativa: 'a' })).status).toBe(404)
  })
})
