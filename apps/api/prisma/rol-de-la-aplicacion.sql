-- Usuario restringido con el que se conecta la aplicación. Las migraciones las corre el dueño de la base
-- (URL_MIGRACIONES); la aplicación entra como riego_app (DATABASE_URL), que no puede modificar ni borrar el
-- registro de actividad ni tocar el historial de migraciones (decisión de software 4).
--
-- Se corre una vez, como dueño de la base, antes o después de las migraciones:
--   psql "$URL_MIGRACIONES" -v clave="la clave de riego_app" -f apps/api/prisma/rol-de-la-aplicacion.sql
-- Dentro de cada bloque DO todas las líneas van sangradas: así se pueden separar las sentencias por «;» al
-- final de una línea sin sangría.

CREATE ROLE riego_app LOGIN PASSWORD :'clave';

DO $$
  BEGIN
    GRANT USAGE ON SCHEMA public TO riego_app;
    -- Las tablas que creen las migraciones siguientes.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO riego_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO riego_app;
    -- Las que ya existen, si las migraciones se corrieron antes.
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO riego_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO riego_app;
    IF to_regclass('public.evento') IS NOT NULL THEN
      REVOKE UPDATE, DELETE, TRUNCATE ON evento FROM riego_app;
    END IF;
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
      REVOKE ALL ON _prisma_migrations FROM riego_app;
    END IF;
  END
$$;
