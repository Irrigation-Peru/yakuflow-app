import { desproyectarLocal } from '@riego/calculo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// HU0005: marcar la parcela y la fuente de agua en el mapa e ingresar el caudal y la calidad del agua medidos.

// Un terreno de prueba: un plano que sube 5 m cada 100 m hacia el norte, desde 3000 m en el origen.
const ORIGEN = { lat: -10.68, lon: -76.25 }
const enMetros = (x: number, y: number) => desproyectarLocal(ORIGEN, { x, y })
const norteM = (p: { lat: number }) => (p.lat - ORIGEN.lat) * (Math.PI / 180) * 6_371_008.8
let pedidosDeCotas = 0
const plano: ProveedorDeElevacion = {
  cotas: async (puntos) => {
    pedidosDeCotas++
    return { cotas: puntos.map((p) => 3000 + 0.05 * norteM(p)), fuente: { nombre: 'Plano de prueba', resolucionM: 1, respaldo: false } }
  },
}

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba({ elevacion: plano })
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

const cuadrado = [enMetros(0, 0), enMetros(100, 0), enMetros(100, 100), enMetros(0, 100)]
const fuente = {
  tipo: 'manantial',
  ...enMetros(50, 400),
  caudalLps: 4,
  conductividadDsM: 0.6,
  horasDisponiblesDia: 12,
  origenDato: 'campo',
}

async function proyectoNuevo() {
  const { agente } = await estudianteHabilitado(prueba.app)
  const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Parcela de prueba' })).body
  return { agente, id: id as string }
}

describe('contorno de la parcela (criterio 1)', () => {
  it('al cerrar el contorno devuelve el área, la pendiente media y el perfil del terreno', async () => {
    const { agente, id } = await proyectoNuevo()
    const respuesta = await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    expect(respuesta.status).toBe(200)
    const { parcela, elevacion } = respuesta.body
    expect(parcela.areaHa).toBeCloseTo(1, 4)
    expect(parcela.pendienteMediaPct).toBeCloseTo(5, 6)
    expect(parcela.altitudMsnm).toBeGreaterThan(3000)
    expect(parcela.altitudMsnm).toBeLessThan(3005)
    expect(parcela.perfil).toHaveLength(21)
    expect(parcela.perfil[20].distanciaM).toBeCloseTo(Math.SQRT2 * 100, 3)
    expect(elevacion).toEqual({ nombre: 'Plano de prueba', resolucionM: 1, respaldo: false })
  })

  it('guarda la parcela con el área que calcula el servidor', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    const parcela = await prueba.bd.parcela.findUniqueOrThrow({ where: { proyectoId: id } })
    expect(parcela.areaHa).toBeCloseTo(1, 4)
    expect(parcela.pendienteMediaPct).toBeCloseTo(5, 6)
    expect(parcela.poligono).toMatchObject({ type: 'Polygon' })
  })

  it('rechaza un contorno de menos de tres vértices o con los vértices alineados', async () => {
    const { agente, id } = await proyectoNuevo()
    expect((await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado.slice(0, 2) })).status).toBe(400)
    const alineados = [enMetros(0, 0), enMetros(50, 0), enMetros(100, 0)]
    const respuesta = await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: alineados })
    expect(respuesta.status).toBe(400)
    expect(respuesta.body.codigo).toBe('contorno_sin_area')
  })
})

describe('desnivel disponible (criterio 2)', () => {
  it('al ubicar la fuente con la parcela dibujada, devuelve el desnivel entre las dos', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    const respuesta = await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)
    expect(respuesta.status).toBe(200)
    // La fuente está 400 m al norte (3020 m); la parcela va de 3000 a 3005 m.
    expect(respuesta.body.fuente.cotaMsnm).toBeCloseTo(3020, 6)
    expect(respuesta.body.desnivel.disponibleM).toBeCloseTo(15, 6)
    expect(respuesta.body.desnivel.maximoM).toBeCloseTo(20, 6)
  })

  it('sin parcela, guarda la fuente y deja el desnivel para después', async () => {
    const { agente, id } = await proyectoNuevo()
    const respuesta = await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)
    expect(respuesta.status).toBe(200)
    expect(respuesta.body.desnivel).toBeNull()
    const conParcela = await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    expect(conParcela.body.desnivel.disponibleM).toBeCloseTo(15, 6)
  })
})

