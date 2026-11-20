-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Servicio" AS ENUM ('mapa', 'elevacion', 'suelo', 'clima');

-- CreateEnum
CREATE TYPE "TipoEmisor" AS ENUM ('gotero', 'aspersor');

-- CreateEnum
CREATE TYPE "NombreModelo" AS ENUM ('cultivos', 'optimizacion');

-- CreateEnum
CREATE TYPE "Forma" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "Grupo" AS ENUM ('control', 'experimental');

-- CreateEnum
CREATE TYPE "TipoEvaluacion" AS ENUM ('entrada', 'salida');

-- CreateEnum
CREATE TYPE "MetodoRiego" AS ENUM ('goteo', 'aspersion');

-- CreateEnum
CREATE TYPE "TipoFuente" AS ENUM ('canal', 'manantial', 'reservorio');

-- CreateEnum
CREATE TYPE "OrigenDato" AS ENUM ('campo', 'declarado');

-- CreateEnum
CREATE TYPE "OrigenRed" AS ENUM ('modulo', 'ml', 'estudiante');

-- CreateEnum
CREATE TYPE "Alcanza" AS ENUM ('si', 'parcial', 'no');

-- CreateEnum
CREATE TYPE "SalidaBalance" AS ENUM ('turnos', 'reservorio', 'menos_area', 'cambio_cultivo');

-- CreateEnum
CREATE TYPE "OrigenSuelo" AS ENUM ('satelital', 'campo');

-- CreateEnum
CREATE TYPE "OrdenTramo" AS ENUM ('matriz', 'principal', 'lateral');

-- CreateEnum
CREATE TYPE "TipoNodo" AS ENUM ('fuente', 'cabezal', 'union', 'emisor', 'crp', 'vrp');

-- CreateEnum
CREATE TYPE "TipoPartida" AS ENUM ('tuberia', 'emisor', 'accesorio', 'obra');

