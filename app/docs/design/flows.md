# Recorridos de demostración

Siete recorridos que el presentador puede ejecutar en vivo. Cada paso indica la pantalla, lo que se pulsa y lo que se ve, según la interfaz implementada. Los textos de botones corresponden a `screens.md`; los diálogos del robot, a `orientation-copy.md`. El guion cronometrado para el jurado está en [`docs/demo/DEMO-SCRIPT.md`](../demo/DEMO-SCRIPT.md).

## Preparación común

| Elemento              | Preparación                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reinicio              | En `/`, abrir `«Controles de la demostración»`, pulsar `«Reiniciar demostración»` y confirmar con `«Reiniciar»`. La fecha simulada queda en `«Sábado 24 oct 2026»`.                                                                          |
| Pantalla K (kiosco)   | Tarjeta `«Robot R1»` en `/` (`/robot`), en tableta o ventana de 768 px o más. Los controles simulados están en el cajón `«Presentador»`.                                                                                                     |
| Pantalla E (edecán)   | Tarjeta `«Sofía»` (`/edecan`). Se usa en los recorridos (f) y (g). `/edecan?perfil=U-01` abre el panel de Sara.                                                                                                                              |
| Pantalla S (socio)    | Tarjeta `«Andrés»` (`/socio?perfil=V-201`) o `«Camila»` (`/socio?perfil=V-202`), en ventana de 375 px.                                                                                                                                       |
| Pantalla M (personal) | Tarjeta `«Mario»` (`/personal`). Se usa en (d).                                                                                                                                                                                              |
| Estado compartido     | El perfil pertenece a cada pestaña. En modo local, las visitas, invitaciones y relevos se comparten entre las pestañas del mismo navegador; en modo API, entre dispositivos (la portada indica el modo en su pie).                           |
| Datos de ejemplo      | Hay una invitación vigente de Male para Valentina Restrepo, con pase de ejemplo (`«Llegan como visitas»` → `«Abrir su pase»`) y un perfil facial de demostración consentido (`«Valentina · no miembro»`). Laura tiene un permiso de sábados. |

Lo que se ve como resultado facial, cámara o falla del robot lleva el sello `«Simulación»`. Ninguna decisión de acceso se toma por el rostro: cada recorrido muestra la evidencia que la confirma.

Los recorridos que cierran una visita terminan igual: el kiosco muestra la despedida (R-12) y vuelve a la bienvenida (R-01) con `«Listo»` o tras 15 s.

Un robot en falla no vuelve a acompañar hasta reiniciar la demostración. Una solicitud de relevo sin aceptar vence a los 300 s.

---

## (a) VIP · Andrés, por rostro

**Qué demuestra.** Reconocimiento como miembro, confirmación con la membresía VIP, acompañamiento con robot, llegada.

