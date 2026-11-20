import type { RequestHandler, Response } from 'express'
import { jwtVerify, SignJWT } from 'jose'
import type { Configuracion } from './configuracion.ts'
import { ErrorDeApi } from './errores.ts'

// La sesión es un JWT firmado en una cookie httpOnly: el código del navegador no la puede leer, así que un
// script inyectado no se la lleva.

const COOKIE = 'sesion'
const DURACION_S = 8 * 60 * 60

function opcionesDeCookie(config: Configuracion) {
  // SameSite=None exige Secure. Contra la falsificación de solicitudes protege además la cabecera X-Riego (app.ts).
  // Con la web y la API en sitios distintos, para el navegador la cookie es de otro sitio, y Safari la descarta si no
  // pide partición (CHIPS, desde Safari 26.2): el inicio de sesión respondía bien, pero la sesión no quedaba guardada.
  // Particionada, queda guardada para el sitio de la web, que es el único que llama a la API.
  return {
    httpOnly: true,
    secure: config.produccion || config.cookieEntreSitios,
    sameSite: config.cookieEntreSitios ? ('none' as const) : ('lax' as const),
    partitioned: config.cookieEntreSitios,
    path: '/',
  }
}

export async function abrirSesion(res: Response, config: Configuracion, usuarioId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_S}s`)
    .sign(config.secretoJwt)
  res.cookie(COOKIE, token, { ...opcionesDeCookie(config), maxAge: DURACION_S * 1000 })
}

export function cerrarSesion(res: Response, config: Configuracion) {
  const opciones = opcionesDeCookie(config)
  res.clearCookie(COOKIE, opciones)
  // Para el navegador, la particionada y la que no lo está son dos cookies distintas. Se borra también la de antes, sin
  // partición, que puede seguir viva hasta ocho horas: si no, quien salió seguiría con la sesión abierta.
  if (opciones.partitioned) res.clearCookie(COOKIE, { ...opciones, partitioned: false })
}

export function requiereSesion(config: Configuracion): RequestHandler {
  return async (req, res, siguiente) => {
    const token: unknown = req.cookies?.[COOKIE]
    if (typeof token !== 'string') throw new ErrorDeApi(401, 'sin_sesion', 'Inicia sesión para continuar')
    try {
      const { payload } = await jwtVerify(token, config.secretoJwt, { algorithms: ['HS256'] })
      if (typeof payload.sub !== 'string') throw new Error('sin sujeto')
      res.locals.usuarioId = payload.sub
    } catch {
      throw new ErrorDeApi(401, 'sin_sesion', 'Tu sesión venció; vuelve a iniciarla')
    }
    siguiente()
  }
}

export function usuarioDe(res: Response): string {
  return res.locals.usuarioId as string
}
