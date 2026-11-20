import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { join } from 'node:path'

// Base de datos para desarrollar sin instalar PostgreSQL ni Docker: PGlite (PostgreSQL compilado a WebAssembly)
// servido en un puerto local. Los datos quedan en apps/api/.bd-local/, que git ignora.
// `pnpm --filter @riego/api bd-local`, y en otra terminal `pnpm --filter @riego/api migrar`.

const PUERTO = Number(process.env.PUERTO_BD ?? 5433)
const pg = await PGlite.create(join(import.meta.dirname, '..', '..', '.bd-local'))
const servidor = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: PUERTO, maxConnections: 8 })
await servidor.start()
console.log(`Base local en postgresql://postgres@127.0.0.1:${PUERTO}/postgres?sslmode=disable`)

process.on('SIGINT', async () => {
  await servidor.stop()
  await pg.close()
  process.exit(0)
})
