import type { FuncionesDelCalculo, NombreDeFuncion, Pedido, Respuesta } from './trabajador.ts'

// Puente con el hilo del módulo de cálculo, escrito a mano: cada pedido lleva un número y la respuesta vuelve
// con el mismo número, así se pueden tener varios pedidos en vuelo.

let trabajador: Worker | null = null
let siguiente = 0
const pendientes = new Map<number, { resolver: (valor: unknown) => void; rechazar: (error: Error) => void }>()

function hilo() {
  if (!trabajador) {
    trabajador = new Worker(new URL('./trabajador.ts', import.meta.url), { type: 'module' })
    trabajador.onmessage = ({ data }: MessageEvent<Respuesta>) => {
      const pendiente = pendientes.get(data.id)
      pendientes.delete(data.id)
      if ('error' in data) pendiente?.rechazar(new Error(data.error))
      else pendiente?.resolver(data.resultado)
    }
  }
  return trabajador
}

export function calcular<F extends NombreDeFuncion>(
  funcion: F,
  ...argumentos: Parameters<FuncionesDelCalculo[F]>
): Promise<Awaited<ReturnType<FuncionesDelCalculo[F]>>> {
  const id = ++siguiente
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver: resolver as (valor: unknown) => void, rechazar })
    hilo().postMessage({ id, funcion, argumentos } satisfies Pedido)
  })
}
