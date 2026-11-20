// Llamadas a la API. La sesión viaja en una cookie httpOnly; la cabecera X-Riego le dice a la API que la
// solicitud sale de la aplicación y no de otro sitio.

const BASE = import.meta.env.VITE_API ?? ''

export class ErrorDeApi extends Error {
  readonly estado: number
  readonly codigo: string
  readonly datos: Record<string, unknown>

  constructor(estado: number, codigo: string, mensaje: string, datos: Record<string, unknown>) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
    this.datos = datos
  }
}

export async function api<T>(ruta: string, { metodo = 'GET', cuerpo }: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(`${BASE}/api${ruta}`, {
      method: metodo,
      credentials: 'include',
      headers: { 'X-Riego': '1', ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new ErrorDeApi(0, 'sin_conexion', 'No hay conexión con el servidor; revisa tu internet', {})
  }
  if (respuesta.status === 204) return undefined as T
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
  if (!respuesta.ok) {
    throw new ErrorDeApi(respuesta.status, String(datos.codigo ?? 'error'), String(datos.mensaje ?? 'Algo salió mal'), datos)
  }
  return datos as T
}

export const URL_DE_TESELAS = `${BASE}/api/teselas/{z}/{x}/{y}.png`
