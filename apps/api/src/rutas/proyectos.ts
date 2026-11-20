import { aguaDisponibleDeLaFuente } from '@riego/calculo'
import { Router } from 'express'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import { ErrorDeApi } from '../errores.ts'
import { calcularLugar, calcularRelieve } from '../lugar.ts'
import { aGeoJson, avanceAlGuardar, deGeoJson, ELIMINADO, proyectoPropio, resumenDeLaCampana, type ProyectoPropio } from '../proyecto.ts'
import type { ProveedorDeElevacion } from '../servicios/elevacion.ts'
import { usuarioDe } from '../sesion.ts'

// Proyectos del estudiante y el paso 1 del recorrido: la parcela y la fuente de agua (HU0005).

const punto = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
export const datosDeParcela = z.object({ contorno: z.array(punto).min(3).max(200) })
// El caudal y la calidad del agua son lo único que el estudiante escribe: los midió en campo.
export const datosDeFuente = punto.extend({
  tipo: z.enum(['canal', 'manantial', 'reservorio']),
  caudalLps: z.number().positive().max(1000),
  conductividadDsM: z.number().min(0).max(30).nullable().default(null),
  horasDisponiblesDia: z.number().positive().max(24),
  origenDato: z.enum(['campo', 'declarado']),
})
export const datosDelProyecto = z.object({ nombre: z.string().trim().min(1).max(120) })

