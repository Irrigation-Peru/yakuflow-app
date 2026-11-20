import { describe, expect, it } from 'vitest'
import { crearCola, type EventoPendiente } from '../src/registro/cola.ts'

// El registro de actividad (HU0007) desde el navegador: cada acción se guarda primero en el equipo y se manda
// por lotes. Si la conexión falla, nada se pierde; se vuelve a intentar.

function almacenEnMemoria() {
  const datos = new Map<string, string>()
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  }
}

function servidorFalso() {
  const recibidos: EventoPendiente[][] = []
  let caido = false
  return {
    recibidos,
    caer: (si: boolean) => (caido = si),
    enviar: async (eventos: EventoPendiente[]) => {
      if (caido) throw new Error('sin conexión')
      recibidos.push(eventos)
    },
  }
}

const reloj = () => new Date('2027-04-10T15:00:00Z')

describe('cola del registro de actividad', () => {
  it('registra la acción con su paso, sus datos y la hora en que ocurrió', async () => {
    const servidor = servidorFalso()
    const cola = crearCola({ almacen: almacenEnMemoria(), enviar: servidor.enviar, ahora: reloj })
    cola.registrar({ paso: 1, accion: 'parcelaCerrada', detalle: { vertices: 5 }, proyectoId: 'p1' })
    await cola.vaciar()
    expect(servidor.recibidos).toEqual([
      [{ paso: 1, accion: 'parcelaCerrada', detalle: { vertices: 5 }, proyectoId: 'p1', ocurridoEn: '2027-04-10T15:00:00.000Z' }],
    ])
  })

  it('conserva las acciones si el servidor no responde y las manda después', async () => {
    const servidor = servidorFalso()
    const cola = crearCola({ almacen: almacenEnMemoria(), enviar: servidor.enviar, ahora: reloj })
    servidor.caer(true)
    cola.registrar({ paso: 1, accion: 'fuenteUbicada' })
    await cola.vaciar()
    expect(cola.pendientes()).toBe(1)
    servidor.caer(false)
    await cola.vaciar()
    expect(cola.pendientes()).toBe(0)
    expect(servidor.recibidos.flat().map((e) => e.accion)).toEqual(['fuenteUbicada'])
  })

  it('sobrevive a que se cierre la página: lo pendiente queda en el equipo', async () => {
    const almacen = almacenEnMemoria()
    const servidor = servidorFalso()
    servidor.caer(true)
    crearCola({ almacen, enviar: servidor.enviar, ahora: reloj }).registrar({ paso: 1, accion: 'parcelaCerrada' })
    servidor.caer(false)
    const otra = crearCola({ almacen, enviar: servidor.enviar, ahora: reloj })
    expect(otra.pendientes()).toBe(1)
    await otra.vaciar()
    expect(servidor.recibidos).toHaveLength(1)
  })

  it('manda de a doscientas como máximo', async () => {
    const servidor = servidorFalso()
    const cola = crearCola({ almacen: almacenEnMemoria(), enviar: servidor.enviar, ahora: reloj })
    for (let i = 0; i < 450; i++) cola.registrar({ paso: 1, accion: 'verticeAgregado' })
    await cola.vaciar()
    expect(servidor.recibidos.map((lote) => lote.length)).toEqual([200, 200, 50])
  })

  it('no manda dos veces lo mismo si se vacía dos veces a la vez', async () => {
    const servidor = servidorFalso()
    const cola = crearCola({ almacen: almacenEnMemoria(), enviar: servidor.enviar, ahora: reloj })
    cola.registrar({ paso: 1, accion: 'parcelaCerrada' })
    await Promise.all([cola.vaciar(), cola.vaciar()])
    expect(servidor.recibidos.flat()).toHaveLength(1)
  })
})