-- CreateTable
CREATE TABLE "cache_servicio_externo" (
    "id" UUID NOT NULL,
    "servicio" "Servicio" NOT NULL,
    "clave_consulta" TEXT NOT NULL,
    "respuesta" JSONB NOT NULL,
    "obtenido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_servicio_externo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cultivo" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "familia" TEXT,
    "kc_inicial" DOUBLE PRECISION NOT NULL,
    "kc_medio" DOUBLE PRECISION NOT NULL,
    "kc_final" DOUBLE PRECISION NOT NULL,
    "dias_por_etapa" JSONB NOT NULL,
    "profundidad_radicular_cm" DOUBLE PRECISION NOT NULL,
    "tolerancia_salinidad_ds_m" DOUBLE PRECISION,
    "altitud_min_msnm" DOUBLE PRECISION,
    "altitud_max_msnm" DOUBLE PRECISION,
    "temp_min_c" DOUBLE PRECISION,
    "temp_max_c" DOUBLE PRECISION,
    "fuente_dato" TEXT NOT NULL,

    CONSTRAINT "cultivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emisor_catalogo" (
    "id" UUID NOT NULL,
    "tipo" "TipoEmisor" NOT NULL,
    "caudal_nominal_lph" DOUBLE PRECISION NOT NULL,
    "presion_nominal_mca" DOUBLE PRECISION NOT NULL,
    "coeficiente_k" DOUBLE PRECISION NOT NULL,
    "exponente_x" DOUBLE PRECISION NOT NULL,
    "cv_fabricacion" DOUBLE PRECISION,
    "precio_unitario" DECIMAL(12,2),
    "proveedor" TEXT,

    CONSTRAINT "emisor_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_ml" (
    "id" UUID NOT NULL,
    "nombre" "NombreModelo" NOT NULL,
    "version" TEXT NOT NULL,
    "metricas" JSONB NOT NULL,
    "conjunto_entrenamiento" TEXT NOT NULL,
    "entrenado_en" TIMESTAMP(3) NOT NULL,
    "archivo_uri" TEXT NOT NULL,

    CONSTRAINT "modelo_ml_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tuberia_catalogo" (
    "id" UUID NOT NULL,
    "material" TEXT NOT NULL,
    "diametro_nominal_mm" DOUBLE PRECISION NOT NULL,
    "diametro_interno_mm" DOUBLE PRECISION NOT NULL,
    "clase_presion_pn" TEXT NOT NULL,
    "coeficiente_hazen_williams" DOUBLE PRECISION NOT NULL,
    "precio_unitario" DECIMAL(12,2),
    "proveedor" TEXT,
    "vigente_desde" DATE NOT NULL,

    CONSTRAINT "tuberia_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_instrumento" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "concepcion_erronea" TEXT NOT NULL,
    "nivel_cognitivo" TEXT NOT NULL,
    "forma" "Forma" NOT NULL,
    "alternativas" JSONB NOT NULL,
    "clave" TEXT NOT NULL,

    CONSTRAINT "item_instrumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "correo_institucional" TEXT NOT NULL,
    "contrasena_hash" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "codigo_curso" TEXT NOT NULL,
    "grupo" "Grupo",
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acceso" TIMESTAMP(3),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimiento" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "version_texto" TEXT NOT NULL,
    "aceptado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_en" TIMESTAMP(3),

    CONSTRAINT "consentimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoEvaluacion" NOT NULL,
    "forma" "Forma" NOT NULL,
    "iniciada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminada_en" TIMESTAMP(3),
    "puntaje" DOUBLE PRECISION,

    CONSTRAINT "evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuesta" (
    "id" UUID NOT NULL,
    "evaluacion_id" UUID NOT NULL,
    "item_instrumento_id" UUID NOT NULL,
    "alternativa_marcada" TEXT NOT NULL,
    "es_correcta" BOOLEAN NOT NULL,
    "segundos" INTEGER,

    CONSTRAINT "respuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" UUID NOT NULL,
    "proyecto_id" UUID,
    "paso" SMALLINT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB NOT NULL DEFAULT '{}',
    "ocurrido_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "paso_alcanzado" SMALLINT NOT NULL DEFAULT 1,
    "resultados_desactualizados" JSONB NOT NULL DEFAULT '[]',
    "estado" TEXT NOT NULL DEFAULT 'en_curso',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campania" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "cultivo_id" UUID NOT NULL,
    "fecha_siembra" DATE NOT NULL,
    "duracion_dias" INTEGER NOT NULL,
    "area_sembrada_ha" DOUBLE PRECISION NOT NULL,
    "marco_plantacion_m" TEXT,
    "numero_plantas" INTEGER,

    CONSTRAINT "campania_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diseno_agronomico" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "metodo" "MetodoRiego" NOT NULL,
    "emisor_catalogo_id" UUID NOT NULL,
    "espaciamiento_emisor_m" DOUBLE PRECISION NOT NULL,
    "espaciamiento_lateral_m" DOUBLE PRECISION NOT NULL,
    "lamina_neta_mm" DOUBLE PRECISION NOT NULL,
    "lamina_bruta_mm" DOUBLE PRECISION NOT NULL,
    "frecuencia_dias" INTEGER NOT NULL,
    "tiempo_riego_h" DOUBLE PRECISION NOT NULL,
    "area_mojada_pct" DOUBLE PRECISION,
    "intensidad_mm_h" DOUBLE PRECISION NOT NULL,
    "eficiencia_aplicacion" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "diseno_agronomico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuente_agua" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "tipo" "TipoFuente" NOT NULL,
    "caudal_lps" DOUBLE PRECISION NOT NULL,
    "cota_msnm" DOUBLE PRECISION NOT NULL,
    "conductividad_ds_m" DOUBLE PRECISION,
    "horas_disponibles_dia" DOUBLE PRECISION NOT NULL,
    "origen_dato" "OrigenDato" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "fuente_agua_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "informe" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "archivo_uri" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "generado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "informe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcela" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "poligono" JSONB NOT NULL,
    "area_ha" DOUBLE PRECISION NOT NULL,
    "pendiente_media_pct" DOUBLE PRECISION,
    "altitud_msnm" DOUBLE PRECISION,
    "centroide_lat" DOUBLE PRECISION NOT NULL,
    "centroide_lon" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recomendacion_cultivo" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "cultivo_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "probabilidad" DOUBLE PRECISION NOT NULL,
    "condiciones_parcela" JSONB NOT NULL,
    "rangos_cultivo" JSONB NOT NULL,
    "variable_mas_influyente" TEXT NOT NULL,
    "explicacion" TEXT NOT NULL,
    "modelo_ml_id" UUID NOT NULL,
    "generada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recomendacion_cultivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "red" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "origen" "OrigenRed" NOT NULL,
    "costo_total" DECIMAL(14,2),
    "uniformidad_pct" DOUBLE PRECISION,
    "presion_min_mca" DOUBLE PRECISION,
    "presion_max_mca" DOUBLE PRECISION,
    "verificada" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "red_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_hidrico" (
    "id" UUID NOT NULL,
    "campania_id" UUID NOT NULL,
    "semana" SMALLINT NOT NULL,
    "etapa_cultivo" TEXT NOT NULL,
    "demanda_bruta_m3" DOUBLE PRECISION NOT NULL,
    "lluvia_efectiva_mm" DOUBLE PRECISION NOT NULL,
    "oferta_m3" DOUBLE PRECISION NOT NULL,
    "deficit_m3" DOUBLE PRECISION NOT NULL,
    "alcanza" "Alcanza" NOT NULL,

    CONSTRAINT "balance_hidrico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_balance" (
    "id" UUID NOT NULL,
    "campania_id" UUID NOT NULL,
    "salida" "SalidaBalance" NOT NULL,
    "parametros" JSONB NOT NULL,
    "volumen_reservorio_m3" DOUBLE PRECISION,
    "area_ajustada_ha" DOUBLE PRECISION,
    "decidida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sector_riego" (
    "id" UUID NOT NULL,
    "diseno_agronomico_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "area_ha" DOUBLE PRECISION NOT NULL,
    "caudal_lps" DOUBLE PRECISION NOT NULL,
    "turno" SMALLINT NOT NULL,
    "duracion_h" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "sector_riego_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alternativa_ml" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "red_base_id" UUID NOT NULL,
    "red_propuesta_id" UUID NOT NULL,
    "modelo_ml_id" UUID NOT NULL,
    "criterio_mejorado" TEXT NOT NULL,
    "delta_costo" DOUBLE PRECISION NOT NULL,
    "delta_uniformidad" DOUBLE PRECISION NOT NULL,
    "delta_margen_presion" DOUBLE PRECISION NOT NULL,
    "cambios_por_tramo" JSONB NOT NULL,
    "verificada_por_modulo" BOOLEAN NOT NULL,
    "aceptada_por_estudiante" BOOLEAN,

    CONSTRAINT "alternativa_ml_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clima_mensual" (
    "id" UUID NOT NULL,
    "parcela_id" UUID NOT NULL,
    "mes" SMALLINT NOT NULL,
    "et0_mm_dia" DOUBLE PRECISION NOT NULL,
    "precipitacion_mm" DOUBLE PRECISION NOT NULL,
    "temp_media_c" DOUBLE PRECISION,
    "fuente" TEXT NOT NULL,
    "obtenido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clima_mensual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suelo" (
    "id" UUID NOT NULL,
    "parcela_id" UUID NOT NULL,
    "textura" TEXT NOT NULL,
    "capacidad_campo_pct" DOUBLE PRECISION NOT NULL,
    "punto_marchitez_pct" DOUBLE PRECISION NOT NULL,
    "densidad_aparente" DOUBLE PRECISION,
    "infiltracion_mm_h" DOUBLE PRECISION,
    "profundidad_efectiva_cm" DOUBLE PRECISION,
    "origen" "OrigenSuelo" NOT NULL,

    CONSTRAINT "suelo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tramo" (
    "id" UUID NOT NULL,
    "red_id" UUID NOT NULL,
    "nodo_inicio_id" UUID NOT NULL,
    "nodo_fin_id" UUID NOT NULL,
    "orden" "OrdenTramo" NOT NULL,
    "tuberia_catalogo_id" UUID NOT NULL,
    "longitud_inclinada_m" DOUBLE PRECISION NOT NULL,
    "caudal_lps" DOUBLE PRECISION,
    "velocidad_ms" DOUBLE PRECISION,
    "perdida_carga_m" DOUBLE PRECISION,
    "presion_entrada_mca" DOUBLE PRECISION,
    "presion_salida_mca" DOUBLE PRECISION,
    "cumple_clase" BOOLEAN,

    CONSTRAINT "tramo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabezal" (
    "id" UUID NOT NULL,
    "red_id" UUID NOT NULL,
    "tipo_filtro" TEXT NOT NULL,
    "perdida_filtro_m" DOUBLE PRECISION NOT NULL,
    "valvulas" JSONB NOT NULL,
    "perdida_total_m" DOUBLE PRECISION NOT NULL,
    "incluye_fertirrigacion" BOOLEAN NOT NULL,

    CONSTRAINT "cabezal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodo" (
    "id" UUID NOT NULL,
    "red_id" UUID NOT NULL,
    "tipo" "TipoNodo" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "cota_msnm" DOUBLE PRECISION NOT NULL,
    "presion_mca" DOUBLE PRECISION,
    "caudal_lps" DOUBLE PRECISION,

    CONSTRAINT "nodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto" (
    "id" UUID NOT NULL,
    "red_id" UUID NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "total" DECIMAL(14,2) NOT NULL,
    "generado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partida_presupuesto" (
    "id" UUID NOT NULL,
    "presupuesto_id" UUID NOT NULL,
    "tipo" "TipoPartida" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "partida_presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cache_servicio_externo_servicio_clave_consulta_key" ON "cache_servicio_externo"("servicio", "clave_consulta");

-- CreateIndex
CREATE UNIQUE INDEX "cultivo_nombre_key" ON "cultivo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "modelo_ml_nombre_version_key" ON "modelo_ml"("nombre", "version");

-- CreateIndex
CREATE UNIQUE INDEX "item_instrumento_codigo_key" ON "item_instrumento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_institucional_key" ON "usuario"("correo_institucional");

-- CreateIndex
CREATE UNIQUE INDEX "evaluacion_usuario_id_tipo_key" ON "evaluacion"("usuario_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_evaluacion_id_item_instrumento_id_key" ON "respuesta"("evaluacion_id", "item_instrumento_id");

-- CreateIndex
CREATE INDEX "evento_usuario_id_ocurrido_en_idx" ON "evento"("usuario_id", "ocurrido_en");

-- CreateIndex
CREATE UNIQUE INDEX "fuente_agua_proyecto_id_key" ON "fuente_agua"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "parcela_proyecto_id_key" ON "parcela"("proyecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "red_proyecto_id_version_key" ON "red"("proyecto_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "balance_hidrico_campania_id_semana_key" ON "balance_hidrico"("campania_id", "semana");

-- CreateIndex
CREATE UNIQUE INDEX "clima_mensual_parcela_id_mes_key" ON "clima_mensual"("parcela_id", "mes");

-- AddForeignKey
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion" ADD CONSTRAINT "evaluacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta" ADD CONSTRAINT "respuesta_evaluacion_id_fkey" FOREIGN KEY ("evaluacion_id") REFERENCES "evaluacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta" ADD CONSTRAINT "respuesta_item_instrumento_id_fkey" FOREIGN KEY ("item_instrumento_id") REFERENCES "item_instrumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campania" ADD CONSTRAINT "campania_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campania" ADD CONSTRAINT "campania_cultivo_id_fkey" FOREIGN KEY ("cultivo_id") REFERENCES "cultivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diseno_agronomico" ADD CONSTRAINT "diseno_agronomico_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diseno_agronomico" ADD CONSTRAINT "diseno_agronomico_emisor_catalogo_id_fkey" FOREIGN KEY ("emisor_catalogo_id") REFERENCES "emisor_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuente_agua" ADD CONSTRAINT "fuente_agua_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "informe" ADD CONSTRAINT "informe_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcela" ADD CONSTRAINT "parcela_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recomendacion_cultivo" ADD CONSTRAINT "recomendacion_cultivo_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recomendacion_cultivo" ADD CONSTRAINT "recomendacion_cultivo_cultivo_id_fkey" FOREIGN KEY ("cultivo_id") REFERENCES "cultivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recomendacion_cultivo" ADD CONSTRAINT "recomendacion_cultivo_modelo_ml_id_fkey" FOREIGN KEY ("modelo_ml_id") REFERENCES "modelo_ml"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "red" ADD CONSTRAINT "red_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_hidrico" ADD CONSTRAINT "balance_hidrico_campania_id_fkey" FOREIGN KEY ("campania_id") REFERENCES "campania"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_balance" ADD CONSTRAINT "decision_balance_campania_id_fkey" FOREIGN KEY ("campania_id") REFERENCES "campania"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sector_riego" ADD CONSTRAINT "sector_riego_diseno_agronomico_id_fkey" FOREIGN KEY ("diseno_agronomico_id") REFERENCES "diseno_agronomico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternativa_ml" ADD CONSTRAINT "alternativa_ml_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternativa_ml" ADD CONSTRAINT "alternativa_ml_red_base_id_fkey" FOREIGN KEY ("red_base_id") REFERENCES "red"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternativa_ml" ADD CONSTRAINT "alternativa_ml_red_propuesta_id_fkey" FOREIGN KEY ("red_propuesta_id") REFERENCES "red"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternativa_ml" ADD CONSTRAINT "alternativa_ml_modelo_ml_id_fkey" FOREIGN KEY ("modelo_ml_id") REFERENCES "modelo_ml"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clima_mensual" ADD CONSTRAINT "clima_mensual_parcela_id_fkey" FOREIGN KEY ("parcela_id") REFERENCES "parcela"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suelo" ADD CONSTRAINT "suelo_parcela_id_fkey" FOREIGN KEY ("parcela_id") REFERENCES "parcela"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramo" ADD CONSTRAINT "tramo_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "red"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramo" ADD CONSTRAINT "tramo_nodo_inicio_id_fkey" FOREIGN KEY ("nodo_inicio_id") REFERENCES "nodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramo" ADD CONSTRAINT "tramo_nodo_fin_id_fkey" FOREIGN KEY ("nodo_fin_id") REFERENCES "nodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramo" ADD CONSTRAINT "tramo_tuberia_catalogo_id_fkey" FOREIGN KEY ("tuberia_catalogo_id") REFERENCES "tuberia_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cabezal" ADD CONSTRAINT "cabezal_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "red"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodo" ADD CONSTRAINT "nodo_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "red"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_red_id_fkey" FOREIGN KEY ("red_id") REFERENCES "red"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partida_presupuesto" ADD CONSTRAINT "partida_presupuesto_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

