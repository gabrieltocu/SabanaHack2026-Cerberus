# Guía para contribuir en Cerberus

Aplicación web/PWA de N Club: Expo SDK 58, Expo Router, React Native Web y TypeScript
estricto, con una API propia en `api/` (función de Vercel) y un modo demo que ejecuta el mismo
manejador en el navegador.

## Expo cambia en cada SDK

Antes de usar una API de Expo o React Native, consulta la documentación de la versión instalada
(`https://docs.expo.dev/versions/v58.0.0/`) o el índice `https://docs.expo.dev/llms.txt`. Instala
paquetes con `npx expo install <paquete>` para obtener versiones compatibles con el SDK.

## Comandos

```bash
npm ci                    # dependencias exactas del lockfile
npm run dev               # servidor de desarrollo web (modo demostración local)
npm run verify            # secretos, auditoría, formato, lint, tipos, cobertura, integración, build web y E2E
npm run check:secrets     # busca cadenas con forma de credencial en archivos versionados o nuevos
npm run check:audit       # npm audit de producción: falla con vulnerabilidades altas o críticas no revisadas
npm run format:check      # Prettier (npm run format reescribe)
npm run test:coverage     # falla por debajo del 80 % en sentencias, ramas, funciones o líneas
npm run test:integration  # recorridos de la API sobre memoria y sobre un Upstash simulado
npm run build:web         # exporta la SPA a dist/
npm run build:web:api     # exporta la SPA en modo API (EXPO_PUBLIC_DATA_MODE=api) a dist-api/
npm run serve             # sirve dist/ con fallback SPA y la API en /api/v1 (puerto 4173)
npm run test:e2e          # Playwright: proyectos «mock» y «api» (este usa dos contextos como dos dispositivos)
npm run test:smoke        # Playwright contra un despliegue real; exige SMOKE_BASE_URL (solo lectura salvo SMOKE_WRITE=1)
```

`npm run serve` acepta `CERBERUS_RATE_LIMIT=off` para desactivar el límite de tasa en el servidor local de pruebas; no debe definirse en el despliegue. Las variables de servidor (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `CERBERUS_ROBOT_TOKEN`, `CERBERUS_RESET_ENABLED`) están descritas en `README.md`.

## Trampas conocidas

- **Metro en worktrees de Git.** Si el directorio de trabajo es un worktree dentro de otro repositorio, Metro puede resolver mal la carpeta de rutas. Arrancar con `EXPO_ROUTER_APP_ROOT=app`, por ejemplo `EXPO_ROUTER_APP_ROOT=app npx expo start --web` o `EXPO_ROUTER_APP_ROOT=app npm run build:web`.
- `EXPO_PUBLIC_DATA_MODE` se incrusta al construir: cambiarlo exige volver a construir.
- Un robot en falla no vuelve a acompañar hasta reiniciar la demostración; las pruebas que simulan la falla deben reiniciar el estado.

## Arquitectura y reglas

- `app/` contiene solo rutas de Expo Router; la lógica vive en `src/`.
- `src/domain/` es TypeScript puro: no importa React, Expo, `fetch` ni APIs de plataforma. El reloj
  y la aleatoriedad se inyectan.
- `src/api/` implementa el manejador HTTP agnóstico; `api/` solo lo adapta a Vercel.
- `src/infrastructure/` contiene contratos (Zod), clientes y almacenes.
- `src/design-system/` es la fuente única de tokens y primitivas visuales.
- Ninguna decisión de acceso se toma solo con el resultado facial; siempre se confirma con registros.
- Nunca se colocan secretos en variables `EXPO_PUBLIC_*`: todo lo que empieza así llega al navegador.
- Todo dato del repositorio es ficticio. No se suben fotografías ni datos biométricos reales.

## Flujo de trabajo

- Una rama por checkpoint: `slice/Cxx-CPyy-tema`. Se integra en `main` solo con CI en verde.
- Lógica nueva y correcciones empiezan con una prueba que falla.
- Los archivos compartidos (`package.json`, lockfile, `app.json`, `app/_layout.tsx`, `vercel.json`,
  `.github/workflows/`) se modifican en cambios dedicados y revisados.
- Commits en imperativo con el identificador del checkpoint, por ejemplo
  `feat(C01-CP02): clasificador de categorías`.
