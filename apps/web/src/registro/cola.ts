// El registro de actividad desde el navegador (HU0007). Cada acción se guarda primero en el equipo
// (localStorage) y se manda al servidor por lotes: si la conexión se cae o se cierra la página, nada se pierde.

export interface Accion {
  paso: number
  accion: string
  detalle?: Record<string, unknown>
  proyectoId?: string
}

export interface EventoPendiente extends Accion {
  ocurridoEn: string
}

interface AlmacenLocal {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
}

const POR_LOTE = 200

export function crearCola({
  almacen,
  enviar,
  ahora = () => new Date(),
  clave = 'riego.registro',
}: {
  almacen: AlmacenLocal
  enviar: (eventos: EventoPendiente[]) => Promise<void>
  ahora?: () => Date
  clave?: string
}) {
  const leer = (): EventoPendiente[] => {
    try {
      return JSON.parse(almacen.getItem(clave) ?? '[]') as EventoPendiente[]
    } catch {
      return []
    }
  }
  const guardar = (eventos: EventoPendiente[]) => almacen.setItem(clave, JSON.stringify(eventos))
  let enCurso: Promise<void> | null = null

  return {
    registrar(accion: Accion) {
      guardar([...leer(), { ...accion, ocurridoEn: ahora().toISOString() }])
    },
    pendientes: () => leer().length,
    /** Manda lo pendiente. Mientras manda, lo nuevo se sigue agregando al final y sale en el lote siguiente. */
    vaciar() {
      enCurso ??= (async () => {
        try {
          for (let lote = leer().slice(0, POR_LOTE); lote.length > 0; lote = leer().slice(0, POR_LOTE)) {
            await enviar(lote)
            guardar(leer().slice(lote.length))
          }
        } catch {
          // Sin conexión: queda guardado y sale en el próximo intento.
        } finally {
          enCurso = null
        }
      })()
      return enCurso
    },
  }
}

export type Cola = ReturnType<typeof crearCola>
