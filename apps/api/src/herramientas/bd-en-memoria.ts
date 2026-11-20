import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { crearBd } from '../bd.ts'

// Una base PostgreSQL en memoria (PGlite) con las mismas migraciones que producción, servida por un socket para
// que Prisma la use como a cualquier otra. La usan las pruebas y el servidor de las pruebas de punta a punta:
// corren sin Docker y en la integración continua.

const MIGRACIONES = join(import.meta.dirname, '..', '..', 'prisma', 'migrations')

export async function bdEnMemoria({ puerto = 0 } = {}) {
  const pg = await PGlite.create()
  for (const carpeta of readdirSync(MIGRACIONES).filter((c) => /^\d/.test(c)).sort()) {
    await pg.exec(readFileSync(join(MIGRACIONES, carpeta, 'migration.sql'), 'utf8'))
  }
  // Cuando una consulta falla, el adaptador de Prisma descarta la conexión y abre otra antes de que el servidor
  // termine de cerrar la anterior: con el límite por defecto de una conexión, la nueva se rechazaría.
  const servidor = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: puerto, maxConnections: 4 })
  await servidor.start()
  // PGlite atiende una sesión a la vez: una sola conexión evita que dos transacciones se crucen.
  const bd = crearBd(`postgresql://postgres@${servidor.getServerConn()}/postgres?sslmode=disable`, 1)
  return {
    bd,
    async cerrar() {
      await bd.$disconnect()
      await servidor.stop()
      await pg.close()
    },
  }
}
