# Datos reales de cultivos para el modelo de recomendación

Piloto del 6 de noviembre de 2026. El modelo entrenado con estos datos ya se exporta a `crop-app/packages/modelos`.

## Qué hay aquí

| Archivo | Contenido |
|---|---|
| `data/ena2024_sitio_cultivo.csv` | La data: una fila por lugar y cultivo (39 978 filas, 8 696 lugares) |
| `resultados/gravedad_15m.txt` | Evaluación completa con desnivel de al menos 15 m |
| `resultados/gravedad_30m.txt` | Evaluación completa con desnivel de al menos 30 m |
| `scripts/` | Los scripts del piloto, para reproducirlo |

## Uso recomendado para entrenar

1. Filtrar `aptoGoteo = 1`. Esto deja 7 469 lugares, los que cumplen el alcance de riego por gravedad.
2. Filtrar `enCatalogoActual = 1` mientras el catálogo tenga 8 cultivos. La app no puede calcular un cultivo que no esté en él. Quedan 13 254 filas de 5 860 lugares.
3. Usar `cultivo` como etiqueta y `cosechas` como `sample_weight`.
4. Usar como entradas solo estos 7 rasgos: `altitudM`, `temperaturaMediaAnualC`, `minimaDelMesMasFrioC`, `et0MediaMmDia`, `lluviaAnualMm`, `phDelSuelo` y `texturaGruesa`.
5. No usar `ofertaDeAguaMmDia` ni `conductividadDelAguaDsM`: valen lo mismo en todas las filas (ver limitaciones).
6. No usar `latitud` ni `longitud` como entradas. El modelo memorizaría lugares en vez de aprender condiciones.
7. Separar entrenamiento y prueba por `celdaClima`, nunca por fila. Si la misma zona cae en ambos lados, el resultado sale inflado.

## Modelo entrenado (HU0024)

`entrenamiento/cultivos.py` aplica la receta anterior, evalúa y exporta el modelo que usa la aplicación:

```bash
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r entrenamiento/requirements.txt
.venv/Scripts/python -I entrenamiento/cultivos.py --salida ../crop-app/packages/modelos
```

Validación cruzada por `celdaClima` con 5 particiones: 13 254 filas, 5 860 lugares y 211 zonas. Cada cifra es la media sobre zonas que el modelo no vio. El detalle está en `resultados/cultivos.json`.

| Estrategia | Exactitud en las tres primeras | F1 macro | La primera se cosecha en el lugar |
|---|---|---|---|
| Modelo real, 8 cultivos | 84,3 % | 0,182 | 88,2 % |
| Línea base: el más cosechado de la región | 81,1 % | 0,100 | 80,1 % |
| Tabla por altitud | 83,1 % | 0,145 | 86,4 % |

Cómo leer estas cifras:

- **Cumple HU0024:** supera a la línea base en las tres medidas, con separación geográfica.
- **La ventaja es pequeña.** Frente a una tabla por altitud gana 1,2 puntos en las tres primeras y 1,8 en la primera. La altitud explica casi todo.
- **F1 macro bajo.** Casi todo lo cosechado en estos lugares es papa y maíz, y el modelo apenas acierta los otros seis cultivos.
- **Por región.** En la selva no supera a la línea base (F1 0,131 en ambos) y en la costa queda igual o apenas por debajo en las tres primeras (96,9 % contra 97,3 %). La ganancia está en la sierra, que es el caso de estudio.
- **El 88,2 % no contradice al 69,3 % del piloto.** Aquí se cuentan los 5 860 lugares con algún cultivo del catálogo; el piloto contaba los 7 469 aptos, y 88,2 % × 5 860 / 7 469 = 69,2 %.

El modelo exportado se entrena con todos los datos, así que no tiene prueba propia: sus cifras son las de la validación cruzada. La diferencia máxima entre scikit-learn y ONNX es 1,2 × 10⁻⁷.

## Modelo sustituto (HU0025)