| #   | Pantalla | El presentador pulsa                                                                                | Se ve                                                                                                                                                                                              |
| --- | -------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | S        | Tarjeta `«Andrés»` en `/`                                                                           | `/socio`: `«Buenos días, Andrés»`, insignia `«Socio VIP»`, `«Tu destino habitual: Salón reservado»` y `«No tienes una visita en curso. …»`.                                                        |
| 2   | K        | `«Comenzar»`, luego `«Andrés · miembro»` en `«Rostro simulado»`                                     | R-02 `«Voy a confirmar tu visita»` con el sello `«Simulación de cámara»`. Resultado: `«Andrés, ¿eres tú?»`, `«Socio VIP»`, `«Resultado facial · simulación»` y la evidencia `«Membresía vigente»`. |
| 3   | K        | `«Sí, soy yo»`                                                                                      | R-04: `«Andrés, bienvenido. ¿Te apetece un café, como tienes registrado, o prefieres otra cosa?»`. En S, la visita pasa a `«Confirmada»`.                                                          |
| 4   | K        | `«Café»`, luego `«Continuar»`                                                                       | `«Anotado. Te indicaremos dónde recibirla.»` y R-05: `«Hoy tenemos actividades registradas por el club. …»` con `«Ver actividades de hoy»` y `«Ir a mi reserva del salón»`.                        |
| 5   | K        | Opcional: `«Ver actividades de hoy»` → `«Ir ahí»` o `«Volver»`. Luego `«Ir a mi reserva del salón»` | Destino confirmado y R-06: `«R2 puede acompañarte al salón. ¿Te parece bien?»`.                                                                                                                    |
| 6   | K        | `«Sí, con R2»`                                                                                      | Cabecera `«Robot R2 · Acompañando»`; R-07 `«Vamos hacia tu salón, Andrés. …»` con la ruta `«Recepción»`, `«Pasillo»`, `«Salón reservado»`. En S: `«Orientando»`/`«En curso»` y `«Te atiende R2»`.  |
| 7   | K        | `«Presentador»` → `«Simular llegada al destino»`                                                    | R-08: `«Llegamos al salón de tu reserva. Que disfrutes el día en el club.»`; `«Entendido»` vuelve al reposo con `«Visita en curso · Andrés · Salón reservado»`.                                    |
| 8   | K        | `«Presentador»` → `«Simular regreso a recepción»`                                                   | R-10: `«Andrés, bienvenido de nuevo a recepción. ¿Ya terminaste tu visita por hoy?»` con `«Sí, terminé»` y `«Todavía no»`.                                                                         |
| 9   | K        | `«Sí, terminé»`                                                                                     | R-11: evaluación con `«Servicio de los robots»` y `«Servicios del club»` (1 a 5) y comentario de hasta 300 caracteres.                                                                             |
| 10  | K        | Elegir una nota y `«Enviar»` (o `«Prefiero no participar»`)                                         | R-12: `«Hasta pronto, Andrés. Gracias por venir; esperamos verte de nuevo.»`; la visita queda `«Cerrada»`. `«Listo»` vuelve a R-01.                                                                |

---

## (b) Regular · Camila

**Qué demuestra.** Mismo reconocimiento con trato igual de personalizado; cambian la bebida, el destino y el acompañante (Sara, una persona del equipo) y no se obliga a seguir un recorrido.

| #   | Pantalla | El presentador pulsa                                                                   | Se ve                                                                                                                                                                        |
| --- | -------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | S        | Tarjeta `«Camila»`                                                                     | `/socio`: `«Socia regular»`, `«Tu destino habitual: Cancha de tenis»`.                                                                                                       |
| 2   | K        | `«Comenzar»`, `«Camila · miembro»`                                                     | `«Camila, ¿eres tú?»` con `«Membresía vigente»`.                                                                                                                             |
| 3   | K        | `«Sí, soy yo»`, `«Té»`, `«Continuar»`                                                  | R-04: `«Camila, bienvenida. ¿Quieres un té o prefieres otra bebida?»`; R-05: `«¿Vienes a tu reserva de tenis o quieres ir a otro lugar del club?»` con tres opciones.        |
| 4   | K        | `«Voy a mi reserva de tenis»`, luego `«Ir con Sara»`                                   | R-06: `«Sara puede acompañarte a la cancha. …»`. Con `«Recibir indicaciones»` no se asigna acompañante y la visita sigue con recepción.                                      |
| 5   | K        | `«Presentador»` → `«Simular llegada al destino»`                                       | R-07: `«Camila, soy Sara. Vamos a la cancha que confirmaste en recepción.»`; R-08: `«Aquí está tu cancha, Camila. …»`.                                                       |
| 6   | K        | `«Simular regreso a recepción»`                                                        | Salida asistida, porque la responsable es Sara: `«Camila, ya casi terminamos. Sara confirmará tu salida.»`.                                                                  |
| 7   | E (Sara) | En `/edecan?perfil=U-01`, `«Cerrar visita»` y de nuevo `«Cerrar visita»` en el diálogo | `«Visita cerrada.»` En K, R-11; con `«Prefiero no participar»`: `«Sin problema. Tu salida no cambia.»` y R-12: `«Gracias por venir, Camila. Esperamos que vuelvas pronto.»`. |

---

## (c) Invitada · el socio invita y el invitado llega

**Qué demuestra.** Un socio invita sin que el invitado cree cuenta; el pase QR es opaco y de un solo uso; el rostro solo dice «no miembro» y nunca basta; la invitación confirma la categoría; la orientación lleva a la Terraza con el anfitrión.

**Parte 1. El socio crea la invitación.**

