# ADR 0002: Modos de datos mock y api con un único manejador

- Estado: aceptada
- Fecha: 2026-10-23
- Relacionadas: ADR 0001, `docs/api/CONTRACT.md`, `docs/api/openapi.yaml`

## Contexto

No hay una API previa documentada, así que Cerberus define la suya. La interfaz debe funcionar de dos maneras: sin servidor (demostración local y pruebas) y contra una API real compartida entre dispositivos (robot y edecán en pantallas distintas). Los dos modos deben compartir contrato por construcción, no por disciplina.

## Decisión

### 1. Un manejador agnóstico de plataforma

La API entera es una función pura respecto del transporte (`src/api/http.ts`, `src/api/app.ts`):

```ts
interface ApiRequest {
  method: string; // "GET", "POST"...
  path: string; // por debajo de /api/v1, siempre con "/" inicial: "/visits/vis-7f3a9c21"
  query: Record<string, string>;
  headers: Record<string, string>; // nombres en minúsculas
  body: unknown; // JSON ya analizado o undefined
  ip: string; // dirección del cliente para el límite de tasa; "local" en el navegador
}
interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown; // JSON serializable
}
type ApiHandler = (req: ApiRequest) => Promise<ApiResponse>;

interface AppOptions {
  store: KeyValueStore;
  clock: Clock; // reloj real; el de demostración se deriva de él
  random: (bytes: number) => Uint8Array;
  storage: 'memory' | 'redis' | 'browser';
  resetEnabled: boolean;
  robotToken?: string; // si existe, los endpoints del robot exigen Bearer
}
function createApp(opts: AppOptions): ApiHandler; // "handle"
```

`src/api` no importa nada de Vercel, Node ni del navegador.

- **Servidor.** `api/router.ts` convierte la petición de Vercel en `ApiRequest` (con `toFetchHandler`) y llama al manejador que construye `createServerApp(process.env)` en `src/api/server.ts`, la raíz de composición del servidor: allí se elige el almacén y se leen las variables de entorno. `vercel.json` reescribe `/api/v1/:path*` hacia `/api/router`. El archivo de la función no contiene reglas.
- **Navegador (mock).** El cliente en proceso llama al mismo manejador con un `KeyValueStore` de `localStorage` y sin token de robot.
- **Servidor local.** `scripts/serve.ts` sirve `dist/` y monta `createServerApp` en `/api/v1`, con las mismas cabeceras de seguridad que `vercel.json`.

El contrato fuente son los esquemas Zod de `src/infrastructure/contracts/`. `docs/api/openapi.yaml` describe lo mismo para integradores externos, y las pruebas de contrato comprueban que la tabla de rutas, los ejemplos de `docs/api/CONTRACT.md` y los de OpenAPI coinciden con los esquemas Zod.

### 2. Selección de modo

`EXPO_PUBLIC_DATA_MODE=mock|api`, resuelto al construir la aplicación. Sin valor, el modo es `mock` (el arranque nunca depende de un servidor).

| Modo   | Cliente                                       | Quién valida      | Almacén                                   |
| ------ | --------------------------------------------- | ----------------- | ----------------------------------------- |
| `mock` | En proceso (`createApp` directo)              | El navegador      | `localStorage` con el prefijo `cerberus:` |
| `api`  | `fetch` a `/api/v1` (o `EXPO_PUBLIC_API_URL`) | La función Vercel | Redis o memoria                           |

El cliente expone la misma interfaz tipada en ambos modos; las pantallas no saben cuál usan. En modo `mock`, las pestañas del mismo navegador se avisan de las escrituras con `BroadcastChannel`; en modo `api`, la interfaz consulta cada 3 segundos. La portada muestra el modo: «Modo demostración local» en `mock` y, en `api`, «Modo API · almacenamiento: » seguido del valor de `storage` que informa `GET /health`.

### 3. Persistencia: puerto `KeyValueStore`

