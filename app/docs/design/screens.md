# Especificación de pantallas

N Club. Aplicación web instalable (Expo Router, aplicación de una sola página). Este documento describe, ruta por ruta, qué se muestra, qué se puede hacer y cómo responde la interfaz. Los textos entre comillas angulares `«…»` son microcopy exacto. Los textos de orientación por categoría están en `orientation-copy.md`; los recorridos de demostración, en `flows.md`; los bocetos, en `wireframes.md`.

Dirección visual: «N Club Luxury». Blanco cálido, líneas negras y oro solo como detalle; esquinas rectas, sin sombras, con mucho espacio y poca información por pantalla; no un panel empresarial. Los tamaños de este documento son de referencia y los fija el sistema de diseño de la aplicación (`src/design-system/tokens.ts`).

## Alcance implementado

Este documento es la especificación de diseño; la implementación resolvió algunos puntos de otra manera y dejó otros fuera del MVP. Donde difieren, el texto lo indica con «Implementado» o «Fuera del MVP». Resumen:

| Tema                                                                                                     | Estado en la implementación                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rutas                                                                                                    | `/` redirige a `/entrar` (inicio de sesión con correo y clave). `/demo` es el selector de perfiles (§1). Siguen existiendo las rutas de demostración `/robot`, `/pase/[token]`, `/socio`, `/socio/invitar`, `/edecan`, `/personal`, `/actividades` y `/design`. Cada rol tiene su aplicación bajo `/app/*` y el invitado con pase usa `/visita` (§14). No existen `/robot/qr`, `/socio/invitaciones` ni `/visita/[id]`. |
| Cinta de demostración (G1) y sello «Simulación» (G2)                                                     | No se muestran en ninguna pantalla. Las filas «Simulación» de las tablas de estados describen el diseño original.                                                                                                                                                                                                                                                                                                       |
| Panel del presentador del kiosco                                                                         | En la implementación se llama «Operación»; sus acciones son «Marcar llegada al destino», «Marcar regreso a recepción», «Reportar falla del robot» y «Reiniciar esta visita».                                                                                                                                                                                                                                            |
| Estilo visual                                                                                            | Rige §0.1 (blanco cálido, línea negra, oro como detalle, Geist y Bodoni Moda) y §14 para las pantallas por rol.                                                                                                                                                                                                                                                                                                         |
| Entrada por QR en el kiosco                                                                              | Es una etapa dentro de `/robot` («Tengo un código QR»), no una ruta aparte.                                                                                                                                                                                                                                                                                                                                             |
| Atajos de teclado (`P`, `1`–`3`, `A`, `I`)                                                               | Fuera del MVP. El cajón de operación del kiosco se abre con el botón «Operación».                                                                                                                                                                                                                                                                                                                                       |
| «Necesito ayuda», «Pedir ayuda», «Avisar a recepción»                                                    | Muestran el aviso en el kiosco; no crean una tarea en el panel del edecán, porque la API v1 no tiene un endpoint para ello. Una visita en revisión manual sí aparece en el panel como «Verificación».                                                                                                                                                                                                                   |
| Lista completa de invitaciones, detalle de visita, incidencias                                           | Fuera del MVP. El inicio del socio lista sus invitaciones con «Ver pase» y «Cancelar»; la evaluación se envía desde el kiosco o desde la tarjeta «¿Cómo te fue hoy?» de `/socio`.                                                                                                                                                                                                                                       |
| Agenda del personal                                                                                      | Implementado como el turno del día (inicio y fin); no hay notas privadas en la agenda.                                                                                                                                                                                                                                                                                                                                  |
| Tiempos del kiosco                                                                                       | No hay espera de 2 s ni de 6 s en el reconocimiento ni cierre a los 60 s en la confirmación; solo la despedida vuelve sola al reposo.                                                                                                                                                                                                                                                                                   |
| Franja global de conexión (G7), rótulo de alcance en la cinta (§0.4), pantalla de ruta desconocida (§13) | Fuera del MVP. Los errores de red se muestran en la zona afectada con «Reintentar»; el modo de datos se indica en los ajustes del selector (§1).                                                                                                                                                                                                                                                                        |

Tras iniciar sesión, cada rol llega a su aplicación (§14), que sigue el estilo vigente y dice los estados con una frase corta en lugar de etiquetas. Las secciones 1 a 13 conservan la especificación de las rutas de demostración.

## 0. Fundamentos compartidos

### 0.1 Tokens

| Token          | Hex       | Uso                                                                                                                                        |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ink`          | `#141414` | Texto, líneas, botón principal y fondos de noche.                                                                                          |
| `pine`         | `#2B2B2B` | Botón principal presionado.                                                                                                                |
| `ivory`        | `#FDFCFA` | Blanco cálido: fondo general.                                                                                                              |
| `sage`         | `#F3F2EE` | Superficies suaves.                                                                                                                        |
| `bone`         | `#EDEBE6` | Separadores suaves.                                                                                                                        |
| `white`        | `#FFFFFF` | Tarjetas y campos.                                                                                                                         |
| `muted`        | `#5C5C5C` | Texto secundario.                                                                                                                          |
| `border`       | `#242424` | Líneas negras de tarjetas, campos y separadores.                                                                                           |
| `gold`         | `#AD8948` | Oro apagado, solo para detalles: logo, pestaña activa, progreso, estrellas, avisos que piden atención y la barra destacada de una gráfica. |
| `gold on dark` | `#CAAD7D` | Texto dorado sobre negro (etiqueta del botón principal).                                                                                   |
| `error`        | `#A33A2E` | Errores y denegaciones.                                                                                                                    |

Estados de aviso: éxito `#2F5D3A` sobre `sage`, advertencia `#6E5326` sobre `#F5EFE3` y error `#A33A2E` sobre `#F6E7E4`. Los nombres antiguos de la paleta (`forest`, `espresso`, `champagne`) siguen en el código solo como alias de estos valores.

Tipografía: Bodoni Moda (500 y 600) para el logo, los nombres de personas, los saludos y los titulares grandes (display 44–60, h1 32–40, h2 26–32, h3 22); Geist (400, 500 y 600) para todo lo demás: cuerpo 16–17, etiqueta 14, nota 13, botones, listas y títulos de pantalla. No se usa serif por debajo de 22 px ni en botones.

Forma: todas las esquinas son rectas (radio 0) en botones, tarjetas, etiquetas, avatares, interruptores, barras y gráficas. No hay sombras: los objetos se separan con líneas negras de 1 px; solo las hojas flotantes proyectan una sombra suave.

Logo: el sello, una N en Bodoni Moda dentro de un doble marco cuadrado dorado, con la palabra `N CLUB` en Bodoni con espaciado amplio, en fila o apilada.

Contraste calculado con la fórmula WCAG 2.x para los pares de uso previsto:

| Par (texto sobre fondo)    | Relación | Uso permitido                                            |
| -------------------------- | -------- | -------------------------------------------------------- |
| `ink` sobre `ivory`        | 17,97    | Texto normal.                                            |
| `ink` sobre `white`        | 18,42    | Texto normal.                                            |
| `ink` sobre `sage`         | 16,45    | Texto normal.                                            |
| `muted` sobre `ivory`      | 6,52     | Texto secundario.                                        |
| `muted` sobre `sage`       | 5,97     | Texto secundario.                                        |
| `gold on dark` sobre `ink` | 8,58     | Etiqueta del botón principal y texto dorado sobre negro. |
| `ivory` sobre `ink`        | 17,97    | Texto sobre negro.                                       |
| `error` sobre `ivory`      | 6,40     | Texto de error.                                          |
| `gold` sobre `ivory`       | 3,18     | Líneas, íconos y bordes; **no permitido** para texto.    |
| `gold` sobre `ink`         | 5,66     | Logo y líneas sobre negro.                               |
| `border` sobre `white`     | 15,52    | Líneas de tarjetas y campos.                             |

Regla: el color nunca es el único portador de significado; el estado se dice siempre con texto.

### 0.2 Rejilla y tamaños de referencia

| Ancho | Dispositivo típico                           | Rejilla                            | Márgenes | Objetivo táctil                 |
| ----- | -------------------------------------------- | ---------------------------------- | -------- | ------------------------------- |
| 375   | Teléfono (socio, edecán, pase)               | 1 columna                          | 20       | 44 px mínimo                    |
| 768   | Tableta (kiosco, edecán)                     | 2 columnas (8 de 12)               | 32       | 56 px en kiosco; 44 px en resto |
| 1440  | Escritorio (presentador, personal, catálogo) | 12 columnas, contenido máximo 1120 | 64       | 44 px mínimo                    |

Sin desplazamiento horizontal en ningún ancho. Las tarjetas se apilan en 375, pasan a dos columnas en 768 y a tres o a una columna principal con lateral en 1440, según se indique.

### 0.3 Componentes y rótulos globales

G1 y G2 no se muestran en la implementación (ver «Alcance implementado»).

| Id  | Componente                       | Comportamiento                                                                                                                                                                                                                                                                            |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Cinta de demostración**        | Franja superior fija en toda ruta: `«Modo demostración · datos ficticios»`. Fondo `sage`, texto `ink`, 14 px. No se puede cerrar. En 375 se abrevia a `«Demostración · datos ficticios»`.                                                                                                 |
| G2  | **Sello «Simulación»**           | Insignia con contorno `gold` sobre fondo oscuro o `ink` sobre claro, texto `«Simulación»`, con ícono de matraz. Acompaña, pegado al elemento, a: resultado facial, cámara, falla del robot, lectura de QR por cámara y cualquier acción del panel del presentador.                        |
| G3  | **Esqueleto de carga**           | Bloques rectos `#ECEAE5` que respiran con un cambio suave de opacidad, con la forma exacta del contenido final. Desde 300 ms. Si pasa de 8 s se sustituye por el estado de error `NETWORK_OFFLINE` o `API_UNAVAILABLE`. Con movimiento reducido, sin cambio de opacidad.                  |
| G4  | **Estado vacío**                 | Filete dorado, titular en Geist, una línea de explicación y, cuando exista, una acción única.                                                                                                                                                                                             |
| G5  | **Bloque de error**              | Ícono, mensaje en lenguaje humano que dice qué ocurrió y qué hacer, y debajo, en 13 px: `«Código: <CODIGO>»`. Nunca muestra rutas, trazas ni datos internos. Siempre ofrece un camino alternativo.                                                                                        |
| G6  | **Aviso de éxito**               | Línea en la propia zona de la acción (no ventana flotante) con ícono de verificación y texto. Se anuncia con `role="status"`. Permanece hasta la siguiente acción.                                                                                                                        |
| G7  | **Aviso de conexión**            | Franja bajo la cinta: `«Sin conexión. Tus datos siguen aquí; reintentaremos cuando vuelva la red.»` con botón `«Reintentar ahora»`. Código `NETWORK_OFFLINE`.                                                                                                                             |
| G8  | **Diálogo de confirmación**      | Modal con foco atrapado, titular, consecuencia en una frase, botón de acción a la derecha y botón de cancelar a la izquierda. `Esc` cancela. El foco vuelve al disparador.                                                                                                                |
| G9  | **Insignia de estado**           | Etiqueta recta de línea fina, con texto de las tablas 0.5 y 0.6. Las categorías no llevan un color propio cada una: VIP es negra con texto dorado, regular de solo contorno, invitado sobre `sage`, personal en `pine` y externo de contorno con texto gris. Se usa con mesura (ver 0.5). |
| G10 | **Botón de acción con progreso** | Al pulsar cambia al instante (menos de 100 ms) a estado ocupado: texto en gerundio, deshabilitado, `aria-busy="true"`. Al terminar, vuelve a su texto o pasa al aviso de éxito. Un segundo toque no repite el comando.                                                                    |