| #   | Pantalla         | El presentador pulsa                                                                                                       | Se ve                                                                                                                                                                 |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | S (Camila)       | `«Invitar a alguien»`                                                                                                      | `/socio/invitar`: formulario con la fecha simulada y `«Terraza»` seleccionada.                                                                                        |
| 2   | `/socio/invitar` | Escribir `Sebastián` en `«Nombre de tu invitado»`; `«Bebida preferida (opcional)»`: `Agua aromática`; `«Crear invitación»` | Botón `«Creando invitación…»` y luego `«Invitación creada para Sebastián.»` con la vista previa del pase y el sello `«QR de demostración»`.                           |
| 3   | `/pase/{token}`  | `«Ver pase»` (o `«Copiar enlace del pase»` y abrirlo en otro dispositivo)                                                  | `«Tu pase de visita»`, `«Hola, Sebastián»`, `«Invitación de Camila»`, `«Punto de encuentro: Terraza»`, `«Válido el …»`, insignia `«Vigente»` y QR. El token es opaco. |

**Parte 2. Llega al robot (se pueden mostrar las dos entradas).**

| #   | Pantalla | El presentador pulsa                                                                                                                      | Se ve                                                                                                                                                                                                                 |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a  | K        | Entrada por rostro: `«Comenzar»`, `«Valentina · no miembro»` (perfil consentido, con la invitación de ejemplo vigente)                    | `«Valentina, ¿eres tú?»` con `«Invitado»` y la evidencia `«Invitación de Male para hoy»`. Sin invitación vigente a su nombre, el resultado sería una revisión manual: el rostro no basta.                             |
| 4b  | K        | Entrada por QR: en R-01, `«Tengo un código QR»`; en `«Presentador»`, `«Usar el pase de Sebastián»` (o escribir el código y `«Comprobar»`) | `«Muestra tu código QR»`; resultado `«Sebastián, ¿eres tú?»` con `«Invitación de Camila para hoy»`. El pase queda `«Usado»` (se ve en el teléfono: `QR_ALREADY_USED`).                                                |
| 5   | K        | `«Sí, soy yo»`                                                                                                                            | R-04: `«Hola, Sebastián, bienvenida. Camila indicó que te gusta el agua aromática. …»`.                                                                                                                               |
| 6   | K        | `«Agua aromática»`, `«Continuar»`, `«Sí, acompáñame»`                                                                                     | R-05: `«Camila indicó que te espera en la terraza. …»`; R-06: `«R2 puede acompañarte a la terraza. ¿Quieres ir con él?»`.                                                                                             |
| 7   | K        | `«Sí, con R2»`, luego `«Presentador»` → `«Simular llegada al destino»`                                                                    | R-07 `«Sebastián, seguimos hacia la terraza, el punto que acordaste con Camila.»`; R-08 `«Esta es la terraza, Sebastián. Si Camila no está aquí, podemos contactarla. …»` con `«Contactar a Camila»` y `«Entendido»`. |
| 8   | K        | `«Simular regreso a recepción»`                                                                                                           | R-10: `«Sebastián, gracias por visitarnos. ¿Te gustaría conocer cómo hacerte miembro? …»` con `«Quiero saber más»` y `«No, gracias»`. No cambia su categoría.                                                         |
| 9   | K        | `«No, gracias»`, `«Prefiero no participar»`                                                                                               | R-12: `«Gracias por venir, Sebastián. Esperamos que hayas disfrutado la visita y que vuelvas pronto.»`.                                                                                                               |

**Extra opcional (QR rechazados).** En la etapa de QR, con el panel: `«Probar un pase ya usado»` → `QR_ALREADY_USED`; `«Probar un pase cancelado»` → `QR_REVOKED`; `«Probar un pase vencido»` → `QR_EXPIRED` (cada atajo aparece solo si existe una invitación en ese estado); `«Probar un pase manipulado»` → `QR_NOT_FOUND`. Cada uno muestra su mensaje y deja intentar de nuevo.

Si la invitación la crea Andrés en lugar de Camila, el anfitrión del texto es Andrés.

---

## (d) Personal · Mario

**Qué demuestra.** Un saludo ágil que respeta el trabajo: orientación breve, sin acompañante, y resumen mostrado solo en su pantalla privada.