describe('datos del agua (criterio 3)', () => {
  it('guarda el caudal y la calidad medidos junto con la parcela, y el agua que la fuente entrega', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)
    const guardada = await prueba.bd.fuenteAgua.findUniqueOrThrow({ where: { proyectoId: id } })
    expect(guardada).toMatchObject({ tipo: 'manantial', caudalLps: 4, conductividadDsM: 0.6, horasDisponiblesDia: 12, origenDato: 'campo' })

    const lugar = (await agente.get(`/api/proyectos/${id}`)).body
    expect(lugar.fuente.aguaDisponible.m3PorDia).toBeCloseTo(4 * 3.6 * 12, 9)
    expect(lugar.parcela.areaHa).toBeCloseTo(1, 4)
    expect(lugar.desnivel.disponibleM).toBeCloseTo(15, 6)
  })

  it('rechaza un caudal que no es positivo y unas horas fuera del día', async () => {
    const { agente, id } = await proyectoNuevo()
    expect((await agente.put(`/api/proyectos/${id}/fuente`).send({ ...fuente, caudalLps: 0 })).status).toBe(400)
    expect((await agente.put(`/api/proyectos/${id}/fuente`).send({ ...fuente, horasDisponiblesDia: 25 })).status).toBe(400)
  })
})

describe('paso alcanzado', () => {
  it('con la parcela y la fuente guardadas, en cualquier orden, el proyecto llega al paso 2', async () => {
    const primero = await proyectoNuevo()
    expect((await primero.agente.put(`/api/proyectos/${primero.id}/parcela`).send({ contorno: cuadrado })).body.pasoAlcanzado).toBe(1)
    expect((await primero.agente.put(`/api/proyectos/${primero.id}/fuente`).send(fuente)).body.pasoAlcanzado).toBe(2)

    const alReves = await proyectoNuevo()
    expect((await alReves.agente.put(`/api/proyectos/${alReves.id}/fuente`).send(fuente)).body.pasoAlcanzado).toBe(1)
    expect((await alReves.agente.put(`/api/proyectos/${alReves.id}/parcela`).send({ contorno: cuadrado })).body.pasoAlcanzado).toBe(2)
    const lista = (await alReves.agente.get('/api/proyectos')).body as { id: string; pasoAlcanzado: number }[]
    expect(lista.find((p) => p.id === alReves.id)?.pasoAlcanzado).toBe(2)
  })

  it('con la fuente por debajo de la parcela no llega: sin bombeo, el agua no sube', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    // 400 m al sur: 2980 m, por debajo de toda la parcela.
    const respuesta = await agente.put(`/api/proyectos/${id}/fuente`).send({ ...fuente, ...enMetros(50, -400) })
    expect(respuesta.body.desnivel.disponibleM).toBeLessThan(0)
    expect(respuesta.body.pasoAlcanzado).toBe(1)
  })

  it('volver al paso 1 y guardar de nuevo no hace retroceder el proyecto', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    await prueba.bd.proyecto.update({ where: { id }, data: { pasoAlcanzado: 4 } })
    expect((await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)).body.pasoAlcanzado).toBe(4)
  })
})

describe('cámaras rompe-presión en la conducción', () => {
  it('con la fuente lejos y alta, las pone donde el terreno baja a cada nivel, en el mismo pedido de cotas', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    pedidosDeCotas = 0
    // 3 km al norte: 3150 m. La parcela va de 3000 a 3005 m, así que la última cámara deja el agua a 3050 m: el metro de
    // margen por la precisión del relieve costaría una tercera cámara, a un metro de la fuente, y no se toma.
    const respuesta = await agente.put(`/api/proyectos/${id}/fuente`).send({ ...fuente, ...enMetros(50, 3000) })
    expect(respuesta.status).toBe(200)
    expect(pedidosDeCotas).toBe(1)
    const { conduccion } = respuesta.body
    expect(conduccion.nivelFinalM).toBeCloseTo(3050, 6)
    expect(conduccion.camaras.map((c: { cota: number }) => c.cota)).toEqual([3100, 3050])
    // La conducción va en línea recta al centro de la parcela (50 m al norte): las cámaras quedan a 2000 y 1000 m.
    expect(norteM(conduccion.camaras[0])).toBeCloseTo(2000, 0)
    expect(norteM(conduccion.camaras[1])).toBeCloseTo(1000, 0)
    expect(conduccion.camaras[0].distanciaM).toBeCloseTo(1000, 0)
    expect(conduccion.perfil[0].cota).toBeCloseTo(3150, 6)
    expect(conduccion.perfil.at(-1).distanciaM).toBeCloseTo(2950, 0)
    expect(conduccion.camarasDentroDeLaParcela).toBe(0)
    expect(conduccion.sobreElNivel).toBeNull()
  })

  it('con la fuente cerca no hace falta ninguna, y sin fuente no hay conducción', async () => {
    const { agente, id } = await proyectoNuevo()
    const sinFuente = await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    expect(sinFuente.body.conduccion).toBeNull()
    const conFuente = await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)
    expect(conFuente.body.conduccion.camaras).toEqual([])
  })
})

