import { useQuery } from '@tanstack/react-query'
import { api } from './api/cliente.ts'
import { conDecimales } from './formato.ts'

// Si lo guardado de un proyecto sigue valiendo con las reglas de cálculo de hoy (GET /proyectos/:id/vigencia). Cuando el
// módulo cambia, un proyecto guardado antes puede ya no cumplir: la lista de proyectos y el informe lo dicen, con el
// paso que hay que rehacer.

export interface AvisoDeVigencia {
  paso: number
  codigo: string
  detalle: Record<string, number | string>
}

export function useVigencia(proyectoId: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['vigencia', proyectoId],
    queryFn: () => api<{ avisos: AvisoDeVigencia[] }>(`/proyectos/${proyectoId}/vigencia`),
    enabled: habilitado,
    staleTime: 60_000,
  })
}

const lps = (v: number | string) => `${conDecimales(Number(v), 2)} l/s`

const DEL_DISENO: Readonly<Record<string, string>> = {
  intervalo_con_estres: 'entre riego y riego el cultivo se queda sin agua fácil',
  riego_no_cabe: 'cada riego no entra en las horas de agua entre riego y riego',
  riego_excede_el_dia: 'cada riego dura más que las horas de agua de un día',
  turnos_no_caben: 'los turnos no caben en el intervalo',
  escurre: 'el aspersor echa más agua de la que el suelo absorbe',
}

/** El aviso en una frase, para la lista de proyectos y el informe. */
export function lecturaDelAviso(a: AvisoDeVigencia) {
  if (a.codigo === 'agua_no_alcanza_sin_lluvia') {
    return `en la semana crítica, si no llueve, hacen falta ${lps(a.detalle.necesidadLps!)} y la fuente da ${lps(a.detalle.caudalLps!)}: elige una salida en el paso 3`
  }
  if (a.codigo === 'agua_no_alcanza') {
    return `la fuente ya no cubre ${a.detalle.semanasSinCubrir} ${Number(a.detalle.semanasSinCubrir) === 1 ? 'semana' : 'semanas'} de la campaña: elige una salida en el paso 3`
  }
  return `${DEL_DISENO[a.codigo] ?? a.codigo}: rehaz el paso 4`
}
