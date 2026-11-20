-- Sprint 2: los datos del lugar (HU0009), la campaña (HU0011 y HU0012) y el diseño agronómico (HU0015).

-- El clima del mes guarda las normales con que se calcula la ET0, y de dónde salen.
ALTER TABLE "clima_mensual"
    ADD COLUMN "temp_max_c" DOUBLE PRECISION,
    ADD COLUMN "temp_min_c" DOUBLE PRECISION,
    ADD COLUMN "humedad_relativa_pct" DOUBLE PRECISION,
    ADD COLUMN "viento_ms" DOUBLE PRECISION,
    ADD COLUMN "radiacion_mj_m2_dia" DOUBLE PRECISION,
    ADD COLUMN "resolucion" TEXT;

-- El suelo guarda la granulometría de la que sale su clase, el pH y de dónde salen.
ALTER TABLE "suelo"
    ADD COLUMN "arena_pct" DOUBLE PRECISION,
    ADD COLUMN "limo_pct" DOUBLE PRECISION,
    ADD COLUMN "arcilla_pct" DOUBLE PRECISION,
    ADD COLUMN "ph" DOUBLE PRECISION,
    ADD COLUMN "fuente" TEXT,
    ADD COLUMN "resolucion" TEXT,
    ADD COLUMN "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- El catálogo de emisores se carga del módulo de cálculo: cada fila lleva su código.
ALTER TABLE "emisor_catalogo"
    ADD COLUMN "codigo" TEXT NOT NULL,
    ADD COLUMN "nombre" TEXT NOT NULL;
CREATE UNIQUE INDEX "emisor_catalogo_codigo_key" ON "emisor_catalogo"("codigo");

-- Una campaña y un diseño agronómico por proyecto.
CREATE UNIQUE INDEX "campania_proyecto_id_key" ON "campania"("proyecto_id");
CREATE UNIQUE INDEX "diseno_agronomico_proyecto_id_key" ON "diseno_agronomico"("proyecto_id");
