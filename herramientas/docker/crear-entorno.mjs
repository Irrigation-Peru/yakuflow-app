// Crea el .env de la raíz para docker compose a partir de .env.example: las claves salen al azar, y el código del
// curso y el contacto de OpenStreetMap se toman de apps/api/.env si existe. Si el .env ya existe, solo completa lo que
// le falta. Nunca muestra las claves.
//
//   node herramientas/docker/crear-entorno.mjs

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..', '..')
const destino = join(raiz, '.env')

const leer = (ruta) =>
  existsSync(ruta)
    ? Object.fromEntries(
        readFileSync(ruta, 'utf8')
          .split(/\r?\n/)
          .filter((l) => /^[A-Z_]+=/.test(l))
          .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {}

const actual = leer(destino)
const api = leer(join(raiz, 'apps', 'api', '.env'))
const alAzar = () => randomBytes(32).toString('base64url')
const propuesto = {
  CLAVE_BD: alAzar,
  CLAVE_RIEGO_APP: alAzar,
  JWT_SECRETO: alAzar,
  CODIGOS_CURSO: () => api.CODIGOS_CURSO ?? '',
  CONTACTO_OSM: () => api.CONTACTO_OSM ?? '',
}

const completadas = []
const lineas = readFileSync(join(raiz, '.env.example'), 'utf8')
  .split(/\r?\n/)
  .map((linea) => {
    const m = linea.match(/^([A-Z_]+)=(.*)$/)
    if (!m) return linea
    const [, nombre, ejemplo] = m
    if (actual[nombre]) return `${nombre}=${actual[nombre]}`
    const valor = propuesto[nombre]?.() || ejemplo
    if (valor && valor !== ejemplo) completadas.push(nombre)
    return `${nombre}=${valor}`
  })
// Lo que el .env tenía y el ejemplo no trae se queda, al final.
const enElEjemplo = new Set(lineas.map((l) => l.match(/^([A-Z_]+)=/)?.[1]))
for (const [nombre, valor] of Object.entries(actual)) if (!enElEjemplo.has(nombre)) lineas.push(`${nombre}=${valor}`)
writeFileSync(destino, `${lineas.join('\n').trimEnd()}\n`)

const faltan = lineas.filter((l) => /^[A-Z_]+=$/.test(l)).map((l) => l.slice(0, -1))
console.log(completadas.length ? `Completadas en .env: ${completadas.join(', ')}.` : 'El .env ya tenía todo lo que podía completarse solo.')
if (faltan.length) {
  console.log(`Falta escribir a mano en .env: ${faltan.join(', ')}.`)
  process.exitCode = 1
}