### 0.4 Estado compartido en la demostración

- El **perfil elegido pertenece a cada pestaña** del navegador; el **estado de visitas, invitaciones y relevos es compartido** entre pestañas del mismo navegador. Con la API configurada, el estado se comparte entre dispositivos.
- Implementado: el modo de datos se indica en los ajustes del selector (§1): `«Datos en este navegador · almacenamiento: {almacén}»` o `«Modo API · almacenamiento: {almacén}»` (`redis` o `memory`), y debajo la fecha de trabajo.
- Reloj de la demostración: fecha simulada fija. Valores disponibles: `«Sábado 24 oct 2026»` (por defecto) y `«Martes 27 oct 2026»`. Zona horaria de América/Bogotá.

### 0.5 Etiquetas de estado de visita

| Estado            | Etiqueta         |
| ----------------- | ---------------- |
| `EXPECTED`        | Esperada         |
| `IDENTIFYING`     | Identificándote  |
| `VERIFIED`        | Confirmada       |
| `ORIENTING`       | Orientando       |
| `IN_PROGRESS`     | En curso         |
| `WAITING_HANDOFF` | Esperando relevo |
| `MANUAL_REVIEW`   | En revisión      |
| `FAILED`          | No completada    |
| `CLOSED`          | Cerrada          |

En las aplicaciones por rol (§14) no se muestran estas etiquetas: el estado se dice con una frase corta («Te acompaña Sofía») o no se dice. Solo el panel web conserva etiquetas rectas en sus tablas y listas.

### 0.6 Etiquetas de relevo y categoría

| Estado de relevo      | Etiqueta          |
| --------------------- | ----------------- |
| `REQUESTED`           | Solicitado        |
| `ACCEPTED`            | Aceptado          |
| `CONTEXT_TRANSFERRED` | Contexto recibido |
| `CONFIRMED`           | Confirmado        |
| `EXPIRED`             | Vencido           |
| `CANCELLED`           | Cancelado         |

| Categoría  | Etiqueta           |
| ---------- | ------------------ |
| `VIP`      | Socio VIP          |
| `REGULAR`  | Socio regular      |
| `GUEST`    | Invitado           |
| `STAFF`    | Personal del club  |
| `EXTERNAL` | Trabajador externo |

### 0.7 Catálogo de códigos y mensajes

Los códigos son los identificadores estables que la interfaz espera recibir de la capa de dominio o del cliente de API. El contrato de dominio es la fuente de verdad de los identificadores; este catálogo fija el texto que se muestra y debe actualizarse junto con él.

| Código                           | Mensaje en pantalla                                                                                | Camino alternativo                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `NETWORK_OFFLINE`                | `«No hay conexión. Tus datos siguen aquí; puedes reintentar cuando vuelva la red.»`                | `«Reintentar»`                                   |
| `API_UNAVAILABLE`                | `«El servicio no responde por ahora. Inténtalo de nuevo en unos segundos.»`                        | `«Reintentar»`                                   |
| `SERVER_ERROR`                   | `«No pudimos completar la acción. No se hizo ningún cambio.»`                                      | `«Reintentar»`                                   |
| `RATE_LIMITED`                   | `«Hubo demasiados intentos seguidos. Espera unos segundos e inténtalo de nuevo.»`                  | Botón deshabilitado con cuenta regresiva visible |
| `DEMO_DATA_UNAVAILABLE`          | `«No pudimos preparar la demostración. Recarga la página.»`                                        | `«Recargar»`                                     |
| `DEMO_PROFILE_REQUIRED`          | `«Elige un perfil para continuar.»`                                                                | Redirige a `/demo`                               |
| `RECOGNITION_UNKNOWN`            | `«No pude confirmar tu identidad. Podemos usar tu QR o pedir apoyo a recepción.»`                  | `«Usar mi QR»`, `«Pedir ayuda»`                  |
| `RECOGNITION_ERROR`              | `«No pude usar la cámara en este momento. Podemos continuar con tu QR o con apoyo en recepción.»`  | `«Usar mi QR»`, `«Pedir ayuda»`                  |
| `CAMERA_DENIED`                  | `«La cámara está bloqueada. Puedes continuar con tu QR escribiendo el código.»`                    | Campo de código                                  |
| `CAMERA_UNAVAILABLE`             | `«No encuentro una cámara. Puedes escribir el código de tu QR.»`                                   | Campo de código                                  |
| `CLASSIFICATION_MANUAL_REVIEW`   | `«No puedo confirmar esta visita. Recepción puede ayudarte.»`                                      | `«Avisar a recepción»`                           |
| `ACCESS_DENIED_NO_EVIDENCE`      | `«No encuentro una invitación, un turno o un permiso vigente para hoy. Recepción puede ayudarte.»` | `«Avisar a recepción»`                           |
| `MEMBERSHIP_NOT_ACTIVE`          | `«No encuentro una membresía vigente. Recepción puede ayudarte.»`                                  | `«Avisar a recepción»`                           |
| `STAFF_SHIFT_INACTIVE`           | `«Tu credencial está activa, pero no veo un turno para hoy. Recepción puede confirmarlo.»`         | `«Avisar a recepción»`                           |
| `EXTERNAL_DAY_NOT_ALLOWED`       | `«Su permiso de acceso aplica los sábados y hoy es {día}.»`                                        | `«Avisar a recepción»`                           |
| `EXTERNAL_OUT_OF_HOURS`          | `«Su visita está autorizada en otro horario. Recepción puede ayudarle.»`                           | `«Avisar a recepción»`                           |
| `QR_INVALID`                     | `«Este código no es válido. Revisa que sea el pase que recibiste.»`                                | Reintentar lectura; `«Pedir ayuda»`              |
| `QR_NOT_FOUND`                   | `«No encontramos este pase.»`                                                                      | `«Pedir ayuda»`                                  |
| `QR_EXPIRED`                     | `«Este pase venció. Pide a tu anfitrión que te envíe uno nuevo.»`                                  | `«Pedir ayuda»`                                  |
| `QR_NOT_YET_VALID`               | `«Este pase aún no es válido. Será válido el {fecha}.»`                                            | Ninguno                                          |
| `QR_ALREADY_USED`                | `«Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.»`                   | `«Pedir ayuda»`                                  |
| `QR_REVOKED`                     | `«Tu anfitrión canceló esta invitación.»`                                                          | `«Pedir ayuda»`                                  |
| `QR_NOT_AUTHORIZED`              | `«Este pase es válido, pero no permite este ingreso.»`                                             | `«Pedir ayuda»`                                  |
| `INVITATION_GUEST_NAME_REQUIRED` | `«Escribe el nombre de tu invitado.»`                                                              | Foco en el campo                                 |
| `INVITATION_DATE_INVALID`        | `«Elige una fecha desde hoy en adelante.»`                                                         | Foco en el campo                                 |
| `INVITATION_DUPLICATE`           | `«Ya existe una invitación para este invitado en esa fecha.»`                                      | Enlace `«Ver invitación»`                        |
| `INVITATION_NOT_FOUND`           | `«No encontramos esta invitación.»`                                                                | `«Volver a mis invitaciones»`                    |
| `INVITATION_ALREADY_CANCELLED`   | `«Esta invitación ya estaba cancelada.»`                                                           | Actualiza la lista                               |
| `ROBOT_FAILURE`                  | `«Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.»`                           | Relevo automático                                |
| `ROBOT_BUSY`                     | `«Los robots de acompañamiento están ocupados. Puedo ofrecerte ayuda humana ahora.»`               | `«Ir con una persona»`, `«Esperar un robot»`     |
| `HOST_LOCATION_STALE`            | `«El último dato de {anfitrión} no está actualizado. Voy a confirmar el encuentro.»`               | `«Contactar a {anfitrión}»`                      |
| `HANDOFF_ALREADY_ACCEPTED`       | `«Otra persona del equipo ya aceptó este relevo.»`                                                 | Actualiza la lista                               |
| `HANDOFF_EXPIRED`                | `«La solicitud de relevo venció sin aceptación. La visita sigue a cargo de quien la tenía.»`       | `«Solicitar de nuevo»`                           |
| `HANDOFF_NOT_FOUND`              | `«No encontramos este relevo.»`                                                                    | `«Volver a tareas»`                              |
| `HANDOFF_NOT_ASSIGNED`           | `«No tienes asignada esta tarea.»`                                                                 | `«Volver a tareas»`                              |
| `HANDOFF_INVALID_STATE`          | `«Este relevo cambió mientras lo mirabas. Se actualizó la información.»`                           | Refresca la tarjeta                              |
| `VISIT_NOT_FOUND`                | `«No encontramos esta visita.»`                                                                    | `«Ir al inicio»`                                 |
| `VISIT_ALREADY_CLOSED`           | `«Esta visita ya está cerrada.»`                                                                   | Muestra el detalle                               |
| `FEEDBACK_TEXT_TOO_LONG`         | `«El comentario admite hasta 300 caracteres.»`                                                     | Contador visible                                 |
| `FEEDBACK_ALREADY_SENT`          | `«Ya enviaste tu evaluación de esta visita.»`                                                      | Muestra lo enviado                               |

`QR_NOT_FOUND`, `INVITATION_NOT_FOUND` y `VISIT_NOT_FOUND` usan el mismo texto para «no existe» y «no tienes acceso», para no revelar qué identificadores existen.

### 0.8 Anuncios y foco (reglas comunes)

- Cada cambio de pantalla o de paso mueve el foco al titular (`h1`) de la nueva vista y lo anuncia. Los titulares llevan `tabindex="-1"`.
- Resultados de acción (éxito, error, cambio de estado de relevo) se anuncian en una región `aria-live="polite"`; los errores que bloquean continuar usan `role="alert"`.
- Orden de foco: cinta de demostración (no enfocable), navegación, contenido principal de arriba abajo, acciones secundarias, pie.
- Toda acción disponible con puntero lo es con teclado. `Enter` y `Espacio` activan botones; `Esc` cierra diálogos y paneles; las flechas mueven dentro de grupos de opciones (`radiogroup`).
- Movimiento: todas las transiciones respetan `prefers-reduced-motion`; con movimiento reducido pasan a fundido de 0 ms. Ninguna información depende de la animación.
- Idioma de la página: `es`. Los nombres de pila y los códigos no se traducen.

---

## 1. `/demo` Selector de demostración

**Propósito.** Permitir que el presentador entre en cualquiera de los puntos de vista de la demostración sin escribir correo ni clave. `/` abre el inicio de sesión (`/entrar`), que tiene un acceso rápido con las mismas cuentas y el botón «Elegir perfil» hacia esta pantalla.

