// Lo más que se espera a un servicio externo. Si no contesta, la consulta se corta con un error que dice cuál fue, y
// la pantalla lo muestra en lugar de quedarse esperando: SoilGrids, por ejemplo, a veces no responde.

export const TIEMPO_LIMITE_MS = 15_000

export async function consultarConLimite(obtener: typeof fetch, url: string, servicio: string, tiempoLimiteMs = TIEMPO_LIMITE_MS) {
  try {
    return await obtener(url, { signal: AbortSignal.timeout(tiempoLimiteMs) })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error(`${servicio} no respondió en ${tiempoLimiteMs / 1000} s`)
    }
    throw error
  }
}
