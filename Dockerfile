# syntax=docker/dockerfile:1.7
# Las dos imágenes de la aplicación, construidas desde la raíz del repositorio:
#   web   El sitio que compila Vite, servido por nginx, que además pasa /api a la API por el mismo origen.
#   api   Node + Express + Prisma. La misma imagen prepara la base (preparar-bd) antes de que arranque la API.
# compose.yaml elige cada una por su nombre. Railway construye la última etapa, así que la API va al final.
# Sin cachés de BuildKit (--mount=type=cache): Railway las rechaza si su id no lleva el del servicio.
# Las versiones van fijadas, como todo el proyecto (decisión de software 5); la de Node es la de .nvmrc.

ARG NODE_VERSION=24.11.1

FROM node:${NODE_VERSION}-bookworm-slim AS base
# Prisma necesita OpenSSL para su motor de migraciones, y la imagen slim no lo trae.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
# pnpm sale de «packageManager» en package.json.
RUN corepack enable
WORKDIR /app

# Las dependencias se descargan con el lockfile y nada más: mientras no cambie, esta capa sale de la caché.
FROM base AS dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch --frozen-lockfile
COPY . .

# ---------------------------------------------------------------- Web

# TypeScript está en la raíz del espacio de trabajo: el build de la web lo usa para revisar los tipos.
FROM dependencias AS web-construida
RUN pnpm install --offline --frozen-lockfile --filter @riego/web... --filter simulador-riego
# Vacía, la web llama a /api en su mismo origen y nginx lo pasa a la API. Con la API en otro dominio, su dirección
# sin /api al final (docker build --build-arg VITE_API=https://api.…).
ARG VITE_API=
RUN pnpm --filter @riego/web build

FROM nginx:1.28.0-alpine AS web
COPY herramientas/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY herramientas/docker/cabeceras.conf /etc/nginx/cabeceras.conf
COPY --from=web-construida /app/apps/web/dist /usr/share/nginx/html

# ---------------------------------------------------------------- API

# Al instalar, Prisma genera el cliente (postinstall) y descarga su motor de migraciones.
FROM dependencias AS api-construida
RUN pnpm install --offline --frozen-lockfile --filter @riego/api...

# Solo lo que la API usa: sus dependencias, el módulo de cálculo y su propio código. Corre con tsx, sin compilar,
# igual que en desarrollo.
FROM base AS api
ENV NODE_ENV=production CHECKPOINT_DISABLE=1
COPY --from=api-construida /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=api-construida /app/node_modules ./node_modules
COPY --from=api-construida /app/packages/calculo ./packages/calculo
COPY --from=api-construida /app/apps/api ./apps/api
COPY --chmod=755 herramientas/docker/preparar-bd.sh /usr/local/bin/preparar-bd
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/servidor.ts"]