```ts
interface Versioned<T> {
  value: T;
  version: number; // empieza en 1
}
interface KeyValueStore {
  get<T>(key: string): Promise<Versioned<T> | null>;
  getMany<T>(keys: string[]): Promise<(Versioned<T> | null)[]>; // una sola ida y vuelta
  // Escribe solo si la versión actual es expectedVersion (0 = la clave no debe existir).
  // Devuelve la nueva versión, o null si hay conflicto.
  compareAndSet<T>(key: string, expectedVersion: number, value: T): Promise<number | null>;
  list<T>(prefix: string): Promise<({ key: string } & Versioned<T>)[]>;
  delete(key: string): Promise<void>; // reinicia también la versión; solo para el reinicio
  increment(key: string, ttlSeconds: number): Promise<number>; // contador atómico con caducidad
  clear(prefix: string): Promise<void>; // un prefijo vacío se rechaza
}
```

`delete`, `clear` e `increment` no estaban en la lista mínima del puerto: `POST /demo/reset` necesita vaciar el almacén y el límite de tasa necesita un contador atómico con caducidad.

Adaptadores:

| Adaptador          | Uso                                                     | Atomicidad de `compareAndSet`                                                                                 |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Memoria (`Map`)    | Pruebas y desarrollo; respaldo en el servidor sin Redis | Garantizada dentro de un proceso (una sola tarea del bucle de eventos).                                       |
| `localStorage`     | Modo mock                                               | Garantizada dentro de una pestaña. Dos pestañas pueden competir; se documenta como límite de la demostración. |
| Upstash Redis REST | Modo api con persistencia                               | Garantizada por un script Lua ejecutado con `EVAL`.                                                           |

Upstash se usa con `fetch` y sin SDK: `POST` a `KV_REST_API_URL` con cabecera `Authorization: Bearer <KV_REST_API_TOKEN>` y el comando como arreglo JSON, con un tiempo máximo de 4 s por petición. Cada clave es una cadena JSON `{"v": <versión>, "d": <valor>}`. El script de compare-and-set:

```lua
local cur = redis.call('GET', KEYS[1])
local ver = 0
if cur then ver = cjson.decode(cur).v end
if ver ~= tonumber(ARGV[1]) then return -1 end
local nv = ver + 1
redis.call('SET', KEYS[1], '{"v":' .. nv .. ',"d":' .. ARGV[2] .. '}')
return nv
```

`ARGV[1]` es la versión esperada (0 para «crear si no existe») y `ARGV[2]`, el JSON ya serializado. Un resultado `-1` se traduce a `null`. `increment` ejecuta `INCR` y, en el primer acierto de la ventana, `EXPIRE`. `list` y `clear` recorren las claves con `SCAN` y `MATCH` (escapando los caracteres especiales del prefijo) y leen los valores con `MGET`. Cualquier fallo de red, de estado HTTP o de respuesta se convierte en un error estable sin datos de la petición, que la API responde como 500 `STORAGE_UNAVAILABLE`.

Variables del servidor: `KV_REST_API_URL` y `KV_REST_API_TOKEN` (también se aceptan `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`), solo de servidor y nunca con prefijo `EXPO_PUBLIC_`. Con ambas definidas el almacén es Redis (`storage: "redis"`); sin ellas, memoria (`storage: "memory"`). El despliegue de demostración tiene Upstash conectado. No hay Postgres.

### 4. Disposición de claves