**Quién la usa.** El presentador, desde un escritorio o un teléfono. La pantalla ocupa una columna de 600 px centrada sobre fondo `sage`, con líneas negras a los lados en ventanas anchas.

**Contenido, de arriba abajo.**

1. Barra con el botón de volver a la bienvenida («Volver a la bienvenida», hacia `/entrar`) y el botón «Ajustes».
2. Titular en Bodoni Moda `«¿Quién eres hoy?»` y texto `«Selecciona tu rol para continuar en N Club.»`
3. Ajustes (se abren con el botón «Ajustes»): grupo `«Fecha de trabajo»` con `«Sábado 24 oct 2026»` y `«Martes 27 oct 2026»`, la nota `«Cambiar la fecha reinicia los datos.»`, el botón `«Reiniciar datos»`, la línea de estado (`«Sin visitas en curso»`, `«1 visita en curso»` o `«{n} visitas en curso»`), el modo de datos y la fecha, y el botón `«Catálogo de diseño»` (`/design`).
4. Grupo `«Visitantes»`: filas con ícono, nombre en Bodoni Moda y una línea de descripción.

| Fila                   | Descripción                         | Destino                              |
| ---------------------- | ----------------------------------- | ------------------------------------ |
| `«Socio VIP»`          | `«Sofía · invitados y avisos»`      | `/entrar?cuenta=sofia@nclub.demo`    |
| `«Socia regular»`      | `«{nombre} · reservas e invitados»` | `/entrar?cuenta=camila@nclub.demo`   |
| `«Invitado»`           | `«pase sin cuenta»`                 | `/visita?tipo=invitado`              |
| `«Personal del club»`  | `«{nombre} · agenda y turno»`       | `/entrar?cuenta=personal@nclub.demo` |
| `«Trabajador externo»` | `«pase de servicio sin cuenta»`     | `/visita?tipo=externo`               |

5. Grupo `«Operación del club»`:

| Fila               | Descripción                                | Destino                               |
| ------------------ | ------------------------------------------ | ------------------------------------- |
| `«Concierge»`      | `«Llegadas y atención de salas»`           | `/entrar?cuenta=concierge@nclub.demo` |
| `«Edecán»`         | `«{nombre} · relevos y tareas del equipo»` | `/entrar?cuenta=edecan@nclub.demo`    |
| `«Robot R1»`       | `«Recepción · reconoce y orienta»`         | `/robot`                              |
| `«Administración»` | `«panel web de métricas»`                  | `/entrar?cuenta=admin@nclub.demo`     |

6. Bloque plegable `«Llegan como visitas»`: `«Sin credenciales: no son perfiles que se eligen aquí.»`, `«Valentina · invitada»` con `«Su anfitrión le emite un pase QR. Llega al robot.»`, `«Laura · trabajadora externa»` con `«Permiso de acceso los sábados. Llega al robot.»` y, si hay una invitación de ejemplo, el botón `«Abrir su pase»` (`/pase/{token}`).

Elegir una cuenta inicia sesión con la clave de ejemplo y abre la aplicación de ese rol (§14).

**Acciones.** Primaria: elegir una fila. Secundarias: cambiar la fecha de trabajo, reiniciar los datos (diálogo G8: titular `«¿Reiniciar los datos?»`, texto `«Se borran las visitas, invitaciones y relevos creados y vuelven los datos iniciales.»`, botones `«Cancelar»` y `«Reiniciar»`), abrir el catálogo de diseño.

**Estados.**

| Estado   | Tratamiento                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cargando | Tres esqueletos de fila de 76 px y `«Cargando…»`.                                                                                  |
| Vacío    | `«Sin visitas en curso»` en los ajustes. Las filas y los ajustes siguen disponibles.                                               |
| Error    | `DEMO_DATA_UNAVAILABLE` sustituyendo las filas del directorio; botón `«Recargar»`.                                                 |
| Éxito    | Tras reiniciar: `«Datos reiniciados.»` Tras cambiar la fecha: `«Fecha de trabajo: {fecha}.»` Ambos avisos aparecen en los ajustes. |

**Accesibilidad.** Las filas son enlaces con nombre accesible `«{nombre}, {rol}»`; `Enter` las abre. Las listas llevan etiqueta («Visitantes», «Operación del club»).

---

## 2. `/socio` Inicio del socio

**Propósito.** Ofrecer al socio su resumen del día, acceso a invitar a alguien y seguimiento de su visita.

**Quién la usa.** Andrés (VIP) o Camila (regular), desde el teléfono.

**Contenido, de arriba abajo.**

1. Cinta de demostración (G1) y barra superior con el nombre del club y menú.
2. Saludo en Bodoni Moda: `«Buenos días, Andrés»` (`«Buenas tardes»` desde las 12:00 y `«Buenas noches»` desde las 18:00, hora de Bogotá).
3. Insignia de categoría (G9): `«Socio VIP»` o `«Socia regular»`, y referencia de visita `«V-201»` o `«V-202»`.
4. Tarjeta **Tu visita de hoy**: destino y estado.
   - Implementado: `«Tu destino habitual: Salón reservado»` (Andrés) o `«Tu destino habitual: Cancha de tenis»` (Camila).
   - Si hay visita activa: estado (G9) y responsable actual (`«Te atiende R2»`, `«Te atiende Sofía»`). No hay botón `«Ver mi visita»` ni ruta `/visita/{id}` (fuera del MVP).
5. Botón primario `«Invitar a alguien»` (`/socio/invitar`).
6. Tarjeta **Mis invitaciones**: la lista de sus invitaciones, cada una con insignia de estado y los botones `«Ver pase»` y `«Cancelar»` (este último solo en las vigentes, con diálogo de confirmación). No hay enlace `«Ver todas»` ni ruta `/socio/invitaciones` (fuera del MVP).
7. Tarjeta **Hoy en el club**: tres actividades resumidas y enlace `«Ver actividades»` (`/actividades`).
8. Si hay una visita cerrada sin evaluar: tarjeta `«¿Cómo te fue hoy?»` con botón `«Evaluar mi visita»`, que despliega el formulario en la misma tarjeta (`«Enviar evaluación»`, `«Prefiero no evaluar»`).

**Acciones.** Primaria: `«Invitar a alguien»`. Secundarias: ver pase, cancelar una invitación, ver actividades, evaluar.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Esqueletos del saludo y de las tres tarjetas (G3).                                                                                                                                                                                           |
| Vacío      | Visita: `«No tienes una visita en curso. Cuando llegues al club, el robot de recepción te reconocerá.»` Invitaciones: `«Aún no has invitado a nadie.»` con botón `«Invitar a alguien»`. Actividades: `«Hoy no hay actividades registradas.»` |
| Error      | G5 dentro de la tarjeta afectada, sin vaciar el resto; `NETWORK_OFFLINE` muestra G7. Perfil ausente: `DEMO_PROFILE_REQUIRED` y redirección a `/demo`.                                                                                        |
| Éxito      | Al volver de crear una invitación: `«Invitación creada para {invitado}.»` (G6) en la tarjeta de invitaciones. Al cambiar el responsable: `«{responsable} continúa contigo.»`                                                                 |
| Simulación | G1; los datos de reserva, visita y actividades son ficticios y la tarjeta de visita muestra el sello G2 cuando su estado proviene de una acción del presentador (falla del robot).                                                           |

**Responsive.**

- 375: una columna; botón primario fijo al pie de la pantalla.
- 768: dos columnas; la visita ocupa el ancho completo en la cabecera.
- 1440: contenido centrado de 1120 px, tres columnas (visita y evaluación a la izquierda, invitaciones al centro, actividades a la derecha).

**Accesibilidad.** Foco inicial en el saludo. Orden: visita, invitar, invitaciones, actividades, evaluación. Los cambios de estado de la visita se anuncian en una región `aria-live="polite"` (por ejemplo `«Tu visita pasó a: esperando relevo»`).

**Teclas.** `Tab` en el orden anterior; `Enter` activa. El atajo `I` está fuera del MVP.

---

## 3. `/socio/invitar` Crear invitación

**Propósito.** Registrar a un invitado ficticio para una fecha y emitir su pase QR temporal, sin crear cuenta para el invitado.

**Quién la usa.** Andrés o Camila.

**Contenido, de arriba abajo.**

1. Navegación `«← Mi inicio»` y titular `«Invitar a alguien»`; texto `«Tu invitado recibirá un pase con código QR. No necesita crear una cuenta.»`
2. Formulario:

| Campo              | Etiqueta                        | Reglas                                                                                                                   | Texto de ayuda                                                              |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Nombre             | `«Nombre de tu invitado»`       | Obligatorio, 2 a 60 caracteres.                                                                                          | `«Solo el nombre de pila basta.»`                                           |
| Fecha              | `«Fecha de la visita»`          | Obligatoria; desde la fecha simulada de hoy hasta 30 días. Implementado como texto `AAAA-MM-DD` (sin selector de fecha). | `«El pase solo vale ese día. Formato AAAA-MM-DD, hasta 30 días desde hoy.»` |
| Punto de encuentro | `«Punto de encuentro»`          | Selección: Terraza, Salón reservado, Cancha de tenis. Valor inicial: Terraza.                                            | `«Es donde lo esperas.»`                                                    |
| Bebida             | `«Bebida preferida (opcional)»` | Texto libre de hasta 40 caracteres.                                                                                      | `«El robot se lo ofrecerá, sin darlo por hecho.»`                           |
| Foto               | `«Foto de ejemplo»`             | Interruptor, apagado por defecto. Al activarlo muestra un avatar de ejemplo con sello G2.                                | `«En esta demostración no se sube ninguna foto.»`                           |

3. Resumen fijo a la derecha o al pie: `«{nombre} · {fecha} · {punto}»`.
4. Botón primario `«Crear invitación»`; secundario `«Cancelar»`.

**Acciones.** Primaria: crear. Secundaria: cancelar (vuelve a `/socio` sin guardar; si hay datos escritos, G8 con `«¿Descartar la invitación?»`, `«Se perderán los datos escritos.»`, botones `«Seguir editando»` y `«Descartar»`).

**Validación.** Al salir de un campo (no mientras se escribe) y al enviar. Un error muestra el mensaje bajo el campo, con ícono, `aria-describedby` y el campo marcado con borde `error`. Al enviar con errores, el foco va al primer campo inválido y se anuncia `«Hay {n} campos por corregir.»`.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Esqueleto de formulario hasta que estén los puntos de encuentro. Al enviar: botón `«Creando invitación…»` (G10); los campos quedan de solo lectura.                                                                                                                                                              |
| Vacío      | Formulario inicial sin errores. Sin lista de puntos de encuentro disponible: `«No hay puntos de encuentro configurados.»` y botón deshabilitado.                                                                                                                                                                 |
| Error      | `INVITATION_GUEST_NAME_REQUIRED`, `INVITATION_DATE_INVALID` bajo el campo; `INVITATION_DUPLICATE`, `NETWORK_OFFLINE`, `SERVER_ERROR`, `RATE_LIMITED` en un bloque G5 sobre el botón. Los datos escritos se conservan siempre.                                                                                    |
| Éxito      | Se sustituye el formulario por la confirmación: ícono de verificación, `«Invitación creada para {nombre}.»`, vista previa del pase (QR con sello G2 `«QR de demostración»`), botones `«Ver pase»` (`/pase/{token}`), `«Copiar enlace del pase»` (confirma con `«Enlace copiado.»`) y `«Invitar a otra persona»`. |
| Simulación | G1; el QR y la foto llevan el sello G2; el pie dice `«Este QR no abre puertas reales.»`                                                                                                                                                                                                                          |

