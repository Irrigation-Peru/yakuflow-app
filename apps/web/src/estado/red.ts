import type { CambioDeRed } from '@riego/calculo'
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// Estado del paso 5: lo que el estudiante le cambió a la red generada. La red misma no se guarda aquí: sale del módulo
// de cálculo con estos cambios, así el historial de deshacer es liviano y no puede quedar una red a medio calcular. Las
// acciones se nombran como eventos (lo que pasó), no como órdenes.

export interface RedDelEstudiante {
  proyectoId: string | null
  cambios: CambioDeRed[]
}

const inicial: RedDelEstudiante = { proyectoId: null, cambios: [] }

const red = createSlice({
  name: 'red',
  initialState: inicial,
  reducers: {
    redCargada(_estado, { payload }: PayloadAction<RedDelEstudiante>) {
      return payload
    },
    redCambiada(estado, { payload }: PayloadAction<CambioDeRed>) {
      const ultimo = estado.cambios.at(-1)
      // Dos cambios seguidos al mismo tramo son uno solo: la lista no crece mientras el estudiante prueba diámetros.
      if (payload.tipo === 'tramo' && ultimo?.tipo === 'tramo' && ultimo.tramo === payload.tramo) {
        estado.cambios[estado.cambios.length - 1] = { ...ultimo, ...payload }
        return
      }
      estado.cambios.push(payload)
    },
  },
})

export const { redCargada, redCambiada } = red.actions
export const reductorDeLaRed = red.reducer

export const DESHACER_LA_RED = 'red/deshecha'
export const REHACER_LA_RED = 'red/rehecha'
export const LIMPIAR_LA_RED = 'red/historialLimpiado'

/** Carga lo que el servidor tiene guardado. No entra al historial: deshacer no vuelve a una red de otro proyecto. */
export const cargarRed = (guardado: RedDelEstudiante) => (despachar: (accion: unknown) => unknown) => {
  despachar(redCargada(guardado))
  despachar({ type: LIMPIAR_LA_RED })
}
