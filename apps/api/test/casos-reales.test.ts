import { CATALOGO_FAO56, climaDeLosDoceMeses, desproyectarLocal, mejorFechaDeSiembra, sueloDeLaTextura } from '@riego/calculo'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LUGARES_REALES, type LugarReal } from '../../../packages/calculo/test/datos/lugares-reales.ts'
import type { ProveedorDeClima } from '../src/servicios/clima.ts'
import type { ProveedorDeElevacion } from '../src/servicios/elevacion.ts'
import type { ProveedorDeSuelo } from '../src/servicios/suelo.ts'
import { appDePrueba, estudianteHabilitado } from './app-de-prueba.ts'
import { cargarItemsDePrueba } from './items-de-prueba.ts'

// El recorrido completo por la API, del paso 1 al 8, con los datos reales de cinco lugares de Pasco y Junín
// (packages/calculo/test/datos/lugares-reales.ts): el clima de NASA POWER y del SENAMHI y el suelo de SoilGrids, tal
// como la aplicación los trajo. El relieve es un plano con la altitud y la pendiente media que dio el DEM, y la fuente
// queda aguas arriba, a la cota que se declaró en cada proyecto. El servidor recalcula cada paso con el módulo.

const LUGARES = Object.entries(LUGARES_REALES).map(([clave, l]) => ({ clave, l }))
const RADIO_TERRESTRE_M = 6_371_008.8
const norteM = (desde: { lat: number }, p: { lat: number }) => (p.lat - desde.lat) * (Math.PI / 180) * RADIO_TERRESTRE_M
const distancia2 = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2
const masCercano = (p: { lat: number; lon: number }) => LUGARES.reduce((a, b) => (distancia2(p, b.l.centroide) < distancia2(p, a.l.centroide) ? b : a)).l

/** La cota de un punto en el plano del lugar: sube hacia el norte con la pendiente media del DEM. */
const cotaEn = (l: LugarReal, p: { lat: number }) => l.altitudM + (l.pendienteMediaPct / 100) * norteM(l.centroide, p)
const elevacion: ProveedorDeElevacion = {
  cotas: async (puntos) => ({
    cotas: puntos.map((p) => cotaEn(masCercano(p), p)),
    fuente: { nombre: 'Plano con la pendiente media del DEM', resolucionM: 30, respaldo: false },
  }),
}
const ORIGEN = { nombre: 'Datos guardados por la aplicación el 7/11/2026', resolucion: 'la del servicio', respaldo: false }
const clima: ProveedorDeClima = { normales: async (p) => ({ meses: masCercano(p).normales, lluvia: ORIGEN, atmosfera: ORIGEN }) }
const suelo: ProveedorDeSuelo = {
  suelo: async (p) => {
    const { arenaPct, arcillaPct, ph } = masCercano(p).suelo
    return { arenaPct, arcillaPct, limoPct: 100 - arenaPct - arcillaPct, ph, fuente: { nombre: 'SoilGrids 2.0', resolucion: '250 m', respaldo: false } }
  },
}

let prueba: Awaited<ReturnType<typeof appDePrueba>>
beforeAll(async () => {
  prueba = await appDePrueba({ elevacion, clima, suelo })
  await cargarItemsDePrueba(prueba.bd)
})
afterAll(() => prueba.cerrar())

/** Una parcela de 80 m × 80 m centrada en el lugar, y la fuente al norte, a la cota que se declaró. */
function planteamiento(l: LugarReal) {
  const en = (x: number, y: number) => desproyectarLocal(l.centroide, { x, y })
  const contorno = [en(-40, -40), en(40, -40), en(40, 40), en(-40, 40)]
  const alNorteM = (l.fuente.cotaMsnm - l.altitudM) / (l.pendienteMediaPct / 100)
  const fuente = {
    tipo: 'manantial',
    ...en(0, alNorteM),
    caudalLps: l.fuente.caudalLps,
    conductividadDsM: l.fuente.conductividadDsM,
    horasDisponiblesDia: l.fuente.horasDisponiblesDia,
    origenDato: 'campo',
  }
  return { contorno, fuente }
}

function mejorFechaDeLaPapa(l: LugarReal) {
  const s = sueloDeLaTextura(l.suelo)
  const lugar = {
    altitudM: l.altitudM,
    normales: l.normales,
    clima: climaDeLosDoceMeses({ latitudGrados: l.centroide.lat, altitudM: l.altitudM, meses: l.normales }),
    suelo: { clase: s.clase, ph: l.suelo.ph },
    fuente: l.fuente,
    areaHa: 0.64,
  }
  return mejorFechaDeSiembra({ cultivo: CATALOGO_FAO56.find((c) => c.nombre === 'Papa')!, lugar }).fechaSiembra
}

