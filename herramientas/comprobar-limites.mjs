// Comprueba los límites entre las piezas del repositorio (HU0001). Corre en la integración continua.
// 1. El módulo de cálculo no tiene dependencias y solo importa sus propios archivos: nada de la aplicación
//    web, de la API ni de Node.
// 2. Las pantallas de la aplicación web no tienen fórmulas: todo resultado sale del módulo de cálculo.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const problemas = []

function archivos(carpeta, extensiones) {
  let lista = []
  let entradas
  try {
    entradas = readdirSync(carpeta)
  } catch {
    return lista
  }
  for (const nombre of entradas) {
    if (nombre === 'node_modules' || nombre === 'dist') continue
    const ruta = join(carpeta, nombre)
    if (statSync(ruta).isDirectory()) lista = lista.concat(archivos(ruta, extensiones))
    else if (extensiones.some((e) => nombre.endsWith(e))) lista.push(ruta)
  }
  return lista
}

const importaciones = (codigo) =>
  [...codigo.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    (m) => m[1] ?? m[2],
  )

// 1. El módulo de cálculo
const calculo = join(raiz, 'packages', 'calculo')
const paquete = JSON.parse(readFileSync(join(calculo, 'package.json'), 'utf8'))
if (Object.keys(paquete.dependencies ?? {}).length > 0) {
  problemas.push(`packages/calculo tiene dependencias: ${Object.keys(paquete.dependencies).join(', ')}`)
}
for (const archivo of archivos(join(calculo, 'src'), ['.ts'])) {
  for (const destino of importaciones(readFileSync(archivo, 'utf8'))) {
    if (!destino.startsWith('./') && !destino.startsWith('../')) {
      problemas.push(`${relative(raiz, archivo)} importa «${destino}»: el módulo de cálculo solo importa sus archivos`)
    }
  }
}

// 2. Las pantallas de la aplicación web
const FORMULAS = [
  [/\*\*/, 'potencia (**)'],
  [/Math\.(pow|sqrt|cbrt|exp|log\w*|sin|cos|tan|asin|acos|atan2?|hypot)\b/, 'función matemática'],
  [/\b(3\.1416|9\.81|0\.0004264|1\.85|4\.87|1\.852|4\.871)\b/, 'constante del método'],
]
for (const archivo of archivos(join(raiz, 'apps', 'web', 'src', 'pantallas'), ['.ts', '.tsx'])) {
  const lineas = readFileSync(archivo, 'utf8').split('\n')
  lineas.forEach((linea, i) => {
    if (/^\s*(\/\/|\*)/.test(linea)) return
    for (const [patron, que] of FORMULAS) {
      if (patron.test(linea)) problemas.push(`${relative(raiz, archivo)}:${i + 1} tiene una ${que}; el cálculo va en packages/calculo`)
    }
  })
}

if (problemas.length > 0) {
  console.error(problemas.join('\n'))
  process.exit(1)
}
console.log('Límites respetados: el módulo de cálculo no importa nada de afuera y las pantallas no tienen fórmulas.')
