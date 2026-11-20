import { configureStore } from '@reduxjs/toolkit'
import undoable from 'redux-undo'
import { reductorDelLugar } from './lugar.ts'
import { DESHACER_LA_RED, LIMPIAR_LA_RED, reductorDeLaRed, REHACER_LA_RED } from './red.ts'

export function crearAlmacen() {
  return configureStore({
    reducer: {
      // Cada historial tiene sus propias acciones: deshacer en el paso 5 no toca el contorno del paso 1.
      lugar: undoable(reductorDelLugar, { limit: 100 }),
      red: undoable(reductorDeLaRed, { limit: 100, undoType: DESHACER_LA_RED, redoType: REHACER_LA_RED, clearHistoryType: LIMPIAR_LA_RED }),
    },
  })
}

export type Almacen = ReturnType<typeof crearAlmacen>
export type Estado = ReturnType<Almacen['getState']>
export type Despacho = Almacen['dispatch']
