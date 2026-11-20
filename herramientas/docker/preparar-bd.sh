#!/bin/sh
# Deja la base lista antes de que arranque la API: el servicio «preparar» de compose.yaml y el preDeployCommand de
# railway.json (pnpm --filter @riego/api preparar-bd). Corre en cada despliegue; todo lo que hace se puede repetir.
# Se ejecuta desde apps/api: allí la deja el WORKDIR de la imagen y allí entra pnpm --filter.
# Necesita URL_MIGRACIONES (el dueño de la base) y DATABASE_URL (riego_app, con su clave).
set -eu
test -f prisma/schema.prisma || { echo 'preparar-bd se corre desde apps/api' >&2; exit 1; }
test -n "${URL_MIGRACIONES:-}" || { echo 'Falta URL_MIGRACIONES: las migraciones las corre el dueño de la base' >&2; exit 1; }
test -n "${DATABASE_URL:-}" || { echo 'Falta DATABASE_URL: la dirección con la que entra riego_app' >&2; exit 1; }

# 1. riego_app, si todavía no existe, con la clave de DATABASE_URL: así la base no necesita abrirse a internet para
#    crearlo. Va antes de las migraciones, para que la del registro de actividad le quite UPDATE y DELETE. Con Docker
#    ya lo creó crear-rol.sh y aquí no se toca. Los permisos son los de prisma/rol-de-la-aplicacion.sql.
CLAVE=$(node -e "
  const u = new URL(process.env.DATABASE_URL)
  if (u.username !== 'riego_app') { console.error('DATABASE_URL tiene que entrar como riego_app, no como ' + u.username); process.exit(1) }
  const clave = decodeURIComponent(u.password)
  if (!/^[A-Za-z0-9_-]{16,}$/.test(clave)) { console.error('La clave de riego_app: al menos 16 letras, números, - o _'); process.exit(1) }
  process.stdout.write(clave)
")
node_modules/.bin/prisma db execute --stdin <<SQL
DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'riego_app') THEN
      CREATE ROLE riego_app LOGIN PASSWORD '$CLAVE';
      GRANT USAGE ON SCHEMA public TO riego_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO riego_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO riego_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO riego_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO riego_app;
    END IF;
  END
\$\$;
SQL
unset CLAVE

# 2. Las migraciones, como dueño de la base (URL_MIGRACIONES).
node_modules/.bin/prisma migrate deploy

# 3. Lo que riego_app no puede tocar, aunque los permisos por omisión se lo hayan dado: el historial de migraciones y
#    modificar o borrar el registro de actividad (decisión de software 4).
node_modules/.bin/prisma db execute --stdin <<'SQL'
REVOKE ALL ON _prisma_migrations FROM riego_app;
REVOKE UPDATE, DELETE, TRUNCATE ON evento FROM riego_app;
SQL

# 4. El banco de ejemplo, si se pide y la base todavía no tiene uno. Para el estudio se carga el banco aprobado.
if [ "${CARGAR_BANCO_DE_EJEMPLO:-no}" = si ]; then
  node --import tsx src/instrumento/cargar-banco.ts instrumento/banco-de-ejemplo.json --borrador --si-falta
fi
