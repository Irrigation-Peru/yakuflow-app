import { defineConfig } from 'prisma/config'

// Prisma 7 ya no lee el .env por su cuenta.
try {
  process.loadEnvFile()
} catch {
  // Sin .env: las variables ya están en el entorno.
}

// Prisma 7 toma la conexión de aquí y no del esquema. La URL viene del entorno; nunca se escribe en el repositorio.
// Las migraciones las corre el dueño de la base (URL_MIGRACIONES); la aplicación entra con DATABASE_URL como
// riego_app, que no puede modificar el registro de actividad (prisma/rol-de-la-aplicacion.sql). En local, sin
// URL_MIGRACIONES, las dos son la misma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.URL_MIGRACIONES || process.env.DATABASE_URL || '' },
})
