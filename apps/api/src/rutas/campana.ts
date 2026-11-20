import {
  analisisDeLaRed,
  balanceHidrico,
  CATALOGO_EMISORES,
  CATALOGO_FAO56,
  demandaDeLaCampana,
  disenoDelRiego,
  duracionDelCiclo,
  demandaDeDiseno,
  eficienciaDelBalance,
  eficienciaDelMetodo,
  emisorDelCatalogo,
  FRACCION_MINIMA_DE_AREA,
  generarRedDelProyecto,
  metodoDeRiego,
  presupuestoDeLaRed,
  redConCambios,
  type AjusteDelBalance,
  type CambioDeRed,
  type Cultivo,
  type EmisorDeCatalogo,
  type Red,
  valorDelDiseno,
  diferenciaDeValor,
} from '@riego/calculo'
import { Router } from 'express'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { catalogoVigente } from '../catalogo.ts'
import { datosDelLugar, filaDeSuelo, lugarDelCultivo, type ProveedoresDelLugar } from '../datos-del-lugar.ts'
import { ErrorDeApi } from '../errores.ts'
import type { DecisionBalance } from '../generado/prisma/client.ts'
import { calcularLugar, calcularRelieve } from '../lugar.ts'
import { aGeoJson, avanceAlGuardar, deGeoJson, proyectoPropio, resumenDeLaCampana, type ProyectoPropio } from '../proyecto.ts'
import { datosDeFuente, datosDeParcela } from './proyectos.ts'
import type { ProveedorDeElevacion } from '../servicios/elevacion.ts'
import { usuarioDe } from '../sesion.ts'

// Pasos 2 a 4 del recorrido: los datos del lugar (HU0009), el cultivo y la fecha de siembra con las sugerencias del
// modelo (HU0011 y HU0012), si el agua alcanza y con qué ajuste (HU0013 y HU0014), y el diseño agronómico (HU0015).
// El navegador calcula con el módulo para responder al instante; el servidor vuelve a calcular con el mismo módulo
// antes de guardar, y solo deja avanzar lo que funciona.

const NOMBRES_DE_CULTIVOS = CATALOGO_FAO56.map((c) => c.nombre) as [string, ...string[]]
const CODIGOS_DE_EMISORES = CATALOGO_EMISORES.map((e) => e.codigo) as [string, ...string[]]
const nombreDeCultivo = z.enum(NOMBRES_DE_CULTIVOS, { error: 'Ese cultivo no está en el catálogo' })

export const datosDelSuelo = z
  .object({ arenaPct: z.number().min(0).max(100), arcillaPct: z.number().min(0).max(100) })
  .refine((s) => s.arenaPct + s.arcillaPct <= 100, { message: 'La arena y la arcilla suman más de 100 %', path: ['arcillaPct'] })

export const datosDeLaCampania = z.object({ cultivo: nombreDeCultivo, fechaSiembra: z.iso.date() })

export const datosDeRecomendaciones = z.object({
  modelo: z.object({
    version: z.string().min(1).max(40),
    metricas: z.record(z.string(), z.unknown()),
    // La descripción del conjunto la escribe el entrenamiento: la del modelo de cultivos ya pasa de 300 caracteres.
    conjunto: z.string().min(1).max(1000),
    entrenadoEn: z.iso.datetime({ offset: true }),
    archivo: z.string().min(1).max(200),
  }),
  sugerencias: z
    .array(
      z.object({
        cultivo: nombreDeCultivo,
        orden: z.int().min(1).max(3),
        probabilidad: z.number().min(0).max(1),
        condicionMasInfluyente: z.string().min(1).max(40),
        condiciones: z.record(z.string(), z.unknown()),
        rangos: z.record(z.string(), z.unknown()),
        explicacion: z.string().min(1).max(600),
      }),
    )
    .min(1)
    .max(3),
})

export const datosDelBalance = z.object({
  ajuste: z
    .discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('turnos'), turnos: z.int().min(1).max(24) }),
      z.object({ tipo: z.literal('reservorio'), volumenM3: z.number().positive().max(1_000_000) }),
      z.object({ tipo: z.literal('menos_area'), areaHa: z.number().positive() }),
    ])
    .nullable(),
})

export const datosDelDiseno = z.object({
  metodo: z.enum(['goteo', 'aspersion']),
  emisor: z.enum(CODIGOS_DE_EMISORES, { error: 'Ese emisor no está en el catálogo' }),
  separacionM: z.number().positive().max(30),
  separacionLateralesM: z.number().positive().max(30),
  /** Días entre riegos; sin él, el máximo que el suelo permite. */
  intervaloDias: z.int().min(1).max(60).optional(),
})

// Una alternativa del paso 7 cambia grupos enteros de tubería: en una red grande son unos mil tramos.
const listaDeCambios = z
  .array(
    z.discriminatedUnion('tipo', [
      z.object({
        tipo: z.literal('tramo'),
        tramo: z.string().min(1).max(40),
        diametroInternoMm: z.number().positive().optional(),
        clase: z.string().min(1).max(10).optional(),
      }),
      z.object({ tipo: z.literal('poner-camara'), nodo: z.string().min(1).max(40) }),
      z.object({ tipo: z.literal('quitar-camara'), nodo: z.string().min(1).max(40) }),
    ]),
  )
  .max(2000)

export const datosDeLaRed = z.object({ cambios: listaDeCambios })

const datosDelModeloMl = z.object({
  version: z.string().min(1).max(60),
  metricas: z.record(z.string(), z.unknown()),
  conjunto: z.string().min(1).max(2000),
  entrenadoEn: z.iso.datetime({ offset: true }),
  archivo: z.string().min(1).max(200),
})

export const datosDeLaDecision = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('propia') }),
  z.object({ decision: z.literal('alternativa'), criterio: z.enum(['costo', 'uniformidad', 'margen']), cambios: listaDeCambios, modelo: datosDelModeloMl }),
])