**Responsive.**

- 375: campos apilados; resumen colapsado sobre el botón; botón primario a ancho completo.
- 768: formulario en una columna de 560 px con resumen a la derecha.
- 1440: formulario de 560 px a la izquierda y vista previa del pase en vivo a la derecha.

**Accesibilidad.** Cada campo con `label` visible. El selector de fecha admite escribir con teclado. Los errores se anuncian con `role="alert"` al enviar. El interruptor de foto es un `switch` con estado hablado.

**Teclas.** `Enter` en un campo de texto avanza al siguiente; `Enter` en el último envía; `Esc` abre el diálogo de descarte si hay cambios.

---

## 4. `/socio/invitaciones` Mis invitaciones

> **Fuera del MVP.** La ruta no existe: la lista de invitaciones, el pase y la cancelación están en la tarjeta «Mis invitaciones» de `/socio`. Se conserva la especificación como referencia de una versión posterior.

**Propósito.** Consultar, abrir o cancelar las invitaciones emitidas.

**Quién la usa.** Andrés o Camila.

**Contenido, de arriba abajo.**

1. Navegación `«← Mi inicio»`, titular `«Mis invitaciones»`, botón `«Invitar a alguien»`.
2. Filtros en pestañas: `«Próximas»` (por defecto), `«Usadas»`, `«Vencidas o canceladas»`.
3. Lista de tarjetas: nombre del invitado, fecha, punto de encuentro, insignia de estado (`«Vigente»`, `«Usada»`, `«Vencida»`, `«Cancelada»`) y acciones `«Ver pase»` y `«Cancelar invitación»` (solo en vigentes).

**Acciones.** Primaria: `«Ver pase»`. Secundaria: cancelar. La cancelación abre G8: `«¿Cancelar la invitación de {nombre}?»`, `«Su pase dejará de ser válido de inmediato.»`, botones `«Conservar»` y `«Cancelar invitación»`.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Tres esqueletos de tarjeta.                                                                                                                                 |
| Vacío      | `«Aún no has invitado a nadie.»` con botón `«Invitar a alguien»`. Pestañas sin elementos: `«No hay invitaciones en esta lista.»`                            |
| Error      | G5 con `NETWORK_OFFLINE` o `API_UNAVAILABLE` sobre la lista; `INVITATION_NOT_FOUND` o `INVITATION_ALREADY_CANCELLED` al cancelar, con la lista actualizada. |
| Éxito      | Tras cancelar: la tarjeta pasa a `«Cancelada»` y se anuncia `«Invitación de {nombre} cancelada.»`; no desaparece de golpe.                                  |
| Simulación | G1; los pases muestran `«QR de demostración»` con sello G2 al abrirse.                                                                                      |

**Responsive.**

- 375: tarjetas apiladas; acciones en una fila bajo cada tarjeta.
- 768: dos columnas.
- 1440: tabla con columnas Invitado, Fecha, Punto, Estado, Acciones; el pase se abre en un panel lateral.

**Accesibilidad.** Las pestañas siguen el patrón `tablist` con flechas. Cada acción incluye el nombre del invitado en su etiqueta accesible (`«Cancelar invitación de Valentina»`).

**Teclas.** Flechas entre pestañas; `Enter` activa; `Supr` sobre una tarjeta enfocada no cancela (acción destructiva: solo botón y diálogo).

---

## 5. `/pase/[token]` Pase del invitado

**Propósito.** Entregar al invitado, sin cuenta ni contraseña, su pase con QR y explicarle con claridad el estado de validez.

**Quién la usa.** El invitado (por ejemplo Valentina), desde su teléfono, abriendo el enlace `/pase/<token>` que recibió. Sin cuenta. El token es la única credencial: la validez se consulta con `GET /passes/{token}` y un enlace antiguo con `?inv=` se ignora.

**Contenido, de arriba abajo.**

1. Cinta de demostración (G1).
2. Cabecera negra (`ink`) a ancho completo con el nombre del club en dorado y el titular `«Tu pase de visita»` en Bodoni Moda y blanco cálido.
3. Tarjeta del pase: `«Hola, {nombre}»` (solo el nombre de pila), `«Invitación de {anfitrión}»`, fecha, `«Punto de encuentro: {punto}»`, ventana de validez (`«Válido el sáb 24 oct 2026»`), insignia de estado (G9): `«Vigente»`.
4. QR grande de alto contraste (cuadrado, fondo blanco, margen de silencio de 4 módulos) con sello G2 `«QR de demostración»`. El QR codifica solo un identificador opaco.
5. Botón `«Mostrar a pantalla completa»` (QR ampliado y brillo máximo sugerido).
6. Texto de ayuda: `«Preséntalo en recepción. El robot lo leerá y confirmará tu visita.»`
7. Bloque `«¿Sin teléfono o sin QR?»`: `«Dile tu nombre a una persona de recepción. Podemos ayudarte sin que instales nada.»`
8. Acciones secundarias: `«Copiar enlace»`.
9. Pie: `«Este pase se valida en recepción. Una captura de pantalla no es suficiente por sí sola.»`

**Estados del pase.** Cada estado reemplaza la tarjeta y el QR; no se muestra QR en ningún estado distinto de `«Vigente»`.

| Estado        | Insignia          | Mensaje                                                                          | Código             |
| ------------- | ----------------- | -------------------------------------------------------------------------------- | ------------------ |
| Vigente       | `«Vigente»`       | Datos del pase y QR                                                              |                    |
| Aún no válido | `«Aún no válido»` | `«Este pase aún no es válido. Será válido el {fecha}.»`                          | `QR_NOT_YET_VALID` |
| Vencido       | `«Vencido»`       | `«Este pase venció. Pide a tu anfitrión que te envíe uno nuevo.»`                | `QR_EXPIRED`       |
| Ya usado      | `«Usado»`         | `«Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.»` | `QR_ALREADY_USED`  |
| Cancelado     | `«Cancelado»`     | `«Tu anfitrión canceló esta invitación.»`                                        | `QR_REVOKED`       |
| No encontrado | `«No válido»`     | `«No encontramos este pase.»`                                                    | `QR_NOT_FOUND`     |

**Estados de la pantalla.**

| Estado     | Tratamiento                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Esqueleto de tarjeta y de QR (G3) con el texto `«Comprobando tu pase…»`. La validez siempre se consulta al servicio, nunca se deduce del enlace.                                                                                                        |
| Vacío      | Un enlace sin pase asociado se trata como «No encontrado»: tarjeta con insignia `«No válido»` y `QR_NOT_FOUND`.                                                                                                                                         |
| Error      | `NETWORK_OFFLINE`, `API_UNAVAILABLE`: G5 con `«No pudimos comprobar tu pase.»` y botón `«Reintentar»`. Si el pase ya estaba visible al perder la conexión, el QR permanece y se añade el aviso `«Sin conexión: la validez se comprobará en recepción.»` |
| Éxito      | Pase vigente mostrado. Tras copiar el enlace: `«Enlace copiado.»`                                                                                                                                                                                       |
| Simulación | G1 y sello `«QR de demostración»`; pie `«Este QR no abre puertas reales.»`                                                                                                                                                                              |

**Responsive.**

- 375: tarjeta a ancho completo; QR de 280 px (o el ancho disponible menos 40 px).
- 768: tarjeta centrada de 480 px; QR de 320 px.
- 1440: tarjeta centrada de 480 px sobre fondo `ivory`, con la cabecera negra a ancho completo.

**Accesibilidad.** El QR tiene `role="img"` y texto alternativo `«Código QR de tu pase. Muéstralo en recepción.»`; la información que contiene no se expone como texto. El pase completo se puede leer sin ver el QR. El estado se anuncia al cargar (`«Pase vigente para el sábado 24 de octubre»`).

**Teclas.** `Tab`: botón de pantalla completa, copiar enlace. `Esc` cierra la pantalla completa y devuelve el foco al botón.

---

## 6. `/robot` Kiosco de recepción

**Propósito.** Ser la voz única del robot: recibir, confirmar quién llega, orientar según la categoría, acompañar, pedir ayuda y despedir. La misma pantalla representa a R1 en recepción y al robot que acompaña (por ejemplo R2); la cabecera indica cuál.

**Quién la usa.** El visitante frente al robot; el presentador mediante el panel del presentador.

**Reglas de la pantalla.**

- Fondo `ivory`, texto `ink`, cabecera con línea negra y el sello al centro; el saludo y los titulares van en Bodoni Moda, grandes y centrados (de 36 a 96 px según el ancho), y el resto en Geist. Un solo mensaje por pantalla, una pregunta a la vez.
- Máximo tres botones por pantalla; el botón principal a la derecha o arriba, 56 px de alto como mínimo.
- Cabecera fija: nombre del robot (`«Robot R1»`; el nombre accesible es `«Robot R1 · Recepción»`, o `«Robot R2 · Acompañando»`, `«Sofía · Acompañando»`), estado `«En línea»`, el sello y los botones de ícono `«Necesito ayuda»` (siempre presente) y `«Ajustes del robot»`. Implementado: solo muestra el aviso `«Aviso enviado a recepción. Una persona del equipo viene en camino.»` en el kiosco; no crea una tarea en el panel del edecán.
- Barra inferior del kiosco: `«Inicio»`, `«Visitas»`, `«Mapa»`, `«Concierge»` y `«Ajustes»`; `«Inicio»` es el flujo R-01 a R-13 y `«Ajustes»` abre el cajón de operación.
- Ninguna decisión de acceso depende solo del rostro: la categoría y los permisos siempre se confirman con registros (invitación, membresía, turno o permiso).
- Cada resultado de cámara o de rostro lleva el sello G2 `«Simulación»`.

**Panel del presentador (solo demostración).** Cajón en el borde inferior, cerrado por defecto (abierto en la pantalla de reconocimiento), con rótulo `«Operación»` y `«Ajustes del robot»`. Se abre con el botón `«Operación»` (o con la pestaña `«Ajustes»` de la barra inferior); la tecla `P` está fuera del MVP.

| Control                                                            | Opciones                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `«Rostro a reconocer»` (botones, en la pantalla de reconocimiento) | `«Andrés · miembro»`, `«Camila · miembro»`, `«Valentina · no miembro»`, `«Mario · no miembro»`, `«Laura · no miembro»`, `«Daniela · socia y personal»`, `«Esteban · membresía suspendida»`, `«Iván · membresía vencida»`, `«Male · miembro»`, `«Paula · sin turno hoy»`, `«Rostro desconocido»`, `«Error de cámara»` |
| `«Fecha de trabajo»`                                               | `«Sábado 24 oct 2026»`, `«Martes 27 oct 2026»`                                                                                                                                                                                                                                                                       |
| Acciones                                                           | `«Marcar llegada al destino»`, `«Marcar regreso a recepción»`, `«Reportar falla del robot»`, `«Reiniciar esta visita»` (solo limpia la pantalla del kiosco) y `«Reiniciar datos»` (con diálogo `«¿Reiniciar los datos?»`)                                                                                            |