| Clave                                  | Contenido                                                                                             | Escritura                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `visit:<visitId>`                      | Agregado `Visit`: incluye la invitación (si la hay), los relevos y el historial                       | `compareAndSet` por versión                           |
| `visits:ids`                           | Índice con los identificadores de todas las visitas, para listar sin recorrer el almacén              | `compareAndSet` (se reconstruye una vez si falta)     |
| `qr:<token>`                           | `{ visitId }`                                                                                         | Una vez, al emitir la invitación                      |
| `inv:<invitationId>`                   | `{ visitId }`                                                                                         | Una vez, al emitir la invitación                      |
| `handoff:<handoffId>`                  | `{ visitId }`                                                                                         | Una vez, al crear el relevo                           |
| `hostday:<hostId>:<AAAA-MM-DD>`        | Índice de invitaciones del socio para esa fecha (ids de visita y claves normalizadas de invitado)     | `compareAndSet` (límite diario y duplicados atómicos) |
| `person:<personId>`                    | Reserva de la visita abierta de una persona identificada (una sola visita abierta por persona)        | `compareAndSet`                                       |
| `escort:<acompañanteId>`               | Arrendamiento breve mientras se asigna un acompañante a una visita (un acompañante, una tarea activa) | `compareAndSet`                                       |
| `robot:<robotId>`                      | Estado del robot (`OK` o `FAULT`)                                                                     | `compareAndSet`                                       |
| `idem:<método> <ruta>:<actor>:<clave>` | Cuerpo canónico, respuesta guardada y caducidad de 24 horas                                           | `compareAndSet` (reserva la clave antes de ejecutar)  |
| `rate:<ip>:<tipo>:<ventana>`           | Contador del límite de tasa por ventana fija de un minuto (`read`, `write` o `reset`)                 | `increment` con caducidad                             |
| `meta:clock`                           | Instante de demostración y el instante real en que se fijó                                            | `compareAndSet`                                       |

El directorio de personas, las actividades y los permisos son datos de semilla del código (`src/domain/seed.ts`); no se escriben en el almacén.

La respuesta guardada de una clave de idempotencia caduca a las 24 horas (la fecha de caducidad va en el valor y se ignora al leer; el puerto no tiene TTL por clave). Solo se guardan las respuestas 2xx que no sean una denegación de negocio, para que el reintento que debería prosperar no quede bloqueado. `POST /demo/reset` borra con `clear` los prefijos `visit:`, `visits:`, `qr:`, `inv:`, `handoff:`, `hostday:`, `person:`, `escort:`, `robot:` e `idem:`, reescribe `meta:clock` y vuelve a sembrar la invitación de ejemplo.

### 5. Reloj y datos de semilla

- El reloj es un puerto (`Clock`). La zona es `America/Bogota` (UTC-5, sin horario de verano).
- El reloj de demostración parte de una fecha fija y avanza en tiempo real: `POST /demo/reset` lo fija (por defecto, sábado 2026-10-24 09:00 en Bogotá) y guarda el desfase en `meta:clock`. La primera petición sobre un almacén vacío equivale a un reinicio con la fecha por defecto. Las pruebas usan un reloj fijo.
- Con esto un escenario como "externo un martes" se reproduce reiniciando la demostración con otra fecha, sin tocar el código.

### 6. Concurrencia e idempotencia

- Cada transición de una visita (incluidos sus relevos e invitación) es una sola escritura `compareAndSet` sobre `visit:<id>`; ver ADR 0004.
- `Idempotency-Key` es obligatoria en los POST que crean recursos o consumen un token (`/invitations`, `/recognition/events`, `/access/verify`, `/handoffs`, `/robots/{id}/failure`) y opcional en el resto. Misma clave y mismo cuerpo repiten la respuesta guardada (con `Idempotency-Replayed: true`); misma clave con otro cuerpo da 422 `IDEMPOTENCY_KEY_REUSED`.
- Errores con forma `{ "error": { "code": "CODIGO_ESTABLE", "message": "..." } }` y estados 400, 401, 403, 404, 409, 413, 415, 422, 429 y 500. Los códigos son parte del contrato.

### 7. Límites que deben declararse

