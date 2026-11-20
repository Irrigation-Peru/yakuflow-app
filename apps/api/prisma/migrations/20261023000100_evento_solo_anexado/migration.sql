-- El registro de actividad solo se agrega (decisión de software 4). Dos defensas:
-- 1. Disparadores que rechazan UPDATE, DELETE y TRUNCATE sobre evento, para cualquier usuario que no sea dueño
--    de la tabla con permiso para desactivarlos.
-- 2. Al rol de la aplicación, si existe, se le quitan UPDATE, DELETE y TRUNCATE. El rol se llama riego_app; en
--    producción la aplicación se conecta con él y las migraciones con el dueño de la base.

CREATE FUNCTION evento_solo_anexado() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de actividad solo admite agregar filas: % rechazado sobre evento', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evento_sin_modificar
  BEFORE UPDATE OR DELETE ON "evento"
  FOR EACH ROW EXECUTE FUNCTION evento_solo_anexado();

CREATE TRIGGER evento_sin_vaciar
  BEFORE TRUNCATE ON "evento"
  FOR EACH STATEMENT EXECUTE FUNCTION evento_solo_anexado();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'riego_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "evento" FROM riego_app;
  END IF;
END
$$;