Las acciones aparecen habilitadas solo cuando tienen sentido: `«Marcar llegada al destino»` durante la ruta (o con el relevo confirmado), `«Marcar regreso a recepción»` en el reposo con una visita abierta y `«Reportar falla del robot»` solo durante la ruta con un robot distinto de R1. Cambiar la fecha de trabajo reinicia los datos de ejemplo y devuelve el kiosco al reposo.

### 6.1 Pantallas del kiosco

| Id   | Pantalla             | Titular                             | Contenido y botones                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Siguiente                                  |
| ---- | -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| R-01 | Bienvenida (reposo)  | `«Bienvenido a N Club»`             | Subtítulo `«Soy el robot de recepción.»`. Botones: `«Comenzar»` (principal), `«Tengo un código QR»` (abre la etapa de QR dentro de `/robot`), `«Necesito ayuda»` (en la cabecera).                                                                                                                                                                                                                                                                                                                                                                                               | R-02                                       |
| R-02 | Reconocimiento       | `«Voy a confirmar tu visita»`       | Recuadro de cámara con sello G2 `«Simulación de cámara»`. Texto `«Bienvenido. Voy a confirmar tu visita. Si lo necesitas, podemos usar tu QR o pedir ayuda en recepción.»` Indicador de espera sin porcentaje. Botón `«Usar mi QR»`. El resultado llega cuando el presentador elige un rostro en el panel; no hay espera fija de 2 s ni resultado automático a los 6 s (fuera del MVP).                                                                                                                                                                                          | R-03 o R-13                                |
| R-03 | Confirmación         | `«{nombre}, ¿eres tú?»`             | Línea de evidencia (por ejemplo `«Membresía vigente»`, `«Invitación de {anfitrión} para hoy»`, `«Credencial de personal vigente»`, `«Visita de servicio registrada para hoy»`) con sello G2 en el resultado facial. Botones: `«Sí, soy yo»`, `«No soy yo»` (lleva a R-13a: QR o ayuda; no abre visita). El regreso automático a los 60 s está fuera del MVP.                                                                                                                                                                                                                     | R-04 o R-13                                |
| R-04 | Saludo y preferencia | Saludo de la categoría              | Ver `orientation-copy.md`, fila «Saludo». Tres botones de respuesta. Staff: «Verlo en mi teléfono» / «Ahora no».                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | R-05                                       |
| R-05 | Destino              | Pregunta de destino de la categoría | Botones de la fila «Pregunta de destino». Para VIP, `«Ver actividades de hoy»` abre la lista dentro del kiosco con botón `«Volver»`.                                                                                                                                                                                                                                                                                                                                                                                                                                             | R-06                                       |
| R-06 | Asignación           | Fila «Asignación»                   | Quién acompaña y dos botones. Sin robot libre: `ROBOT_BUSY`. Orientación sin acompañante (`ASSIGN_ESCORT` con `NONE`): personal del club, y socios o invitados que eligen `«Recibir indicaciones»` o `«Prefiero recibir indicaciones»`; recepción conserva la visita y sigue en R-07. Un externo siempre va con una persona. Una identidad confirmada por QR tras un rostro no reconocido sigue el guion de su categoría (invitado: R2); el texto `«{edecán} continuará contigo…»` está fuera del MVP. Si el acompañante asignado no está disponible, se ofrece `«Ir con Sara»`. | R-07                                       |
| R-07 | Acompañamiento       | Fila «Ruta»                         | Línea de ruta de tres puntos (`«Recepción»`, `«Pasillo»`, `«{destino}»`) con el punto actual resaltado. Sin porcentaje ni tiempo estimado. Indicador `«R2 te acompaña · robot de acompañamiento»` o `«Sara te acompaña · persona del equipo»`.                                                                                                                                                                                                                                                                                                                                   | R-08, R-09                                 |
| R-08 | Llegada              | Fila «Llegada»                      | Confirmación del destino. Botón `«Entendido»`. Invitada: `«Contactar a {anfitrión}»`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Visita activa (reposo con visita en curso) |
| R-09 | Falla y ayuda        | `«Tengo un inconveniente»`          | Texto `«Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.»` con sello G2 `«Simulación de falla»` si proviene del presentador. Estado del relevo en línea: `«Ayuda solicitada»` → `«{edecán} va hacia ti»` → `«{edecán} ya tiene tu destino»` → `«{edecán} continúa contigo»`. Botón `«Mostrar mi QR»` (R-13c). Sin pantalla muerta: siempre hay un estado y una salida.                                                                                                                                                                                       | R-07 con edecán                            |
| R-10 | Salida               | Fila «Salida»                       | Implementado: `«Marcar regreso a recepción»` abre directamente la pregunta de salida de la categoría (por ejemplo `«¿Ya terminaste tu visita por hoy?»`) con `«Sí, terminé»` y `«Todavía no»`; no se vuelve a reconocer a la persona. Si la persona responsable de la visita es un edecán, la salida es asistida: `«{nombre}, ya casi terminamos. {edecán} confirmará tu salida.»` y el kiosco espera a que el edecán cierre la visita.                                                                                                                                          | R-11                                       |
| R-11 | Evaluación           | `«¿Cómo te fue?»`                   | Texto de evaluación. Dos filas de 1 a 5 (`«Servicio de los robots»`, `«Servicios del club»`), cuadro de comentario opcional (hasta 300 caracteres) y botones `«Enviar»`, `«Prefiero no participar»`.                                                                                                                                                                                                                                                                                                                                                                             | R-12                                       |
| R-12 | Despedida            | Fila «Despedida»                    | Texto de despedida de la categoría. Botón `«Listo»`; si no se pulsa, vuelve a R-01 a los 15 s con una barra de tiempo visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | R-01                                       |
| R-13 | No puedo confirmar   | Ver variantes                       | a) rostro desconocido; b) error de cámara; c) pase QR con problema; d) denegación; e) verificación manual. Ver 6.2.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Alternativa                                |

### 6.2 Variantes de R-13

| Variante | Causa                                                                 | Titular                              | Mensaje                                                                                       | Botones                         | Código                         |
| -------- | --------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------ |
| a        | Rostro no reconocido                                                  | `«No pude confirmar tu identidad»`   | Mensaje del código                                                                            | `«Usar mi QR»`, `«Pedir ayuda»` | `RECOGNITION_UNKNOWN`          |
| b        | Falla de cámara                                                       | `«No pude usar la cámara»`           | Mensaje del código                                                                            | `«Usar mi QR»`, `«Pedir ayuda»` | `RECOGNITION_ERROR`            |
| c        | Rostro de persona sin pase (no miembro sin evidencia)                 | `«Necesito tu pase»`                 | `«Para continuar necesito tu pase de invitación. Muéstrame tu QR o pide apoyo en recepción.»` | `«Usar mi QR»`, `«Pedir ayuda»` | `ACCESS_DENIED_NO_EVIDENCE`    |
| d        | Denegación con explicación (por ejemplo externa en día no autorizado) | `«No puedo confirmar su visita hoy»` | Mensaje del código                                                                            | `«Avisar a recepción»`          | `EXTERNAL_DAY_NOT_ALLOWED`     |
| e        | Evidencias que no coinciden                                           | `«Recepción puede ayudarte»`         | `«No puedo confirmar esta visita. Recepción puede ayudarte.»`                                 | `«Avisar a recepción»`          | `CLASSIFICATION_MANUAL_REVIEW` |

`«Pedir ayuda»` y `«Avisar a recepción»` crean una tarea para el edecán (tipo Verificación) y muestran `«Aviso enviado a recepción. Una persona del equipo viene en camino.»` (G6). No conceden acceso.

### 6.3 Estados de la ruta

| Estado     | Tratamiento                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cargando   | Pantalla R-01 con `«Preparando al robot…»` y esqueleto del titular, hasta que cargue el estado. Al enviar una respuesta: el botón pulsado pasa a ocupado (G10) y los demás se deshabilitan.                                                            |
| Vacío      | R-01 es el estado vacío: no hay visitante. Si hay visitas en curso en otros puestos, no se muestran en el kiosco.                                                                                                                                      |
| Error      | `NETWORK_OFFLINE`: franja G7 y R-13 con ayuda humana disponible; el robot no acepta tareas nuevas ni confirma permisos sin verificarlos. `SERVER_ERROR`: `«No pude registrar tu respuesta. Inténtalo de nuevo.»` con `«Reintentar»` y `«Pedir ayuda»`. |
| Éxito      | R-12 despedida. La visita queda `«Cerrada»`.                                                                                                                                                                                                           |
| Simulación | Sello G2 en cámara, resultado facial, falla del robot y cada acción del panel del presentador. El rótulo `«Demostración · el reconocimiento facial es simulado»` se muestra bajo la cabecera en R-02 y R-03.                                           |

**Responsive.**

- 375: una columna; botones a ancho completo apilados; panel del presentador a pantalla completa al abrirse.
- 768 (objetivo principal del kiosco, vertical u horizontal): titular a 52 px, botones de 64 px, panel del presentador como cajón inferior de 40 % de alto.
- 1440: contenido centrado en columna de 880 px, con la línea de ruta y el estado del relevo a la derecha; panel del presentador como cajón lateral derecho de 360 px.

**Accesibilidad.** El titular recibe el foco en cada pantalla y se anuncia. Los botones de respuesta forman un grupo con el nombre de la pregunta como etiqueta. La línea de ruta es una lista ordenada con `aria-current="step"` en el punto actual. Los cambios del estado del relevo se anuncian en una región `aria-live="polite"`; la falla se anuncia con `role="alert"`. Los textos del robot se muestran siempre por escrito; no hay información solo por voz.

**Teclas.** `Enter` y `Espacio` activan los botones. Los atajos `1`, `2`, `3`, `A` y `P` están fuera del MVP.

---

## 7. Alternativa con QR (etapa de `/robot`)

> **Implementado como etapa de `/robot`**, no como la ruta `/robot/qr`: se llega con `«Tengo un código QR»`, `«Usar mi QR»` o desde un resultado dudoso, y `«Volver»` regresa al reposo (o a la pantalla de relevo si hay una ayuda en camino).

**Propósito.** Permitir entrar por la vía QR cuando falla el rostro, no hay consentimiento facial o el visitante prefiere el pase.

**Quién la usa.** El visitante con pase (por ejemplo Valentina o Tomás) frente al robot; el presentador.

**Contenido, de arriba abajo.**

1. Cabecera del kiosco con `«Necesito ayuda»`; botón `«Volver»` bajo el campo de código.
2. Titular `«Muestra tu código QR»`.
3. Recuadro de cámara con sello G2 `«Simulación de cámara»` y guía de encuadre.
4. Texto `«Coloca el código dentro del recuadro. Lo comprobaré con el registro del club.»`
5. Campo `«O escribe el código de tu pase»` con botón `«Comprobar»`.
6. Atajos de demostración (en el panel del presentador), generados con las invitaciones reales de Andrés, Camila y Male: `«Usar el pase de {nombre}»` (hasta tres pases vigentes, por ejemplo `«Usar el pase de Valentina»`) y, si existen, `«Probar un pase ya usado»`, `«Probar un pase cancelado»`, `«Probar un pase vencido»`, más `«Probar un pase manipulado»`. `«Probar un pase para otra área»` y `QR_NOT_AUTHORIZED` están fuera del MVP.

