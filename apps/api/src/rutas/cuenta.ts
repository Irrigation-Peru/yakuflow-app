import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import type { Bd } from '../bd.ts'
import type { Configuracion } from '../configuracion.ts'
import { ErrorDeApi } from '../errores.ts'
import { estadoDelRecorrido } from '../recorrido.ts'
import { abrirSesion, cerrarSesion, requiereSesion, usuarioDe } from '../sesion.ts'

// HU0006, criterio 1: la cuenta se crea con el correo institucional y queda vinculada al código del curso.

const correo = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido'))
// bcrypt solo mira los primeros 72 bytes: una contraseña más larga se aceptaría con cualquier final.
const contrasena = z
  .string()
  .min(10, 'La contraseña necesita al menos 10 caracteres')
  .refine((c) => new TextEncoder().encode(c).length <= 72, 'La contraseña no puede pasar de 72 bytes')

export const datosDeCuenta = z.object({
  correo,
  contrasena,
  nombres: z.string().trim().min(1).max(120),
  codigoCurso: z.string().trim().min(1).max(40),
})

export const datosDeSesion = z.object({ correo, contrasena: z.string().min(1).max(200) })

function esDelDominio(correo: string, dominio: string) {
  const sitio = correo.slice(correo.lastIndexOf('@') + 1)
  return sitio === dominio || sitio.endsWith(`.${dominio}`)
}

export function rutasDeCuenta(bd: Bd, config: Configuracion) {
  const rutas = Router()
  // Para comparar en el mismo tiempo exista o no la cuenta, y no revelar qué correos están registrados.
  const hashDeRelleno = bcrypt.hashSync('relleno para igualar tiempos', config.costoBcrypt)

  // Un laboratorio entero sale a internet por una sola IP: el límite de registros por IP tiene que alcanzar
  // para toda una sección. El de inicio de sesión se cuenta por correo, y solo cuenta los intentos fallidos.
  const limiteDeRegistro = rateLimit({ windowMs: 15 * 60_000, limit: config.limites.registrosPorIp, standardHeaders: 'draft-8', legacyHeaders: false })
  const limiteDeSesion = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.limites.intentosDeSesion,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => String(req.body?.correo ?? '').trim().toLowerCase(),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ codigo: 'demasiados_intentos', mensaje: 'Demasiados intentos; espera unos minutos' })
    },
  })

  rutas.post('/cuenta', limiteDeRegistro, async (req, res) => {
    const datos = datosDeCuenta.parse(req.body)
    if (!esDelDominio(datos.correo, config.dominioCorreo)) {
      throw new ErrorDeApi(400, 'correo_no_institucional', `Usa tu correo de la universidad (@${config.dominioCorreo})`)
    }
    if (!config.codigosCurso.includes(datos.codigoCurso)) {
      throw new ErrorDeApi(400, 'curso_desconocido', 'Ese código de curso no existe; pídeselo a tu docente')
    }
    if (await bd.usuario.findUnique({ where: { correoInstitucional: datos.correo } })) {
      throw new ErrorDeApi(409, 'cuenta_existente', 'Ya existe una cuenta con ese correo; inicia sesión')
    }
    const usuario = await bd.usuario.create({
      data: {
        correoInstitucional: datos.correo,
        contrasenaHash: await bcrypt.hash(datos.contrasena, config.costoBcrypt),
        nombres: datos.nombres,
        codigoCurso: datos.codigoCurso,
        ultimoAcceso: new Date(),
      },
    })
    await abrirSesion(res, config, usuario.id)
    res.status(201).json(await estadoDelRecorrido(bd, usuario.id))
  })

  rutas.post('/sesion', limiteDeSesion, async (req, res) => {
    const datos = datosDeSesion.parse(req.body)
    const usuario = await bd.usuario.findUnique({ where: { correoInstitucional: datos.correo } })
    const valida = await bcrypt.compare(datos.contrasena, usuario?.contrasenaHash ?? hashDeRelleno)
    if (!usuario || !valida) throw new ErrorDeApi(401, 'credenciales_invalidas', 'El correo o la contraseña no coinciden')
    await bd.usuario.update({ where: { id: usuario.id }, data: { ultimoAcceso: new Date() } })
    await abrirSesion(res, config, usuario.id)
    res.json(await estadoDelRecorrido(bd, usuario.id))
  })

  rutas.delete('/sesion', (_req, res) => {
    cerrarSesion(res, config)
    res.status(204).end()
  })

  rutas.get('/estado', requiereSesion(config), async (_req, res) => {
    const usuario = await bd.usuario.findUniqueOrThrow({ where: { id: usuarioDe(res) } })
    res.json({
      usuario: { id: usuario.id, nombres: usuario.nombres, correo: usuario.correoInstitucional },
      ...(await estadoDelRecorrido(bd, usuario.id)),
    })
  })

  return rutas
}
