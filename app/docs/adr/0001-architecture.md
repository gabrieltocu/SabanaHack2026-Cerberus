# ADR 0001: Arquitectura general: monolito modular universal

- Estado: aceptada
- Fecha: 2026-10-23
- Relacionadas: ADR 0002 (modos mock/api), ADR 0003 (clasificación facial), ADR 0004 (QR y relevo)

## Contexto

Cerberus es un MVP para N Club construido para Sabana Hack 2026. Debe demostrar, en un enlace público de Vercel (`*.vercel.app`), cinco recorridos diferenciados (VIP, regular, invitado, personal del club, trabajador externo), el ingreso alternativo con QR y el relevo robot-humano cuando el robot falla, con una interfaz cuidada, pruebas automatizadas e integración continua.

Restricciones relevantes:

- No existe documentación de una API previa que el robot o el reconocimiento facial puedan consumir. La API se define en este repositorio y debe ser lo bastante clara y compatible para que otro equipo se integre con ella.
- El reconocimiento facial existente solo distingue miembro de no miembro; las cinco categorías salen de combinarlo con registros del club.
- Todos los datos son ficticios. No se almacena biometría real.
- Equipo pequeño, plazo corto, un único repositorio y un único despliegue.

## Decisión

### 1. Monolito modular, sin microservicios

Un solo repositorio, un solo despliegue en Vercel con dos piezas: una SPA estática y una función serverless única para la API. Los módulos se separan por carpetas y por reglas de dependencia, no por procesos.

### 2. Stack

- Expo SDK 58, Expo Router, React Native Web y TypeScript con modo estricto.
- `web.output: "single"`: la aplicación se exporta como SPA estática a `dist/`.
- Zod para los esquemas de contrato y la validación en la frontera.
- Fuentes con licencia OFL mediante `@expo-google-fonts`: Bodoni Moda para el logo, los nombres y los saludos, y Geist para todo lo demás.

### 3. Capas y estructura de carpetas

```
app/                               Expo Router: solo rutas y composición de pantallas
src/design-system/                 tokens.ts (fuente única), componentes
src/features/                      pantallas y hooks por área: data (cliente y mapeadores),
                                   demo, handoffs, invitations, orientation, pages, robot,
                                   screens, shared, visits
src/domain/
  entities/                        tipos de Visit, Invitation, Person, Handoff...
  policies/                        clasificación, ventanas de permiso, QR, hora de Bogotá,
                                   máquinas de estado de visita y relevo
  clock.ts, seed.ts                reloj inyectable y directorio de semilla ficticio
src/api/                           handle(req) → res, enrutado /api/v1, validación, casos de uso
                                   y repositorio de visitas; server.ts es la raíz de composición
                                   del servidor
src/infrastructure/
  contracts/                       esquemas Zod = contrato fuente
  clients/                         cliente HTTP (fetch) y cliente en proceso (modo mock)
  stores/                          KeyValueStore: memoria, localStorage, Upstash REST
src/shared/                        utilidades puras (aleatoriedad, resultados)
api/router.ts                      función Vercel; solo adapta Request/Response a handle()
scripts/                           serve.ts (servidor local), scan-secrets.mjs, audit.mjs
tests/{unit,integration,contract,e2e,smoke,support}
docs/{adr,architecture,design,domain,api,demo}
```

La carpeta `api/` de la raíz es la que Vercel reconoce como funciones; `src/api` contiene la lógica. La primera no debe contener reglas de negocio. `vercel.json` reescribe `/api/v1/*` hacia `api/router.ts` para conservar el prefijo público.

### 4. Regla de dependencias

Cada fila puede importar solo lo que indica la tabla.

