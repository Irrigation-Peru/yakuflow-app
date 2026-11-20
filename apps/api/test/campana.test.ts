import { readFileSync } from 'node:fs'
import {
  balanceHidrico,
  CATALOGO_FAO56,
  climaDeLosDoceMeses,
  demandaDeDiseno,
  demandaDeLaCampana,
  desproyectarLocal,
  type NormalDelMes,
} from '@riego/calculo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProveedorDeClima } from '../src/servicios/clima.ts'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import type { ProveedorDeSuelo } from '../src/servicios/suelo.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// Pasos 2 a 4 en el servidor: los datos del lugar (HU0009), la campaña y las sugerencias del modelo (HU0011 y
// HU0012), la decisión sobre el agua (HU0013 y HU0014) y el diseño agronómico (HU0015). El servidor vuelve a
// calcular con el módulo antes de dejar avanzar al estudiante: no se fía del navegador.

const ORIGEN = { lat: -10.68, lon: -76.25 }
const enMetros = (x: number, y: number) => desproyectarLocal(ORIGEN, { x, y })
const norteM = (p: { lat: number }) => (p.lat - ORIGEN.lat) * (Math.PI / 180) * 6_371_008.8
const plano: ProveedorDeElevacion = {
  cotas: async (puntos) => ({
    cotas: puntos.map((p) => 3000 + 0.05 * norteM(p)),
    fuente: { nombre: 'Plano de prueba', resolucionM: 1, respaldo: false },
  }),
}

// Un valle templado: 18 °C de máxima y 6 de mínima todo el año, con lluvias de diciembre a marzo.
const NORMALES: NormalDelMes[] = Array.from({ length: 12 }, (_, i) => ({
  temperaturaMaximaC: 22,
  temperaturaMinimaC: 8,
  humedadRelativaMediaPct: 70,
  vientoA2mMs: 2,
  radiacionSolarMJm2Dia: 18,
  lluviaMm: [0, 1, 2, 11].includes(i) ? 100 : 10,
}))
const FUENTE_CLIMA = { nombre: 'Clima de prueba', resolucion: '1 km', respaldo: false }
let pedidosDeClima = 0
let climaCaido = false
const clima: ProveedorDeClima = {
  normales: async () => {
    pedidosDeClima++
    if (climaCaido) throw new Error('NASA POWER respondió 503')
    return { meses: NORMALES, lluvia: FUENTE_CLIMA, atmosfera: FUENTE_CLIMA }
  },
}
let pedidosDeSuelo = 0
const suelo: ProveedorDeSuelo = {
  suelo: async () => {
    pedidosDeSuelo++
    return { arenaPct: 40, limoPct: 40, arcillaPct: 20, ph: 6, fuente: { nombre: 'Suelo de prueba', resolucion: '250 m', respaldo: true } }
  },
}

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba({ elevacion: plano, clima, suelo })
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

const cuadrado = [enMetros(0, 0), enMetros(100, 0), enMetros(100, 100), enMetros(0, 100)]
// 420 m al norte: 21 m sobre el origen y 16 m sobre la esquina más alta de la parcela. Alcanza para goteo (15 m), no
// para aspersión (30 m); no se pone justo en 15 m porque el redondeo de la proyección lo deja unas milésimas abajo.
const fuente = (caudalLps = 4) => ({
  tipo: 'manantial',
  ...enMetros(50, 420),
  caudalLps,
  conductividadDsM: 0.3,
  horasDisponiblesDia: 12,
  origenDato: 'campo',
})

async function proyectoEnElPaso2(caudalLps?: number) {
  const { agente } = await estudianteHabilitado(prueba.app)
  const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Campaña de prueba' })).body
  await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: cuadrado })
  await agente.put(`/api/proyectos/${id}/fuente`).send(fuente(caudalLps))
  return { agente, id: id as string }
}

const campania = { cultivo: 'Papa', fechaSiembra: '2027-10-01' }