**Acciones.** Primaria: leer o `«Comprobar»`. Secundarias: volver, pedir ayuda. Resultado válido: pasa a R-03 (confirmación) con la evidencia `«Invitación de {anfitrión} para hoy»`; el pase queda marcado `Usado` en cuanto el servidor lo verifica. Si la persona responde `«No soy yo»`, la visita recién creada se cierra. Un pase ya usado devuelve `QR_ALREADY_USED`.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cargando   | Cámara iniciando: `«Abriendo la cámara…»`. Al comprobar: botón `«Comprobando…»` (G10).                                                                                                                                                                                                                                                                                                                                                                                         |
| Vacío      | Cámara lista y campo vacío: `«Esperando tu código…»`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Error      | Un G5 bajo el recuadro con el código correspondiente: `CAMERA_DENIED`, `CAMERA_UNAVAILABLE`, `QR_INVALID`, `QR_NOT_FOUND`, `QR_EXPIRED`, `QR_NOT_YET_VALID`, `QR_ALREADY_USED`, `QR_REVOKED`, `QR_NOT_AUTHORIZED`, `NETWORK_OFFLINE`. Tras un error la pantalla no se bloquea: el campo conserva el texto y se puede intentar otra vez. El límite de tasa del servidor (`RATE_LIMITED`) se aplica por dirección y minuto; no hay un contador de cinco intentos en la pantalla. |
| Éxito      | Paso inmediato a R-03 (el aviso `«Pase confirmado.»` de 1 s está fuera del MVP).                                                                                                                                                                                                                                                                                                                                                                                               |
| Simulación | Sello G2 en la cámara y en cada atajo; la lectura del código desde la cámara es simulada en la demostración.                                                                                                                                                                                                                                                                                                                                                                   |

**Responsive.**

- 375: cámara a ancho completo, campo y botón apilados.
- 768: cámara de 480 px, campo debajo.
- 1440: cámara y campo lado a lado en columna de 880 px.

**Accesibilidad.** Si el permiso de cámara se niega, el foco pasa al campo de código y se anuncia `«La cámara está bloqueada. Puedes escribir el código.»` El recuadro de cámara tiene `aria-label="Vista de la cámara (simulación)"`. Cada error se anuncia con `role="alert"`.

**Teclas.** `Enter` en el campo comprueba; `Esc` no vuelve (fuera del MVP).

---

## 8. `/edecan` Panel del edecán

**Propósito.** Que el edecán vea qué le piden, acepte una tarea o un relevo, reciba el contexto de la visita sin pedírselo de nuevo a la persona, confirme la entrega, valide un QR y reporte una incidencia.

**Quién la usa.** Sofía (edecán), desde tableta o teléfono, de pie y con una mano.

**Contenido, de arriba abajo.**

1. Cinta (G1) y cabecera: `«Sofía · Edecán»`, estado `«Disponible»` / `«Con una visita»` (conmutador) y número de tareas pendientes.
2. **Equipo** (franja de recursos): `«R1 · Recepción»`, `«R2 · {estado}»`, `«R3 · {estado}»`, `«Sara · {estado}»`, `«Sofía · {estado}»`, `«Ramiro · {estado}»`. Estados: `«Disponible»`, `«Atendiendo»`, `«Acompañando»`, `«Detenido»`, `«Fuera de servicio»`.
3. **Tareas** (lista, la más urgente primero). Tipos de tarjeta: `«Relevo»`, `«Acompañamiento»`, `«Verificación»`, `«Incidencia»`.
   - Tarjeta de relevo: `«Relevo solicitado»`, visitante y categoría (`«Andrés · Socio VIP»`), `«De: R2 → A: Equipo»` (pasa a `«A: Sofía»` al aceptar), destino, último punto confirmado, motivo (`«Falla de R2 (simulación)»`), hora de solicitud y de vencimiento, insignia de estado (G9).
   - Tarjeta `«Verificación»`: una visita en revisión manual (por ejemplo, rostro no reconocido) con el motivo y el botón `«Validar su QR»`.
4. **Visita en curso** (cuando es responsable): destino, estado, contexto (ver abajo), línea de tiempo y acciones.
5. **Validar QR**: tarjeta con el campo `«Código del pase»` y el botón `«Validar QR»` (sello `«Lectura de QR simulada»`). Un pase válido abre una visita confirmada a nombre del edecán; si se abrió desde una tarjeta `«Verificación»` con `«Validar su QR»`, el pase se vincula con esa visita.
6. **Reportar incidencia**: fuera del MVP (no existe el botón ni el formulario).

**Detalle de una tarea de relevo (panel o página).**

- Cabecera con avance de cuatro pasos: `«Solicitado»` → `«Aceptado»` → `«Contexto recibido»` → `«Confirmado»`.
- Aviso permanente sobre `sage`: `«R2 sigue siendo el responsable de la visita hasta que confirmes el relevo.»`
- Tarjeta **Contexto de la visita**: nombre y categoría, destino confirmado, permisos vigentes, preferencias pertinentes (por ejemplo `«Café»`), último punto confirmado, avance. No incluye datos ajenos al servicio.
- Botones, uno a la vez según el estado:

| Estado del relevo     | Botón principal             | Botón secundario                                  |
| --------------------- | --------------------------- | ------------------------------------------------- |
| `REQUESTED`           | `«Aceptar relevo»`          | `«Rechazar»` (oculta la tarea solo en este panel) |
| `ACCEPTED`            | `«Recibí el contexto»`      |                                                   |
| `CONTEXT_TRANSFERRED` | `«Confirmar relevo»`        |                                                   |
| `CONFIRMED`           | `«Ir a la visita en curso»` |                                                   |

- `«Confirmar relevo»` abre G8: titular `«¿Ya estás con {visitante}?»`, texto `«Al confirmar serás la responsable de esta visita. R2 queda liberado.»`, botones `«Todavía no»` y `«Sí, asumo la visita»`.
- Implementado: no existe la tarjeta `«Acompañamiento»` ni `«Aceptar acompañamiento»`. Una visita confirmada a nombre del edecán (por ejemplo, tras validar un pase) aparece en `«Visita en curso»` con `«Comenzar acompañamiento»`.
- Visita en curso, acciones: `«Confirmar llegada a {destino}»` (G8 de una línea) y `«Cerrar visita»` (G8: `«¿Cerrar la visita de {visitante}?»`, `«Confirmas que salió del club. No se puede reabrir.»`, botones `«Todavía no»` y `«Cerrar visita»`).

**Acciones.** Primaria: la de la tabla anterior según el estado. Secundarias: validar QR, reportar incidencia, cambiar disponibilidad.

**Vencimiento.** Una solicitud de relevo sin aceptar vence a los 300 s; una aceptada, a los 600 s desde la aceptación. La tarjeta muestra la hora de vencimiento.

**Reglas de estado.** La solicitud de relevo no cambia al responsable; solo la confirmación lo hace. Si dos personas aceptan al mismo tiempo, el servicio resuelve cuál gana: el botón se deshabilita mientras la acción está en curso, pero la decisión no depende de la interfaz. La confirmación es idempotente: pulsarla dos veces no crea un segundo cambio.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Esqueleto de la franja de equipo y de dos tarjetas de tarea. Al pulsar un botón de acción: texto en gerundio (`«Aceptando…»`, `«Confirmando…»`) y deshabilitado (G10).                                                                                                                                                                                                                                                                              |
| Vacío      | Tareas: `«No hay tareas pendientes. Cuando un robot o recepción pida ayuda, aparecerá aquí.»` Visita en curso: `«No tienes una visita en curso.»`                                                                                                                                                                                                                                                                                                   |
| Error      | G5 en la tarjeta afectada con `HANDOFF_ALREADY_ACCEPTED`, `HANDOFF_EXPIRED`, `HANDOFF_NOT_FOUND`, `HANDOFF_NOT_ASSIGNED`, `HANDOFF_INVALID_STATE`, `VISIT_NOT_FOUND`, `VISIT_ALREADY_CLOSED`, `NETWORK_OFFLINE`. La tarjeta se actualiza con el estado real y conserva lo escrito en la incidencia. En `NETWORK_OFFLINE` se muestra G7 y las acciones de escritura se deshabilitan; no se repiten órdenes al volver la red sin comprobar el estado. |
| Éxito      | Cada transición se confirma en la propia tarjeta (G6): `«Aceptaste el relevo. R2 sigue siendo el responsable hasta que lo confirmes.»`, `«Contexto recibido.»`, `«Aceptaste acompañar a {visitante}.»`, `«Eres la responsable de la visita de {visitante}.»`, `«Llegada a {destino} registrada.»`, `«Visita cerrada.»`, `«Incidencia registrada.»`                                                                                                  |
| Simulación | G1. Las tareas creadas por el panel del presentador (falla de R2) llevan el sello G2 y el motivo `«Falla de R2 (simulación)»`. El lector de QR lleva el sello G2.                                                                                                                                                                                                                                                                                   |

**Incidencia (fuera del MVP).** Formulario previsto: `«Tipo»` (`«Robot detenido»`, `«Ruta bloqueada»`, `«Persona perdida o fuera de ruta»`, `«Pase o identidad que no coinciden»`, `«Emergencia»`, `«Otra»`), `«Nota»` (obligatoria, hasta 300 caracteres) y botón `«Registrar incidencia»`. Texto fijo para emergencia: `«Si hay una emergencia, sigue el protocolo del club primero.»`

**Responsive.**

- 375: lista de tareas; el detalle abre como hoja inferior a pantalla completa; botón principal fijo al pie.
- 768: dos columnas, lista a la izquierda y detalle a la derecha.
- 1440: tres columnas (equipo, tareas, detalle y contexto), con la franja de equipo vertical.

**Accesibilidad.** Cada tarjeta es un `article` con titular y estado en su etiqueta. La llegada de una tarea nueva se anuncia con `aria-live="polite"` (`«Nueva tarea: relevo solicitado para Andrés»`). El avance de cuatro pasos es una lista ordenada con `aria-current="step"`. Los botones de acción mantienen el foco en el mismo lugar tras la transición para evitar saltos.

**Teclas.** `Tab` recorre tarjetas y acciones; `Enter` abre y activa; `Esc` cierra el detalle o diálogo. No hay atajo para aceptar ni confirmar: son acciones con consecuencias y requieren botón.

---

## 9. `/personal` Agenda y entrada del personal

**Propósito.** Que el personal del club consulte su agenda y turno en privado y vea los accesos de proveedores autorizados para el día.

**Quién la usa.** Mario (personal), desde su teléfono o un escritorio.

**Contenido, de arriba abajo.**