| #   | Pantalla | El presentador pulsa                                                  | Se ve                                                                                                                                                                                                     |
| --- | -------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | M        | Tarjeta `«Mario»` en `/`                                              | `/personal`: `«Mi agenda de hoy»` con `«Inicio de turno»` y `«Fin de turno»` (el turno del día), `«Solo tú ves esto»`, `«Mi turno»` con `«Credencial vigente»`.                                           |
| 2   | K        | `«Comenzar»`, `«Mario · no miembro»`                                  | `«Mario, ¿eres tú?»` con `«Personal del club»` y `«Credencial de personal vigente»`. El rostro dijo «no miembro»: la credencial se contrasta con el directorio de personal.                               |
| 3   | K        | `«Sí, soy yo»`, `«Verlo en mi teléfono»`                              | R-04: `«Hola, Mario. Buen día. ¿Quieres consultar en privado un resumen rápido de tu agenda de hoy?»`; R-05: `«Te envié el resumen a tu teléfono. ¿Necesitas ayuda para llegar o sigues por tu cuenta?»`. |
| 4   | K        | `«Sigo por mi cuenta»`                                                | R-06: `«Perfecto, Mario. Puedes continuar. …»` con `«Continuar»`. En M aparece `«Resumen recibido desde recepción.»`; el kiosco no muestra el detalle.                                                    |
| 5   | K        | `«Continuar»`, luego `«Presentador»` → `«Simular llegada al destino»` | R-07: `«Operaciones queda por el corredor de servicio. …»`; R-08: `«Que tengas un gran día de trabajo, Mario.»`. No se asigna acompañante ni se ocupa un robot.                                           |
| 6   | K        | `«Entendido»`, `«Simular regreso a recepción»`, `«Sí, terminé»`       | R-10: `«Mario, ¿terminaste tu visita de hoy? …»`.                                                                                                                                                         |
| 7   | K        | `«Prefiero no participar»`                                            | R-12: `«Nos vemos pronto, Mario. Gracias por tu trabajo de hoy.»`.                                                                                                                                        |

---

## (e) Externa · Laura (sábado permitido, martes denegado)

**Qué demuestra.** La misma persona, con el mismo permiso, recibe orientación un sábado y una denegación explicada un martes. Nunca se concede acceso por el rostro.

**Parte 1. Sábado (fecha simulada por defecto).**

| #   | Pantalla    | El presentador pulsa                                                                                                     | Se ve                                                                                                                                                                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | K           | `«Comenzar»`, `«Laura · no miembro»`                                                                                     | `«Laura, ¿eres tú?»` con `«Trabajador externo»` y la evidencia `«Visita de servicio registrada para hoy»`.                                                                                              |
| 2   | K           | `«Sí, soy yo»`, `«Continuar»`                                                                                            | R-04: `«Buenos días, Laura. Bienvenida. Su visita de mantenimiento está registrada para hoy.»` (trato de usted, sin bebida); R-05: `«El responsable de su servicio indicó recepción de proveedores …»`. |
| 3   | K           | `«Sí, vamos»`, `«Entendido»`                                                                                             | R-06: `«Sara la acompañará al punto autorizado para su servicio.»`. Un externo siempre va con una persona, nunca con robot.                                                                             |
| 4   | K           | `«Presentador»` → `«Simular llegada al destino»`                                                                         | R-07: `«Laura, por aquí está el punto de presentación. …»`; R-08: `«Aquí está recepción de proveedores. Que tenga un gran día de trabajo.»`.                                                            |
| 5   | K, E (Sara) | `«Entendido»`, `«Simular regreso a recepción»`; en `/edecan?perfil=U-01`, `«Cerrar visita»` y de nuevo `«Cerrar visita»` | Salida asistida: `«Laura, ya casi terminamos. Sara confirmará tu salida.»`. Tras cerrar, R-11 y R-12: `«Gracias por su visita y por su aporte al club, Laura. Que tenga un buen día.»`.                 |

**Parte 2. El mismo caso un martes.**