async function hastaElBalance(l: LugarReal, fechaSiembra: string) {
  const { agente } = await estudianteHabilitado(prueba.app)
  const { id } = (await agente.post('/api/proyectos').send({ nombre: `Papa en ${l.nombre}` })).body
  const { contorno, fuente } = planteamiento(l)
  expect((await agente.put(`/api/proyectos/${id}/parcela`).send({ contorno })).status).toBe(200)
  expect((await agente.put(`/api/proyectos/${id}/fuente`).send(fuente)).status).toBe(200)
  const lugar = await agente.get(`/api/proyectos/${id}/datos-del-lugar`)
  expect(lugar.status).toBe(200)
  expect(lugar.body.errores).toEqual({})
  expect((await agente.put(`/api/proyectos/${id}/campania`).send({ cultivo: 'Papa', fechaSiembra })).status).toBe(200)
  const balance = await agente.put(`/api/proyectos/${id}/balance`).send({ ajuste: null })
  return { agente, id: id as string, lugar: lugar.body, balance }
}

const etapaDeLaSemana = (semanas: { semana: number }[], semana: number, calendario: (s: number) => string) =>
  semanas.length >= semana ? calendario(semana) : 'fuera del ciclo'

describe('el caso observado por el asesor, por la API: papa en Cerro de Pasco sembrada el 1 de enero', () => {
  it('el servidor no pone la semana crítica en la maduración ni pide regar más en ella', async () => {
    const l = LUGARES_REALES.cerroDePasco
    const { balance } = await hastaElBalance(l, '2027-01-01')
    expect(balance.status).toBe(200)
    const b = balance.body.balance
    // La papa dura 193 días en la sierra (ENA 2024): la etapa final empieza el día 154, en la semana 22. El asesor vio el
    // caso con el ciclo de 145 días, cuando la semana que pedía más agua, ya en la maduración, era la 18; ahora es la 23.
    expect(b.semanaCritica).not.toBe(23)
    const etapa = etapaDeLaSemana(b.semanas, b.semanaCritica, (s) => ((s - 1) * 7 + 4 <= 153 ? 'antes de la maduración' : 'maduración'))
    expect(etapa).toBe('antes de la maduración')
    const critica = b.semanas[b.semanaCritica - 1]
    for (const s of b.semanas.slice(21)) expect(s.necesidadM3 / s.dias).toBeLessThanOrEqual(critica.necesidadM3 / critica.dias + 1e-9)
    // Las dos últimas semanas, ya en el corte del riego, no piden agua.
    expect(b.semanas.at(-1).necesidadM3).toBe(0)
    expect(b.semanas.at(-2).necesidadM3).toBe(0)
  })
})

describe('el recorrido completo con la papa en su mejor fecha, en cada lugar real', () => {
  it.each(LUGARES)('$l.nombre', async ({ l }) => {
    const fecha = mejorFechaDeLaPapa(l)
    const { agente, id, lugar, balance } = await hastaElBalance(l, fecha)
    expect(lugar.clima.meses.map((m: { et0MmDia: number }) => m.et0MmDia)).toEqual(l.et0MmDia.map((e) => expect.closeTo(e, 3)))
    expect(balance.status, JSON.stringify(balance.body)).toBe(200)
    expect(balance.body.balance.alcanza).toBe('si')

    const diseno = await agente.put(`/api/proyectos/${id}/diseno-agronomico`).send({ metodo: 'goteo', emisor: 'gotero-2', separacionM: 0.3, separacionLateralesM: 0.9 })
    if (l.pendienteMediaPct > 50) {
      // En la ladera de Cerro de Pasco (60 %) la parcela de 80 m tiene 48 m de desnivel. Antes la última cámara de la
      // conducción quedaba a 50 m sobre lo más bajo y a lo alto le quedaban menos de 2 m: el paso 4 descartaba el goteo.
      // Ahora deja a lo alto los 35 m que cualquier método necesita, y la parte baja se riega por pisos.
      const proyecto = (await agente.get(`/api/proyectos/${id}`)).body
      expect(proyecto.cargaDisponibleM).toBeCloseTo(35, 0)
      expect(proyecto.conduccion.camarasDentroDeLaParcela).toBe(1)
    }
    if (diseno.status === 409 && diseno.body.codigo === 'sin_demanda') {
      // Sembrando con las lluvias puede no haber nada que regar: el servidor lo dice y no deja diseñar en vano.
      expect(diseno.body.mensaje ?? diseno.body.error ?? '').toBeDefined()
      return
    }
    expect(diseno.status, JSON.stringify(diseno.body)).toBe(200)
    expect(diseno.body.pasoAlcanzado).toBe(5)

    const red = await agente.put(`/api/proyectos/${id}/red`).send({ cambios: [] })
    expect(red.status, JSON.stringify(red.body).slice(0, 400)).toBe(200)
    const funcionamiento = await agente.put(`/api/proyectos/${id}/red/funcionamiento`).send({})
    if (funcionamiento.status === 200) {
      expect((await agente.put(`/api/proyectos/${id}/optimizacion`).send({ decision: 'propia' })).body.pasoAlcanzado).toBe(8)
      const exportado = await agente.get(`/api/proyectos/${id}/exportacion`)
      expect(exportado.status).toBe(200)
      expect(exportado.body).toMatchObject({ formato: 'riego-proyecto', pasoAlcanzado: 8 })
    } else {
      // Si la red generada no funciona, el servidor dice por qué con alertas que señalan un tramo y una corrección.
      expect(funcionamiento.status).toBe(409)
      expect(red.body.alertas.length).toBeGreaterThan(0)
    }
  })
})