describe('relieve alrededor de la parcela, para ubicar la fuente', () => {
  it('sin parcela no hay alrededor que mostrar', async () => {
    const { agente, id } = await proyectoNuevo()
    const respuesta = await agente.get(`/api/proyectos/${id}/relieve`)
    expect(respuesta.status).toBe(409)
    expect(respuesta.body.codigo).toBe('parcela_pendiente')
  })

  it('devuelve las cotas alrededor y los puntos más alto y más bajo de la parcela, de un solo pedido', async () => {
    const { agente, id } = await proyectoNuevo()
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
    pedidosDeCotas = 0
    const respuesta = await agente.get(`/api/proyectos/${id}/relieve`)
    expect(respuesta.status).toBe(200)
    expect(pedidosDeCotas).toBe(1)

    const { grilla, parcela, elevacion } = respuesta.body
    expect(grilla.cotas).toHaveLength(grilla.filas * grilla.columnas)
    // Un kilómetro de margen: el borde norte queda más de 1100 m al norte del origen.
    const norte = { lat: grilla.latSur + (grilla.filas - 1) * grilla.pasoGrados }
    expect(norteM(norte)).toBeGreaterThan(1100)
    // Las cotas son las del terreno en cada nodo: la primera fila es la del sur.
    expect(grilla.cotas[0]).toBeCloseTo(3000 + 0.05 * norteM({ lat: grilla.latSur }), 6)
    // La parcela va de 3000 m (borde sur) a 3005 m (borde norte).
    expect(parcela.masAlto.cota).toBeCloseTo(3005, 6)
    expect(parcela.masBajo.cota).toBeCloseTo(3000, 6)
    expect(norteM(parcela.masAlto)).toBeCloseTo(100, 3)
    expect(elevacion.nombre).toBe('Plano de prueba')
  })
})

describe('eliminar un proyecto', () => {
  it('sale de la lista y ya no se abre, pero sigue en la base con su registro de actividad', async () => {
    const { agente, id } = await proyectoNuevo()
    expect((await agente.delete(`/api/proyectos/${id}`)).status).toBe(204)
    const lista = (await agente.get('/api/proyectos')).body as { id: string }[]
    expect(lista.some((p) => p.id === id)).toBe(false)
    expect((await agente.get(`/api/proyectos/${id}`)).status).toBe(404)
    expect((await agente.delete(`/api/proyectos/${id}`)).status).toBe(404)
    const fila = await prueba.bd.proyecto.findUnique({ where: { id } })
    expect(fila?.estado).toBe('eliminado')
  })

  it('no deja eliminar el proyecto de otro estudiante', async () => {
    const { agente: duena, id } = await proyectoNuevo()
    const { agente } = await estudianteHabilitado(prueba.app)
    expect((await agente.delete(`/api/proyectos/${id}`)).status).toBe(404)
    expect((await duena.get(`/api/proyectos/${id}`)).status).toBe(200)
  })
})

describe('proyectos ajenos', () => {
  it('no deja ver ni cambiar el proyecto de otro estudiante', async () => {
    const { id } = await proyectoNuevo()
    const { agente } = await estudianteHabilitado(prueba.app)
    expect((await agente.get(`/api/proyectos/${id}`)).status).toBe(404)
    expect((await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })).status).toBe(404)
    expect((await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)).status).toBe(404)
    expect((await agente.get(`/api/proyectos/${id}/relieve`)).status).toBe(404)
  })
})