| #   | Pantalla | El presentador pulsa                                           | Se ve                                                                                                                                                                                                |
| --- | -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | K        | `«Comenzar»` y, en `«Presentador»`, `«Martes 27 oct 2026»`     | El kiosco vuelve al reposo con `«Demostración reiniciada. Los datos de ejemplo volvieron a su estado inicial.»`. Cambiar la fecha reinicia los datos. En M, Laura figura como `«No autorizada hoy»`. |
| 7   | K        | `«Comenzar»`, `«Laura · no miembro»`                           | `«No puedo confirmar su visita hoy»`, `«Su permiso de acceso aplica los sábados y hoy es martes.»` y `«Código: EXTERNAL_DAY_NOT_ALLOWED»`. No hay botón para continuar.                              |
| 8   | K        | `«Avisar a recepción»`                                         | `«Aviso enviado a recepción. Una persona del equipo viene en camino.»` Solo se muestra en el kiosco; no concede acceso ni crea una tarea en el panel del edecán.                                     |
| 9   | K        | `«Volver al inicio»`, `«Presentador»` → `«Sábado 24 oct 2026»` | `«Hoy: Sábado 24 oct 2026»`: fecha restaurada para los siguientes recorridos.                                                                                                                        |

---

## (f) Rostro desconocido → QR

**Qué demuestra.** Cuando el rostro no se reconoce el sistema no adivina: ofrece el QR y ayuda humana, y una persona del equipo ve la visita en revisión. Con un QR válido, la visita en revisión se fusiona con la invitación y sigue el guion del invitado.

| #   | Pantalla | El presentador pulsa                                                                                  | Se ve                                                                                                                                                                  |
| --- | -------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | E        | Tarjeta `«Sofía»` en `/`                                                                              | `«No hay tareas pendientes.»` y `«Cuando un robot o recepción pida ayuda, aparecerá aquí.»`.                                                                           |
| 2   | K        | `«Comenzar»`, `«Rostro desconocido»`                                                                  | R-13a: `«No pude confirmar tu identidad»`, `«Código: RECOGNITION_UNKNOWN»` y los botones `«Usar mi QR»`, `«Pedir ayuda»`, `«Volver al inicio»`.                        |
| 3   | E        | Ninguna                                                                                               | Aparece una tarjeta `«Verificación»` con `«Visitante sin identificar»`, `«Motivo: Rostro no reconocido»` y `«Validar su QR»`.                                          |
| 4   | K        | `«Usar mi QR»`; en `«Presentador»`, `«Usar el pase de Valentina»` (o el de un invitado creado en (c)) | `«Muestra tu código QR»` y luego `«Valentina, ¿eres tú?»` con la evidencia `«Invitación de Male para hoy»`. La tarjeta `«Verificación»` desaparece (visita fusionada). |
| 5   | K        | `«Sí, soy yo»`                                                                                        | R-04 con el texto de invitado; el recorrido sigue como en (c).                                                                                                         |

**Variante con el edecán.** En el paso 2, `«Pedir ayuda»` muestra `«Aviso enviado a recepción. Una persona del equipo viene en camino.»` en el kiosco (no crea tarea). Sofía, desde su panel, pulsa `«Validar su QR»` en la tarjeta `«Verificación»`, escribe el código del pase en `«Código del pase»` y pulsa `«Validar QR»`: `«Pase válido: {nombre} · Invitado.»` La visita queda confirmada a su nombre y aparece en `«Visita en curso»` con `«Comenzar acompañamiento»`, `«Confirmar llegada a {destino}»` y `«Cerrar visita»`.

---

## (g) Falla del robot → relevo a Sofía

**Qué demuestra.** Falla simulada del robot; la visita no se pierde ni queda en pantalla muerta; el relevo pasa por solicitud, aceptación, transferencia de contexto y confirmación; el responsable cambia solo al confirmar; la visita llega a su destino y se cierra con evaluación.

**Preparación.** Pantallas K, E y S (Andrés). Reiniciar la demostración. Recorrido (a), pasos 1 a 6, hasta que R2 acompaña a Andrés (no pulsar `«Simular llegada al destino»`).