export const proyectoExportado = z.object({
  formato: z.literal('riego-proyecto'),
  version: z.literal(1),
  nombre: z.string().trim().min(1).max(120),
  pasoAlcanzado: z.int().min(1).max(8),
  resultadosDesactualizados: z.array(z.int().min(1).max(8)).max(8),
  parcela: datosDeParcela.nullable(),
  fuente: datosDeFuente.nullable(),
  muestrasDeSuelo: z.array(datosDelSuelo).max(50),
  campania: datosDeLaCampania.nullable(),
  balance: z.object({ salida: z.string().max(40), parametros: z.record(z.string(), z.unknown()), volumenReservorioM3: z.number().nullable(), areaAjustadaHa: z.number().nullable() }).nullable(),
  disenoAgronomico: z
    .object({ metodo: z.enum(['goteo', 'aspersion']), emisor: z.enum(CODIGOS_DE_EMISORES), separacionM: z.number().positive(), separacionLateralesM: z.number().positive(), intervaloDias: z.int().min(1).max(60) })
    .nullable(),
  redes: z.array(z.object({ version: z.int().min(1), origen: z.enum(['modulo', 'ml', 'estudiante']), cambios: listaDeCambios, funciono: z.boolean() })).max(200),
  alternativas: z
    .array(
      z.object({
        versionBase: z.int().min(1),
        versionPropuesta: z.int().min(1),
        criterio: z.string().max(20),
        cambios: listaDeCambios,
        modelo: datosDelModeloMl,
      }),
    )
    .max(200),
})

const cultivoDelCatalogo = (nombre: string) => CATALOGO_FAO56.find((c) => c.nombre === nombre)!

const NOMBRE_DEL_METODO = { goteo: 'goteo', aspersion: 'aspersión' } as const
const EL_METODO = { goteo: 'El goteo', aspersion: 'La aspersión' } as const
const DEL_METODO = { goteo: 'del goteo', aspersion: 'de la aspersión' } as const

const pasoPendiente = (paso: number, que: string) => new ErrorDeApi(409, 'paso_pendiente', `Primero termina el paso ${paso}: ${que}`)

/** La fila del cultivo en la base: se carga del catálogo del módulo la primera vez que alguien lo usa. */
function filaDelCultivo(bd: Bd, cultivo: Cultivo) {
  const datos = {
    kcInicial: cultivo.kc.inicial,
    kcMedio: cultivo.kc.media,
    kcFinal: cultivo.kc.final,
    diasPorEtapa: cultivo.etapas,
    profundidadRadicularCm: 100 * cultivo.profundidadRadicularM.maxima,
    toleranciaSalinidadDsM: cultivo.requisitos?.salinidad.umbralDsM ?? null,
    altitudMaxMsnm: cultivo.requisitos?.altitudMaximaM ?? null,
    tempMinC: cultivo.requisitos?.temperaturaMediaC.minimo ?? null,
    tempMaxC: cultivo.requisitos?.temperaturaMediaC.maximo ?? null,
    fuenteDato: [cultivo.fuente, cultivo.requisitos?.fuente].filter(Boolean).join('. '),
  }
  return bd.cultivo.upsert({ where: { nombre: cultivo.nombre }, create: { nombre: cultivo.nombre, ...datos }, update: datos })
}

/** La fila del emisor en la base, cargada del catálogo del módulo como la del cultivo. */
function filaDelEmisor(bd: Bd, emisor: EmisorDeCatalogo) {
  const datos = {
    nombre: emisor.nombre,
    tipo: emisor.metodo === 'goteo' ? ('gotero' as const) : ('aspersor' as const),
    caudalNominalLph: emisor.caudalNominalLph,
    presionNominalMca: emisor.presionNominalM,
    coeficienteK: emisor.coeficienteK,
    exponenteX: emisor.exponenteX,
  }
  return bd.emisorCatalogo.upsert({ where: { codigo: emisor.codigo }, create: { codigo: emisor.codigo, ...datos }, update: datos })
}

/** El ajuste que el estudiante eligió en el paso 3, tal como lo recibe el módulo. */
function ajusteDeLaDecision(decision: DecisionBalance | undefined): AjusteDelBalance | undefined {
  switch (decision?.salida) {
    case 'turnos':
      return { tipo: 'turnos', turnos: (decision.parametros as { ajuste: { turnos: number } }).ajuste.turnos }
    case 'reservorio':
      return { tipo: 'reservorio', volumenM3: decision.volumenReservorioM3! }
    case 'menos_area':
      return { tipo: 'menos_area', areaHa: decision.areaAjustadaHa! }
    default:
      return undefined
  }
}

/** La demanda de la campaña guardada y el balance contra la fuente, con la eficiencia y el ajuste que se pidan. */
export async function aguaDeLaCampanaGuardada(bd: Bd, proveedores: ProveedoresDelLugar, proyecto: ProyectoPropio) {
  const campania = await bd.campania.findUnique({
    where: { proyectoId: proyecto.id },
    include: { cultivo: true, decisiones: { orderBy: { decididaEn: 'desc' }, take: 1 } },
  })
  if (!campania) throw pasoPendiente(2, 'elige el cultivo y la fecha de siembra')
  const cultivo = cultivoDelCatalogo(campania.cultivo.nombre)
  const { lugar, suelo, parcela, fuenteAgua } = await lugarDelCultivo(bd, proveedores, proyecto)
  const demanda = demandaDeLaCampana({ cultivo, fechaSiembra: campania.fechaSiembra.toISOString().slice(0, 10), clima: lugar.clima })
  const fuente = { tipo: fuenteAgua.tipo, caudalLps: fuenteAgua.caudalLps, horasDisponiblesDia: fuenteAgua.horasDisponiblesDia }
  const balance = (eficiencia: number, ajuste?: AjusteDelBalance) =>
    balanceHidrico({ semanas: demanda.semanas, areaHa: parcela.areaHa, eficiencia, fuente, ajuste, demandaDeDisenoMmDia: demandaDeDiseno(demanda) })
  return { campania, decision: campania.decisiones[0], cultivo, suelo, parcela, fuenteAgua, demanda, balance }
}

