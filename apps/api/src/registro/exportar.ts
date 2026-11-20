import '../entorno.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { crearBd } from '../bd.ts'
import { exportarRegistro } from './exportacion.ts'

// Exporta el registro para el análisis, sin identificadores:
// `SECRETO_SEUDONIMO=… pnpm --filter @riego/api exportar <carpeta>`.
// La carpeta va fuera del repositorio o en datos-validacion/, que git ignora. El secreto lo guarda el equipo:
// con él, dos exportaciones dan los mismos códigos.

const [carpeta] = process.argv.slice(2)
const url = process.env.DATABASE_URL
const secreto = process.env.SECRETO_SEUDONIMO
if (!carpeta || !url || !secreto) {
  console.error('Uso: DATABASE_URL=… SECRETO_SEUDONIMO=… pnpm --filter @riego/api exportar <carpeta>')
  process.exit(1)
}

const bd = crearBd(url, 1)
try {
  const { eventos, respuestas } = await exportarRegistro(bd, secreto)
  const destino = resolve(carpeta)
  mkdirSync(destino, { recursive: true })
  writeFileSync(join(destino, 'eventos.csv'), eventos)
  writeFileSync(join(destino, 'respuestas.csv'), respuestas)
  console.log(`Exportado en ${destino}. No subas estos archivos al repositorio.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await bd.$disconnect()
}