describe('datos del lugar (HU0009)', () => {
  it('sin parcela no hay lugar que consultar', async () => {
    const { agente } = await estudianteHabilitado(prueba.app)
    const { id } = (await agente.post('/api/proyectos').send({ nombre: 'Vacío' })).body
    const respuesta = await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    expect(respuesta.status).toBe(409)
    expect(respuesta.body.codigo).toBe('parcela_pendiente')
  })

  it('trae el clima con su ET0 y el suelo con su clase, con su origen; los guarda y no vuelve a consultarlos (criterio 1)', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    const [climaAntes, sueloAntes] = [pedidosDeClima, pedidosDeSuelo]
    const { status, body } = await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    expect(status).toBe(200)
    expect(body.clima.meses).toHaveLength(12)
    const parcela = await prueba.bd.parcela.findUniqueOrThrow({ where: { proyectoId: id } })
    const esperado = climaDeLosDoceMeses({ latitudGrados: parcela.centroideLat, altitudM: parcela.altitudMsnm!, meses: NORMALES })
    expect(body.clima.meses[0].et0MmDia).toBeCloseTo(esperado[0]!.et0MmDia, 9)
    expect(body.clima.meses[0]).toMatchObject({ mes: 1, lluviaMm: 100, temperaturaMaximaC: 22 })
    expect(body.clima.fuente).toMatch(/Clima de prueba/)
    expect(body.suelo.satelital).toMatchObject({ clase: 'franco', capacidadDeCampo: 0.25, puntoDeMarchitez: 0.12, infiltracionBasicaMmH: 15, ph: 6 })
    expect(body.suelo.satelital.fuente).toMatch(/Suelo de prueba/)
    expect(body.suelo.satelital.resolucion).toBe('250 m')
    expect(body.suelo.campo).toBeNull()
    expect(body.suelo.vigente).toBe('satelital')

    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    expect([pedidosDeClima, pedidosDeSuelo]).toEqual([climaAntes + 1, sueloAntes + 1])
  })

  it('si el clima no llega, lo dice y entrega el suelo igual', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    climaCaido = true
    try {
      const { status, body } = await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
      expect(status).toBe(200)
      expect(body.clima).toBeNull()
      expect(body.errores.clima).toMatch(/503/)
      expect(body.suelo.satelital.clase).toBe('franco')
    } finally {
      climaCaido = false
    }
  })

  it('la textura de la muestra de campo reemplaza a la satelital, que se conserva (criterio 2)', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    const { status, body } = await agente.put(`/api/proyectos/${id}/suelo`).send({ arenaPct: 30, arcillaPct: 35 })
    expect(status).toBe(200)
    expect(body.suelo.campo).toMatchObject({ clase: 'franco arcilloso', arenaPct: 30, limoPct: 35, arcillaPct: 35 })
    expect(body.suelo.campo.ph).toBe(6)
    expect(body.suelo.satelital.clase).toBe('franco')
    expect(body.suelo.vigente).toBe('campo')
    expect((await agente.put(`/api/proyectos/${id}/suelo`).send({ arenaPct: 80, arcillaPct: 30 })).status).toBe(400)
  })

  it('al mover la parcela, el clima y el suelo satelital se vuelven a consultar', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    const antes = pedidosDeClima
    const otra = cuadrado.map((p) => ({ lat: p.lat + 0.001, lon: p.lon }))
    await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno: otra })
    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    expect(pedidosDeClima).toBe(antes + 1)
  })
})