// Si lo guardado sigue valiendo con las reglas de hoy: el módulo de cálculo cambia (la semana crítica sin lluvia, el
// lavado de sales, el área mojada del goteo) y un proyecto guardado antes puede ya no cumplir. Se recalcula con los
// datos guardados, sin consultar servicios externos que no estén ya en caché, y se dice qué paso rehacer.
export async function vigenciaDelProyecto(bd: Bd, proveedores: ProveedoresDelLugar, proyecto: ProyectoPropio) {
  const avisos: { paso: number; codigo: string; detalle: Record<string, number | string> }[] = []
  if (proyecto.pasoAlcanzado <= 3) return avisos
  const agua = await aguaDeLaCampanaGuardada(bd, proveedores, proyecto)
  const guardado = await bd.disenoAgronomico.findUnique({ where: { proyectoId: proyecto.id }, include: { emisorCatalogo: true } })
  const ajuste = ajusteDeLaDecision(agua.decision)
  const conductividad = agua.fuenteAgua.conductividadDsM
  const eficiencia = guardado ? eficienciaDelMetodo(guardado.metodo, agua.cultivo, conductividad) : eficienciaDelBalance(agua.cultivo, conductividad)
  const balance = agua.balance(eficiencia, ajuste)
  if (balance.alcanza !== 'si') {
    avisos.push({
      paso: 3,
      codigo: balance.semanasSinCubrir.length > 0 ? 'agua_no_alcanza' : 'agua_no_alcanza_sin_lluvia',
      detalle: { necesidadLps: balance.necesidadPicoLps, caudalLps: balance.caudalLps, semanasSinCubrir: balance.semanasSinCubrir.length },
    })
    return avisos
  }
  if (proyecto.pasoAlcanzado > 4 && guardado && agua.demanda.demandaNetaPicoMmDia > 0) {
    const calculo = disenoDelRiego({
      conductividadDelAguaDsM: conductividad,
      cultivo: agua.cultivo,
      metodo: guardado.metodo,
      emisor: emisorDelCatalogo(guardado.emisorCatalogo.codigo),
      separacionM: guardado.espaciamientoEmisorM,
      separacionLateralesM: guardado.espaciamientoLateralM,
      intervaloDias: guardado.frecuenciaDias,
      demanda: agua.demanda,
      suelo: { ...agua.suelo, infiltracionBasicaMmH: agua.suelo.infiltracionBasicaMmH! },
      areaHa: balance.areaHa,
      horasDeRiegoPorDia: balance.horasDeRiegoPorDia,
      fuente: { caudalLps: balance.caudalLps, reservorioM3: ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined },
    })
    for (const problema of calculo.problemas) {
      avisos.push({ paso: 4, codigo: problema, detalle: { tiempoDeRiegoH: calculo.tiempoDeRiegoH, intervaloDias: calculo.intervaloDias } })
    }
  }
  return avisos
}