| #   | Pantalla | El presentador pulsa                                          | Se ve                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | K        | `«Presentador»` → `«Simular falla del robot»`                 | R-09 `«Tengo un inconveniente»`, `«Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.»`, el sello `«Simulación de falla»` y la lista con `«Ayuda solicitada»` como paso actual y `«Mostrar mi QR»`. Se anuncia como alerta.                                                                                                                     |
| 2   | S        | Ninguna                                                       | La tarjeta de visita muestra `«Esperando relevo»` con el sello `«Simulación»` y `«Te atiende R2»` (R2 sigue siendo el responsable).                                                                                                                                                                                                                               |
| 3   | E        | Ninguna                                                       | Tarea `«Relevo solicitado»` con `«Andrés · Socio VIP»`, `«De: R2 → A: Equipo»`, `«Destino: Salón reservado»`, `«Último punto confirmado: Pasillo»`, `«Motivo: Falla de R2 (simulación)»`, insignia `«Solicitado»` y el aviso `«R2 sigue siendo el responsable de la visita hasta que confirmes el relevo.»`.                                                      |
| 4   | E        | `«Aceptar relevo»`                                            | `«Aceptaste el relevo. R2 sigue siendo el responsable hasta que lo confirmes.»`, insignia `«Aceptado»` y `«De: R2 → A: Sofía»`. En K: `«Soy Sofía, voy a ayudarte. ¿Estás junto al robot?»` y `«Sofía va hacia ti»`.                                                                                                                                              |
| 5   | E        | `«Recibí el contexto»`                                        | Tarjeta `«Contexto de la visita»`: `«Andrés Mejía · V-201»`, `«Socio VIP»`, destino, permisos, `«Café»`, último punto y avance. Insignia `«Contexto recibido»`. En K: `«Ya tengo tu destino. Continuaremos desde aquí.»`.                                                                                                                                         |
| 6   | E        | `«Confirmar relevo»` → en el diálogo, `«Sí, asumo la visita»` | Diálogo `«¿Ya estás con Andrés?»` y `«Al confirmar serás la responsable de esta visita. R2 queda liberado.»`. Después: `«Eres la responsable de la visita de Andrés.»`, insignia `«Confirmado»` y, bajo `«Visita en curso»`, la visita. Solo ahora cambia el responsable. En K: `«Yo sigo contigo; nuestro equipo revisará el robot.»` y `«Sofía · Acompañando»`. |
| 7   | E        | `«Confirmar llegada a Salón reservado»` → `«Sí, llegamos»`    | `«Llegada a Salón reservado registrada.»` En K, R-08: `«Llegamos al salón de tu reserva. Que disfrutes el día en el club.»`; `«Entendido»` vuelve al reposo.                                                                                                                                                                                                      |
| 8   | K        | `«Presentador»` → `«Simular regreso a recepción»`             | R-10 asistido: `«Andrés, ya casi terminamos. Sofía confirmará tu salida.»` y `«Esperando a que Sofía confirme tu salida.»`.                                                                                                                                                                                                                                       |
| 9   | E        | `«Cerrar visita»` → `«Cerrar visita»` en el diálogo           | El diálogo dice `«¿Cerrar la visita de Andrés?»` y `«Confirmas que salió del club. No se puede reabrir.»`; después `«Visita cerrada.»`.                                                                                                                                                                                                                           |
| 10  | K        | Elegir notas y `«Enviar»`                                     | R-11 y luego R-12: `«Hasta pronto, Andrés. Gracias por venir; esperamos verte de nuevo.»`.                                                                                                                                                                                                                                                                        |
| 11  | S        | Ninguna                                                       | La visita figura `«Cerrada»`. Si no se evaluó en el kiosco, aparece la tarjeta `«¿Cómo te fue hoy?»` con `«Evaluar mi visita»`.                                                                                                                                                                                                                                   |

**Variantes opcionales.**

- Antes del paso 4, abrir una segunda pestaña como Sara (`/edecan?perfil=U-01`) o como Sofía y pulsar `«Aceptar relevo»` en ambas: la segunda recibe `HANDOFF_ALREADY_ACCEPTED` (`«Otra persona del equipo ya aceptó este relevo.»`) y su tarjeta se actualiza con `«Actualizar lista»`.
- Dejar vencer la solicitud sin aceptar (300 s): K muestra `«Seguimos buscando a una persona del equipo. Puedes mostrar tu QR o pedir ayuda en recepción.»` y E recibe `HANDOFF_EXPIRED`; la visita no cambia de responsable.
- En el paso 1, pulsar `«Mostrar mi QR»` en K: se abre la etapa de QR mientras llega la ayuda, y `«Volver»` regresa a la pantalla de relevo.
