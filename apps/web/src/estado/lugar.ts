import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { ActionCreators } from 'redux-undo'

// Estado del paso 1: el contorno que el estudiante dibuja en el mapa y el punto donde ubica la fuente. Las
// acciones se nombran como eventos (lo que pasó), no como órdenes.

export interface Punto {
  lat: number
  lon: number
}

export type Modo = 'parcela' | 'fuente' | null

export interface Lugar {
  modo: Modo
  vertices: Punto[]
  cerrado: boolean
  fuente: Punto | null
}

const inicial: Lugar = { modo: null, vertices: [], cerrado: false, fuente: null }

const lugar = createSlice({
  name: 'lugar',
  initialState: inicial,
  reducers: {
    modoElegido(estado, { payload }: PayloadAction<Modo>) {
      estado.modo = payload
      // Empezar a dibujar es empezar un contorno nuevo; deshacer recupera el anterior.
      if (payload === 'parcela') {
        estado.vertices = []
        estado.cerrado = false
      }
    },
    verticeAgregado(estado, { payload }: PayloadAction<Punto>) {
      if (estado.modo === 'parcela' && !estado.cerrado) estado.vertices.push(payload)
    },
    contornoCerrado(estado) {
      if (estado.modo !== 'parcela' || estado.vertices.length < 3) return
      estado.cerrado = true
      estado.modo = null
    },
    fuenteUbicada(estado, { payload }: PayloadAction<Punto>) {
      if (estado.modo !== 'fuente') return
      estado.fuente = payload
      estado.modo = null
    },
    lugarCargado(_estado, { payload }: PayloadAction<{ contorno: Punto[] | null; fuente: Punto | null }>) {
      return { modo: null, vertices: payload.contorno ?? [], cerrado: payload.contorno !== null, fuente: payload.fuente }
    },
  },
})

export const { modoElegido, verticeAgregado, contornoCerrado, fuenteUbicada, lugarCargado } = lugar.actions
export const reductorDelLugar = lugar.reducer

/** Carga lo que el servidor tiene guardado. No entra al historial: deshacer no vuelve a un lugar vacío. */
export const cargarLugar =
  (guardado: { contorno: Punto[] | null; fuente: Punto | null }) => (despachar: (accion: unknown) => unknown) => {
    despachar(lugarCargado(guardado))
    despachar(ActionCreators.clearHistory())
  }
