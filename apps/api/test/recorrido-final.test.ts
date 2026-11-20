import { desproyectarLocal, type NormalDelMes } from '@riego/calculo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportarRegistro } from '../src/registro/exportacion.ts'
import type { ProveedorDeClima } from '../src/servicios/clima.ts'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import type { ProveedorDeSuelo } from '../src/servicios/suelo.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// Pasos 7 y 8 en el servidor (HU0026, HU0029, HU0030): la decisión sobre las alternativas, exportar e importar el
// proyecto y la prueba de salida. El servidor nunca cree lo que dice el navegador o el archivo: lo vuelve a calcular.

const ORIGEN = { lat: -10.68, lon: -76.25 }
const enMetros = (x: number, y: number) => desproyectarLocal(ORIGEN, { x, y })
const norteM = (p: { lat: number }) => (p.lat - ORIGEN.lat) * (Math.PI / 180) * 6_371_008.8
const plano: ProveedorDeElevacion = {
  cotas: async (puntos) => ({ cotas: puntos.map((p) => 3000 + 0.05 * norteM(p)), fuente: { nombre: 'Plano de prueba', resolucionM: 1, respaldo: false } }),
}
const NORMALES: NormalDelMes[] = Array.from({ length: 12 }, (_, i) => ({
  temperaturaMaximaC: 22,
  temperaturaMinimaC: 8,
  humedadRelativaMediaPct: 70,
  vientoA2mMs: 2,
  radiacionSolarMJm2Dia: 18,
  lluviaMm: [0, 1, 2, 11].includes(i) ? 100 : 10,
}))
const FUENTE_CLIMA = { nombre: 'Clima de prueba', resolucion: '1 km', respaldo: false }
const clima: ProveedorDeClima = { normales: async () => ({ meses: NORMALES, lluvia: FUENTE_CLIMA, atmosfera: FUENTE_CLIMA }) }
const suelo: ProveedorDeSuelo = {
  suelo: async () => ({ arenaPct: 40, limoPct: 40, arcillaPct: 20, ph: 6, fuente: { nombre: 'Suelo de prueba', resolucion: '250 m', respaldo: false } }),
}

const MODELO = {
  version: 'redes-de-prueba',
  metricas: { r2: 0.9 },
  conjunto: 'Redes de prueba',
  entrenadoEn: '2026-11-07T00:00:00+00:00',
  archivo: 'sustituto.onnx',
}

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba({ elevacion: plano, clima, suelo })
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

const cuadrado = [enMetros(0, 0), enMetros(100, 0), enMetros(100, 100), enMetros(0, 100)]

/** Un proyecto con la red guardada y, si se pide, ya probada en el paso 6. */
async function proyectoConRed(funcionando = true) {
  const estudiante = await estudianteHabilitado(prueba.app)
  const { agente } = estudiante
  const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Campaña de prueba' })).body
  await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
  await agente.put(`/api/proyectos/${id}/fuente`).send({ tipo: 'manantial', ...enMetros(50, 420), caudalLps: 4, conductividadDsM: 0.3, horasDisponiblesDia: 12, origenDato: 'campo' })
  await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
  await agente.put(`/api/proyectos/${id}/campania`).send({ cultivo: 'Papa', fechaSiembra: '2027-10-01' })
  await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
  await agente.put(`/api/proyectos/${id}/diseno-agronomico`).send({ metodo: 'goteo', emisor: 'gotero-2', separacionM: 0.3, separacionLateralesM: 0.9 })
  expect((await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })).status).toBe(200)
  if (funcionando) expect((await agente.put(`/api/proyectos/${id}/red/funcionamiento`).send({})).status).toBe(200)
  return { ...estudiante, id: id as string }
}

const CAMBIO_QUE_FUNCIONA = [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 110 }]
const CAMBIO_QUE_NO_FUNCIONA = [{ tipo: 'tramo', tramo: 'conduccion', diametroInternoMm: 13.6 }]