Ordena las modificaciones posibles de un diseño que ya funciona (diámetro o clase de un grupo de tramos) según lo que
estima de costo, uniformidad, margen de presión y si seguirá funcionando. No decide nada: en la aplicación, el módulo de
cálculo recalcula y pone a funcionar cada propuesta, y la que no cumple no aparece.

Las redes salen del propio módulo, con `herramientas/redes` de `crop-app` y la semilla 20261107: 400 redes al azar que
funcionan y 16 modificaciones de cada una, 6 400 filas en `data/redes_generadas.csv`. De los escenarios sorteados se
descartaron 344 porque el diseño generado no funcionaba. Las redes se generaron el 16 de noviembre de 2026 con el
generador vigente: portalateral por el centro de la parcela con un lateral a cada lado (o por el borde si así pide menos
cámaras rompe-presión), una válvula reguladora por curva de nivel, y el catálogo de precios `referencial-2026-11b`, que
cobra el lateral de goteo como manguera con gotero integrado. La versión del modelo es la huella SHA-256 del archivo de
datos: `redes-dbfa09a9`. La versión anterior, `redes-a167e14e`, se entrenó con el trazado por el borde y los precios
provisionales.

```bash
.venv/Scripts/python -I entrenamiento/sustituto.py --datos data/redes_generadas.csv --salida ../crop-app/packages/modelos
```

Bosque aleatorio de regresión con 30 árboles, profundidad 11 y 5 filas por hoja; el tamaño lo limita lo que pesa bajarlo
al navegador (984 KB). Validación cruzada por red con 5 particiones: ninguna red cae a la vez en entrenamiento y prueba.
El detalle está en `resultados/sustituto.json`. El 65,0 % de las modificaciones medidas deja una red que funciona.

| Salida | Error medio absoluto | Si estimara siempre la media | R² | Correlación dentro de cada red |
|---|---|---|---|---|
| Cambio de costo (%) | 2,31 | 6,75 | 0,83 | 0,92 |
| Uniformidad (puntos) | 2,12 | 5,50 | 0,67 | 0,89 |
| Margen de presión (m) | 0,93 | 2,27 | 0,72 | 0,86 |
| Funciona (0 o 1) | 0,25 | 0,46 | 0,48 | AUC 0,89 |

Con los precios de referencia, las modificaciones cambian menos el costo (la media de lo que varía bajó de 10,1 a 6,7
puntos), así que el R² del costo baja aunque el error absoluto también baja.

La medida que importa es la de punta a punta, sobre 60 redes nuevas: el modelo elige unas 16 de las 138 modificaciones
posibles por red y el módulo las verifica. Se compara con elegir las mismas al azar. El detalle está en
`resultados/sustituto-punta-a-punta.json`.

| | Modelo | Al azar, mismo esfuerzo |
|---|---|---|
| Pasan la verificación del módulo | 80,6 % | 67,4 % |
| Funcionan y mejoran en algo | 68,7 % | 33,7 % |
| Ahorro medio de la mejor alternativa | 6,0 % | 4,6 % |
| Redes con al menos una alternativa | 98,3 % | |

Cómo leer estas cifras:

- **Cumple HU0025:** registra costo, uniformidad y margen, se valida con redes no vistas y corre en el navegador.
- **Lo que se gana es no perder tiempo:** con el mismo número de recálculos, el doble de lo que se verifica sirve.
- **Los precios son de referencia, no una cotización.** Con el catálogo comercial de la región hay que volver a generar las
  redes y reentrenar.
- **Las modificaciones son de diámetro y clase por grupo de tramos.** No propone cámaras rompepresión ni cambiar el emisor.
- **El tiempo** se midió en Node: mediana 0,8 s y máximo 8 s por red, la mayor parte en recalcular. En la aplicación corre
  en el hilo del cálculo, sin bloquear la pantalla.

### Contraste con una regla experta (paper, Fig. 4)

`crop-app/herramientas/redes/src/contrastar.ts` compara, en 60 redes con la semilla 424242 y el mismo número de
recálculos por red, el modelo con el azar y con una regla experta. Salida en `resultados/sustituto-contraste.jsonl`;
resumen en `resultados/sustituto-contraste.txt`.

