import '../entorno.ts'
import { readFileSync } from 'node:fs'
import { crearBd } from '../bd.ts'
import { cargarBanco } from './banco.ts'

// Carga el banco de ítems en la base: `pnpm --filter @riego/api cargar-banco <ruta del banco> [--borrador] [--si-falta]`.
// Sin --borrador, solo entra un banco aprobado por el juicio de expertos. Con --si-falta, solo si la base todavía no
// tiene uno: así lo usa el arranque con Docker (herramientas/docker/preparar-bd.sh).

const [ruta, ...opciones] = process.argv.slice(2)
const url = process.env.DATABASE_URL
if (!ruta || !url) {
  console.error('Uso: DATABASE_URL=… pnpm --filter @riego/api cargar-banco <ruta del banco.json> [--borrador] [--si-falta]')
  process.exit(1)
}

const bd = crearBd(url, 1)
try {
  if (opciones.includes('--si-falta') && (await bd.itemInstrumento.count()) > 0) {
    console.log('La base ya tiene un banco: no se toca.')
  } else {
    const revision = await cargarBanco(bd, JSON.parse(readFileSync(ruta, 'utf8')), { borrador: opciones.includes('--borrador') })
    console.log(revision.aprobado ? 'Banco aprobado y cargado.' : 'Banco cargado como BORRADOR. Le falta:')
    for (const o of revision.observaciones) console.log(`- ${o}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await bd.$disconnect()
}
