# Cómo correr el código

El código vive junto a la documentación, en un solo repositorio con espacios de trabajo de pnpm. Lo acordado
sobre el producto sigue en `lineamientos/decisiones-vigentes.md`; este archivo solo explica cómo levantar,
probar y desplegar la aplicación.

## Las piezas

```
packages/calculo           El módulo de cálculo. Sin dependencias ni framework: corre en el navegador, en el
                           worker y en las pruebas. No importa nada de apps/ (lo comprueba la integración continua).
herramientas/verificacion  Verificación del módulo contra el método normalizado, FAO 56 y EPANET (HU0004).
                           Escribe la tabla en herramientas/verificacion/resultados/.
herramientas/redes         Las redes de ejemplo con que se entrena el modelo sustituto (HU0025) y la evaluación de
                           punta a punta de sus propuestas. El entrenamiento está en el repositorio crop-ml.
packages/modelos           Los modelos ya exportados a ONNX y lo que los prepara y los usa en el navegador.
apps/api                   Node + Express 5 + Prisma: cuentas, consentimiento, pruebas, proyectos, registro de
                           actividad y la caché de los servicios externos (elevación y teselas del mapa).
apps/web                   React 19 + Vite: el recorrido del estudiante. El módulo de cálculo corre en un worker.
herramientas/comprobar-limites.mjs
                           Que el módulo no importe nada de afuera y que las pantallas no tengan fórmulas.
```

## Lo que necesitas

- **Node 24.11.1** (la versión está en `.nvmrc`).
- **pnpm 11.28.5**, que trae Node con corepack. Si `pnpm` no se reconoce como comando, antepón `corepack`
  (`corepack pnpm install`) o corre una vez `corepack enable`.
- **Fuera de OneDrive.** `node_modules` tiene miles de archivos y OneDrive los bloquea al sincronizar: clona el
  repositorio en una carpeta local, por ejemplo `C:\Users\<tú>\dev\`.

No hace falta instalar PostgreSQL ni Docker: para desarrollar y para las pruebas se usa PGlite, que es PostgreSQL
compilado a WebAssembly. Docker sirve para otra cosa: levantar la aplicación completa como quedaría en un servidor
(ver «Con Docker»).

## Primera vez

```bash
pnpm install                     # instala todo y genera el cliente de Prisma
cp apps/api/.env.example apps/api/.env
```

`DOMINIO_CORREO` y `ORIGEN_WEB` ya vienen con el valor para local. Completa el resto:

```
DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres?sslmode=disable
CODIGOS_CURSO=AGR-DEMO
JWT_SECRETO=<32 caracteres o más al azar>
CONTACTO_OSM=<correo del equipo>
```

El `.env` nunca se sube al repositorio. Tampoco ningún dato de un estudiante (Ley N.º 29733).

## Levantar la aplicación

Tres terminales:

```bash
pnpm --filter @riego/api bd-local      # 1. la base local en el puerto 5433 (los datos quedan en apps/api/.bd-local/)
pnpm --filter @riego/api migrar        #    una vez, y cada vez que llegue una migración nueva
pnpm --filter @riego/api cargar-banco instrumento/banco-de-ejemplo.json --borrador

pnpm --filter @riego/api dev           # 2. la API en http://localhost:3000
pnpm --filter @riego/web dev           # 3. la web en http://localhost:5173
```

`cargar-banco` sin `--borrador` solo acepta un banco aprobado: dos expertos conformes por ítem, las ocho
concepciones erróneas cubiertas y las formas A y B equilibradas. El banco de ejemplo trae ítems de muestra que no
son del instrumento.

**Documentación de la API.** Con la API en desarrollo, `http://localhost:3000/api/docs` abre Swagger UI con el
contrato en OpenAPI 3.1 (`/api/docs/openapi.json`). Los cuerpos salen de los mismos esquemas zod con que valida cada
ruta, y las pruebas comprueban que ninguna ruta quede sin documentar. Para probar las rutas con sesión, primero
`POST /api/sesion`: la cookie queda en el navegador. La página agrega sola la cabecera `X-Riego`. En producción no se
monta.

**Relieve.** La API busca primero en `apps/api/escenarios/` (el DEM del IGN ya extraído, ver su `LEEME.md`).
Fuera de esa cobertura pide la elevación a OpenTopoData (SRTM 30 m) y la guarda en la caché de la base: la
primera parcela tarda unos segundos y las siguientes salen de la caché. Nunca se mezclan dos fuentes en un mismo
cálculo.

## Con Docker

La aplicación completa en contenedores, con PostgreSQL de verdad: la base, la API y la web servida por nginx, que pasa
`/api` a la API por el mismo origen. Solo hace falta Docker con Compose.

