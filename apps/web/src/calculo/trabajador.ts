/// <reference lib="webworker" />
import { areaDePoligono } from '@riego/calculo'
import { aguaDeLaCampana, campanaDelCultivo, riegoDeLaCampana } from './campana.ts'
import { informeDelProyecto } from './informe.ts'
import { sugerenciasDelModelo } from './modelo-de-cultivos.ts'
import { alternativasDelEstudiante } from './modelo-sustituto.ts'
import { laRedDelEstudiante } from './red.ts'

// El módulo de cálculo y los modelos corren en un hilo aparte: la pantalla no se traba aunque el cálculo
// tarde. Solo se pueden llamar las funciones de esta lista; crece a medida que las pantallas las necesitan.

const FUNCIONES = {
  areaDePoligono,
  campanaDelCultivo,
  aguaDeLaCampana,
  riegoDeLaCampana,
  sugerenciasDelModelo,
  laRedDelEstudiante,
  alternativasDelEstudiante,
  informeDelProyecto,
}

export type FuncionesDelCalculo = typeof FUNCIONES
export type NombreDeFuncion = keyof FuncionesDelCalculo

export interface Pedido {
  id: number
  funcion: NombreDeFuncion
  argumentos: unknown[]
}

export type Respuesta = { id: number; resultado: unknown } | { id: number; error: string }

self.onmessage = async ({ data: { id, funcion, argumentos } }: MessageEvent<Pedido>) => {
  try {
    // Los modelos responden con una promesa; el módulo de cálculo, al instante.
    const resultado = await (FUNCIONES[funcion] as (...a: unknown[]) => unknown)(...argumentos)
    self.postMessage({ id, resultado } satisfies Respuesta)
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies Respuesta)
  }
}