```bash
.venv/Scripts/python -I scripts/sustituto_contraste.py resultados/sustituto-contraste.jsonl
.venv/Scripts/python -I scripts/sustituto_figuras.py ../crop-app/packages/modelos resultados/sustituto-contraste.jsonl resultados
```

| | Modelo | Regla experta | Al azar |
|---|---|---|---|
| Funcionan y mejoran en algo | 66,6 % | 46,2 % | 34,1 % |
| Pasan la verificación | 78,5 % | 84,2 % | 64,8 % |
| Ahorro medio de la mejor | 7,3 % | 7,3 % | 5,5 % |

Diferencia pareada del modelo: +32,5 pp [26,5; 38,5] frente al azar (d = 1,40, gana en 57 de 60) y +20,3 pp [15,9; 24,8]
frente a la regla (d = 1,18, gana en 53 de 60); t pareada y Wilcoxon p < 10⁻⁸ en ambos. Con otras dos muestras de 60 redes
(semillas 1 y 777) y el mismo modelo: 72,0 % y 70,3 % con el modelo, 47,1 % y 47,6 % con la regla, 31,0 % y 33,9 % al
azar; frente a la regla, +24,9 [19,5; 30,2] y +22,7 [18,4; 27,0]. Las figuras son
`resultados/fig-sustituto-desempeno.png` y `resultados/fig-sustituto-contraste.png`.

## Tabla 4 del paper (modelo de cultivos)

`scripts/p9_tabla_paper.py` produce `resultados/tabla4_paper.{txt,json}`: el bosque contra la tabla por altitud, el
cultivo más común, la regla del catálogo y el bosque sintético previo, con IC por remuestreo de celdas. Necesita además
`sitios-cultivos.csv`, el conjunto sintético del modelo previo, que no se conserva en este repositorio; sin él, la fila del
bosque sintético no se puede regenerar. Los scripts auxiliares `altitud_catalogo.py`, `diag_regla_por_condicion.mts` y
`regla_corregida.mts` diagnostican por qué la regla declara sin cultivo apto el 16,5 % de los lugares.
`data/piloto/` guarda la climatología de POWER y los sitios del piloto que usan esos scripts (pasar `data` como carpeta).

Entorno probado: Python 3.13 con NumPy 2.5, scikit-learn 1.9, skl2onnx 1.20, SciPy y matplotlib.

## Columnas

| Columna | Significado |
|---|---|
| `sitio` | Segmento de la ENA, con prefijo E |
| `departamento` | Código INEI del departamento (19 es Pasco) |
| `region` | Costa, Sierra o Selva, según la ENA |
| `latitud`, `longitud` | Coordenada del segmento, no de la parcela |
| `desnivelDisponibleM` | Punto más alto a 900 m en 8 direcciones, menos la altitud del lugar |
| `aptoGoteo` | 1 si el desnivel es de al menos 15 m (`DESNIVEL_MINIMO_GOTEO_M`) |
| `aptoAspersion` | 1 si el desnivel es de al menos 30 m (`DESNIVEL_MINIMO_ASPERSION_M`) |
| `cultivo` | Cultivo cosechado. Los del catálogo usan el nombre del catálogo; los demás, el de la ENA |
| `enCatalogoActual` | 1 si es uno de los 8 cultivos del catálogo |
| `cosechas` | Registros de cosecha de ese cultivo en ese lugar |
| `cosechasBajoRiego` | Cuántos de esos registros no dependen solo de la lluvia |
| `superficieHa` | Superficie cosechada sumada, en hectáreas |
| `medianaKgHa` | Rendimiento mediano calculado de la ENA. Vacío si no se pudo calcular |
| `arenaPct`, `arcillaPct`, `limoPct` | Suelo de 0 a 30 cm, SoilGrids |
| `altitudM` a `texturaGruesa` | Los 9 rasgos, calculados con `rasgosDelLugar` del módulo de cálculo. `altitudM` va en metros |
| `top3Regla` | Los tres mejores cultivos según la regla del catálogo |
| `indiceMejorRegla` | Nota del mejor cultivo según la regla. 0 significa que ninguno es apto |
| `celdaClima` | Celda de NASA POWER, usada para separar zonas |

