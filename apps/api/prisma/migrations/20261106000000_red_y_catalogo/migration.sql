-- La red guarda su definición y los cambios del estudiante; el catálogo de precios se versiona.
ALTER TABLE "red" ADD COLUMN "definicion" JSONB NOT NULL,
ADD COLUMN "sectores" JSONB NOT NULL,
ADD COLUMN "cambios" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "funciono" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "catalogo_precios" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "provisional" BOOLEAN NOT NULL,
    "fuente" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "cargado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogo_precios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalogo_precios_version_key" ON "catalogo_precios"("version");