```bash
node herramientas/docker/crear-entorno.mjs    # una vez: el .env de la raíz, con las claves al azar
docker compose up --build -d                  # la aplicación en http://localhost:8080
docker compose logs -f api                    # el registro técnico de la API
docker compose down                           # apaga todo; los datos quedan en el volumen riego_datos
```

`crear-entorno.mjs` toma de `.env.example` los nombres de las variables. Las claves las genera al azar, y el código
del curso y el contacto de OpenStreetMap los copia de `apps/api/.env` si existe; no muestra ninguna clave. El `.env`
nunca entra a una imagen (`.dockerignore`) ni al repositorio.

Al arrancar pasa esto, en orden:

1. **bd** (PostgreSQL 17). La primera vez, con el volumen vacío, crea `riego_app` con `apps/api/prisma/rol-de-la-aplicacion.sql`.
2. **preparar** corre las migraciones como dueño de la base y termina. Si `CARGAR_BANCO_DE_EJEMPLO=si`, carga el banco
   de ejemplo cuando la base todavía no tiene uno. Se puede repetir en cada arranque.
3. **api** entra como `riego_app`, igual que en el despliegue: no puede modificar ni borrar el registro de actividad.
   No publica su puerto.
4. **web** compila el sitio con Vite y lo sirve con las mismas cabeceras de `render.yaml`.

Es un modo de producción (`NODE_ENV=production`): la web no muestra la cuenta de demostración, y la cookie de sesión
es `Secure`. El navegador la acepta en `http://localhost`, pero no desde otra máquina por `http://`. Para servirla en
la red hace falta HTTPS delante.

Para el estudio, `CARGAR_BANCO_DE_EJEMPLO=no`, y el banco aprobado se carga antes de la primera respuesta:

```bash
docker compose run --rm -T preparar node --import tsx src/instrumento/cargar-banco.ts /dev/stdin < banco-aprobado.json
```

Para empezar de cero, `docker compose down -v` borra también la base.

## Pruebas

```bash
pnpm limites          # el módulo de cálculo no importa nada de afuera; las pantallas no tienen fórmulas
pnpm lint             # oxlint
pnpm tipos            # TypeScript en todas las piezas
pnpm test             # Vitest: módulo de cálculo, API (contra PGlite en memoria), web y verificación
pnpm verificar        # la tabla de verificación (HU0004); si cambia, se sube con el cambio que la movió

pnpm --filter @riego/web exec playwright install chromium     # una vez
pnpm --filter @riego/web e2e    # el recorrido en un navegador real, con una API de prueba sin internet
```

La integración continua (`.github/workflows/ci.yml`) corre todo esto en cada PR, y además comprueba que la tabla
de verificación del repositorio sea la que produce el código.

## Volver a entrenar el modelo sustituto

Cuando cambien los precios del catálogo, el módulo de cálculo o las modificaciones posibles, el modelo sustituto queda
desfasado: se vuelve a generar y entrenar. El entrenamiento corre en `crop-ml`; aquí solo quedan el ONNX y sus metadatos.

```bash
pnpm --filter @riego/redes generar ../crop-ml/data/redes_generadas.csv 400 16
# En crop-ml, con su entorno de Python:
python -I entrenamiento/sustituto.py --datos data/redes_generadas.csv --salida ../crop-app/packages/modelos
# De vuelta aquí: las métricas de punta a punta, contra elegir al azar con el mismo esfuerzo.
pnpm --filter @riego/redes evaluar 60
```

## Despliegue

Como lo pide `lineamientos/tecnologias.md`: la web en Render como sitio estático (`render.yaml`) y la API con su base
en Railway, en un dominio propio con los subdominios `app.` y `api.`. Todo lo que cambia de un despliegue a otro es una
variable de entorno: nada se escribe en el código ni en el repositorio.

Railway construye la API con el `Dockerfile` de la raíz, que lleva la API como última etapa. Desde 2026 los servicios
nuevos ya no leen `railway.json`: su contenido es la configuración que se aplicó al servicio (paso previo
`preparar-bd`, arranque, `/api/salud`, una réplica, sin dormir y cinco reintentos), y se mantiene como registro. Si se
cambia algo en el panel de Railway, se cambia también ahí.

### Orden

1. En Railway, crear PostgreSQL. Su dirección, la del dueño de la base, es `URL_MIGRACIONES`.
2. Elegir la clave del usuario de la aplicación, `riego_app`: al menos 16 letras, números, `-` o `_`. `DATABASE_URL`
   es la dirección de la base con ese usuario y esa clave. No hace falta crearlo a mano.
