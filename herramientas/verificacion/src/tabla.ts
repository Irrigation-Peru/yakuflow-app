import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ERROR_ADMITIDO, todosLosCasos, type Comparacion } from './casos'

// Genera la tabla de verificación del módulo de cálculo (HU0004) en Markdown y en CSV, y termina con error
// si algún caso supera el error admitido. Se corre con `pnpm verificar` desde la raíz del repositorio.

const REDES = 100
const SEMILLA = 1

const porcentaje = (error: number) => `${(error * 100).toExponential(2)} %`

function aMarkdown(comparaciones: Comparacion[], descartadas: { semilla: number; motivo: string }[]) {
  const fuentes = [...new Set(comparaciones.map((c) => c.fuente))]
  const resumen = fuentes.map((fuente) => {
    const deLaFuente = comparaciones.filter((c) => c.fuente === fuente)
    const maximo = Math.max(...deLaFuente.map((c) => c.error))
    const cumplen = deLaFuente.filter((c) => c.error < ERROR_ADMITIDO).length
    return `| ${fuente} | ${new Set(deLaFuente.map((c) => c.caso)).size} | ${deLaFuente.length} | ${porcentaje(maximo)} | ${cumplen} de ${deLaFuente.length} |`
  })
  const filas = comparaciones.map(
    (c) =>
      `| ${c.fuente} | ${c.caso} | ${c.magnitud} | ${c.esperado} | ${c.obtenido} | ${porcentaje(c.error)} | ${c.error < ERROR_ADMITIDO ? 'Sí' : '**No**'} |`,
  )
  return [
    '# Tabla de verificación del módulo de cálculo',
    '',
    'Generada por `herramientas/verificacion` (`pnpm verificar`). No se edita a mano.',
    '',
    `Error admitido: **${porcentaje(ERROR_ADMITIDO)}** (una centésima de por ciento). El error es`,
    '|obtenido − esperado| / máx(|esperado|, escala). La escala solo pesa donde el valor esperado es casi nulo,',
    'como la presión al salir de una cámara rompe-presión: 0.5 m en presiones, 1e-6 l/s en tramos y 1e-3 l/h en',
    'emisores. Cuando la fuente publica un valor redondeado, el del módulo se redondea igual antes de comparar.',
    '',
    '## Fuentes',
    '',
    '1. **Método de diseño normalizado**: valores guardados del método de referencia.',
    '2. **FAO 56**: ejemplos 28 (coeficiente de cultivo por día) y 36 (agua útil y fácilmente aprovechable) del',
    '   Estudio FAO Riego y Drenaje N.º 56 (Allen et al., 1998).',
    `3. **EPANET 2.2** (OWA, compilado a WebAssembly por epanet-js): ${REDES} redes al azar con semilla ${SEMILLA}, calculadas con las`,
    '   ecuaciones de EPANET de los dos lados. De cada red se informa el nodo, el tramo y el emisor con mayor error.',
    '',
    '## Resumen',
    '',
    '| Fuente | Casos | Comparaciones | Error máximo | Dentro del error admitido |',
    '|---|---|---|---|---|',
    ...resumen,
    '',
    '## Redes no comparadas',
    '',
    'EPANET 2.2 deja que un emisor tome agua con presión negativa y el módulo no, así que se comparan solo redes',
    'donde todo emisor trabaja con al menos 0.5 m. Tampoco se comparan las redes donde EPANET no converge: le',
    'pasa cuando una válvula reductora está inactiva, porque su estado alterna entre abierta y activa.',
    '',
    '| Red | Motivo |',
    '|---|---|',
    ...descartadas.map((d) => `| ${d.semilla} | ${d.motivo} |`),
    '',
    '## Comparaciones',
    '',
    '| Fuente | Caso | Magnitud | Fuente dice | Módulo da | Error | Cumple |',
    '|---|---|---|---|---|---|---|',
    ...filas,
    '',
  ].join('\n')
}

function aCsv(comparaciones: Comparacion[]) {
  const celda = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replaceAll('"', '""')}"`)
  return [
    'fuente,caso,magnitud,esperado,obtenido,error_relativo,cumple',
    ...comparaciones.map((c) =>
      [c.fuente, c.caso, c.magnitud, c.esperado, c.obtenido, c.error, c.error < ERROR_ADMITIDO ? 'si' : 'no']
        .map(celda)
        .join(','),
    ),
    '',
  ].join('\n')
}

const { comparaciones, redesDescartadas } = await todosLosCasos({ redes: REDES, semilla: SEMILLA })
const carpeta = join(dirname(fileURLToPath(import.meta.url)), '..', 'resultados')
mkdirSync(carpeta, { recursive: true })
writeFileSync(join(carpeta, 'tabla-de-verificacion.md'), aMarkdown(comparaciones, redesDescartadas))
writeFileSync(join(carpeta, 'tabla-de-verificacion.csv'), aCsv(comparaciones))

const fallan = comparaciones.filter((c) => !(c.error < ERROR_ADMITIDO))
const maximo = Math.max(...comparaciones.map((c) => c.error))
console.log(
  `${comparaciones.length} comparaciones, error máximo ${porcentaje(maximo)}, ${fallan.length} fuera del error admitido.`,
)
console.log(`${REDES - redesDescartadas.length} de ${REDES} redes comparadas contra EPANET. Tabla en ${carpeta}`)
if (fallan.length > 0) process.exitCode = 1
