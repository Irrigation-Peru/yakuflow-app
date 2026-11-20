import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useRegistrar } from '../registro/contexto.ts'
import { api, ErrorDeApi } from './cliente.ts'
import type { AvanceDeLaCampana, Consentimiento, DatosDelLugar, LugarDelProyecto } from './tipos.ts'

export function useConsentimiento() {
  return useQuery({ queryKey: ['consentimiento'], queryFn: () => api<Consentimiento>('/consentimiento'), staleTime: Infinity })
}

export const claveDelProyecto = (proyectoId: string) => ['proyecto', proyectoId]

/** El proyecto con su lugar y lo que se decidió en cada paso: lo comparten todas las pantallas del recorrido. */
export function useProyecto(proyectoId: string, habilitado = true) {
  return useQuery({
    queryKey: claveDelProyecto(proyectoId),
    queryFn: () => api<LugarDelProyecto>(`/proyectos/${proyectoId}`),
    enabled: habilitado,
  })
}

/**
 * El proyecto, para la pantalla de un paso: registra que el paso se abrió y, si el proyecto ya no existe (otro
 * equipo, otra cuenta), vuelve a la lista.
 */
export function useProyectoDelPaso(paso: number, proyectoId: string, alPerderlo: () => void) {
  const proyecto = useProyecto(proyectoId)
  const registrar = useRegistrar()
  useEffect(() => {
    registrar({ paso, accion: 'pasoAbierto', proyectoId })
    // Una vez por pantalla abierta.
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (proyecto.error instanceof ErrorDeApi && proyecto.error.estado === 404) alPerderlo()
  }, [proyecto.error, alPerderlo])
  return proyecto
}

export const claveDeLosDatosDelLugar =(proyecto: LugarDelProyecto | undefined) => ['datos-del-lugar', proyecto?.id, proyecto?.parcela?.contorno]

/** El clima y el suelo del lugar. Dependen de la parcela: si cambia, se vuelven a pedir. */
export function useDatosDelLugar(proyecto: LugarDelProyecto | undefined) {
  return useQuery({
    queryKey: claveDeLosDatosDelLugar(proyecto),
    queryFn: () => api<DatosDelLugar>(`/proyectos/${proyecto!.id}/datos-del-lugar`),
    enabled: Boolean(proyecto?.parcela?.contorno),
    staleTime: Infinity,
  })
}

/** Lo que devuelve un paso al guardarse se mezcla con el proyecto en memoria: el avance y lo decidido. */
export function useAlGuardarElPaso(proyectoId: string) {
  const consultas = useQueryClient()
  return (avance: AvanceDeLaCampana) => {
    consultas.setQueryData<LugarDelProyecto>(claveDelProyecto(proyectoId), (anterior) => anterior && { ...anterior, ...avance })
    // Lo guardado cambió: si seguía valiendo con las reglas de hoy se vuelve a preguntar.
    void consultas.invalidateQueries({ queryKey: ['vigencia', proyectoId] })
  }
}