describe('la decisión del paso 7 (HU0026)', () => {
  it('sin un diseño que funcionó no se decide nada', async () => {
    const { agente, id } = await proyectoConRed(false)
    const r = await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('diseno_no_funciona')
  })

  it('quedarse con el diseño propio abre el paso 8 y no crea otra versión', async () => {
    const { agente, id } = await proyectoConRed()
    const { status, body } = await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(8)
    expect(await prueba.bd.red.count({ where: { proyectoId: id } })).toBe(1)
    expect(await prueba.bd.alternativaMl.count({ where: { proyectoId: id } })).toBe(0)
  })

  it('una alternativa queda como versión nueva, con las diferencias que calculó el servidor', async () => {
    const { agente, id } = await proyectoConRed()
    const { status, body } = await agente
      .put(`/api/proyectos/${id}/optimizacion`)
      .send({ decision: 'alternativa', criterio: 'costo', cambios: CAMBIO_QUE_FUNCIONA, modelo: MODELO })
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(8)
    expect(body.red).toMatchObject({ version: 2, origen: 'ml', funciono: true, cambios: CAMBIO_QUE_FUNCIONA })
    const fila = await prueba.bd.alternativaMl.findFirstOrThrow({ where: { proyectoId: id }, include: { redBase: true, redPropuesta: true, modeloMl: true } })
    expect(fila.verificadaPorModulo).toBe(true)
    expect(fila.aceptadaPorEstudiante).toBe(true)
    expect(fila.modeloMl).toMatchObject({ nombre: 'optimizacion', version: MODELO.version })
    const esperado = ((Number(fila.redPropuesta.costoTotal) - Number(fila.redBase.costoTotal)) / Number(fila.redBase.costoTotal)) * 100
    expect(fila.deltaCosto).toBeCloseTo(esperado, 3)
  })

  it('la alternativa que no pasa la verificación del servidor no se guarda, diga lo que diga el navegador', async () => {
    const { agente, id } = await proyectoConRed()
    const r = await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'alternativa', criterio: 'costo', cambios: CAMBIO_QUE_NO_FUNCIONA, modelo: MODELO })
    expect(r.status).toBe(409)
    expect(r.body.codigo).toBe('alternativa_no_cumple')
    expect(await prueba.bd.red.count({ where: { proyectoId: id } })).toBe(1)
    expect(await prueba.bd.alternativaMl.count({ where: { proyectoId: id } })).toBe(0)
  })
})

describe('volver atrás marca lo desactualizado hasta el paso 8 (HU0029)', () => {
  it('cambiar la red después de decidir deja vencidos los pasos siguientes, sin borrar nada', async () => {
    const { agente, id } = await proyectoConRed()
    await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    const { body } = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: CAMBIO_QUE_FUNCIONA })
    expect(body.pasoAlcanzado).toBe(8)
    expect(body.resultadosDesactualizados).toEqual(expect.arrayContaining([6, 7]))
    expect(await prueba.bd.red.count({ where: { proyectoId: id } })).toBe(2)
  })
})

describe('exportar e importar el proyecto (HU0028, HU0029)', () => {
  it('el archivo lleva las decisiones y nada que identifique a la persona', async () => {
    const { agente, id, datos } = await proyectoConRed()
    await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'alternativa', criterio: 'costo', cambios: CAMBIO_QUE_FUNCIONA, modelo: MODELO })
    const { status, body, text } = await agente.get(`/api/proyectos/${id}/exportacion`)
    expect(status).toBe(200)
    expect(body).toMatchObject({ formato: 'riego-proyecto', version: 1, pasoAlcanzado: 8 })
    expect(body.redes.map((r: { version: number }) => r.version)).toEqual([1, 2])
    expect(body.alternativas).toHaveLength(1)
    expect(text).not.toContain(datos.correo)
    const usuario = await prueba.bd.usuario.findUniqueOrThrow({ where: { correoInstitucional: datos.correo } })
    expect(text).not.toContain(usuario.id)
    expect(text).not.toContain(id)
  })

  it('exportar, importar y volver a exportar da las mismas decisiones', async () => {
    const dueno = await proyectoConRed()
    await dueno.agente.put(`/api/proyectos/${dueno.id}/optimizacion`).send({ decision: 'alternativa', criterio: 'costo', cambios: CAMBIO_QUE_FUNCIONA, modelo: MODELO })
    const original = (await dueno.agente.get(`/api/proyectos/${dueno.id}/exportacion`)).body

    const otro = await estudianteHabilitado(prueba.app)
    const importado = await otro.agente.post('/api/proyectos/importacion').send(original)
    expect(importado.status).toBe(201)
    expect(importado.body.id).not.toBe(dueno.id)
    expect(importado.body.pasoAlcanzado).toBe(8)
    expect(importado.body.red).toMatchObject({ version: 2, origen: 'ml', funciono: true })

    const denuevo = (await otro.agente.get(`/api/proyectos/${importado.body.id}/exportacion`)).body
    expect(denuevo).toEqual(original)

    const a = (await dueno.agente.get(`/api/proyectos/${dueno.id}`)).body
    const b = (await otro.agente.get(`/api/proyectos/${importado.body.id}`)).body
    expect(b.red.costoTotal).toBeCloseTo(a.red.costoTotal, 6)
    expect(b.red.uniformidadPct).toBeCloseTo(a.red.uniformidadPct, 6)
  })

  it('el archivo no manda sobre el cálculo: una red que no funciona no queda como que funcionó', async () => {
    const { agente, id } = await proyectoConRed()
    const archivo = (await agente.get(`/api/proyectos/${id}/exportacion`)).body
    archivo.redes = [{ version: 1, origen: 'estudiante', cambios: CAMBIO_QUE_NO_FUNCIONA, funciono: true }]
    archivo.pasoAlcanzado = 8
    const { status, body } = await agente.post('/api/proyectos/importacion').send(archivo)
    expect(status).toBe(201)
    expect(body.red.funciono).toBe(false)
    expect(body.pasoAlcanzado).toBeLessThanOrEqual(6)
  })

  it('un proyecto a medias se importa hasta donde llegó', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    const { id } = (await agente.post('/api/proyectos').send({ nombre: 'A medias' })).body
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    const archivo = (await agente.get(`/api/proyectos/${id}/exportacion`)).body
    const { status, body } = await agente.post('/api/proyectos/importacion').send(archivo)
    expect(status).toBe(201)
    expect(body.pasoAlcanzado).toBe(1)
  })

  it('lo que no es un proyecto exportado se rechaza sin dejar nada a medias', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    const antes = (await agente.get('/api/proyectos')).body.length
    const r = await agente.post('/api/proyectos/importacion').send({ hola: 'mundo' })
    expect(r.status).toBe(400)
    expect(r.body.codigo).toBe('archivo_invalido')
    expect((await agente.get('/api/proyectos')).body.length).toBe(antes)
  })

  it('no se exporta el proyecto de otra persona', async () => {
    const { id } = await proyectoConRed()
    const { agente } = await estudianteHabilitado(prueba.app)
    expect((await agente.get(`/api/proyectos/${id}/exportacion`)).status).toBe(404)
  })
})