export function rutasDeProyectos(bd: Bd, elevacion: ProveedorDeElevacion) {
  const rutas = Router()

  // Con la parcela y la fuente guardadas, y el agua llegando por gravedad a toda la parcela, el paso 1 está
  // completo y el proyecto llega al paso 2. Si el estudiante vuelve al paso 1 desde más adelante, no retrocede, y lo
  // que ya decidió en los pasos siguientes queda marcado para revisar.
  const pasoUno = (proyecto: ProyectoPropio, { desnivel }: Awaited<ReturnType<typeof calcularLugar>>) => {
    const avance = avanceAlGuardar(proyecto, 1)
    const completo = desnivel !== null && desnivel.disponibleM > 0
    return bd.proyecto.update({
      where: { id: proyecto.id },
      data: completo ? avance : { resultadosDesactualizados: avance.resultadosDesactualizados },
    })
  }

  async function responderLugar(proyectoId: string, lugar: Awaited<ReturnType<typeof calcularLugar>>) {
    const { parcela, fuenteAgua, ...proyecto } = await bd.proyecto.findUniqueOrThrow({
      where: { id: proyectoId },
      include: { parcela: true, fuenteAgua: true },
    })
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      pasoAlcanzado: proyecto.pasoAlcanzado,
      resultadosDesactualizados: proyecto.resultadosDesactualizados as number[],
      parcela: parcela && lugar.parcela && { contorno: deGeoJson(parcela.poligono), ...lugar.parcela },
      fuente: fuenteAgua && {
        tipo: fuenteAgua.tipo,
        lat: fuenteAgua.lat,
        lon: fuenteAgua.lon,
        caudalLps: fuenteAgua.caudalLps,
        conductividadDsM: fuenteAgua.conductividadDsM,
        horasDisponiblesDia: fuenteAgua.horasDisponiblesDia,
        origenDato: fuenteAgua.origenDato,
        cotaMsnm: lugar.cotaFuente ?? fuenteAgua.cotaMsnm,
        aguaDisponible: aguaDisponibleDeLaFuente({ caudalLps: fuenteAgua.caudalLps, horasDeRiegoPorDia: fuenteAgua.horasDisponiblesDia }),
      },
      desnivel: lugar.desnivel,
      conduccion: lugar.conduccion,
      cargaDisponibleM: lugar.cargaDisponibleM,
      elevacion: lugar.elevacion,
      ...(await resumenDeLaCampana(bd, proyectoId)),
    }
  }

  rutas.get('/', async (_req, res) => {
    const proyectos = await bd.proyecto.findMany({ where: { usuarioId: usuarioDe(res), estado: { not: ELIMINADO } }, orderBy: { creadoEn: 'asc' } })
    res.json(proyectos.map(({ id, nombre, pasoAlcanzado, creadoEn }) => ({ id, nombre, pasoAlcanzado, creadoEn })))
  })

  rutas.post('/', async (req, res) => {
    const { nombre } = datosDelProyecto.parse(req.body)
    const proyecto = await bd.proyecto.create({ data: { usuarioId: usuarioDe(res), nombre } })
    res.status(201).json({ id: proyecto.id, nombre: proyecto.nombre, pasoAlcanzado: proyecto.pasoAlcanzado })
  })

  rutas.get('/:id', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const lugar = await calcularLugar(elevacion, proyecto.parcela && deGeoJson(proyecto.parcela.poligono), proyecto.fuenteAgua)
    res.json(await responderLugar(proyecto.id, lugar))
  })

  // Eliminar: el proyecto sale de la lista del estudiante y ya no se abre, pero no se borra (ver ELIMINADO).
  rutas.delete('/:id', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    await bd.proyecto.update({ where: { id: proyecto.id }, data: { estado: ELIMINADO } })
    res.status(204).end()
  })

  rutas.get('/:id/relieve', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    if (!proyecto.parcela) throw new ErrorDeApi(409, 'parcela_pendiente', 'Primero dibuja la parcela: el relieve se muestra a su alrededor')
    res.json(await calcularRelieve(elevacion, deGeoJson(proyecto.parcela.poligono)))
  })

  rutas.put('/:id/parcela', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const { contorno } = datosDeParcela.parse(req.body)
    const lugar = await calcularLugar(elevacion, contorno, proyecto.fuenteAgua)
    const parcela = lugar.parcela!
    const datos = {
      poligono: aGeoJson(contorno),
      areaHa: parcela.areaHa,
      pendienteMediaPct: parcela.pendienteMediaPct,
      altitudMsnm: parcela.altitudMsnm,
      centroideLat: parcela.centroide.lat,
      centroideLon: parcela.centroide.lon,
    }
    // El clima y el suelo satelital son del lugar: si la parcela cambia, se vuelven a consultar. La muestra de campo
    // la tomó el estudiante y se queda hasta que la reemplace.
    const cambiada = proyecto.parcela && JSON.stringify(proyecto.parcela.poligono) !== JSON.stringify(datos.poligono)
    await bd.$transaction([
      ...(cambiada
        ? [
            bd.climaMensual.deleteMany({ where: { parcelaId: proyecto.parcela!.id } }),
            bd.suelo.deleteMany({ where: { parcelaId: proyecto.parcela!.id, origen: 'satelital' } }),
          ]
        : []),
      bd.parcela.upsert({ where: { proyectoId: proyecto.id }, create: { proyectoId: proyecto.id, ...datos }, update: datos }),
      // Las cotas de la parcela y la de la fuente salen siempre de la misma fuente de elevación.
      ...(proyecto.fuenteAgua && lugar.cotaFuente !== null
        ? [bd.fuenteAgua.update({ where: { proyectoId: proyecto.id }, data: { cotaMsnm: lugar.cotaFuente } })]
        : []),
      pasoUno(proyecto, lugar),
    ])
    res.json(await responderLugar(proyecto.id, lugar))
  })

  rutas.put('/:id/fuente', async (req, res) => {
    const proyecto = await proyectoPropio(bd, req.params.id, usuarioDe(res))
    const datos = datosDeFuente.parse(req.body)
    const lugar = await calcularLugar(elevacion, proyecto.parcela && deGeoJson(proyecto.parcela.poligono), datos)
    const fila = { ...datos, cotaMsnm: lugar.cotaFuente! }
    await bd.$transaction([
      bd.fuenteAgua.upsert({ where: { proyectoId: proyecto.id }, create: { proyectoId: proyecto.id, ...fila }, update: fila }),
      pasoUno(proyecto, lugar),
    ])
    res.json(await responderLugar(proyecto.id, lugar))
  })

  return rutas
}
