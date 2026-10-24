# N Club

Recepción asistida por robots para N Club, construida para Sabana Hack 2026. Cerberus es una aplicación web instalable (PWA) con una API propia que clasifica a cada persona que llega al club, la orienta según su categoría y, si el robot falla, entrega la visita a una persona del equipo sin perder el contexto.

La [integración en vivo con SABANAHACK2026](docs/api/SABANAHACK.md) conecta el cerebro Python y la simulación con esta API: identidades del equipo, fotos consentidas, pases QR, sesión del robot, eventos y confirmaciones desde la app. El modo `CERBERUS_DATA_SOURCE=sabana` utiliza ese padrón y no siembra actividades, turnos ni órdenes ficticias.

## El reto

El reconocimiento facial con el que cuenta el club solo responde si una persona es **miembro** o **no miembro**. El club necesita más: distinguir cinco categorías (**VIP, regular, invitado, personal del club y trabajador externo**) y adaptar a cada una el saludo, el destino y el acompañamiento.

Cerberus resuelve esa diferencia en dos etapas:

1. La señal facial es solo una **pista**: miembro, no miembro, desconocido o error.
2. El servidor **confirma la categoría con los registros del club**: membresía, turno de personal, permiso de trabajador externo o invitación con QR. Si el registro no respalda la pista, el resultado es una revisión manual o una denegación explicada; nunca un acceso.

**El rostro nunca autoriza por sí solo.** Toda confirmación incluye al menos una evidencia de registro (ADR 0003).

Cuando el robot que acompaña a un visitante falla, la visita pasa por un relevo explícito (solicitado, aceptado, con contexto transferido y confirmado) hasta una persona del equipo. El responsable de la visita cambia únicamente al confirmar el relevo (ADR 0004).

## Demostración en vivo

- Aplicación y API: <https://n-club-five.vercel.app>
- Estado de la API (solo lectura): <https://n-club-five.vercel.app/api/v1/health>