| Capa                           | Puede importar                                                                                                             | No puede importar                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/shared`                   | nada del proyecto                                                                                                          | React, Expo, `fetch`, cualquier otra capa                                                               |
| `src/domain`                   | `src/shared`                                                                                                               | React, React Native, Expo, `fetch`, Vercel, Zod, `src/api`, `src/infrastructure`, `src/features`        |
| `src/infrastructure/contracts` | `src/domain` (tipos y enumeraciones), `src/shared`, Zod                                                                    | React, Expo, `src/api`, `src/features`                                                                  |
| `src/infrastructure/stores`    | `src/shared` (el puerto `KeyValueStore` vive en `stores/types.ts`)                                                         | React, Expo, `src/api`, `src/features`                                                                  |
| `src/api`                      | `src/domain`, `src/infrastructure/contracts`, `src/infrastructure/stores`, `src/shared`                                    | React, Expo, `src/features`, `app/`                                                                     |
| `src/infrastructure/clients`   | `src/infrastructure/contracts`, `src/shared`; el cliente en proceso importa además `src/api` y `src/infrastructure/stores` | React, `src/features`, `app/`                                                                           |
| `src/design-system`            | `src/shared`, React, React Native                                                                                          | `src/domain`, `src/api`, `src/infrastructure`, `src/features`                                           |
| `src/features`                 | `src/design-system`, `src/shared`, tipos de `src/domain`, interfaz del cliente de `src/infrastructure/clients`             | `src/api`, `src/infrastructure/stores`, importar entre sí otras features salvo por sus índices públicos |
| `app/`                         | `src/features`, `src/design-system`, `src/shared`, proveedor del cliente                                                   | lógica de negocio, `src/api`, `src/infrastructure/stores`                                               |
| `api/router.ts`                | `src/api`                                                                                                                  | `src/features`, `src/design-system`, React                                                              |

La regla se mantiene hoy por revisión de código: la configuración de lint no incluye todavía una restricción de importaciones ni existe una prueba que recorra los imports de `src/domain`. Automatizarlo es una mejora pendiente; el dominio ya se prueba sin React, Expo ni red.

### 5. Interfaz de usuario

- Sin NativeWind ni React Native Reusables. Se construyen primitivas propias sobre `StyleSheet` (botón, campo, tarjeta, insignia de estado, esqueleto de carga, diálogo) con tokens en una fuente única, `src/design-system/tokens.ts`. Las pantallas no usan colores ni tamaños literales: usan tokens.
- Dirección visual: «N Club Luxury». Blanco cálido, líneas negras y oro solo en los detalles; esquinas rectas y sin sombras; editorial y con mucho espacio, no un panel empresarial. Se toma como inspiración la atmósfera de clubes privados, sin copiar marcas, textos, imágenes ni tipografías de terceros.
- Contraste WCAG AA comprobado con una prueba automática sobre los pares de tokens (4,5:1 para texto normal, 3:1 para componentes de interfaz). Objetivos táctiles de al menos 44 px, navegación por teclado, estados de carga, vacío y error en cada pantalla, y comprobación a 375, 768 y 1440 px de ancho.
- La aplicación abre en `/entrar` (correo y clave). El selector de perfiles de demostración está en `/demo`; no es un inicio de sesión.

### 6. Despliegue en Vercel

- Vercel construye con `npx expo export -p web` y publica `dist/`.
- Reescritura de rutas del lado del cliente (`vercel.json`): las rutas sin extensión que no empiecen por `/api/` se resuelven con `index.html`. Las pruebas de humo posteriores al despliegue comprueban que una ruta profunda recarga con 200 y que un recurso estático inexistente da 404.
- La API es una única función, `api/router.ts`, a la que `vercel.json` reescribe el prefijo público `/api/v1/*`.
- Variables de entorno: ver `docs/architecture/C4-containers.md`. Ningún secreto lleva el prefijo `EXPO_PUBLIC_`.
- Vercel despliega tras cada push a la rama enlazada y por sí solo no garantiza que las pruebas hayan pasado. Se exige rama `main` protegida con comprobaciones obligatorias antes de integrar.

### 7. Calidad como parte de la arquitectura

- Pirámide de pruebas: unitarias del dominio, integración de casos de uso con almacén en memoria, contratos contra los esquemas Zod y `docs/api/openapi.yaml`, E2E sobre el build estático y pruebas de humo contra el despliegue.
- Objetivo de cobertura: al menos 80 % en líneas, ramas, funciones y sentencias del código elegible, sin bajar el umbral para que pase la integración continua. El objetivo se declara aquí; su cumplimiento solo se afirma con el informe de cobertura generado.
- El reloj se inyecta siempre (`Clock`); ninguna política consulta `Date.now()` directamente.

## Consecuencias

Positivas:

- Un solo lenguaje, un solo repositorio y un solo despliegue reducen la fricción del equipo.
- El dominio se prueba sin framework, sin red y sin reloj real.
- La misma lógica de servidor corre en el navegador (modo mock), lo que mantiene un único contrato (ADR 0002).

Negativas y límites:

- En modo mock el código de la API viaja en el paquete del navegador; es aceptable porque los datos son ficticios.
- Las primitivas propias cuestan más tiempo inicial que una biblioteca de componentes.
- Una única función serverless concentra la API; con tráfico alto habría que dividirla. Está fuera del alcance del MVP.

## Alternativas descartadas

- **Microservicios o backend separado.** Añade despliegue, red y operación sin beneficio para una demostración de este tamaño.
- **NativeWind y React Native Reusables.** Su compatibilidad con Expo SDK 58 no está verificada y añaden dependencias. Las primitivas propias sobre `StyleSheet` se pueden migrar después porque los tokens están aislados.
- **Next.js u otro framework web.** Obliga a duplicar la capa de interfaz si más adelante se quiere app nativa; Expo Router cubre web ahora y móvil después.
- **Postgres u otra base de datos.** No hace falta para la demostración multidispositivo; ver ADR 0002.
- **Funciones serverless por endpoint.** Multiplican el arranque en frío y la configuración; una función con enrutador interno es más simple y permite reutilizar el manejador en el navegador.
