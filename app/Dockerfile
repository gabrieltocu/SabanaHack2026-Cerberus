# syntax=docker/dockerfile:1
# Imagen autocontenida de N Club: web exportada, API v1, API del club y base SQLite en /data.
# Construcción:  docker build -t nclub-api .   (o podman build -t nclub-api .)

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN EXPO_PUBLIC_DATA_MODE=api npx expo export -p web --output-dir dist-api
# Servidor a un solo archivo. El banner da `require` a las dependencias CommonJS del bundle ESM.
RUN node_modules/.bin/esbuild scripts/serve.ts --bundle --platform=node --format=esm \
      --target=node22 --packages=bundle --external:'node:*' \
      --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
      --outfile=server.mjs

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/server.mjs /app/vercel.json ./
COPY --from=build /app/dist-api ./dist-api
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production \
    SQLITE_PATH=/data/nclub.db \
    SEED_FIXED=1 \
    CERBERUS_RESET_ENABLED=false \
    DIST=dist-api \
    HOST=0.0.0.0 \
    PORT=8080 \
    TZ=America/Bogota \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/club-health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