1. Cinta (G1), saludo `«Buen día, Mario»`, insignia `«Personal del club»` y referencia `«V-204»`.
2. **Mi agenda de hoy** (privada): implementada como el turno del día, con las entradas `«8:00 a. m. · Inicio de turno · Operaciones»` y `«8:00 p. m. · Fin de turno · Operaciones»`; no hay notas privadas en la agenda. Rótulo `«Solo tú ves esto»`. Cuando el robot envía el resumen, se añade `«Resumen recibido desde recepción.»` con el texto del resumen.
3. **Mi turno**: `«Operaciones · turno de 8:00 a. m. a 8:00 p. m.»` y estado de la credencial `«Credencial vigente»`.
4. **Mi ingreso de hoy**: texto `«Cuando llegues, el robot de recepción confirmará tu credencial y te saludará. Si no necesitas ayuda, sigues por tu cuenta.»` y, si la visita está abierta, su estado (G9) y el destino `«Operaciones»`.
5. **Proveedores autorizados hoy**: lista de solo lectura con nombre, servicio, día de permiso e insignia: `«Laura · Mantenimiento · Autorizada hoy»` el sábado, o `«Laura · Mantenimiento · No autorizada hoy»` con el motivo `EXTERNAL_DAY_NOT_ALLOWED` en otros días.
6. Enlace `«Ver actividades de hoy»` (`/actividades`).

**Acciones.** Primaria: consultar. Secundaria: ver actividades. No hay acciones que modifiquen accesos desde esta pantalla.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Esqueleto de lista de agenda y de las tres tarjetas.                                                                                                                                                             |
| Vacío      | Agenda: `«No tienes eventos hoy.»` Proveedores: `«No hay proveedores autorizados para hoy.»`                                                                                                                     |
| Error      | G5 en la tarjeta afectada con `NETWORK_OFFLINE`, `API_UNAVAILABLE`, `STAFF_SHIFT_INACTIVE` (en la tarjeta de turno: `«Tu credencial está activa, pero no veo un turno para hoy. Recepción puede confirmarlo.»`). |
| Éxito      | Al abrir el resumen enviado por el robot: `«Resumen recibido desde recepción.»` (G6).                                                                                                                            |
| Simulación | G1; la agenda, el turno y los proveedores son datos ficticios; el pie dice `«El resumen de agenda del robot no registra tu asistencia laboral.»`                                                                 |

**Privacidad.** La agenda solo se muestra en esta pantalla, nunca en `/robot`. El kiosco no anuncia reuniones ni su contenido.

**Responsive.**

- 375: una columna en el orden indicado.
- 768: agenda a la izquierda; turno, ingreso y proveedores a la derecha.
- 1440: tres columnas de igual ancho.

**Accesibilidad.** La agenda es una lista con horas en elemento `time`. El rótulo de privacidad forma parte de la región. La insignia de autorización de proveedores usa ícono y texto.

**Teclas.** `Tab` entre tarjetas; `Enter` en un evento no hace nada (solo lectura).

---

## 10. `/actividades` Actividades del día

**Propósito.** Mostrar las actividades registradas por el personal autorizado para que socios y personal las conozcan y, desde el kiosco, las elijan como destino.

**Quién la usa.** Andrés, Camila y Mario; el kiosco la usa dentro de R-05.

**Contenido, de arriba abajo.**

1. Navegación `«← Volver»` y titular `«Hoy en el club»` con la fecha simulada.
2. Lista de tarjetas: nombre, lugar, hora, cupo informativo y botón `«Ir ahí»` (solo en el kiosco, cuando se llega desde R-05).
3. Pie: `«Las actividades las carga el personal autorizado del club.»`

Actividades de ejemplo (ficticias, de `GET /activities`): `«Clase abierta de tenis · Cancha de tenis · 9:30 a. m.»`, `«Yoga en la terraza · Terraza · 10:30 a. m.»`, `«Cata de cafés de origen · Sala de catas · 11:00 a. m.»`. En el kiosco la lista se filtra por la categoría del visitante. Los eventos internos del personal no aparecen.

**Acciones.** Primaria: ninguna en modo consulta; en el kiosco, `«Ir ahí»` fija el destino y sigue a R-06. Secundaria: volver.

**Estados.**

| Estado     | Tratamiento                                                                             |
| ---------- | --------------------------------------------------------------------------------------- |
| Cargando   | Tres esqueletos de tarjeta.                                                             |
| Vacío      | `«Hoy no hay actividades registradas.»` y, en el kiosco, `«Volver»`.                    |
| Error      | G5 con `NETWORK_OFFLINE` o `API_UNAVAILABLE` y `«Reintentar»`.                          |
| Éxito      | En el kiosco, al pulsar `«Ir ahí»`: `«Destino confirmado: {actividad}.»` y paso a R-06. |
| Simulación | G1; el pie `«Actividades de demostración.»` con sello G2 solo en el kiosco.             |

**Responsive.**

- 375: tarjetas apiladas.
- 768: dos columnas.
- 1440: lista de una columna de 720 px con detalle lateral de la actividad seleccionada.

**Accesibilidad.** Lista semántica; la hora en elemento `time`; `«Ir ahí»` con nombre accesible `«Ir a {actividad}»`.

**Teclas.** `Tab` entre tarjetas; `Enter` activa `«Ir ahí»`; `Esc` o `Retroceso` fuera de campos vuelve.

---

## 11. `/visita/[id]` Detalle y evaluación de la visita

> **Fuera del MVP.** La ruta no existe. La evaluación se envía desde el kiosco (R-11, después del cierre de la visita) o desde la tarjeta `«¿Cómo te fue hoy?»` de `/socio`; no hay línea de tiempo de la visita. Comentario de hasta 300 caracteres.

**Propósito.** Mostrar qué ocurrió en una visita y permitir evaluarla al cerrarse, sin cambiar la categoría ni bloquear nada.

**Quién la usa.** El socio dueño de la visita, el edecán responsable y el personal con función de encargado. Quien no tiene acceso ve `VISIT_NOT_FOUND`.

**Contenido, de arriba abajo.**

1. Navegación `«← Volver»`, referencia de visita (`«V-201»`) e insignia de estado (G9).
2. Resumen: nombre, categoría (G9), destino, responsable actual y fecha.
3. **Línea de tiempo**: lista cronológica de eventos con hora: `«Visita preparada»`, `«Identidad confirmada»`, `«Bienvenida»`, `«Destino confirmado: {destino}»`, `«Acompañante asignado: {acompañante}»`, `«Acompañamiento en curso»`, `«Falla de R2 (simulación)»`, `«Relevo solicitado»`, `«Relevo aceptado por Sofía»`, `«Contexto recibido»`, `«Relevo confirmado: Sofía es la responsable»`, `«Llegada a {destino}»`, `«Salida confirmada»`, `«Visita cerrada»`.
4. **Evaluación** (visible cuando la visita está cerrada):
   - Texto `«Si quieres, cuéntanos cómo te fue con el servicio de los robots y con los servicios del club.»`
   - `«Servicio de los robots»`: escala de 1 a 5 (`«1 · Muy malo»` … `«5 · Muy bueno»`).
   - `«Servicios del club»`: escala de 1 a 5.
   - `«Comentario (opcional)»`: hasta 500 caracteres con contador.
   - Botones `«Enviar evaluación»` y `«Prefiero no evaluar»`.
5. Evaluación enviada: se muestra de solo lectura con la fecha.

**Acciones.** Primaria: `«Enviar evaluación»`. Secundarias: `«Prefiero no evaluar»` (cierra el bloque sin guardar; no cambia la visita) y volver.

**Estados.**

| Estado     | Tratamiento                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Esqueleto de resumen y de línea de tiempo. Al enviar: `«Enviando…»` (G10).                                                                                                              |
| Vacío      | Línea de tiempo sin eventos: `«Aún no hay eventos en esta visita.»` Visita no cerrada: en lugar del formulario, `«Podrás evaluar tu visita cuando termine.»`                            |
| Error      | `VISIT_NOT_FOUND` (pantalla completa, botón `«Ir al inicio»`), `FEEDBACK_TEXT_TOO_LONG`, `FEEDBACK_ALREADY_SENT`, `NETWORK_OFFLINE`, `SERVER_ERROR`. El comentario escrito se conserva. |
| Éxito      | `«Gracias. Tu evaluación quedó registrada.»` (G6), formulario sustituido por la evaluación de solo lectura.                                                                             |
| Simulación | G1; el pie de la evaluación dice `«La evaluación es ficticia y solo se guarda en esta demostración.»` Los eventos originados por el presentador (falla) llevan el sello G2.             |

**Responsive.**

- 375: resumen, evaluación y línea de tiempo apilados; escalas en filas de cinco botones de 52 px.
- 768: resumen a la izquierda, línea de tiempo a la derecha; evaluación bajo ambos.
- 1440: línea de tiempo central de 640 px, resumen y evaluación laterales.

**Accesibilidad.** La escala es un `radiogroup` por pregunta con etiqueta `«Servicio de los robots, de 1 a 5»`. El contador del comentario se anuncia al acercarse al límite (a 450 y a 500 caracteres). La línea de tiempo es una lista ordenada con elementos `time`.

**Teclas.** Flechas en cada escala; `Enter` envía desde el botón; `Ctrl` + `Enter` envía desde el comentario.

---

## 12. `/design` Catálogo de diseño

**Propósito.** Referencia visual viva para el equipo de producto y de ingeniería: tokens, tipografía y componentes del sistema N Club Luxury, tal como se usan en las demás pantallas.

**Quién la usa.** El equipo de producto y de ingeniería. No forma parte de la demostración; se abre desde los ajustes del selector (§1).

**Contenido, de arriba abajo.**

1. Tarjeta negra con el sello, el titular `«Sistema de diseño de N Club»` y la línea `«Blanco cálido, líneas negras y oro como detalle. Todas las esquinas son rectas.»`
2. **Color**: muestras de la paleta de 0.1 con nombre, hex, uso y su contraste.
3. **Tipografía**: escala display, h1, h2, h3, cuerpo, etiqueta, nota y sobretítulo en Bodoni Moda y Geist, con texto de muestra.
4. **Botones**, **Tarjetas**, **Avatares, listas y accesos**, **Cabecera y barra inferior** (Inicio, Invitados, Agenda, Perfil) y **Campos**.
5. **Categorías y estados** y **Avisos** (información, advertencia y error).
6. **Cargando, vacío y error**, **Relevo al edecán** (cuatro fases) y **Fases de una visita**, con botones para avanzar y retroceder de fase.

**Accesibilidad.** Cada muestra de color indica su relación de contraste, no solo el color.

---

## 13. Rutas no definidas

> **Fuera del MVP.** No hay pantalla propia: una ruta desconocida muestra la pantalla de error por defecto del enrutador.

Una ruta desconocida muestra una pantalla de error: titular `«No encontramos esta página»`, texto `«La dirección no existe o cambió.»` y botón `«Ir al inicio»` (`/`). Una ruta de perfil abierta sin perfil elegido redirige a `/` con `DEMO_PROFILE_REQUIRED`.

---

## 14. Aplicación por rol

Esta sección describe las pantallas de la aplicación con el estilo N Club Luxury (§0.1). Reglas que comparten:

- Una tarea por pantalla. Los estados se dicen con una frase corta o no se dicen; no hay etiquetas de estado, contadores ni filas de datos que no sirvan para actuar (el panel web es la única excepción, §14.6).
- Como máximo un bloque destacado, con borde dorado; el resto son listas limpias, con filas separadas por una línea negra.
- Barra inferior por rol con ícono y texto; la pestaña activa lleva una línea dorada.
- Nombres de personas y saludos en Bodoni Moda; títulos de pantalla, listas y botones en Geist. Esquinas rectas y sin sombras.