El modo de demostración usa datos ficticios. El modo integrado usa el padrón del equipo y las invitaciones registradas en la app; las imágenes permanecen fuera de Git. La portada indica en su pie si la interfaz trabaja en **modo API** (estado compartido entre dispositivos) o en **modo demostración local** (estado solo en ese navegador); ver [Modos de datos](#modos-de-datos).

## Probar en dos minutos

Rutas reales de la aplicación: `/` (lleva a `/entrar`), `/demo` (selector de perfiles), `/robot` (kiosco), `/edecan` (panel del edecán), `/socio` (inicio del socio), `/socio/invitar`, `/pase/<token>`, `/personal` y `/actividades`.

1. Abrir `/demo` y elegir la tarjeta **Robot R1** (abre `/robot`).
2. Pulsar **Comenzar** y, en el panel «Rostro a reconocer», **Andrés · miembro**. La pantalla pregunta «Andrés, ¿eres tú?» y muestra la evidencia que lo respalda («Membresía vigente»). Pulsar **Sí, soy yo**.
3. Elegir **Café**, **Continuar**, **Ir a mi reserva del salón** y **Sí, con R2**. El kiosco pasa a «Robot R2 · Acompañando».
4. Abrir `/demo` en una segunda pestaña y elegir **Sofía** (abre `/edecan`).
5. En el kiosco, abrir **Operación** y pulsar **Reportar falla del robot**. En el panel de Sofía aparece «Relevo solicitado»: pulsar **Aceptar relevo**, **Recibí el contexto**, **Confirmar relevo** y **Sí, asumo la visita**.
6. Para comprobar que el rostro no basta: en el kiosco, abrir **Operación**, pulsar **Reiniciar esta visita**, luego **Comenzar** y **Rostro desconocido**. El resultado es «No pude confirmar tu identidad», con las salidas **Usar mi QR** y **Pedir ayuda**; no se abre ninguna visita confirmada.

El guion completo para presentar ante el jurado está en [`docs/demo/DEMO-SCRIPT.md`](docs/demo/DEMO-SCRIPT.md).

## Arquitectura en diez líneas

1. Monolito modular en TypeScript estricto: una SPA estática (Expo Router + React Native Web) y una única función serverless para la API ([ADR 0001](docs/adr/0001-architecture.md)).
2. `src/domain/` es TypeScript puro (clasificación, máquinas de estado de visita y relevo, ventanas horarias de Bogotá); el reloj y la aleatoriedad se inyectan.
3. `src/api/` implementa un manejador HTTP agnóstico de plataforma (`handle(req) → res`) con rutas bajo `/api/v1`, validación con Zod, idempotencia y límite de tasa.
4. `api/router.ts` solo adapta ese manejador a Vercel; no contiene reglas de negocio.
5. `src/infrastructure/` contiene los esquemas Zod (contrato fuente), los clientes (HTTP y en proceso) y los almacenes (memoria, `localStorage`, Upstash Redis).
6. Cada visita es un único registro (invitación, historial y relevos incluidos) que se escribe con compare-and-set; así dos aceptaciones simultáneas de un relevo tienen exactamente un ganador ([ADR 0002](docs/adr/0002-mocks-api.md), [ADR 0004](docs/adr/0004-qr-handoff.md)).
7. El mismo manejador corre en el servidor y, con un almacén en `localStorage`, dentro del navegador (modo demostración local): un solo contrato, sin mocks que se desvíen.
8. `src/features/` y `app/` contienen las pantallas; `src/design-system/` es la fuente única de tokens y componentes.
9. Diagramas: [contexto (C4 nivel 1)](docs/architecture/C4-context.md) y [contenedores (C4 nivel 2)](docs/architecture/C4-containers.md).
10. Especificaciones de dominio: [matriz de categorías](docs/domain/categories-matrix.md), [invitaciones y QR](docs/domain/invitations-qr.md) y [estados de visita y relevo](docs/domain/visit-handoff-states.md).

## Modos de datos

`EXPO_PUBLIC_DATA_MODE` se resuelve **al construir** la aplicación (`npm run build:web`, `npm run dev`): Expo incrusta su valor en el paquete del navegador.

| Variable                | Valor                       | Efecto                                                                                                           |
| ----------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_DATA_MODE` | `mock` (o sin definir)      | La API se ejecuta dentro del navegador con `localStorage`. Las pestañas del mismo navegador comparten el estado. |
| `EXPO_PUBLIC_DATA_MODE` | `api`                       | La interfaz llama a `/api/v1` y consulta cada 3 s. Con Redis, el estado se comparte entre dispositivos.          |
| `EXPO_PUBLIC_API_URL`   | origen de la API (opcional) | Solo en modo `api`; por defecto, el mismo origen.                                                                |

- **Demostración local** (sin servidor): `npm run dev`. La interfaz lo rotula como «Modo demostración local».
- **API local con la interfaz**: `npm run build:web:api` exporta la aplicación en modo API (`EXPO_PUBLIC_DATA_MODE=api`) a `dist-api/`; `npm run serve` (puerto 4173) monta la API en `/api/v1` con almacén en memoria. Para pruebas locales, `CERBERUS_RATE_LIMIT=off` desactiva el límite de tasa.
- **Desplegado**: `vercel.json` construye la interfaz con `EXPO_PUBLIC_DATA_MODE=api`; el servidor responde con Redis cuando están definidas las credenciales de Upstash; la cabecera `X-Cerberus-Storage` y `GET /api/v1/health` informan el almacén en uso (`memory`, `redis` o `browser`).

Las variables `EXPO_PUBLIC_*` son públicas: llegan al navegador. Los secretos del servidor nunca llevan ese prefijo.

## API para integradores

La API v1 está bajo `/api/v1`. La guía de integración es [`docs/api/CONTRACT.md`](docs/api/CONTRACT.md) y la descripción formal, [`docs/api/openapi.yaml`](docs/api/openapi.yaml) (OpenAPI 3.1). Una prueba de contrato comprueba que ejemplos, esquemas Zod y rutas coinciden con esos documentos.

Resumen de lo que un integrador (el robot X2 o el servicio de reconocimiento facial) necesita:

| Necesidad                        | Cómo                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Comprobar el servicio            | `GET /api/v1/health` (contrato, almacén, reloj de la demostración, commit desplegado).                                |
| Enviar la señal facial           | `POST /api/v1/recognition/events` con `source: { kind: "ROBOT", id: "R1" }` y la señal (`MATCH`, `UNKNOWN`, `ERROR`). |
| Verificar el QR de un invitado   | `POST /api/v1/access/verify`.                                                                                         |
| Avanzar, cerrar o evaluar visita | `POST /api/v1/visits/{id}/advance`, `/close`, `/feedback`.                                                            |
| Avisar de una falla              | `POST /api/v1/robots/{id}/failure` (crea un relevo por cada visita abierta del robot).                                |
| Gestionar relevos                | `GET /api/v1/handoffs` y `POST /api/v1/handoffs/{id}/accept`, `/context`, `/confirm`, `/cancel`.                      |

Cabeceras que importan:

- **`X-Demo-Actor`**: identificador del directorio (`V-209`, `U-02`, `R1`, `O-01`). Es **declarativa y no verificable**: la demostración no tiene autenticación real, pero cada operación admite solo los tipos de actor que le corresponden (403 `ACTOR_NOT_ALLOWED` al resto).
- **`Idempotency-Key`** (8 a 128 caracteres): obligatoria en `POST /invitations`, `/recognition/events`, `/access/verify`, `/handoffs` y `/robots/{id}/failure`; opcional en las demás escrituras. Repetir la misma clave y el mismo cuerpo devuelve la respuesta guardada con `Idempotency-Replayed: true`.
- **`Authorization: Bearer <token>`**: opcional. Si el servidor define `CERBERUS_ROBOT_TOKEN`, los tres endpoints del robot (`recognition/events`, `access/verify`, `robots/{id}/failure`) lo exigen y responden 401 `UNAUTHENTICATED` si falta o no coincide.

Los errores tienen siempre la forma `{ "error": { "code", "message", "details"? } }` con códigos estables. No se emiten cabeceras CORS: la aplicación y la API comparten origen.

## Variables de servidor

Se leen en `src/api/server.ts` y se configuran en el entorno de Vercel (o del proceso que ejecute `npm run serve`).

| Variable                               | Efecto                                                                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Credenciales de Upstash Redis (REST). Con ambas definidas, el almacén es Redis; sin ellas, memoria del proceso (volátil). También se aceptan `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. |
| `CERBERUS_ROBOT_TOKEN`                 | Token Bearer opcional para los endpoints del robot. Sin la variable no se exige nada; definida pero vacía, deniega todo.                                                                            |
| `CERBERUS_RESET_ENABLED`               | `false` (cualquier valor distinto de `true`) desactiva `POST /api/v1/demo/reset`. Por defecto el reinicio está habilitado. El nombre anterior `CERBERUS_DEMO_RESET=off` también lo desactiva.       |
| `CERBERUS_RATE_LIMIT`                  | `off` desactiva el límite de tasa. Está pensado únicamente para el servidor local de pruebas (`npm run serve`); no debe definirse en el despliegue.                                                 |
| `VERCEL_GIT_COMMIT_SHA`                | Lo define Vercel; `GET /health` lo expone como `commit` para que la prueba posterior al despliegue espere la versión correcta.                                                                      |

## Calidad

Scripts de `package.json`:

| Comando                    | Qué hace                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:secrets`    | Falla si algún archivo contiene cadenas con forma de credencial (claves privadas, tokens).                                |
| `npm run check:audit`      | `npm audit` de producción: falla con vulnerabilidades altas o críticas no revisadas.                                      |
| `npm run format:check`     | Prettier sobre los archivos del repositorio (`npm run format` los reescribe).                                             |
| `npm run lint`             | ESLint (configuración de Expo).                                                                                           |
| `npm run typecheck`        | `tsc --noEmit` en modo estricto.                                                                                          |
| `npm test`                 | Pruebas unitarias, de componentes y de contrato (Jest).                                                                   |
| `npm run test:coverage`    | Las mismas con cobertura; falla por debajo de 80 % en sentencias, ramas, funciones o líneas.                              |
| `npm run test:integration` | Recorridos de la API sobre el almacén en memoria y sobre un servidor Upstash simulado.                                    |
| `npm run build:web`        | Exporta la SPA a `dist/`.                                                                                                 |
| `npm run build:web:api`    | Exporta la SPA en modo API a `dist-api/`.                                                                                 |
| `npm run test:e2e`         | Playwright (Chromium) con dos proyectos: `mock` (modo local) y `api` (dos contextos de navegador, como dos dispositivos). |
| `npm run test:smoke`       | Playwright contra un despliegue real; exige `SMOKE_BASE_URL`. Solo lectura salvo `SMOKE_WRITE=1`.                         |
| `npm run verify`           | Encadena todo lo anterior salvo `test` y `test:smoke`.                                                                    |

**Integración continua** (`.github/workflows/ci.yml`, en cada pull request y en cada push a `main`): `npm ci`, auditoría de dependencias, búsqueda de secretos, formato, lint, tipos, pruebas con umbral de cobertura del 80 % en las cuatro métricas, integración, build web en los dos modos (`mock` y `api`, este último en `dist-api/`) y E2E de ambos proyectos de Playwright (`mock` y `api`, este con dos contextos de navegador como dos dispositivos). Publica como evidencia la cobertura y los informes de Playwright.

**Smoke posterior al despliegue** (`.github/workflows/smoke.yml`): tras un CI exitoso en `main`, espera a que `GET /api/v1/health` informe el commit recién fusionado y ejecuta la suite de solo lectura contra la producción. El recorrido de escritura (invitación → verificación → reutilización) solo se ejecuta bajo demanda, porque consume el cupo diario de invitaciones.

Resultado de referencia medido el 2026-10-23 con `npm run test:coverage`: 60 suites y 1232 pruebas superadas; cobertura de 96,95 % en sentencias, 91,99 % en ramas, 96,8 % en funciones y 97,91 % en líneas; además, 67 pruebas E2E (63 en modo `mock` y 4 en modo `api`). Con `npm run test:integration`: 3 suites y 15 pruebas superadas. Estas cifras cambian con el código: el informe vigente es el que genera cada ejecución.

## Despliegue en Vercel

El repositorio incluye `vercel.json`: importar el repositorio con el preset **Other**. El archivo ya fija:

- `installCommand`: `npm ci`; `buildCommand`: `npx expo export -p web`; `outputDirectory`: `dist`.
- Reescritura de `/api/v1/*` hacia la función `api/router.ts` y reescritura SPA (`/index.html`) para toda ruta sin extensión que no empiece por `/api/`.
- Cabeceras de seguridad en todas las respuestas: Content-Security-Policy restrictiva, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` y `Permissions-Policy` (cámara solo del mismo origen).

Para que el estado se comparta entre dispositivos, en el proyecto de Vercel deben definirse:

1. Las credenciales de Upstash (`KV_REST_API_URL` y `KV_REST_API_TOKEN`; la integración de Upstash para Vercel las crea con esos nombres).
2. `EXPO_PUBLIC_DATA_MODE=api`, **antes del build**, para que la interfaz use la API en lugar del modo local. `vercel.json` ya lo declara en el comando de build; si se construye de otra manera, debe definirse como variable de entorno.

Vercel despliega tras cada push a la rama enlazada; por sí solo no garantiza que las pruebas hayan pasado. La comprobación posterior es el workflow de smoke.

## Estado del alcance

La tabla siguiente corresponde al modo demostración y a la API v1. La aplicación autenticada y el reconocimiento real del modo integrado se describen en [N Club y SABANAHACK](docs/api/SABANAHACK.md).

| Elemento                                                                                                 | Estado                                                                                                |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Clasificación en cinco categorías con registros del club (membresías, turnos, permisos, invitaciones)    | REAL                                                                                                  |
| Invitaciones con QR de un solo uso (token opaco de 128 bits, ventana horaria de Bogotá) y página de pase | REAL                                                                                                  |
| Máquinas de estado de visita y relevo, concurrencia con compare-and-set e idempotencia                   | REAL                                                                                                  |
| API REST v1, contrato OpenAPI y límite de tasa; token de robot opcional                                  | REAL                                                                                                  |
| Persistencia compartida en Upstash Redis (cuando hay credenciales)                                       | REAL                                                                                                  |
| Cabeceras de seguridad, PWA con manifiesto y service worker, CI con cobertura y smoke                    | REAL                                                                                                  |
| Reconocimiento facial                                                                                    | SIMULADO                                                                                              |
| Cámara y lectura de QR por cámara (se escribe el código o se usa un atajo del presentador)               | SIMULADO                                                                                              |
| Robot de recepción y acompañamiento (el kiosco `/robot` es un cliente de la API)                         | SIMULADO                                                                                              |
| Falla del robot, llegada al destino y regreso a recepción (botones del presentador)                      | SIMULADO                                                                                              |
| Reloj de la demostración (fecha simulada: sábado 24 o martes 27 de octubre de 2026)                      | SIMULADO                                                                                              |
| Directorio de personas, permisos y actividades                                                           | SIMULADO (datos ficticios de semilla)                                                                 |
| Autenticación y autorización de usuarios                                                                 | NO IMPLEMENTADO (el actor se declara en `X-Demo-Actor`)                                               |
| Integración con el hardware del robot X2 y con un servicio de reconocimiento facial real                 | NO IMPLEMENTADO                                                                                       |
| Notificaciones push (la interfaz consulta cada 3 s)                                                      | NO IMPLEMENTADO                                                                                       |
| Aviso a recepción desde el kiosco («Necesito ayuda», «Avisar a recepción»)                               | NO IMPLEMENTADO como tarea: solo muestra el aviso en el kiosco; la API v1 no tiene endpoint para ello |
| Lista completa de invitaciones, detalle de visita, reporte de incidencias, atajos de teclado del kiosco  | NO IMPLEMENTADO                                                                                       |
| Interacción por voz; interfaz en otros idiomas distintos del español                                     | NO IMPLEMENTADO                                                                                       |

## Limitaciones conocidas

- **Sin autenticación real.** El perfil se elige en la portada y el actor viaja en `X-Demo-Actor`, que cualquier cliente puede declarar. Quien conozca el identificador de un socio puede listar sus invitaciones y leer sus tokens de QR. Las escrituras públicas se protegen con límite de tasa y con los datos ficticios, no con identidad.
- **Datos ficticios.** Personas, permisos, turnos y actividades son datos de semilla. No se almacenan fotografías, imágenes ni plantillas biométricas.
- **Reconocimiento facial simulado.** Desde el cajón «Operación» se elige el rostro; esas llegadas se registran como `simulated: true`.
- **Sin robot físico conectado.** El kiosco es una pantalla que se comporta como cliente de la API; no se ha probado con el robot X2.
- **PWA no verificada en un dispositivo físico.** El manifiesto, los iconos y el service worker se comprueban en pruebas de navegador de escritorio, pero la instalación en un teléfono o tableta no se ha verificado.
- **Estado según el modo.** En modo local, cada navegador tiene su propio estado (las pestañas del mismo navegador lo comparten). En modo API sin Redis, cada instancia serverless tiene su propia memoria y el estado puede parecer inconsistente.
- **Relevos que vencen.** Una solicitud de relevo sin aceptar vence a los 300 s; uno aceptado, a los 600 s desde la aceptación. El vencimiento se aplica al consultar, sin tareas programadas.
- **Un robot en falla no vuelve a acompañar** hasta reiniciar la demostración, que lo devuelve al estado `OK`.
- **El pase requiere conexión** para comprobar su validez; sin red, el QR ya visible permanece y la validez se comprueba en recepción.

## Documentación

- Decisiones: [`docs/adr/`](docs/adr/) (arquitectura, modos de datos y API, clasificación facial, QR y relevo).
- Arquitectura: [`docs/architecture/`](docs/architecture/) (C4 de contexto y de contenedores).
- Dominio: [`docs/domain/`](docs/domain/).
- Diseño: [`docs/design/`](docs/design/) (pantallas, recorridos, bocetos y textos de orientación).
- API: [`docs/api/`](docs/api/).
- Guion de demostración: [`docs/demo/DEMO-SCRIPT.md`](docs/demo/DEMO-SCRIPT.md).
- Guía para contribuir: [`AGENTS.md`](AGENTS.md).