1. En modo `mock` el estado vive en un solo navegador: no hay sincronización entre robot y edecán en dispositivos distintos. La interfaz lo rotula como «Modo demostración local».
2. En modo `api` sin Redis, el servidor serverless usa memoria. Cada instancia tiene su copia y se pierde al reciclarse: el estado es volátil y puede parecer inconsistente entre peticiones. `GET /health` informa `storage: "memory"` y la interfaz lo muestra.
3. Sin autenticación real: el actor se declara con la cabecera `X-Demo-Actor` y no es verificable. Las escrituras públicas se protegen con límite de tasa en el servidor (ventana fija de un minuto por cliente (IP): 600 lecturas, 120 escrituras y 3 reinicios; el detalle está en `docs/api/CONTRACT.md`, sección 1) y los datos son ficticios. El modo del navegador no aplica límite.
4. Token de robot opcional: si el servidor define `CERBERUS_ROBOT_TOKEN`, los endpoints que llama el robot (`POST /recognition/events`, `POST /access/verify` y `POST /robots/{id}/failure`) exigen `Authorization: Bearer <token>` y responden 401 `UNAUTHENTICATED` si falta o no coincide (la comparación no sale en el primer carácter distinto y se hace antes de las comprobaciones de actor y de negocio). Sin la variable no se exige nada, y definida pero vacía deniega todo. El token no protege a los demás actores, que siguen siendo declarativos.
5. Toda respuesta del manejador lleva la cabecera `X-Cerberus-Storage` (`memory`, `redis` o `browser`), para que quien integre el robot sepa si el estado es volátil. `POST /demo/reset` se desactiva con `CERBERUS_RESET_ENABLED=false` (cualquier valor distinto de `true`; el nombre anterior `CERBERUS_DEMO_RESET=off` también lo desactiva) y responde 403 `RESET_DISABLED`.
6. El pase del invitado se consulta con `GET /passes/{token}` sin actor: poseer el token es la credencial, y un token mal formado, desconocido o que ya no corresponde a una invitación recibe siempre el mismo 404 `PASS_NOT_FOUND`.
7. No se emiten cabeceras CORS: la SPA y la API comparten origen y un robot es un cliente de servidor. Un integrador que llame desde otro origen en un navegador necesita una lista de orígenes permitidos, que no se ha definido.

### 8. Cómo se integra un tercero (robot o reconocimiento facial)

1. Leer `docs/api/openapi.yaml` (OpenAPI 3.1) y `docs/api/CONTRACT.md`. El prefijo es `/api/v1`; los cambios compatibles son aditivos y un cambio incompatible exige `/api/v2`.
2. Comprobar `GET /health` y leer el catálogo con `GET /people` y `GET /activities`.
3. Enviar la señal facial como evento a `POST /recognition/events` indicando `source: { kind: "ROBOT", id: "R1" }`. Si el servicio facial usa otro formato, un adaptador traduce su evento a este cuerpo; el contrato propio no cambia.
4. Presentar el QR de un invitado con `POST /access/verify`; avanzar la visita con `POST /visits/{id}/advance`; avisar de una falla con `POST /robots/{id}/failure`.
5. Enviar siempre `Idempotency-Key` en los POST que la exigen y `X-Demo-Actor` con el identificador del robot; si el servidor define `CERBERUS_ROBOT_TOKEN`, enviar además `Authorization: Bearer <token>`.
6. Tratar los códigos de error como estables y las reglas (clasificación, vigencia, responsable) como exclusivas del servidor.

## Consecuencias

- Un solo contrato y un solo manejador: no puede haber deriva entre mock y api, y los casos de uso se prueban sin red.
- La demostración multidispositivo solo es real con Redis configurado; sin él, se declara la limitación.
- El agregado único por visita evita transacciones entre registros pero hace que los listados lean varias claves; es aceptable con el volumen de una demostración.

## Alternativas descartadas

- **Mocks separados del servidor (MSW u objetos de prueba en la interfaz).** Dos implementaciones del contrato acaban divergiendo. Se descarta porque el objetivo es un único manejador.
- **Postgres.** Requiere aprovisionamiento y migraciones que la demostración no justifica; un almacén clave-valor con compare-and-set cubre la concurrencia necesaria.
- **SDK de Upstash.** Una dependencia más para cuatro comandos; `fetch` basta y funciona igual en cualquier runtime.
- **Estado compartido por WebSocket o BroadcastChannel.** Como mecanismo de estado compartido, resuelve solo un navegador o añade infraestructura persistente; el sondeo sobre la API es suficiente para la demostración. En modo `mock`, `BroadcastChannel` solo avisa a las otras pestañas de que hubo una escritura.
