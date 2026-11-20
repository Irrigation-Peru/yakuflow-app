import {
  climaDeLosDoceMeses,
  sueloDeLaTextura,
  type ClaseTextural,
  type LugarDelCultivo,
  type NormalDelMes,
} from '@riego/calculo'
import type { Bd } from './bd.ts'
import { ErrorDeApi } from './errores.ts'
import type { Parcela, Suelo } from './generado/prisma/client.ts'
import type { ProyectoPropio } from './proyecto.ts'
import type { ProveedorDeClima } from './servicios/clima.ts'
import type { ProveedorDeSuelo } from './servicios/suelo.ts'

// Los datos del lugar (HU0009): el clima de los doce meses y el suelo. La primera vez se consultan por las
// coordenadas de la parcela y se guardan con ella, con su origen y su resolución: desde ahí el proyecto no depende
// de los servicios. El suelo satelital se conserva cuando el estudiante lo reemplaza por su muestra de campo.

export interface ProveedoresDelLugar {
  clima: ProveedorDeClima
  suelo: ProveedorDeSuelo
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error))

const sueloParaResponder = (fila: Suelo) => ({
  origen: fila.origen,
  clase: fila.textura as ClaseTextural,
  arenaPct: fila.arenaPct,
  limoPct: fila.limoPct,
  arcillaPct: fila.arcillaPct,
  ph: fila.ph,
  capacidadDeCampo: fila.capacidadCampoPct / 100,
  puntoDeMarchitez: fila.puntoMarchitezPct / 100,
  infiltracionBasicaMmH: fila.infiltracionMmH,
  fuente: fila.fuente,
  resolucion: fila.resolucion,
})

/** La fila de suelo que sale de una granulometría, con las propiedades que el módulo de cálculo le asigna. */
export function filaDeSuelo(
  parcelaId: string,
  origen: 'satelital' | 'campo',
  granulometria: { arenaPct: number; arcillaPct: number; ph: number | null },
  fuenteDelDato: { nombre: string; resolucion: string },
) {
  const suelo = sueloDeLaTextura(granulometria)
  return {
    parcelaId,
    origen,
    textura: suelo.clase,
    arenaPct: suelo.arenaPct,
    limoPct: suelo.limoPct,
    arcillaPct: suelo.arcillaPct,
    ph: granulometria.ph,
    capacidadCampoPct: 100 * suelo.capacidadDeCampo,
    puntoMarchitezPct: 100 * suelo.puntoDeMarchitez,
    infiltracionMmH: suelo.infiltracionBasicaMmH,
    fuente: `${fuenteDelDato.nombre}. Propiedades: ${suelo.fuente}`,
    resolucion: fuenteDelDato.resolucion,
  }
}