describe('la prueba de salida (HU0030)', () => {
  it('se abre al terminar el recorrido, con la forma B, y no muestra ni clave ni puntaje', async () => {
    const { agente, id } = await proyectoConRed()
    const cerrada = await agente.post('/api/evaluaciones/salida')
    expect(cerrada.status).toBe(403)
    expect(cerrada.body.codigo).toBe('salida_no_habilitada')

    await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    const abierta = await agente.post('/api/evaluaciones/salida')
    expect(abierta.status).toBe(200)
    expect(JSON.stringify(abierta.body)).not.toContain('clave')
    const codigos = await prueba.bd.itemInstrumento.findMany({ where: { id: { in: abierta.body.items.map((i: { id: string }) => i.id) } }, select: { forma: true } })
    expect(codigos.every((i) => i.forma === 'B')).toBe(true)

    for (const item of abierta.body.items) await agente.put(`/api/evaluaciones/salida/respuestas/${item.id}`).send({ alternativa: 'a' })
    const fin = await agente.post('/api/evaluaciones/salida/fin')
    expect(fin.status).toBe(200)
    expect(JSON.stringify(fin.body)).not.toMatch(/clave|puntaje|correct/i)
  })

  it('un ítem de la forma A no se responde en la prueba de salida', async () => {
    const { agente, id } = await proyectoConRed()
    await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    await agente.post('/api/evaluaciones/salida')
    const deEntrada = await prueba.bd.itemInstrumento.findFirstOrThrow({ where: { forma: 'A' } })
    expect((await agente.put(`/api/evaluaciones/salida/respuestas/${deEntrada.id}`).send({ alternativa: 'a' })).status).toBe(404)
  })

  it('la exportación vincula entrada y salida con el mismo código, sin identificadores', async () => {
    const { agente, id, datos } = await proyectoConRed()
    await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    const { items } = (await agente.post('/api/evaluaciones/salida')).body
    for (const item of items) await agente.put(`/api/evaluaciones/salida/respuestas/${item.id}`).send({ alternativa: 'b' })
    await agente.post('/api/evaluaciones/salida/fin')

    const { respuestas } = await exportarRegistro(prueba.bd, 'secreto de seudonimización de más de treinta y dos caracteres')
    const [cabecera, ...filas] = respuestas.trim().split('\n')
    const columnas = cabecera!.split(',')
    const de = (fila: string, nombre: string) => fila.split(',')[columnas.indexOf(nombre)]
    const salidas = filas.filter((f) => de(f, 'prueba') === 'salida' && de(f, 'alternativa') === 'b')
    expect(salidas).toHaveLength(items.length)
    const codigo = de(salidas[0]!, 'participante')
    expect(filas.some((f) => de(f, 'prueba') === 'entrada' && de(f, 'participante') === codigo)).toBe(true)
    expect(respuestas).not.toContain(datos.correo)
  })

  it('el estado del recorrido dice cuándo se puede dar', async () => {
    const { agente, id } = await proyectoConRed()
    const sesion = async () => (await agente.get('/api/estado')).body
    expect(await sesion()).toMatchObject({ salidaHabilitada: false, pruebaDeSalida: 'pendiente' })
    await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })
    expect(await sesion()).toMatchObject({ salidaHabilitada: true, pruebaDeSalida: 'pendiente' })
  })
})