export function rutasDeLaCampana(bd: Bd, { elevacion, ...proveedores }: ProveedoresDelLugar & { elevacion: ProveedorDeElevacion }) {
  const rutas = Router()

  async function responder(proyectoId: string) {
    const { id, pasoAlcanzado, resultadosDesactualizados } = await bd.proyecto.findUniqueOrThrow({ where: { id: proyectoId } })
    return { id, pasoAlcanzado, resultadosDesactualizados, ...(await resumenDeLaCampana(bd, proyectoId)) }
  }

  const aguaDeLaCampana = (proyecto: ProyectoPropio) => aguaDeLaCampanaGuardada(bd, proveedores, proyecto)

  rutas.get('/:id/vigencia', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    try {
      res.json({ avisos: await vigenciaDelProyecto(bd, proveedores, proyecto) })
    } catch (error) {
      // Un paso pendiente o un dato que falta no es un aviso de reglas: lo dice el propio paso al abrirlo.
      if (error instanceof ErrorDeApi && error.estado === 409) res.json({ avisos: [] })
      else throw error
    }
  })

  rutas.get('/:id/datos-del-lugar', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (!proyecto.parcela) throw new ErrorDeApi(409, 'parcela_pendiente', 'Primero dibuja la parcela: el clima y el suelo se buscan en su lugar')
    res.json(await datosDelLugar(bd, proveedores, proyecto.parcela))
  })

  // La muestra de campo reemplaza a la textura satelital, que se conserva para compararlas (HU0009, criterio 2).
  rutas.put('/:id/suelo', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (!proyecto.parcela) throw new ErrorDeApi(409, 'parcela_pendiente', 'Primero dibuja la parcela')
    const granulometria = datosDelSuelo.parse(req.body)
    const satelital = await bd.suelo.findFirst({ where: { parcelaId: proyecto.parcela.id, origen: 'satelital' }, orderBy: { creadoEn: 'desc' } })
    await bd.$transaction([
      bd.suelo.create({
        data: filaDeSuelo(proyecto.parcela.id, 'campo', { ...granulometria, ph: satelital?.ph ?? null }, {
          nombre: 'Muestra de campo del estudiante',
          resolucion: 'puntual',
        }),
      }),
      // El suelo es del paso 1: lo que ya se decidió después con el otro suelo queda por revisar.
      bd.proyecto.update({ where: { id: proyecto.id }, data: { resultadosDesactualizados: avanceAlGuardar(proyecto, 1).resultadosDesactualizados } }),
    ])
    res.json(await datosDelLugar(bd, proveedores, proyecto.parcela))
  })

  rutas.put('/:id/campania', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (proyecto.pasoAlcanzado < 2 || !proyecto.parcela) throw pasoPendiente(1, 'la parcela y la fuente')
    const { cultivo: nombre, fechaSiembra } = datosDeLaCampania.parse(req.body)
    const cultivo = cultivoDelCatalogo(nombre)
    const fila = await filaDelCultivo(bd, cultivo)
    const datos = {
      cultivoId: fila.id,
      fechaSiembra: new Date(`${fechaSiembra}T00:00:00Z`),
      duracionDias: duracionDelCiclo(cultivo),
      areaSembradaHa: proyecto.parcela.areaHa,
    }
    await bd.$transaction([
      bd.campania.upsert({ where: { proyectoId: proyecto.id }, create: { proyectoId: proyecto.id, ...datos }, update: datos }),
      bd.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 2) }),
    ])
    res.json(await responder(proyecto.id))
  })

  // Lo que el modelo sugirió y el estudiante vio, con la versión del modelo: queda como evidencia, no se reemplaza.
  rutas.post('/:id/recomendaciones', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (proyecto.pasoAlcanzado < 2) throw pasoPendiente(1, 'la parcela y la fuente')
    const { modelo, sugerencias } = datosDeRecomendaciones.parse(req.body)
    const datosDelModelo = {
      metricas: modelo.metricas as object,
      conjuntoEntrenamiento: modelo.conjunto,
      entrenadoEn: new Date(modelo.entrenadoEn),
      archivoUri: modelo.archivo,
    }
    const fila = await bd.modeloMl.upsert({
      where: { nombre_version: { nombre: 'cultivos', version: modelo.version } },
      create: { nombre: 'cultivos', version: modelo.version, ...datosDelModelo },
      update: {},
    })
    const cultivos = new Map<string, string>()
    for (const s of sugerencias) cultivos.set(s.cultivo, (await filaDelCultivo(bd, cultivoDelCatalogo(s.cultivo))).id)
    await bd.recomendacionCultivo.createMany({
      data: sugerencias.map((s) => ({
        proyectoId: proyecto.id,
        cultivoId: cultivos.get(s.cultivo)!,
        orden: s.orden,
        probabilidad: s.probabilidad,
        condicionesParcela: s.condiciones as object,
        rangosCultivo: s.rangos as object,
        variableMasInfluyente: s.condicionMasInfluyente,
        explicacion: s.explicacion,
        modeloMlId: fila.id,
      })),
    })
    res.status(201).json({ registradas: sugerencias.length })
  })

  // El paso 3 se cierra si la fuente cubre todas las semanas, por sí sola o con el ajuste que el estudiante eligió.
  // La eficiencia es la del método más eficiente del cultivo; el paso 4 vuelve a comprobar con el método elegido.
  rutas.put('/:id/balance', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const { ajuste } = datosDelBalance.parse(req.body)
    const agua = await aguaDeLaCampana(proyecto)
    const eficiencia = eficienciaDelBalance(agua.cultivo, agua.fuenteAgua.conductividadDsM)
    const sinAjuste = agua.balance(eficiencia)
    if (!ajuste && sinAjuste.alcanza !== 'si') {
      throw new ErrorDeApi(409, 'agua_no_alcanza', 'La fuente no cubre todas las semanas: elige un ajuste o vuelve a elegir el cultivo', {
        semanasSinCubrir: sinAjuste.semanasSinCubrir,
      })
    }
    if (ajuste) {
      const area = agua.parcela.areaHa
      if (ajuste.tipo === 'turnos' && !sinAjuste.ajustes.turnos.viable) {
        throw new ErrorDeApi(409, 'ajuste_no_viable', 'Con esta fuente no se puede regar por turnos', { motivo: sinAjuste.ajustes.turnos.motivo })
      }
      if (ajuste.tipo === 'turnos' && ajuste.turnos * agua.fuenteAgua.horasDisponiblesDia > 24) {
        throw new ErrorDeApi(409, 'ajuste_no_viable', `${ajuste.turnos} turnos de ${agua.fuenteAgua.horasDisponiblesDia} h no caben en un día`)
      }
      if (ajuste.tipo === 'reservorio' && !sinAjuste.ajustes.reservorio.viable) {
        throw new ErrorDeApi(409, 'ajuste_no_viable', 'Falta agua desde las primeras semanas: el reservorio no tiene con qué llenarse', {
          motivo: sinAjuste.ajustes.reservorio.motivo,
        })
      }
      if (ajuste.tipo === 'menos_area' && (ajuste.areaHa > area || ajuste.areaHa < FRACCION_MINIMA_DE_AREA * area)) {
        throw new ErrorDeApi(409, 'ajuste_no_viable', `El área a regar tiene que estar entre ${FRACCION_MINIMA_DE_AREA * 100} % y el total de la parcela`)
      }
      const conAjuste = agua.balance(eficiencia, ajuste)
      if (conAjuste.alcanza !== 'si') {
        throw new ErrorDeApi(409, 'ajuste_insuficiente', 'Con ese ajuste todavía quedan semanas sin cubrir', { semanasSinCubrir: conAjuste.semanasSinCubrir })
      }
    }
    const decision = ajuste && {
      campaniaId: agua.campania.id,
      salida: ajuste.tipo,
      parametros: { ajuste, eficiencia, semanasSinCubrirSinAjuste: sinAjuste.semanasSinCubrir },
      volumenReservorioM3: ajuste.tipo === 'reservorio' ? ajuste.volumenM3 : null,
      areaAjustadaHa: ajuste.tipo === 'menos_area' ? ajuste.areaHa : null,
    }
    // La decisión guardada es la vigente; las anteriores quedan en el registro de actividad.
    await bd.$transaction([
      bd.decisionBalance.deleteMany({ where: { campaniaId: agua.campania.id } }),
      ...(decision ? [bd.decisionBalance.create({ data: decision })] : []),
      bd.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 3) }),
    ])
    res.json({ ...(await responder(proyecto.id)), balance: agua.balance(eficiencia, ajuste ?? undefined) })
  })

  rutas.put('/:id/diseno-agronomico', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (proyecto.pasoAlcanzado < 4) throw pasoPendiente(3, 'comprueba si el agua alcanza')
    const datos = datosDelDiseno.parse(req.body)
    const emisor = emisorDelCatalogo(datos.emisor)
    if (emisor.metodo !== datos.metodo) {
      throw new ErrorDeApi(400, 'emisor_de_otro_metodo', `${emisor.nombre} es para ${NOMBRE_DEL_METODO[emisor.metodo]}, no para ${NOMBRE_DEL_METODO[datos.metodo]}`)
    }
    const agua = await aguaDeLaCampana(proyecto)
    const { cargaDisponibleM } = await calcularLugar(elevacion, deGeoJson(agua.parcela.poligono), agua.fuenteAgua)
    const metodos = metodoDeRiego({ cultivo: agua.cultivo, cargaDisponibleM: cargaDisponibleM ?? 0, infiltracionBasicaMmH: agua.suelo.infiltracionBasicaMmH! })
    const viabilidad = metodos.metodos[datos.metodo]
    if (!viabilidad.viable) {
      throw new ErrorDeApi(409, 'metodo_no_viable', `${EL_METODO[datos.metodo]} no es viable en este lugar`, {
        motivos: viabilidad.motivos,
        cargaDisponibleM,
        cargaNecesariaM: viabilidad.cargaNecesariaM ?? null,
      })
    }

    // El agua se volvió a comprobar con la eficiencia del método elegido y con el ajuste del paso 3.
    const eficiencia = eficienciaDelMetodo(datos.metodo, agua.cultivo, agua.fuenteAgua.conductividadDsM)
    const ajuste = ajusteDeLaDecision(agua.decision)
    const balance = agua.balance(eficiencia, ajuste)
    if (balance.alcanza !== 'si') {
      throw new ErrorDeApi(409, 'agua_no_alcanza_con_el_metodo', `Con la eficiencia ${DEL_METODO[datos.metodo]} la fuente ya no cubre todas las semanas: vuelve al paso 3`, {
        semanasSinCubrir: balance.semanasSinCubrir,
      })
    }
    if (!(agua.demanda.demandaNetaPicoMmDia > 0)) {
      throw new ErrorDeApi(409, 'sin_demanda', 'En esta campaña la lluvia cubre toda la demanda: no hay riego que diseñar')
    }

    const calculo = disenoDelRiego({
      conductividadDelAguaDsM: agua.fuenteAgua.conductividadDsM,
      cultivo: agua.cultivo,
      metodo: datos.metodo,
      emisor,
      separacionM: datos.separacionM,
      separacionLateralesM: datos.separacionLateralesM,
      intervaloDias: datos.intervaloDias,
      demanda: agua.demanda,
      suelo: { ...agua.suelo, infiltracionBasicaMmH: agua.suelo.infiltracionBasicaMmH! },
      areaHa: balance.areaHa,
      horasDeRiegoPorDia: balance.horasDeRiegoPorDia,
      fuente: { caudalLps: balance.caudalLps, reservorioM3: ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined },
    })
    const [problema] = calculo.problemas
    if (problema === 'intervalo_con_estres') {
      throw new ErrorDeApi(409, problema, `Cada ${calculo.intervaloDias} días el cultivo agota el agua del suelo: riega cada ${calculo.intervaloMaximoDias} días o menos`)
    }
    if (problema === 'riego_no_cabe') {
      throw new ErrorDeApi(409, problema, `Un riego dura ${calculo.tiempoDeRiegoH.toFixed(1)} h y no cabe en las horas de agua: usa un emisor de más caudal o júntalos más`)
    }
    if (problema === 'riego_excede_el_dia') {
      throw new ErrorDeApi(
        409,
        problema,
        `Un riego dura ${calculo.tiempoDeRiegoH.toFixed(1)} h y la fuente da agua ${balance.horasDeRiegoPorDia} h al día: riega cada ${calculo.intervaloPropuestoDias} días o menos`,
      )
    }
    if (problema === 'turnos_no_caben') {
      throw new ErrorDeApi(
        409,
        problema,
        `Para que ningún turno pida más de lo que da la fuente hacen falta ${calculo.turnosNecesarios}, y en ${calculo.intervaloDias} días caben ${calculo.turnosMaximos}: piden ${(Math.ceil(calculo.horasDeRiegoNecesariasPorDia * 10) / 10).toFixed(1)} h de riego al día y hay ${balance.horasDeRiegoPorDia}; vuelve al paso 3 por más horas, un reservorio o menos área`,
      )
    }
    if (problema === 'escurre') {
      throw new ErrorDeApi(409, problema, 'El aspersor aplica más rápido de lo que el suelo infiltra y el agua escurre: usa otro aspersor o sepáralos más')
    }

    const filaEmisor = await filaDelEmisor(bd, emisor)
    const fila = {
      metodo: datos.metodo,
      emisorCatalogoId: filaEmisor.id,
      espaciamientoEmisorM: datos.separacionM,
      espaciamientoLateralM: datos.separacionLateralesM,
      laminaNetaMm: calculo.laminaNetaMm,
      laminaBrutaMm: calculo.laminaBrutaMm,
      frecuenciaDias: calculo.intervaloDias,
      tiempoRiegoH: calculo.tiempoDeRiegoH,
      areaMojadaPct: calculo.areaMojadaPct,
      intensidadMmH: calculo.intensidadMmH,
      eficienciaAplicacion: eficiencia,
    }
    await bd.$transaction([
      bd.disenoAgronomico.upsert({ where: { proyectoId: proyecto.id }, create: { proyectoId: proyecto.id, ...fila }, update: fila }),
      bd.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 4) }),
    ])
    res.json({ ...(await responder(proyecto.id)), calculo })
  })

  /**
   * La red generada con lo que está guardado de los pasos 1 a 4: la misma que armó el navegador, porque sale de la misma
   * función del módulo. Lo que el estudiante cambió se aplica encima.
   */
  async function redGeneradaDelProyecto(proyecto: ProyectoPropio) {
    if (proyecto.pasoAlcanzado < 5) throw pasoPendiente(4, 'define cómo regar')
    const agua = await aguaDeLaCampana(proyecto)
    const guardado = await bd.disenoAgronomico.findUnique({ where: { proyectoId: proyecto.id }, include: { emisorCatalogo: true } })
    if (!guardado) throw pasoPendiente(4, 'define cómo regar')
    const emisor = emisorDelCatalogo(guardado.emisorCatalogo.codigo)
    const ajuste = ajusteDeLaDecision(agua.decision)
    const balance = agua.balance(guardado.eficienciaAplicacion, ajuste)
    const calculo = disenoDelRiego({
      conductividadDelAguaDsM: agua.fuenteAgua.conductividadDsM,
      cultivo: agua.cultivo,
      metodo: guardado.metodo,
      emisor,
      separacionM: guardado.espaciamientoEmisorM,
      separacionLateralesM: guardado.espaciamientoLateralM,
      intervaloDias: guardado.frecuenciaDias,
      demanda: agua.demanda,
      suelo: { ...agua.suelo, infiltracionBasicaMmH: agua.suelo.infiltracionBasicaMmH! },
      areaHa: balance.areaHa,
      horasDeRiegoPorDia: balance.horasDeRiegoPorDia,
      fuente: { caudalLps: balance.caudalLps, reservorioM3: ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined },
    })
    const contorno = deGeoJson(agua.parcela.poligono)
    const [lugar, relieve] = await Promise.all([calcularLugar(elevacion, contorno, agua.fuenteAgua), calcularRelieve(elevacion, contorno)])
    try {
      return generarRedDelProyecto({
        contorno,
        fuente: { lat: agua.fuenteAgua.lat, lon: agua.fuenteAgua.lon, cotaMsnm: lugar.cotaFuente ?? agua.fuenteAgua.cotaMsnm },
        camaras: lugar.conduccion?.camaras,
        grilla: relieve.grilla,
        metodo: guardado.metodo,
        emisor: emisor.codigo,
        separacionM: guardado.espaciamientoEmisorM,
        separacionLateralesM: guardado.espaciamientoLateralM,
        turnos: calculo.turnos,
      })
    } catch (error) {
      throw new ErrorDeApi(409, 'red_no_generable', error instanceof Error ? error.message : 'No se pudo generar la red')
    }
  }

  // El paso 5: guarda la red con lo que el estudiante le cambió. Cada guardado es una versión nueva y las anteriores se
  // quedan: nada se borra (HU0029). La red nueva todavía no ha funcionado, aunque la anterior sí.
  function redCalculada(generada: Awaited<ReturnType<typeof redGeneradaDelProyecto>>, cambios: readonly CambioDeRed[]) {
    try {
      return redConCambios(generada, cambios)
    } catch (error) {
      throw new ErrorDeApi(400, 'cambio_invalido', error instanceof Error ? error.message : 'Ese cambio no se puede aplicar a la red')
    }
  }

  /** La fila de una versión de la red, con lo que el módulo calculó de ella. */
  async function filaDeLaRed(
    proyectoId: string,
    version: number,
    generada: Awaited<ReturnType<typeof redGeneradaDelProyecto>>,
    { red, analisis }: ReturnType<typeof redCalculada>,
    cambios: readonly CambioDeRed[],
    origen: 'modulo' | 'ml' | 'estudiante',
    funciono = false,
  ) {
    const presupuesto = presupuestoDeLaRed({ red, emisor: generada.emisor, precios: await catalogoVigente(bd) })
    const presionesDeLosTurnos = analisis.turnos.flatMap((t) => red.emisores.filter((e) => e.sector === t.sector).map((e) => t.resultado.nodos[e.nodo]?.presionM ?? 0))
    return {
      proyectoId,
      version,
      origen,
      costoTotal: presupuesto.total,
      uniformidadPct: Math.min(...analisis.turnos.map((t) => t.uniformidad)) * 100,
      presionMinMca: Math.min(...presionesDeLosTurnos),
      presionMaxMca: Math.max(...analisis.presiones.map((p) => p.presionMaximaM)),
      verificada: true,
      definicion: red as object,
      sectores: generada.sectores as string[],
      cambios: cambios as object[],
      funciono,
    }
  }

  /** Lo que una red gana o pierde frente a la base, calculado aquí, sin creer lo que trae el pedido o el archivo. */
  async function diferenciaEntre(generada: Awaited<ReturnType<typeof redGeneradaDelProyecto>>, cambiosBase: readonly CambioDeRed[], red: Red) {
    const precios = await catalogoVigente(bd)
    const valorar = (r: Red) => valorDelDiseno({ red: r, sectores: generada.sectores, presionNominalEmisorM: generada.presionNominalEmisorM, emisor: generada.emisor, precios })
    return diferenciaDeValor(valorar(redCalculada(generada, cambiosBase).red), valorar(red))
  }

  const ultimaRed = (proyectoId: string) => bd.red.findFirst({ where: { proyectoId }, orderBy: { version: 'desc' } })

  rutas.put('/:id/red', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const { cambios } = datosDeLaRed.parse(req.body)
    const generada = await redGeneradaDelProyecto(proyecto)
    const calculada = redCalculada(generada, cambios as CambioDeRed[])
    const { analisis } = calculada
    const ultima = await ultimaRed(proyecto.id)
    const fila = await filaDeLaRed(proyecto.id, (ultima?.version ?? 0) + 1, generada, calculada, cambios as CambioDeRed[], cambios.length > 0 ? 'estudiante' : 'modulo')
    await bd.$transaction([bd.red.create({ data: fila }), bd.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 5) })])
    res.json({ ...(await responder(proyecto.id)), alertas: analisis.alertas, funciona: analisis.funciona })
  })

  // El paso 6: el servidor vuelve a poner a funcionar la red guardada y solo deja seguir si funciona. Ahí se abre el
  // paso 7: nadie ve una alternativa antes de que su propio diseño funcione.
  rutas.put('/:id/red/funcionamiento', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (proyecto.pasoAlcanzado < 6) throw pasoPendiente(5, 'genera y guarda la red')
    const fila = await bd.red.findFirst({ where: { proyectoId: proyecto.id }, orderBy: { version: 'desc' } })
    if (!fila) throw pasoPendiente(5, 'genera y guarda la red')
    const generada = await redGeneradaDelProyecto(proyecto)
    const analisis = analisisDeLaRed({ red: fila.definicion as unknown as Red, sectores: fila.sectores as string[], presionNominalEmisorM: generada.presionNominalEmisorM })
    if (!analisis.funciona) {
      throw new ErrorDeApi(409, 'diseno_no_funciona', 'El diseño todavía tiene alertas por corregir', { alertas: analisis.alertas.filter((a) => a.gravedad !== 'avisa') })
    }
    await bd.$transaction([
      bd.red.update({ where: { id: fila.id }, data: { funciono: true } }),
      bd.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 6) }),
    ])
    res.json(await responder(proyecto.id))
  })

  // El paso 7: el estudiante se queda con su diseño o con una alternativa (HU0026). El navegador ya la verificó, pero la
  // última palabra es del servidor: la vuelve a calcular con el mismo módulo y, si no funciona, no se guarda.
  rutas.put('/:id/optimizacion', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const datos = datosDeLaDecision.parse(req.body)
    const base = await ultimaRed(proyecto.id)
    const vencido = [5, 6].some((paso) => (proyecto.resultadosDesactualizados as number[]).includes(paso))
    if (!base?.funciono || proyecto.pasoAlcanzado < 7 || vencido) throw new ErrorDeApi(409, 'diseno_no_funciona', 'Primero tu diseño tiene que funcionar en el paso 6')
    if (datos.decision === 'propia') {
      await bd.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 7) })
      res.json(await responder(proyecto.id))
      return
    }
    const generada = await redGeneradaDelProyecto(proyecto)
    const cambiosBase = base.cambios as unknown as CambioDeRed[]
    const deLaAlternativa = datos.cambios as CambioDeRed[]
    const calculada = redCalculada(generada, [...cambiosBase, ...deLaAlternativa])
    if (!calculada.analisis.funciona) {
      throw new ErrorDeApi(409, 'alternativa_no_cumple', 'Esa alternativa no pasó la verificación del módulo de cálculo', { alertas: calculada.analisis.alertas.filter((a) => a.gravedad !== 'avisa') })
    }
    const diferencia = await diferenciaEntre(generada, cambiosBase, calculada.red)
    const modelo = await filaDelSustituto(datos.modelo)
    const fila = await filaDeLaRed(proyecto.id, base.version + 1, generada, calculada, [...cambiosBase, ...deLaAlternativa], 'ml', true)
    await bd.$transaction(async (t) => {
      const propuesta = await t.red.create({ data: fila })
      await t.alternativaMl.create({
        data: {
          proyectoId: proyecto.id,
          redBaseId: base.id,
          redPropuestaId: propuesta.id,
          modeloMlId: modelo.id,
          criterioMejorado: datos.criterio,
          deltaCosto: diferencia.costoPct,
          deltaUniformidad: diferencia.uniformidad,
          deltaMargenPresion: diferencia.margenM,
          cambiosPorTramo: deLaAlternativa as object[],
          verificadaPorModulo: true,
          aceptadaPorEstudiante: true,
        },
      })
      await t.proyecto.update({ where: { id: proyecto.id }, data: avanceAlGuardar(proyecto, 7) })
    })
    res.json(await responder(proyecto.id))
  })

  const filaDelSustituto = (modelo: z.infer<typeof datosDelModeloMl>) =>
    bd.modeloMl.upsert({
      where: { nombre_version: { nombre: 'optimizacion', version: modelo.version } },
      create: {
        nombre: 'optimizacion',
        version: modelo.version,
        metricas: modelo.metricas as object,
        conjuntoEntrenamiento: modelo.conjunto,
        entrenadoEn: new Date(modelo.entrenadoEn),
        archivoUri: modelo.archivo,
      },
      update: {},
    })

  // Exportar e importar (HU0028, criterio 4; HU0029): todo lo que el estudiante decidió, sin nada que lo identifique y
  // sin lo calculado, porque al importar el servidor lo vuelve a calcular. El registro de actividad no viaja: es
  // evidencia de lo que pasó en esta cuenta y no se reescribe.
  rutas.get('/:id/exportacion', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const [resumen, muestras, redes, alternativas] = await Promise.all([
      resumenDeLaCampana(bd, proyecto.id),
      proyecto.parcela ? bd.suelo.findMany({ where: { parcelaId: proyecto.parcela.id, origen: 'campo' }, orderBy: { creadoEn: 'asc' } }) : [],
      bd.red.findMany({ where: { proyectoId: proyecto.id }, orderBy: { version: 'asc' } }),
      bd.alternativaMl.findMany({ where: { proyectoId: proyecto.id }, include: { redBase: true, redPropuesta: true, modeloMl: true } }),
    ])
    const f = proyecto.fuenteAgua
    const exportado: z.infer<typeof proyectoExportado> = {
      formato: 'riego-proyecto',
      version: 1,
      nombre: proyecto.nombre,
      pasoAlcanzado: proyecto.pasoAlcanzado,
      resultadosDesactualizados: proyecto.resultadosDesactualizados as number[],
      parcela: proyecto.parcela && { contorno: deGeoJson(proyecto.parcela.poligono) as { lat: number; lon: number }[] },
      fuente: f && { lat: f.lat, lon: f.lon, tipo: f.tipo, caudalLps: f.caudalLps, conductividadDsM: f.conductividadDsM, horasDisponiblesDia: f.horasDisponiblesDia, origenDato: f.origenDato },
      muestrasDeSuelo: muestras.map((m) => ({ arenaPct: m.arenaPct!, arcillaPct: m.arcillaPct! })),
      campania: resumen.campania && { cultivo: resumen.campania.cultivo, fechaSiembra: resumen.campania.fechaSiembra },
      balance: resumen.decisionBalance && {
        salida: resumen.decisionBalance.salida,
        parametros: resumen.decisionBalance.parametros as Record<string, unknown>,
        volumenReservorioM3: resumen.decisionBalance.volumenReservorioM3,
        areaAjustadaHa: resumen.decisionBalance.areaAjustadaHa,
      },
      disenoAgronomico: resumen.disenoAgronomico && {
        metodo: resumen.disenoAgronomico.metodo,
        emisor: resumen.disenoAgronomico.emisor,
        separacionM: resumen.disenoAgronomico.separacionM,
        separacionLateralesM: resumen.disenoAgronomico.separacionLateralesM,
        intervaloDias: resumen.disenoAgronomico.intervaloDias,
      },
      redes: redes.map((r) => ({ version: r.version, origen: r.origen, cambios: r.cambios as z.infer<typeof listaDeCambios>, funciono: r.funciono })),
      alternativas: alternativas.map((a) => ({
        versionBase: a.redBase.version,
        versionPropuesta: a.redPropuesta.version,
        criterio: a.criterioMejorado,
        cambios: a.cambiosPorTramo as z.infer<typeof listaDeCambios>,
        modelo: {
          version: a.modeloMl.version,
          metricas: a.modeloMl.metricas as Record<string, unknown>,
          conjunto: a.modeloMl.conjuntoEntrenamiento,
          entrenadoEn: a.modeloMl.entrenadoEn.toISOString(),
          archivo: a.modeloMl.archivoUri,
        },
      })),
    }
    res.json(exportado)
  })

  // Se importa como un proyecto nuevo, de quien lo sube. Del archivo se toman las decisiones; lo calculado sale otra vez
  // del módulo. Si una red ya no funciona con lo que hay, no se da por funcionando: el archivo no manda sobre el cálculo.
  rutas.post('/importacion', async (req, res) => {
    const parseado = proyectoExportado.safeParse(req.body)
    if (!parseado.success) throw new ErrorDeApi(400, 'archivo_invalido', 'Ese archivo no es un proyecto exportado de esta aplicación')
    const d = parseado.data
    const usuarioId = usuarioDe(res)
    const creado = await bd.proyecto.create({ data: { usuarioId, nombre: d.nombre } })
    const descartar = async (error: unknown): Promise<never> => {
      await bd.proyecto.delete({ where: { id: creado.id } }).catch(() => undefined)
      throw error
    }
    try {
      let tope = 1
      if (d.parcela) {
        const contorno = d.parcela.contorno
        const lugar = await calcularLugar(elevacion, contorno, d.fuente)
        const p = lugar.parcela!
        const parcela = await bd.parcela.create({
          data: {
            proyectoId: creado.id,
            poligono: aGeoJson(contorno),
            areaHa: p.areaHa,
            pendienteMediaPct: p.pendienteMediaPct,
            altitudMsnm: p.altitudMsnm,
            centroideLat: p.centroide.lat,
            centroideLon: p.centroide.lon,
          },
        })
        if (d.fuente) {
          await bd.fuenteAgua.create({ data: { proyectoId: creado.id, ...d.fuente, cotaMsnm: lugar.cotaFuente! } })
          tope = 2
        }
        await bd.proyecto.update({ where: { id: creado.id }, data: { pasoAlcanzado: tope } })
        await datosDelLugar(bd, proveedores, parcela)
        for (const muestra of d.muestrasDeSuelo) {
          await bd.suelo.create({ data: filaDeSuelo(parcela.id, 'campo', { ...muestra, ph: null }, { nombre: 'Muestra de campo del estudiante', resolucion: 'puntual' }) })
        }
      }
      if (d.campania && tope === 2) {
        const cultivo = cultivoDelCatalogo(d.campania.cultivo)
        const fila = await filaDelCultivo(bd, cultivo)
        const parcela = await bd.parcela.findUniqueOrThrow({ where: { proyectoId: creado.id } })
        const campania = await bd.campania.create({
          data: { proyectoId: creado.id, cultivoId: fila.id, fechaSiembra: new Date(`${d.campania.fechaSiembra}T00:00:00Z`), duracionDias: duracionDelCiclo(cultivo), areaSembradaHa: parcela.areaHa },
        })
        if (d.balance) {
          await bd.decisionBalance.create({
            data: { campaniaId: campania.id, salida: d.balance.salida as DecisionBalance['salida'], parametros: d.balance.parametros as object, volumenReservorioM3: d.balance.volumenReservorioM3, areaAjustadaHa: d.balance.areaAjustadaHa },
          })
        }
        tope = 4
      }
      if (d.disenoAgronomico && tope === 4) {
        const proyecto = await proyectoPropio(bd, creado.id, usuarioId)
        const agua = await aguaDeLaCampana(proyecto)
        const emisor = emisorDelCatalogo(d.disenoAgronomico.emisor)
        const ajuste = ajusteDeLaDecision(agua.decision)
        const eficiencia = eficienciaDelMetodo(d.disenoAgronomico.metodo, agua.cultivo, agua.fuenteAgua.conductividadDsM)
        const balance = agua.balance(eficiencia, ajuste)
        const calculo = disenoDelRiego({
          conductividadDelAguaDsM: agua.fuenteAgua.conductividadDsM,
          cultivo: agua.cultivo,
          metodo: d.disenoAgronomico.metodo,
          emisor,
          separacionM: d.disenoAgronomico.separacionM,
          separacionLateralesM: d.disenoAgronomico.separacionLateralesM,
          intervaloDias: d.disenoAgronomico.intervaloDias,
          demanda: agua.demanda,
          suelo: { ...agua.suelo, infiltracionBasicaMmH: agua.suelo.infiltracionBasicaMmH! },
          areaHa: balance.areaHa,
          horasDeRiegoPorDia: balance.horasDeRiegoPorDia,
          fuente: { caudalLps: balance.caudalLps, reservorioM3: ajuste?.tipo === 'reservorio' ? ajuste.volumenM3 : undefined },
        })
        const filaEmisor = await filaDelEmisor(bd, emisor)
        await bd.disenoAgronomico.create({
          data: {
            proyectoId: creado.id,
            metodo: d.disenoAgronomico.metodo,
            emisorCatalogoId: filaEmisor.id,
            espaciamientoEmisorM: d.disenoAgronomico.separacionM,
            espaciamientoLateralM: d.disenoAgronomico.separacionLateralesM,
            laminaNetaMm: calculo.laminaNetaMm,
            laminaBrutaMm: calculo.laminaBrutaMm,
            frecuenciaDias: calculo.intervaloDias,
            tiempoRiegoH: calculo.tiempoDeRiegoH,
            areaMojadaPct: calculo.areaMojadaPct,
            intensidadMmH: calculo.intensidadMmH,
            eficienciaAplicacion: eficiencia,
          },
        })
        tope = 5
      }

      const porVersion = new Map<number, { id: string; cambios: CambioDeRed[]; red: Red | null }>()
      let ultimaFunciono = false
      if (d.redes.length > 0 && tope === 5) {
        await bd.proyecto.update({ where: { id: creado.id }, data: { pasoAlcanzado: 5 } })
        const proyecto = await proyectoPropio(bd, creado.id, usuarioId)
        const generada = await redGeneradaDelProyecto(proyecto)
        for (const r of d.redes) {
          const cambios = r.cambios as CambioDeRed[]
          let calculada: ReturnType<typeof redCalculada> | null = null
          try {
            calculada = redCalculada(generada, cambios)
          } catch {
            // Una versión vieja puede ser de una red que ya cambió: se conserva lo decidido, sin dar nada por verificado.
          }
          const fila = calculada
            ? await filaDeLaRed(creado.id, r.version, generada, calculada, cambios, r.origen, r.funciono && calculada.analisis.funciona)
            : { proyectoId: creado.id, version: r.version, origen: r.origen, verificada: false, definicion: {}, sectores: [], cambios: cambios as object[], funciono: false }
          const { id } = await bd.red.create({ data: fila })
          porVersion.set(r.version, { id, cambios, red: calculada?.red ?? null })
          ultimaFunciono = fila.funciono
        }
        tope = ultimaFunciono ? 8 : 6
        for (const a of d.alternativas) {
          const base = porVersion.get(a.versionBase)
          const propuesta = porVersion.get(a.versionPropuesta)
          if (!base?.red || !propuesta?.red) continue
          const modelo = await filaDelSustituto(a.modelo)
          const diferencia = await diferenciaEntre(generada, base.cambios, propuesta.red)
          await bd.alternativaMl.create({
            data: {
              proyectoId: creado.id,
              redBaseId: base.id,
              redPropuestaId: propuesta.id,
              modeloMlId: modelo.id,
              criterioMejorado: a.criterio,
              deltaCosto: diferencia.costoPct,
              deltaUniformidad: diferencia.uniformidad,
              deltaMargenPresion: diferencia.margenM,
              cambiosPorTramo: a.cambios as object[],
              verificadaPorModulo: true,
              aceptadaPorEstudiante: true,
            },
          })
        }
      }

      const pasoAlcanzado = Math.min(d.pasoAlcanzado, tope)
      await bd.proyecto.update({
        where: { id: creado.id },
        data: { pasoAlcanzado, resultadosDesactualizados: d.resultadosDesactualizados.filter((paso) => paso < pasoAlcanzado) },
      })
    } catch (error) {
      await descartar(error)
    }
    res.status(201).json(await responder(creado.id))
  })

  return rutas
}