describe('campaña (HU0011 y HU0012)', () => {
  it('guarda el cultivo y la fecha de siembra, y el proyecto llega al paso 3', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    const { status, body } = await agente.put(`/api/proyectos/${id}/campania`).send(campania)
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(3)
    expect(body.campania).toMatchObject({ cultivo: 'Papa', fechaSiembra: '2027-10-01', duracionDias: 193 })
    expect(body.campania.areaSembradaHa).toBeCloseTo(1, 4)
  })

  it('solo admite cultivos del catálogo, y no antes de terminar el paso 1', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    expect((await agente.put(`/api/proyectos/${id}/campania`).send({ ...campania, cultivo: 'Café' })).status).toBe(400)
    const { agente: otro } = await estudianteHabilitado(prueba.app)
    const { id: vacio } = (await otro.post('/api/proyectos').send({ nombre: 'Sin lugar' })).body
    const respuesta = await otro.put(`/api/proyectos/${vacio}/campania`).send(campania)
    expect(respuesta.status).toBe(409)
    expect(respuesta.body.codigo).toBe('paso_pendiente')
  })

  it('guarda las tres sugerencias del modelo con su probabilidad y su condición más influyente', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    const sugerencia = (cultivo: string, orden: number, probabilidad: number) => ({
      cultivo,
      orden,
      probabilidad,
      condicionMasInfluyente: 'altitud',
      condiciones: { altitudM: 3002 },
      rangos: { altitudMaximaM: 4200 },
      explicacion: `La altitud pesa más para ${cultivo}`,
    })
    // Los metadatos del modelo que la aplicación publica, no unos inventados: la descripción de su conjunto pasa de 300
    // caracteres, y con el límite anterior la API rechazaba las recomendaciones y no quedaban en la bitácora.
    const publicado = JSON.parse(readFileSync(new URL('../../../packages/modelos/cultivos.json', import.meta.url), 'utf8'))
    const modelo = { version: 'prueba-1', metricas: publicado.metricas, conjunto: publicado.conjunto, entrenadoEn: publicado.entrenadoEn, archivo: publicado.archivo }
    expect(modelo.conjunto.length).toBeGreaterThan(300)
    const { status } = await agente.post(`/api/proyectos/${id}/recomendaciones`).send({
      modelo,
      sugerencias: [sugerencia('Papa', 1, 0.6), sugerencia('Haba, verde', 2, 0.25), sugerencia('Arveja, verde', 3, 0.1)],
    })
    expect(status).toBe(201)
    const guardadas = await prueba.bd.recomendacionCultivo.findMany({ where: { proyectoId: id }, include: { cultivo: true, modeloMl: true }, orderBy: { orden: 'asc' } })
    expect(guardadas.map((g) => [g.cultivo.nombre, g.probabilidad])).toEqual([['Papa', 0.6], ['Haba, verde', 0.25], ['Arveja, verde', 0.1]])
    expect(guardadas[0]!.variableMasInfluyente).toBe('altitud')
    expect(guardadas[0]!.modeloMl).toMatchObject({ nombre: 'cultivos', version: 'prueba-1' })
  })
})

describe('el agua (HU0013 y HU0014)', () => {
  it('si la fuente alcanza, el proyecto pasa al paso 4 sin ajuste', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    await agente.put(`/api/proyectos/${id}/campania`).send(campania)
    const { status, body } = await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(4)
    expect(body.balance.alcanza).toBe('si')
  })

  it('si no alcanza, no deja pasar sin un ajuste que funcione; con el reservorio que calcula el módulo, sí', async () => {
    const { agente, id } = await proyectoEnElPaso2(0.6)
    const { body: lugar } = await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    await agente.put(`/api/proyectos/${id}/campania`).send(campania)

    const sinAjuste = await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
    expect(sinAjuste.status).toBe(409)
    expect(sinAjuste.body.codigo).toBe('agua_no_alcanza')

    // El mismo cálculo que hacen el navegador y el servidor, con la capacidad de la fuente en la semana crítica.
    const papa = CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!
    const climaDelLugar = lugar.clima.meses.map((m: { et0MmDia: number; lluviaMm: number }) => ({ et0MmDia: m.et0MmDia, lluviaMm: m.lluviaMm }))
    const demanda = demandaDeLaCampana({ cultivo: papa, fechaSiembra: campania.fechaSiembra, clima: climaDelLugar })
    const parcela = await prueba.bd.parcela.findUniqueOrThrow({ where: { proyectoId: id } })
    const balance = balanceHidrico({
      semanas: demanda.semanas,
      areaHa: parcela.areaHa,
      eficiencia: 0.9,
      fuente: { tipo: 'manantial', caudalLps: 0.6, horasDisponiblesDia: 12 },
      demandaDeDisenoMmDia: demandaDeDiseno(demanda),
    })
    expect(balance.alcanza).toBe('parcial')
    const ajuste = balance.ajustes.reservorio.viable
      ? { tipo: 'reservorio', volumenM3: balance.ajustes.reservorio.volumenM3 }
      : { tipo: 'menos_area', areaHa: balance.ajustes.menosArea.areaHa }

    const conAjuste = await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste })
    expect(conAjuste.status).toBe(200)
    expect(conAjuste.body.pasoAlcanzado).toBe(4)
    const decision = await prueba.bd.decisionBalance.findFirstOrThrow({ where: { campania: { proyectoId: id } } })
    expect(decision.salida).toBe(ajuste.tipo)
  })

  it('cambiar de cultivo después marca el agua como desactualizada, sin retroceder', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    await agente.put(`/api/proyectos/${id}/campania`).send(campania)
    await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
    const { body } = await agente.put(`/api/proyectos/${id}/campania`).send({ ...campania, cultivo: 'Haba, verde' })
    expect(body.pasoAlcanzado).toBe(4)
    // El paso 3 ya tenía resultado; el 4 todavía no.
    expect(body.resultadosDesactualizados).toEqual([3])
    const { body: rehecho } = await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
    expect(rehecho.resultadosDesactualizados).toEqual([])
  })
})

