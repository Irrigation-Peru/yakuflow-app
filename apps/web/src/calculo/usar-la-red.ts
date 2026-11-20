import type { CatalogoDePrecios } from '@riego/calculo'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { api } from '../api/cliente.ts'
import { useDatosDelLugar, useProyectoDelPaso } from '../api/consultas.ts'
import type { LugarDelProyecto, RelieveDelProyecto } from '../api/tipos.ts'
import type { Despacho, Estado } from '../estado/almacen.ts'
import { cargarRed } from '../estado/red.ts'
import { lugarDelCultivo, sueloVigente } from '../lugar-del-cultivo.ts'
import { calcular } from './puente.ts'
import type { PlanteamientoDeLaRed } from './red.ts'

// Lo que comparten las pantallas de los pasos 5 y 6: el proyecto, los datos del lugar, el relieve y la red del estudiante
// en el hilo del cálculo.

export function useRelieve(proyecto: LugarDelProyecto | undefined) {
  return useQuery({
    queryKey: ['relieve', proyecto?.id, proyecto?.parcela?.contorno],
    queryFn: () => api<RelieveDelProyecto>(`/proyectos/${proyecto!.id}/relieve`),
    enabled: Boolean(proyecto?.parcela?.contorno),
    staleTime: Infinity,
  })
}

export function usePrecios() {
  return useQuery({ queryKey: ['precios'], queryFn: () => api<CatalogoDePrecios>('/catalogo/precios'), staleTime: Infinity })
}

export function useLaRed(paso: number, proyectoId: string, alPerderlo: () => void) {
  const despachar = useDispatch<Despacho>()
  const cambios = useSelector((e: Estado) => e.red.present.cambios)
  const puedeDeshacer = useSelector((e: Estado) => e.red.past.length > 0)
  const proyecto = useProyectoDelPaso(paso, proyectoId, alPerderlo)
  const datos = useDatosDelLugar(proyecto.data)
  const relieve = useRelieve(proyecto.data)
  const precios = usePrecios()
  const p = proyecto.data

  // Si algo de antes cambió, la red se vuelve a generar sin los cambios: pueden ser de tramos que ya no existen. La
  // versión anterior se queda guardada en el servidor.
  const desactualizada = p?.resultadosDesactualizados.includes(5) ?? false
  const [cargada, setCargada] = useState(false)
  const conCambiosGuardados = p !== undefined
  useEffect(() => {
    if (!conCambiosGuardados || cargada) return
    despachar(cargarRed({ proyectoId, cambios: desactualizada ? [] : (p!.red?.cambios ?? []) }))
    // oxlint-disable-next-line react/set-state-in-effect -- la carga viene del servidor y pasa una sola vez
    setCargada(true)
    // Una vez por pantalla abierta: después manda lo que el estudiante va cambiando.
  }, [conCambiosGuardados]) // oxlint-disable-line react-hooks/exhaustive-deps

  const planteamiento = useMemo<PlanteamientoDeLaRed | null>(() => {
    if (!p || !datos.data || !relieve.data) return null
    const lugar = lugarDelCultivo(p, datos.data)
    const suelo = sueloVigente(datos.data)
    const guardado = p.disenoAgronomico
    if (!lugar || !suelo || !p.campania || !p.fuente || !p.parcela || p.cargaDisponibleM === null || !guardado) return null
    return {
      cultivo: p.campania.cultivo,
      fechaSiembra: p.campania.fechaSiembra,
      lugar,
      suelo: {
        clase: suelo.clase,
        capacidadDeCampo: suelo.capacidadDeCampo,
        puntoDeMarchitez: suelo.puntoDeMarchitez,
        infiltracionBasicaMmH: suelo.infiltracionBasicaMmH,
      },
      cargaDisponibleM: p.cargaDisponibleM,
      fuente: { tipo: p.fuente.tipo, caudalLps: p.fuente.caudalLps, horasDisponiblesDia: p.fuente.horasDisponiblesDia, conductividadDsM: p.fuente.conductividadDsM },
      areaHa: p.parcela.areaHa,
      ajuste: p.decisionBalance?.parametros.ajuste ?? undefined,
      eleccion: {
        metodo: guardado.metodo,
        emisor: guardado.emisor,
        separacionM: guardado.separacionM,
        separacionLateralesM: guardado.separacionLateralesM,
        intervaloDias: guardado.intervaloDias,
      },
      contorno: p.parcela.contorno,
      puntoDeLaFuente: { lat: p.fuente.lat, lon: p.fuente.lon, cotaMsnm: p.fuente.cotaMsnm },
      camaras: p.conduccion?.camaras.map((c) => ({ lat: c.lat, lon: c.lon, cota: c.cota })),
      grilla: relieve.data.grilla,
    }
  }, [p, datos.data, relieve.data])

  const laRed = useQuery({
    // La grilla no entra a la clave: sale del contorno, y son cientos de números que no hace falta comparar.
    queryKey: ['red', proyectoId, planteamiento && { ...planteamiento, grilla: null }, cambios, precios.data?.version],
    queryFn: () => calcular('laRedDelEstudiante', planteamiento!, cambios, precios.data ?? null),
    enabled: planteamiento !== null && cargada && !precios.isPending,
    placeholderData: keepPreviousData,
    retry: false,
  })

  return { proyecto, datos, relieve, precios, planteamiento, cambios, puedeDeshacer, laRed, desactualizada, despachar }
}