export async function datosDelLugar(bd: Bd, proveedores: ProveedoresDelLugar, parcela: Parcela) {
  const errores: { clima?: string; suelo?: string } = {}
  const punto = { lat: parcela.centroideLat, lon: parcela.centroideLon }
  const altitudM = parcela.altitudMsnm ?? 0

  // El clima y el suelo se piden a la vez: si un servicio tarda, la espera es la del más lento y no la suma.
  const climaGuardado = async () => {
    const filas = await bd.climaMensual.findMany({ where: { parcelaId: parcela.id }, orderBy: { mes: 'asc' } })
    if (filas.length === 12) return filas
    try {
      const { meses, lluvia, atmosfera } = await proveedores.clima.normales(punto, altitudM)
      const et0 = climaDeLosDoceMeses({ latitudGrados: parcela.centroideLat, altitudM, meses })
      await bd.$transaction([
        bd.climaMensual.deleteMany({ where: { parcelaId: parcela.id } }),
        bd.climaMensual.createMany({
          data: meses.map((m, i) => ({
            parcelaId: parcela.id,
            mes: i + 1,
            et0MmDia: et0[i]!.et0MmDia,
            precipitacionMm: m.lluviaMm,
            tempMediaC: (m.temperaturaMaximaC + m.temperaturaMinimaC) / 2,
            tempMaxC: m.temperaturaMaximaC,
            tempMinC: m.temperaturaMinimaC,
            humedadRelativaPct: m.humedadRelativaMediaPct,
            vientoMs: m.vientoA2mMs,
            radiacionMjM2Dia: m.radiacionSolarMJm2Dia,
            fuente: `Lluvia: ${lluvia.nombre}. Temperatura, humedad, viento y radiación: ${atmosfera.nombre}. ET0 por Penman-Monteith (FAO 56)`,
            resolucion: `lluvia: ${lluvia.resolucion}; lo demás: ${atmosfera.resolucion}`,
          })),
        }),
      ])
      return await bd.climaMensual.findMany({ where: { parcelaId: parcela.id }, orderBy: { mes: 'asc' } })
    } catch (error) {
      errores.clima = `No se pudo traer el clima del lugar (${mensajeDe(error)}). Vuelve a intentarlo en unos minutos.`
      return filas
    }
  }

  const ultimoSuelo = (origen: 'satelital' | 'campo') =>
    bd.suelo.findFirst({ where: { parcelaId: parcela.id, origen }, orderBy: { creadoEn: 'desc' } })
  const sueloSatelital = async () => {
    const guardado = await ultimoSuelo('satelital')
    if (guardado) return guardado
    try {
      const { arenaPct, arcillaPct, ph, fuente } = await proveedores.suelo.suelo(punto)
      return await bd.suelo.create({ data: filaDeSuelo(parcela.id, 'satelital', { arenaPct, arcillaPct, ph }, fuente) })
    } catch (error) {
      errores.suelo = `No se pudo traer el suelo del lugar (${mensajeDe(error)}). Ingresa la textura de tu muestra de campo.`
      return null
    }
  }
  const [filasDeClima, satelital, campo] = await Promise.all([climaGuardado(), sueloSatelital(), ultimoSuelo('campo')])

  return {
    clima:
      filasDeClima.length === 12
        ? {
            meses: filasDeClima.map((f) => ({
              mes: f.mes,
              temperaturaMaximaC: f.tempMaxC!,
              temperaturaMinimaC: f.tempMinC!,
              humedadRelativaMediaPct: f.humedadRelativaPct!,
              vientoA2mMs: f.vientoMs!,
              radiacionSolarMJm2Dia: f.radiacionMjM2Dia!,
              lluviaMm: f.precipitacionMm,
              et0MmDia: f.et0MmDia,
            })),
            fuente: filasDeClima[0]!.fuente,
            resolucion: filasDeClima[0]!.resolucion,
          }
        : null,
    suelo: {
      satelital: satelital && sueloParaResponder(satelital),
      campo: campo && sueloParaResponder(campo),
      vigente: campo ? ('campo' as const) : satelital ? ('satelital' as const) : null,
    },
    errores,
  }
}

export type DatosDelLugar = Awaited<ReturnType<typeof datosDelLugar>>

/** Lo que el módulo de cálculo necesita del lugar para evaluar un cultivo, a partir de lo guardado. */
export async function lugarDelCultivo(bd: Bd, proveedores: ProveedoresDelLugar, proyecto: ProyectoPropio) {
  const { parcela, fuenteAgua } = proyecto
  if (!parcela || !fuenteAgua) throw new ErrorDeApi(409, 'paso_pendiente', 'Primero termina el paso 1: la parcela y la fuente')
  const datos = await datosDelLugar(bd, proveedores, parcela)
  if (!datos.clima) throw new ErrorDeApi(409, 'clima_pendiente', datos.errores.clima ?? 'Falta el clima del lugar')
  const suelo = datos.suelo.vigente === 'campo' ? datos.suelo.campo : datos.suelo.satelital
  if (!suelo) throw new ErrorDeApi(409, 'suelo_pendiente', datos.errores.suelo ?? 'Falta el suelo del lugar')
  const normales: NormalDelMes[] = datos.clima.meses.map(({ mes: _mes, et0MmDia: _et0, ...normal }) => normal)
  const lugar: LugarDelCultivo = {
    altitudM: parcela.altitudMsnm ?? 0,
    normales,
    clima: datos.clima.meses.map((m) => ({ et0MmDia: m.et0MmDia, lluviaMm: m.lluviaMm })),
    suelo: { clase: suelo.clase, ph: suelo.ph },
    fuente: { caudalLps: fuenteAgua.caudalLps, horasDisponiblesDia: fuenteAgua.horasDisponiblesDia, conductividadDsM: fuenteAgua.conductividadDsM },
    areaHa: parcela.areaHa,
  }
  return { lugar, suelo, parcela, fuenteAgua }
}