describe('diseño agronómico (HU0015)', () => {
  async function proyectoEnElPaso4() {
    const p = await proyectoEnElPaso2()
    await p.agente.get(`/api/proyectos/${p.id}/datos-del-lugar`)
    await p.agente.put(`/api/proyectos/${p.id}/campania`).send(campania)
    await p.agente.put(`/api/proyectos/${p.id}/balance`).send({ ajuste: null })
    return p
  }

  it('guarda el método, el emisor y lo que calcula el módulo, y el proyecto llega al paso 5', async () => {
    const { agente, id } = await proyectoEnElPaso4()
    const { status, body } = await agente
      .put(`/api/proyectos/${id}/diseno-agronomico`)
      .send({ metodo: 'goteo', emisor: 'gotero-2', separacionM: 0.3, separacionLateralesM: 0.9 })
    expect(status).toBe(200)
    expect(body.pasoAlcanzado).toBe(5)
    const diseno = await prueba.bd.disenoAgronomico.findUniqueOrThrow({ where: { proyectoId: id }, include: { emisorCatalogo: true } })
    expect(diseno.metodo).toBe('goteo')
    expect(diseno.emisorCatalogo.codigo).toBe('gotero-2')
    expect(diseno.laminaBrutaMm).toBeCloseTo(diseno.laminaNetaMm / 0.9, 9)
    expect(diseno.intensidadMmH).toBeCloseTo(2 / (0.3 * 0.9), 9)
    expect(diseno.frecuenciaDias).toBeGreaterThanOrEqual(1)
  })

  it('rechaza un método que el lugar no permite: con 16 m no hay presión para aspersión', async () => {
    const { agente, id } = await proyectoEnElPaso4()
    const respuesta = await agente
      .put(`/api/proyectos/${id}/diseno-agronomico`)
      .send({ metodo: 'aspersion', emisor: 'aspersor-3.2', separacionM: 12, separacionLateralesM: 12 })
    expect(respuesta.status).toBe(409)
    expect(respuesta.body.codigo).toBe('metodo_no_viable')
  })

  it('rechaza un emisor de otro método', async () => {
    const { agente, id } = await proyectoEnElPaso4()
    const respuesta = await agente
      .put(`/api/proyectos/${id}/diseno-agronomico`)
      .send({ metodo: 'goteo', emisor: 'aspersor-3.2', separacionM: 0.3, separacionLateralesM: 0.9 })
    expect(respuesta.status).toBe(400)
  })
})

describe('vigencia de lo guardado con las reglas de hoy', () => {
  it('un proyecto al día no tiene avisos; si la fuente ya no da para la semana crítica sin lluvia, pide rehacer el paso 3', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
    await agente.put(`/api/proyectos/${id}/campania`).send(campania)
    expect((await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })).status).toBe(200)
    const alDia = await agente.get(`/api/proyectos/${id}/vigencia`)
    expect(alDia.status).toBe(200)
    expect(alDia.body.avisos).toEqual([])
    // Lo que pasa cuando las reglas cambian después de guardar: lo guardado deja de alcanzar.
    await prueba.bd.fuenteAgua.update({ where: { proyectoId: id }, data: { caudalLps: 0.001 } })
    const vencido = await agente.get(`/api/proyectos/${id}/vigencia`)
    expect(vencido.body.avisos).toHaveLength(1)
    expect(vencido.body.avisos[0]).toMatchObject({ paso: 3, codigo: expect.stringMatching(/^agua_no_alcanza/) })
  })

  it('antes del paso 3 no hay nada que revisar', async () => {
    const { agente, id } = await proyectoEnElPaso2()
    expect((await agente.get(`/api/proyectos/${id}/vigencia`)).body.avisos).toEqual([])
  })
})
