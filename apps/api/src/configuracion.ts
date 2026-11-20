import { z } from 'zod'

// Configuración de la API, leída del entorno. Nada de esto va al repositorio: los valores de cada ambiente
// viven en el panel del proveedor y, en desarrollo, en un .env que git ignora (ver .env.example).

export interface Configuracion {
  /** Dominio del correo institucional; se aceptan también sus subdominios. */
  dominioCorreo: string
  /** Códigos de curso con los que un estudiante puede crear su cuenta. */
  codigosCurso: readonly string[]
  secretoJwt: Uint8Array
  /** Origen de la aplicación web, el único al que se le permite llamar a la API con la cookie de sesión. */
  origenWeb: string
  /** Contacto que se declara a OpenStreetMap en cada pedido de teselas, como exige su política de uso. */
  contactoOsm: string
  produccion: boolean
  /**
   * La web y la API en sitios distintos (por ejemplo, onrender.com y up.railway.app): la cookie tiene que ser
   * SameSite=None. Con un dominio propio para las dos (app.… y api.…) es el mismo sitio y basta con Lax, que
   * además no depende de que el navegador acepte cookies de terceros.
   */
  cookieEntreSitios: boolean
  /**
   * Swagger UI y el contrato OpenAPI en /api/docs. Por omisión, solo fuera de producción; en producción se abre con
   * DOCUMENTACION_PUBLICA=si y se vuelve a cerrar quitando la variable, sin tocar el código.
   */
  documentacionPublica: boolean
  costoBcrypt: number
  /** Cuántos proxies hay delante de la API en producción; de ahí sale la IP del cliente para los límites. */
  saltosDeProxy: number
  /** Conexiones a PostgreSQL que abre la API. El plan de la base pone el tope. */
  conexionesBd: number
  /** Cuánto vale una respuesta guardada de los servicios de clima, suelo y elevación (D13). */
  vigenciaCacheMs: number
  limites: {
    /** Cuentas nuevas por IP cada 15 minutos. Un laboratorio entero sale por una sola IP. */
    registrosPorIp: number
    /** Intentos fallidos de inicio de sesión por correo cada 15 minutos. */
    intentosDeSesion: number
    /** Teselas del mapa por IP cada minuto, para toda una sección mirando el mapa a la vez. */
    teselasPorMinuto: number
  }
}

/** Lo que vale cada parámetro del despliegue si no se define: lo de desarrollo y de las pruebas. */
export const PARAMETROS_POR_OMISION = {
  saltosDeProxy: 1,
  conexionesBd: 10,
  vigenciaCacheMs: 365 * 24 * 60 * 60_000,
  limites: { registrosPorIp: 200, intentosDeSesion: 10, teselasPorMinuto: 3000 },
} satisfies Pick<Configuracion, 'saltosDeProxy' | 'conexionesBd' | 'vigenciaCacheMs' | 'limites'>

const P = PARAMETROS_POR_OMISION
const esquema = z.object({
  DOMINIO_CORREO: z.string().min(3),
  CODIGOS_CURSO: z.string().min(1),
  JWT_SECRETO: z.string().min(32, 'JWT_SECRETO necesita al menos 32 caracteres'),
  ORIGEN_WEB: z.url(),
  CONTACTO_OSM: z.string().min(3),
  COOKIE_ENTRE_SITIOS: z.enum(['si', 'no']).default('no'),
  NODE_ENV: z.string().optional(),
  DOCUMENTACION_PUBLICA: z.enum(['si', 'no']).optional(),
  // Lo que cambia de un despliegue a otro. Sin definir, valen lo que se usó en desarrollo y en las pruebas.
  SALTOS_DE_PROXY: z.coerce.number().int().min(0).default(P.saltosDeProxy),
  CONEXIONES_BD: z.coerce.number().int().min(1).default(P.conexionesBd),
  VIGENCIA_CACHE_DIAS: z.coerce.number().positive().default(P.vigenciaCacheMs / (24 * 60 * 60_000)),
  LIMITE_REGISTROS_POR_IP: z.coerce.number().int().min(1).default(P.limites.registrosPorIp),
  LIMITE_INTENTOS_DE_SESION: z.coerce.number().int().min(1).default(P.limites.intentosDeSesion),
  LIMITE_TESELAS_POR_MINUTO: z.coerce.number().int().min(1).default(P.limites.teselasPorMinuto),
})

export function leerConfiguracion(entorno: Record<string, string | undefined> = process.env): Configuracion {
  const e = esquema.parse(entorno)
  const produccion = e.NODE_ENV === 'production'
  return {
    dominioCorreo: e.DOMINIO_CORREO.toLowerCase(),
    codigosCurso: e.CODIGOS_CURSO.split(',').map((c) => c.trim()).filter(Boolean),
    secretoJwt: new TextEncoder().encode(e.JWT_SECRETO),
    origenWeb: e.ORIGEN_WEB.replace(/\/$/, ''),
    contactoOsm: e.CONTACTO_OSM,
    produccion,
    cookieEntreSitios: e.COOKIE_ENTRE_SITIOS === 'si',
    documentacionPublica: e.DOCUMENTACION_PUBLICA ? e.DOCUMENTACION_PUBLICA === 'si' : !produccion,
    costoBcrypt: 12,
    saltosDeProxy: e.SALTOS_DE_PROXY,
    conexionesBd: e.CONEXIONES_BD,
    vigenciaCacheMs: e.VIGENCIA_CACHE_DIAS * 24 * 60 * 60_000,
    limites: {
      registrosPorIp: e.LIMITE_REGISTROS_POR_IP,
      intentosDeSesion: e.LIMITE_INTENTOS_DE_SESION,
      teselasPorMinuto: e.LIMITE_TESELAS_POR_MINUTO,
    },
  }
}