3. En Railway, el servicio de la API desde este repositorio, con las variables de la tabla. Antes de cada despliegue
   corre `pnpm --filter @riego/api preparar-bd`: crea `riego_app` si no existe, con la clave de `DATABASE_URL`, corre
   las migraciones como dueño y le quita a `riego_app` el historial de migraciones y la posibilidad de modificar o
   borrar el registro de actividad. Así la base no necesita abrirse a internet. Fuera de Railway, el usuario también
   se puede crear con `psql "$URL_MIGRACIONES" -v clave="…" -f apps/api/prisma/rol-de-la-aplicacion.sql`.
4. Cargar el banco de ítems aprobado (`pnpm --filter @riego/api cargar-banco <archivo>`). Sin él no hay prueba de entrada.
5. Si hay catálogo de precios real, `pnpm --filter @riego/api cargar-catalogo <archivo>`. Sin él vale el provisional
   del repositorio, que se marca como provisional en pantalla y en el informe.
6. En Render, el sitio desde `render.yaml`, con `VITE_API`.
7. El dominio: `app.<dominio>` a Render y `api.<dominio>` a Railway. Con eso, `COOKIE_ENTRE_SITIOS=no`.

### Variables de la API (Railway)

| Variable | Obligatoria | Qué es |
|---|---|---|
| `NODE_ENV` | Sí | `production`: activa la cookie segura, confía en el proxy y apaga `/api/docs` |
| `DATABASE_URL` | Sí | PostgreSQL como `riego_app` |
| `URL_MIGRACIONES` | Sí | PostgreSQL como dueño; solo la usa `preparar-bd` |
| `JWT_SECRETO` | Sí | Al menos 32 caracteres al azar |
| `DOMINIO_CORREO` | Sí | Dominio del correo institucional, por ejemplo `undac.edu.pe` |
| `CODIGOS_CURSO` | Sí | Códigos del curso, separados por comas |
| `ORIGEN_WEB` | Sí | `https://app.<dominio>`, sin barra final. Es el único origen al que CORS deja pasar |
| `CONTACTO_OSM` | Sí | Correo que se declara a OpenStreetMap en cada pedido de teselas |
| `COOKIE_ENTRE_SITIOS` | No (`no`) | `si` solo si la web y la API quedan en sitios distintos, como `onrender.com` y `up.railway.app` |
| `DOCUMENTACION_PUBLICA` | No | `si` abre Swagger UI en `/api/docs` en producción, y deja el contrato de la API a la vista de cualquiera. Se cierra quitando la variable |
| `SALTOS_DE_PROXY` | No (`1`) | Proxies delante de la API. Railway pone uno |
| `CONEXIONES_BD` | No (`10`) | Conexiones que abre la API; no deben pasar del tope del plan de la base |
| `VIGENCIA_CACHE_DIAS` | No (`365`) | Cuánto vale una respuesta guardada de clima, suelo y elevación (D13) |
| `LIMITE_REGISTROS_POR_IP` | No (`200`) | Cuentas nuevas por IP cada 15 minutos |
| `LIMITE_INTENTOS_DE_SESION` | No (`10`) | Intentos fallidos por correo cada 15 minutos |
| `LIMITE_TESELAS_POR_MINUTO` | No (`3000`) | Teselas del mapa por IP cada minuto |
| `NIVEL_REGISTRO` | No (`info`) | Nivel del registro técnico (Pino) |
| `PORT` | La pone Railway | Puerto en que escucha la API |

Un laboratorio entero sale a internet por una sola IP: el día de la sesión, los límites por IP tienen que alcanzar para
toda la sección. Con 40 estudiantes en el paso 1, 3000 teselas por minuto son unas 75 por estudiante.

`SECRETO_SEUDONIMO` no va en Railway: solo se usa al exportar, en la máquina de quien analiza.

### Variables de la web (Render)

| Variable | Qué es |
|---|---|
| `VITE_API` | `https://api.<dominio>`, sin `/api` al final. Se fija al compilar: si cambia, hay que volver a desplegar la web |
| `NODE_VERSION` | La de `.nvmrc`; ya está en `render.yaml` |

### En un solo servidor

`compose.yaml` levanta lo mismo en una máquina, con nginx que pasa `/api` a la API en el mismo origen. Las variables
opcionales de la tabla se ponen en el `.env` de la raíz; sin ellas valen lo indicado.

## Exportar el registro para el análisis

```bash
SECRETO_SEUDONIMO=<secreto del equipo> pnpm --filter @riego/api exportar datos-validacion/<fecha>
```

Sale sin identificadores: cada participante es un código HMAC del secreto, y solo entran quienes tienen el
consentimiento vigente. `datos-validacion/` está en `.gitignore`. El secreto se guarda aparte, porque con el
mismo secreto dos exportaciones dan los mismos códigos.