## Cómo se construyó

- **Cultivos:** ENA 2024, tabla de cosechas (`03_CAP200AB.csv`). Se conservan los 33 cultivos más cosechados.
- **Coca:** excluida de forma deliberada; no debe aparecer como recomendación.
- **Variedades:** las papas se agrupan en Papa. Maíz amiláceo, amarillo duro, choclo y morado se agrupan en Maíz, grano. Avena incluye grano y forrajera.
- **Clima:** climatología de NASA POWER por celda, con temperatura corregida por altitud (6,5 °C por km), como en la app. La lluvia es de POWER, no de SENAMHI.
- **Suelo:** SoilGrids 2.0, promedio ponderado de 0 a 30 cm.
- **Altitud:** Copernicus (Open-Meteo) para parte de la sierra y SRTM 90 m (OpenTopoData) para el resto y para el relieve.

## Resultados

Porcentaje de lugares donde la primera sugerencia sí se cosecha allí, probando en zonas que el modelo no vio. Lugares con desnivel de al menos 15 m:

| Estrategia | Gravedad, Perú | Costa | Sierra | Selva |
|---|---|---|---|---|
| Modelo real, 33 cultivos | 77,9 % | 55,3 % | 84,8 % | 72,6 % |
| Tabla por altitud, 33 cultivos | 72,3 % | 38,7 % | 80,1 % | 72,9 % |
| Modelo real, 8 cultivos | 69,3 % | 46,4 % | 82,4 % | 42,0 % |
| Tabla por altitud, 8 cultivos | 67,8 % | 42,7 % | 81,0 % | 42,0 % |
| Regla del catálogo, 8 cultivos | 32,5 % | 5,8 % | 42,2 % | 20,5 % |
| Modelo sintético actual | 17,1 % | 0,8 % | 24,5 % | 4,5 % |

## Limitaciones

- **Mide lo que se cultiva, no lo que conviene.** Refleja también tradición y mercado.
- **La ubicación es aproximada.** Es un punto por segmento, no la parcela.
- **El desnivel solo mide relieve.** No comprueba que exista una fuente de agua en el punto alto. Mezcla dos modelos de elevación, así que puede variar algunos metros cerca del umbral.
- **Oferta de agua y conductividad no tienen dato real.** Se usó un supuesto fijo: 2 l/s, 12 h, 1 ha y agua sin sales.
- **Es un año de encuesta.** La ENA 2024 es una muestra.
- **Modelo sin optimizar.** Se usaron los ajustes actuales: 30 árboles, profundidad 10, mínimo 10 por hoja.
- **Regla sin calibrar.** Para esta comparación la regla usa esos mismos supuestos, y clima de POWER.

## Reproducir

Los scripts reciben sus rutas como argumentos. Orden: `p5_nacional.py`, `p2_nac.mts`, `p7_relieve.py`, `p6g.py` y `p8_exportar.py`. Antes hay que descargar `ENA_2024.zip` de la Plataforma Nacional de Datos Abiertos. `p2_nac.mts` usa el módulo de cálculo de la aplicación. Los demás scripts corresponden a la primera etapa del piloto, solo en sierra.

## Fuentes y licencias

Citar al usar esta data:

- INEI, Encuesta Nacional Agropecuaria 2024, Plataforma Nacional de Datos Abiertos (ODbL).
- NASA POWER, climatología, Prediction of Worldwide Energy Resources.
- Poggio et al. (2021), SoilGrids 2.0, ISRIC.
- NASA SRTM 90 m, vía OpenTopoData; Copernicus DEM, vía Open-Meteo.

Por la licencia ODbL, si se publica una base derivada de esta, debe citar la fuente y mantener una licencia compatible.
