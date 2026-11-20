#!/bin/sh
# Crea riego_app, el usuario con el que entra la API, con el mismo SQL del despliegue
# (apps/api/prisma/rol-de-la-aplicacion.sql). La imagen de PostgreSQL corre este archivo una sola vez: cuando crea
# la base en un volumen vacío, antes de las migraciones.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v clave="$CLAVE_RIEGO_APP" -f /riego/rol-de-la-aplicacion.sql
