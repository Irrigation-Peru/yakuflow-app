// Crea en la API local una cuenta de demostración, solo para pruebas, y deja su correo y su contraseña en
// apps/web/.env.local (git lo ignora), de donde la pantalla de entrada los muestra en desarrollo. La contraseña se
// genera al azar la primera vez y no se imprime. Si la cuenta ya existe, comprueba que la contraseña siga sirviendo.
//
//   node herramientas/cuenta-de-demostracion.mjs [http://localhost:3000]
//
// Toma el dominio del correo y el código del curso de apps/api/.env. Nunca se corre contra la base del experimento.

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const ENV_WEB = join(raiz, 'apps', 'web', '.env.local')
const ENV_API = join(raiz, 'apps', 'api', '.env')
const api = process.argv[2] ?? 'http://localhost:3000'

const leerEnv = (ruta) =>
  existsSync(ruta)
    ? Object.fromEntries(
        readFileSync(ruta, 'utf8')
          .split(/\r?\n/)
          .filter((linea) => /^[A-Z_]+=/.test(linea))
          .map((linea) => [linea.slice(0, linea.indexOf('=')), linea.slice(linea.indexOf('=') + 1).trim()]),
      )
    : {}

const deLaApi = leerEnv(ENV_API)
const codigoCurso = (deLaApi.CODIGOS_CURSO ?? '').split(',')[0]?.trim()
if (!codigoCurso) throw new Error('apps/api/.env no tiene CODIGOS_CURSO: sin código de curso no se puede crear la cuenta')

let { VITE_DEMO_CORREO: correo, VITE_DEMO_CONTRASENA: contrasena } = leerEnv(ENV_WEB)
if (!correo || !contrasena) {
  correo = `demostracion@${deLaApi.DOMINIO_CORREO || 'undac.edu.pe'}`
  contrasena = randomBytes(15).toString('base64url')
  const anterior = existsSync(ENV_WEB) ? readFileSync(ENV_WEB, 'utf8').replace(/^VITE_DEMO_(CORREO|CONTRASENA)=.*\r?\n?/gm, '') : ''
  const bloque = `# Cuenta de demostración, solo para pruebas (herramientas/cuenta-de-demostracion.mjs). No se sube al repositorio.\nVITE_DEMO_CORREO=${correo}\nVITE_DEMO_CONTRASENA=${contrasena}\n`
  writeFileSync(ENV_WEB, anterior.replace(/^# Cuenta de demostración.*\r?\n?/gm, '') + (anterior && !anterior.endsWith('\n') ? '\n' : '') + bloque)
}

let cookie = ''
async function llamar(ruta, metodo = 'GET', cuerpo) {
  const respuesta = await fetch(`${api}/api${ruta}`, {
    method: metodo,
    headers: {
      'X-Riego': '1',
      Origin: deLaApi.ORIGEN_WEB || 'http://localhost:5173',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  const nuevas = respuesta.headers.getSetCookie().map((c) => c.split(';')[0])
  if (nuevas.length) cookie = nuevas.join('; ')
  const texto = await respuesta.text()
  return { estado: respuesta.status, datos: texto ? JSON.parse(texto) : null }
}

const creada = await llamar('/cuenta', 'POST', { correo, contrasena, nombres: 'Cuenta de demostración', codigoCurso })
if (creada.estado === 409) {
  const sesion = await llamar('/sesion', 'POST', { correo, contrasena })
  if (sesion.estado !== 200) {
    throw new Error(`${correo} ya existe con otra contraseña: borra VITE_DEMO_* de apps/web/.env.local y usa otro correo`)
  }
} else if (creada.estado !== 201) {
  throw new Error(`No se pudo crear la cuenta: ${creada.estado} ${creada.datos?.mensaje ?? ''}`)
}

// Como en la pantalla de entrada, crear la cuenta y aceptar el consentimiento van juntos.
const { datos: estado } = await llamar('/estado')
if (!estado.consentimiento) {
  const { datos } = await llamar('/consentimiento')
  const aceptado = await llamar('/consentimiento', 'POST', { version: datos.version })
  if (aceptado.estado >= 300) throw new Error(`No se pudo aceptar el consentimiento: ${aceptado.estado}`)
}

console.log(`Cuenta de demostración ${creada.estado === 201 ? 'creada' : 'comprobada'}: ${correo} (curso ${codigoCurso}).`)
console.log('La contraseña está en apps/web/.env.local y la pantalla de entrada la muestra en desarrollo.')