### 14.1 `/entrar` Inicio de sesión

`/` redirige aquí. El sello grande con `N CLUB`, el campo `«Correo»`, el campo `«Clave»` (con un botón para mostrarla u ocultarla) y un botón negro `«Entrar»`. `«Acceso rápido»` despliega las cuentas de ejemplo (al tocar una se escriben el correo y la clave común) y el botón `«Elegir perfil»` (`/demo`). Un `?cuenta=` válido inicia sesión solo con esa cuenta.

Cada rol llega a su aplicación:

| Rol               | Ruta             |
| ----------------- | ---------------- |
| Socio             | `/app/socio`     |
| Concierge         | `/app/concierge` |
| Edecán            | `/app/edecan`    |
| Personal del club | `/app/personal`  |
| Administración    | `/app/panel`     |

Errores: `«Correo o clave incorrectos. Revisa los datos e intenta de nuevo.»`, `«Demasiados intentos. Espera unos minutos antes de probar otra vez.»`, `«Sin conexión. Revisa tu red e intenta de nuevo.»` y, en cualquier otro caso, `«No pudimos iniciar sesión. Intenta de nuevo en un momento.»`

### 14.2 Socio · `/app/socio`

Cuatro pestañas: **Inicio**, **Invitados**, **Agenda** y **Perfil**. «Mi pase» y «Avisos» se abren desde Inicio (íconos de QR y de campana) y desde Perfil. En ventanas anchas la app ocupa una columna de 560 px centrada.

| Pantalla                                  | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio                                    | Barra con el sello y `N CLUB`, una línea dorada debajo, y a la derecha los íconos `«Mi pase»` y `«Avisos»` (un cuadrado rojo en la campana cuando hay una confirmación por responder). Saludo `«Hola, {nombre}»` en Bodoni Moda. Debajo, la tarjeta de confirmación pendiente (si hay una), la visita destacada en una frase con su barra dorada (la propia, o la del primer invitado que está dentro), `«En el club»` con los demás invitados que están dentro, `«Próximas»` con hasta tres invitaciones (vacío: `«Aún no tienes invitados. Toca Invitar.»`) y el botón `«Invitar»`. |
| Invitados                                 | Título `«Invitados»`, botón de ícono `«Invitar»` y dos pestañas, `«Próximas»` (quién está en el club y las invitaciones próximas) e `«Historial»`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Agenda                                    | Título `«Agenda»`, selector `«Día»` con cuatro días rápidos y la lista de actividades del día; al abrir una se puede inscribirse o cancelar. Vacío: `«No hay actividades este día. Prueba con otro.»`                                                                                                                                                                                                                                                                                                                                                                                 |
| Perfil                                    | Avatar cuadrado y nombre en Bodoni Moda; filas `«Mi pase»`, `«Mi foto»`, `«Preferencias»`, `«Asistencia»` y `«Membresía»`, y el botón `«Cerrar sesión»`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Avisos (`/app/socio/avisos`)              | Tarjetas de confirmación y la lista de avisos. Vacío: `«Sin avisos por ahora. Te avisamos cuando llegue tu invitado.»`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Mi pase (`/app/socio/mi-qr`)              | QR del socio con marco dorado, nombre completo, nivel y cuánto falta para que venza; botón `«Actualizar código»` y la indicación `«Si el rostro no se reconoce»`.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Nueva invitación (`/app/socio/nueva`)     | Formulario a pantalla completa con el título `«Nueva invitación»`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Invitación (`/app/socio/invitacion/[id]`) | Detalle de la invitación con su foto y su cédula.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Visita (`/app/socio/visita/[id]`)         | Seguimiento de la visita de un invitado o la propia (`«Mi visita»`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 14.3 Invitado · `/visita`

El invitado no tiene cuenta: abre el enlace con su QR. La barra inferior es **Pase**, **Mapa**, **Actividades**, **Recorrido** y **Perfil**; sin QR (modo de ejemplo) es **Pase**, **Mapa**, **Mensajes** y **Perfil**.

- **Pase.** Saludo `«Bienvenida»` o `«Bienvenido»` según el trato de la invitación (`trato` de `GET /pase`; `«Te damos la bienvenida»` si el pase no lo trae), el nombre en Bodoni Moda, el QR con marco dorado y una línea de contexto con el formato `«Hoy · {hora} · {destino}»`. Debajo, `«Muéstralo al robot en la entrada»`. Dentro del club, la pantalla muestra a quién tiene como acompañante.
- **Pase vencido o cancelado.** No hay QR: `«Invitación vencida»` o `«Invitación cancelada»` y `«Habla con {anfitrión} para que te envíe un pase nuevo.»`
- **Perfil.** `«Mi perfil»`, la entrada a la membresía y el botón `«Salir de la visita»`.

### 14.4 Concierge · `/app/concierge`

Barra inferior: **Cola**, **Llegadas**, **Esperados** y **Robot**.

| Pestaña   | Contenido                                                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cola      | Título `«Recepción»`, estado del robot y, si hay una alerta nueva, un solo bloque destacado con el botón `«Atender»`. Debajo, la lista de las demás alertas abiertas y el botón `«Ver historial»` (`«Volver a la cola»` en el historial). Vacío: `«Sin alertas por ahora»`. |
| Llegadas  | `«Llegadas de hoy»`. Vacío: `«Aún no llega nadie»`.                                                                                                                                                                                                                         |
| Esperados | `«Esperados hoy»`. Vacío: `«Nadie esperado hoy»`.                                                                                                                                                                                                                           |
| Robot     | Estado (`«En línea»`, `«Acompañando»`, `«Sin servicio»` o `«Sin conexión»`), hora y antigüedad del último latido, y el botón `«Cerrar sesión»`.                                                                                                                             |

### 14.5 Equipo en la aplicación móvil

**Edecán · `/app/edecan`.** Barra inferior: **Tareas**, **En curso**, **Escanear**, **Reportar** y **Perfil**.

| Pestaña  | Contenido                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tareas   | Título `«Hola, {nombre}»`. Cada tarea trae `«Aceptar»` y `«Rechazar»` (el rechazo pide un motivo y se envía con `«Enviar rechazo»`) y, al llegar, `«Llegamos»`. Vacío: `«No tienes tareas por ahora. Esta lista se actualiza sola y te avisamos si llega una urgente.»`    |
| En curso | Título `«En curso»`, secciones `«Encuentro»` y `«Recorrido»`, y las acciones de texto `«Pedir relevo»` y `«Pedir ayuda»`. Vacío: `«No acompañas a nadie ahora. Acepta una tarea o escanea el pase de quien llega.»` Al terminar, la pantalla `«Listo»` con `«Ver tareas»`. |
| Escanear | `«Escanear pase»`: campo `«Código del pase»` y botón `«Verificar»`; con un pase válido, `«Iniciar visita»` (o `«Abrir visita en curso»` si ya hay una). Pase inválido: `«Pase no válido»`.                                                                                 |
| Reportar | Título `«Reportar»`, sección `«Abiertas»` y el formulario de reporte (abajo).                                                                                                                                                                                              |
| Perfil   | `«Mi perfil»` con foto, nombre y rol, selector de `«Mi estado»` y el botón `«Cerrar sesión»`.                                                                                                                                                                              |

**Personal del club · `/app/personal`.** Barra inferior: **Órdenes**, **Reportar**, **Agenda**, **Actividades** y **Perfil**.

| Pestaña     | Contenido                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Órdenes     | `«Órdenes de hoy»`: cada orden con ícono dorado, el trabajo, el lugar y la hora, y un botón `«Tomar»` (la pone en curso) o `«Terminar»`. Vacío: `«No hay órdenes para hoy.»` El botón `«Registrar visita de servicio»` abre `«Nueva visita de servicio»` con `«Registrar»`. |
| Reportar    | El mismo formulario de reporte.                                                                                                                                                                                                                                             |
| Agenda      | Título `«Agenda»` y `«Nuevo recordatorio»` (campos `«Recordatorio»`, `«Hora»` y `«Nota (opcional)»`, con `«Guardar»`).                                                                                                                                                      |
| Actividades | Título `«Actividades»` y `«Nueva actividad»` (`«Nombre»`, `«Descripción (opcional)»`, `«Lugar»`, `«Cupo (opcional)»` y el interruptor `«El robot puede ofrecerla a los visitantes»`); cada actividad se puede `«Editar»` o `«Borrar»` (`«Sí, borrar»`).                     |
| Perfil      | `«Mi perfil»` con foto, nombre y rol, y el botón `«Cerrar sesión»`.                                                                                                                                                                                                         |

**Formulario de reporte** (Edecán y Personal). Cuatro tipos en cuadrícula: `«Robot»`, `«Ruta bloqueada»`, `«Invitado»` y `«Otro»`; el campo `«¿Qué pasó?»` y el botón `«Enviar»`.

### 14.6 Panel web · `/app/panel`

Para administración y concierge. Desde 900 px de ancho hay una barra lateral de 248 px con dos grupos y, en el teléfono, una barra inferior con **Resumen**, **Cola de atención**, **Equipo**, **Alertas** y **Más** (el resto de secciones). El elemento activo lleva una barra dorada a la izquierda y el ícono dorado.

| Grupo     | Secciones                                                               |
| --------- | ----------------------------------------------------------------------- |
| Operación | Resumen, Cola de atención, Equipo, Visitas, Eventos del robot, Robot R1 |
| Registros | Alertas, Historial, Evaluaciones, Registros y permisos                  |

El **Resumen** (`«Resumen general»`) es un lienzo de informe basado en gráficas rectas, sin sombras y con rejilla suave; las series van en tinta y grises, y el oro marca solo el valor máximo. De arriba abajo:

1. Cuatro indicadores con su cifra y una mini gráfica: `«Visitas hoy»` (`«Visitas ayer»` si se mira el día anterior), `«En el club»`, `«Alertas abiertas»` y `«Evaluación media»`.
2. Una rejilla de una, dos o tres columnas según el ancho (dos desde 560 px y tres desde 1040 px de contenido):

| Gráfica                    | Qué muestra                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `«Llegadas por hora»`      | Barras apiladas de 06 a 22 h por Socios, Invitados y Personal; la hora pico se marca en oro. |
| `«Llegadas por categoría»` | Barras horizontales por categoría con cantidad y porcentaje.                                 |
| `«Estado de las visitas»`  | Una barra al 100 % con la leyenda de cada estado.                                            |
| `«Evaluaciones»`           | Cuántas calificaciones recibió cada puntaje de 1 a 5, robot y club lado a lado.              |
| `«Espera en la cola»`      | Barras horizontales con los minutos de espera de hasta seis personas.                        |
| `«Visitas acumuladas»`     | Línea con el total acumulado a lo largo del día.                                             |
| `«Equipo en turno»`        | Barra al 100 % por estado y las cinco primeras personas del equipo.                          |

3. `«Eventos recientes»`: hasta seis eventos del robot, en tabla desde 900 px y en lista en el teléfono. Es una de las pocas pantallas con etiquetas de estado.
