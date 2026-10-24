# Guion de demostración para el jurado (5 a 7 minutos)

Guion para presentar Cerberus en vivo. Cada paso indica dónde pulsar (con el texto exacto del botón), qué debe verse y qué explicar. Las rutas y los textos corresponden a la interfaz implementada; los recorridos de referencia con más detalle están en [`docs/design/flows.md`](../design/flows.md).

**Idea que se quiere dejar clara.** El reconocimiento facial solo dice «miembro» o «no miembro». Cerberus confirma la categoría con los registros del club y adapta la orientación; el rostro nunca autoriza por sí solo. Si el robot falla, la visita continúa con una persona del equipo sin que el visitante repita nada.

## Antes de empezar (10 minutos antes)

1. Abrir <https://n-club-five.vercel.app> y comprobar el servicio en <https://n-club-five.vercel.app/api/v1/health> (debe responder `"status":"ok"`).
2. En la portada (`/`), mirar la línea de estado al pie:
   - «Modo API · almacenamiento: redis»: el estado se comparte entre dispositivos. Se puede usar un teléfono real para el pase.
   - «Modo demostración local …»: cada navegador tiene su propio estado y las pestañas del mismo navegador lo comparten. No usar un teléfono distinto: abrir el pase en otra pestaña o ventana del mismo navegador.
3. Reiniciar: en `/`, abrir «Controles de la demostración», pulsar **Reiniciar demostración** y confirmar con **Reiniciar**. La fecha simulada debe quedar en «Sábado 24 oct 2026».
4. Preparar las pantallas (cada una se abre desde las tarjetas de `/` o directamente por su ruta):

| Pantalla                      | Dispositivo recomendado           | Cómo abrirla                               | Se usa en                |
| ----------------------------- | --------------------------------- | ------------------------------------------ | ------------------------ |
| **K** (kiosco)                | Tableta o ventana de 768 px o más | Tarjeta **Robot R1** (`/robot`)            | Todos los recorridos     |
| **E** (edecán)                | Tableta o segundo monitor         | Tarjeta **Sofía** (`/edecan`)              | Falla del robot y relevo |
| **S** (socio)                 | Teléfono o ventana estrecha       | Tarjeta **Camila** (`/socio?perfil=V-202`) | Invitación               |
| **M** (personal)              | Cualquier pantalla                | Tarjeta **Mario** (`/personal`)            | Recorrido del personal   |
| **T** (teléfono del invitado) | Teléfono (modo API)               | Se abre con el enlace del pase             | Invitación               |

5. Ensayar una vez el recorrido completo y volver a reiniciar. Comprobar que no hay mensajes de error en K ni en E.

**Controles del presentador.** En el kiosco, el cajón **Operación** agrupa los controles de operación (rostro, llegada, falla, fecha, reinicio). Está cerrado por defecto salvo en la pantalla de reconocimiento.

## Línea de tiempo

| Minuto | Recorrido                                                                          | Pantallas |
| ------ | ---------------------------------------------------------------------------------- | --------- |
| 0:00   | 1. Portada y planteamiento del reto                                                | `/`       |
| 0:30   | 2. VIP por rostro (Andrés)                                                         | K, S      |
| 1:20   | 3. Regular por rostro (Camila) _(se puede omitir)_                                 | K         |
| 1:40   | 4. Personal del club (Mario) _(se puede omitir)_                                   | K, M      |
| 2:10   | 5. Trabajadora externa en sábado (Laura)                                           | K         |
| 2:35   | 6. Invitada por QR: el socio crea la invitación y el pase llega a otro dispositivo | S, T      |
| 3:25   | 7. Rostro desconocido → QR → el robot valida la invitación                         | K, E      |
| 4:10   | 8. Falla del robot → relevo a Sofía → cierre → evaluación                          | K, E      |
| 6:10   | 9. Trabajadora externa en martes (cambio de fecha simulada)                        | K         |
| 6:40   | Cierre                                                                             |           |

Los tiempos son orientativos. Una versión de cinco minutos omite los recorridos 3, 4 y 9.

---

## 1. Portada y planteamiento (0:30)

| Dónde | Qué hacer                          | Qué debe verse                                                                                                                                             | Qué explicar                                                                                                                            |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/`   | Mostrar la portada sin pulsar nada | «Un anfitrión. Una visita que continúa.», la cinta «Modo demostración · datos ficticios» y las tarjetas «Andrés», «Camila», «Mario», «Sofía» y «Robot R1». | El selector no es un inicio de sesión: cada tarjeta es una perspectiva (socio, personal, edecán, robot). Todos los datos son ficticios. |

## 2. VIP por rostro · Andrés (0:50)

Prepara en K el kiosco y, opcionalmente, una pestaña S abierta como **Andrés** (`/socio?perfil=V-201`).

| Dónde | Qué hacer                                                          | Qué debe verse                                                                                                                                        | Qué explicar                                                                                                                         |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| K     | **Comenzar**                                                       | «Voy a confirmar tu visita», el recuadro de la cámara y el cajón «Operación» abierto con «Rostro a reconocer».                                        | El reconocimiento facial es simulado: el presentador elige qué rostro «ve» la cámara.                                                |
| K     | **Andrés · miembro**                                               | «Andrés, ¿eres tú?», la insignia «Socio VIP», el sello «Resultado facial · simulación» y la evidencia «Membresía vigente».                            | El rostro solo dijo «miembro». La categoría VIP sale del registro de membresía del club, y por eso la pantalla muestra la evidencia. |
| K     | **Sí, soy yo**                                                     | «Andrés, bienvenido. ¿Te apetece un café, como tienes registrado, o prefieres otra cosa?» con tres respuestas.                                        | Ninguna identidad se da por hecha: la persona confirma. La bebida es un ofrecimiento tomado del registro, no una promesa.            |
| K     | **Café**, **Continuar**                                            | «Anotado. Te indicaremos dónde recibirla.» y después la pregunta de destino con «Ver actividades de hoy» y «Ir a mi reserva del salón».               | Cada categoría tiene su propio guion de saludo y destino.                                                                            |
| K     | **Ir a mi reserva del salón**, luego **Sí, con R2**                | «R2 puede acompañarte al salón. ¿Te parece bien?» y después la cabecera «Robot R2 · Acompañando» con la ruta «Recepción · Pasillo · Salón reservado». | El VIP recibe acompañamiento prioritario con robot, pero solo si acepta.                                                             |
| S     | Mirar la tarjeta «Tu visita de hoy» (se actualiza sola)            | La insignia de estado y «Te atiende R2».                                                                                                              | El socio ve en su teléfono quién lo atiende.                                                                                         |
| K     | **Operación** → **Marcar llegada al destino**, luego **Entendido** | «Llegamos al salón de tu reserva. Que disfrutes el día en el club.» y, al volver al reposo, «Visita en curso · Andrés · Salón reservado».             | Se libera a R2 para el resto de la demostración. Nada de lo simulado cambia reglas de negocio: solo reproduce lo que haría el robot. |

## 3. Regular por rostro · Camila (0:20, omitible)

| Dónde | Qué hacer                                          | Qué debe verse                                                                                                                      | Qué explicar                                                                                                                                                 |
| ----- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K     | **Comenzar**, **Camila · miembro**, **Sí, soy yo** | «Camila, ¿eres tú?» con «Socio regular» y «Membresía vigente»; luego «Camila, bienvenida. ¿Quieres un té o prefieres otra bebida?». | Mismo reconocimiento y trato igual de personalizado; cambian la bebida, el destino (cancha de tenis) y el acompañante (una persona del equipo, no un robot). |
| K     | **Operación** → **Reiniciar esta visita**          | El kiosco vuelve a «Bienvenido a N Club».                                                                                           | Solo reinicia la pantalla del kiosco para el siguiente visitante.                                                                                            |

## 4. Personal del club · Mario (0:30, omitible)

| Dónde | Qué hacer                                                        | Qué debe verse                                                                                                                   | Qué explicar                                                                                                    |
| ----- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| K     | **Comenzar**, **Mario · no miembro**                             | «Mario, ¿eres tú?», «Personal del club» y la evidencia «Credencial de personal vigente».                                         | El sistema facial lo ve como «no miembro»; el registro de personal con turno vigente lo confirma como personal. |
| K     | **Sí, soy yo**, **Verlo en mi teléfono**, **Sigo por mi cuenta** | «Te envié el resumen a tu teléfono. ¿Necesitas ayuda para llegar o sigues por tu cuenta?». En el kiosco no se muestra su agenda. | Trato ágil, sin acompañante ni robot, y privacidad: el detalle va a su pantalla, no a la del kiosco.            |
| M     | Mirar «Mi agenda de hoy» (se actualiza sola)                     | Las entradas «Inicio de turno» y «Fin de turno», «Solo tú ves esto» y «Resumen recibido desde recepción.»                        | El resumen privado solo aparece en la pantalla de Mario.                                                        |
| K     | **Operación** → **Reiniciar esta visita**                        | El kiosco vuelve al reposo.                                                                                                      |                                                                                                                 |

## 5. Trabajadora externa en sábado · Laura (0:25)

| Dónde | Qué hacer                                 | Qué debe verse                                                                                                  | Qué explicar                                                                                                                   |
| ----- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| K     | **Comenzar**, **Laura · no miembro**      | «Laura, ¿eres tú?», «Trabajador externo» y la evidencia «Visita de servicio registrada para hoy».               | Su permiso (orden de trabajo) vale los sábados de 08:00 a 17:00. La fecha simulada es sábado, así que el registro la respalda. |
| K     | **Sí, soy yo**                            | «Buenos días, Laura. Bienvenida. Su visita de mantenimiento está registrada para hoy.» con botón **Continuar**. | Trato de «usted», sin bebida, y siempre con una persona del equipo como acompañante, nunca con robot.                          |
| K     | **Operación** → **Reiniciar esta visita** | El kiosco vuelve al reposo.                                                                                     | Más adelante se repite el caso en martes.                                                                                      |

## 6. Invitada por QR: crear la invitación y recibir el pase (0:50)

Requiere S abierta como **Camila** y, para el efecto completo, un teléfono real con la aplicación en modo API.

| Dónde | Qué hacer                                                                                                                                | Qué debe verse                                                                                                                                    | Qué explicar                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| S     | **Invitar a alguien**                                                                                                                    | «Invitar a alguien» con la fecha de hoy (simulada) y «Terraza» seleccionada.                                                                      | Un socio invita sin que el invitado cree cuenta.                                                                               |
| S     | Escribir `Sebastián` en «Nombre de tu invitado»; en «Bebida preferida (opcional)» escribir `Agua aromática`; pulsar **Crear invitación** | El botón pasa a «Creando invitación…» y después «Invitación creada para Sebastián.» con la vista previa del pase y el sello «QR de demostración». | El servidor valida al anfitrión (socio con membresía vigente), la fecha y los duplicados (máximo cinco invitaciones por día).  |
| S     | **Copiar enlace del pase** y abrirlo en el teléfono (T); o **Ver pase** en la misma pantalla                                             | En T: «Tu pase de visita», «Hola, Sebastián», «Invitación de Camila», «Punto de encuentro: Terraza», la insignia «Vigente» y el QR.               | El QR contiene solo un token opaco de 128 bits: no lleva nombre, fecha ni anfitrión. La validez la decide siempre el servidor. |

> Si no se dispone de modo API, abrir el enlace copiado en una pestaña nueva del mismo navegador. Como atajo sin crear invitación, en `/` abrir «Llegan como visitas» y pulsar **Abrir su pase** (pase de ejemplo de Valentina, invitada por Male).

## 7. Rostro desconocido → QR → el robot valida (0:45)

| Dónde | Qué hacer                                                                   | Qué debe verse                                                                                                                           | Qué explicar                                                                                                                                         |
| ----- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| K     | **Comenzar**, **Rostro desconocido**                                        | «No pude confirmar tu identidad» con «Código: RECOGNITION_UNKNOWN» y las salidas **Usar mi QR**, **Pedir ayuda** y **Volver al inicio**. | Si el rostro no se reconoce, el sistema no adivina: ofrece el QR o ayuda humana. No hay pantalla muerta.                                             |
| E     | Mirar «Tareas» (se actualiza sola)                                          | Una tarjeta «Verificación» con «Visitante sin identificar» y el motivo «Rostro no reconocido», y el botón **Validar su QR**.             | Una persona del equipo también puede resolver la duda desde su panel.                                                                                |
| K     | **Usar mi QR**                                                              | «Muestra tu código QR», el recuadro de la cámara y el campo «O escribe el código de tu pase».                                            | La lectura del QR por cámara es simulada; también se puede escribir el código del pase.                                                              |
| K     | **Operación** → **Usar el pase de Sebastián**                               | «Sebastián, ¿eres tú?», la insignia «Invitado» y la evidencia «Invitación de Camila para hoy».                                           | El QR respalda la invitación y la persona confirma que es ella. La visita que estaba en revisión se fusiona con la visita esperada de la invitación. |
| T     | Mirar el pase (se actualiza sola en modo API)                               | La insignia pasa a «Usado» y el mensaje «Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.»                   | Un QR sirve una sola vez; reutilizarlo da `QR_ALREADY_USED`.                                                                                         |
| K     | **Sí, soy yo**                                                              | «Hola, Sebastián, bienvenida. Camila indicó que te gusta el agua aromática. ¿Quieres una o prefieres otra bebida?».                      | La preferencia la indicó el anfitrión, y el robot solo la ofrece.                                                                                    |
| K     | **Agua aromática**, **Continuar**, **Sí, acompáñame**, luego **Sí, con R2** | «Camila indicó que te espera en la terraza…», «R2 puede acompañarte a la terraza…» y la cabecera «Robot R2 · Acompañando».               | Esta visita se usa en el recorrido siguiente.                                                                                                        |

## 8. Falla del robot → relevo a Sofía → cierre → evaluación (2:00)

Continúa la visita de Sebastián con R2. Sofía debe aceptar el relevo antes de que venza (cinco minutos).

| Dónde | Qué hacer                                                                                | Qué debe verse                                                                                                                                                                                                                                                           | Qué explicar                                                                                                |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| K     | **Operación** → **Reportar falla del robot**                                             | «Tengo un inconveniente», «Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.» y la lista de estado con «Ayuda solicitada» como paso actual, además del botón **Mostrar mi QR**.                                                                       | La visita no se pierde ni queda en una pantalla muerta: siempre hay un estado y una salida.                 |
| E     | Mirar «Tareas» (sin recargar)                                                            | «Relevo solicitado», «Sebastián · Invitado», «De: R2 → A: Equipo», «Destino: Terraza», «Motivo: Falla de R2 (simulación)», la insignia «Solicitado» y el aviso «R2 sigue siendo el responsable de la visita hasta que confirmes el relevo.»                              | El relevo es explícito y por pasos. La solicitud no cambia al responsable.                                  |
| E     | **Aceptar relevo**                                                                       | «Aceptaste el relevo. R2 sigue siendo el responsable hasta que lo confirmes.» y la insignia «Aceptado». En K: «Soy Sofía, voy a ayudarte. ¿Estás junto al robot?».                                                                                                       | Si dos edecanes aceptan a la vez, el servidor decide: uno gana y el otro recibe `HANDOFF_ALREADY_ACCEPTED`. |
| E     | **Recibí el contexto**                                                                   | La tarjeta «Contexto de la visita» (nombre, categoría, destino, permisos, preferencias, último punto y avance) y, en K, «Ya tengo tu destino. Continuaremos desde aquí.».                                                                                                | Sofía recibe todo lo necesario sin pedírselo de nuevo al visitante.                                         |
| E     | **Confirmar relevo**, luego **Sí, asumo la visita**                                      | El diálogo «¿Ya estás con Sebastián?», después «Eres la responsable de la visita de Sebastián.» y, bajo «Visita en curso», «Eres la responsable de esta visita. R2 queda liberado.». En K: «Yo sigo contigo; nuestro equipo revisará el robot.» y «Sofía · Acompañando». | El responsable cambia únicamente en este momento (ADR 0004).                                                |
| E     | **Confirmar llegada a Terraza**, luego **Sí, llegamos**                                  | «Llegada a Terraza registrada.» En K: «Esta es la terraza, Sebastián…».                                                                                                                                                                                                  |                                                                                                             |
| K     | **Entendido**, luego **Operación** → **Marcar regreso a recepción**                      | «Sebastián, ya casi terminamos. Sofía confirmará tu salida.» y «Esperando a que Sofía confirme tu salida.».                                                                                                                                                              | Cuando la visita la lleva una persona, la salida la confirma esa persona.                                   |
| E     | **Cerrar visita**, luego **Cerrar visita** en el diálogo                                 | «¿Cerrar la visita de Sebastián?», «Confirmas que salió del club. No se puede reabrir.» y después «Visita cerrada.».                                                                                                                                                     |                                                                                                             |
| K     | Elegir una nota en «Servicio de los robots» y en «Servicios del club»; pulsar **Enviar** | La evaluación («Si quieres, cuéntanos cómo te fue…»), opcional, con comentario de hasta 300 caracteres; después el mensaje de despedida y la barra «Volviendo al inicio en N s».                                                                                         | La evaluación es voluntaria y no cambia la salida. Se puede elegir **Prefiero no participar**.              |
| K     | **Listo**                                                                                | «Bienvenido a N Club».                                                                                                                                                                                                                                                   |                                                                                                             |

> Variante con el VIP: en el recorrido 2, en lugar de **Marcar llegada al destino**, pulsar **Reportar falla del robot** y seguir esta sección con Andrés. Reiniciar la demostración antes de los recorridos 3 al 7, porque un robot en falla no vuelve a acompañar hasta el reinicio.

## 9. Trabajadora externa en martes (0:30, cambio de fecha simulada)

| Dónde | Qué hacer                                                          | Qué debe verse                                                                                                                                                    | Qué explicar                                                                                                                   |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| K     | **Comenzar** y, en el cajón «Operación», **Martes 27 oct 2026**    | El kiosco vuelve al reposo con «Demostración reiniciada. Los datos de ejemplo volvieron a su estado inicial.».                                                    | Cambiar la fecha simulada reinicia los datos de ejemplo.                                                                       |
| K     | **Comenzar**, **Laura · no miembro**                               | «No puedo confirmar su visita hoy», «Su permiso de acceso aplica los sábados y hoy es martes.» y «Código: EXTERNAL_DAY_NOT_ALLOWED». No hay botón para continuar. | Misma persona, mismo rostro, mismo permiso: el sábado entra y el martes no. El rostro no cambió; cambió el registro aplicable. |
| K     | **Avisar a recepción**                                             | «Aviso enviado a recepción. Una persona del equipo viene en camino.»                                                                                              | No concede ningún acceso. En esta versión el aviso solo se muestra en el kiosco.                                               |
| K     | **Volver al inicio**, luego **Operación** → **Sábado 24 oct 2026** | «Hoy: Sábado 24 oct 2026».                                                                                                                                        | Deja la demostración lista para la siguiente presentación.                                                                     |

**Cierre (0:15).** Resumen de una frase: «El rostro es una pista, los registros deciden, y si el robot falla la visita continúa con una persona».

---

## Plan B si la red falla

La aplicación se puede servir en local sin conexión a Internet una vez construida; el modo por defecto es la demostración local, donde la API corre dentro del navegador.

1. Antes de la presentación, con red: `npm ci` y `npm run build:web` (sin definir `EXPO_PUBLIC_DATA_MODE`).
2. Con o sin red: `npm run serve` y abrir `http://localhost:4173` en un único navegador.
3. Abrir las pantallas K, E, S y M como **pestañas o ventanas del mismo navegador**: comparten el estado (la portada rotula «Modo demostración local»).
4. El pase se abre en otra pestaña con el enlace copiado; no hay teléfono aparte.
5. Los recorridos son los mismos. Solo cambia que «otro dispositivo» pasa a ser «otra pestaña».

Si la aplicación desplegada está en modo API y se pierde la conexión a mitad de un recorrido, el kiosco muestra «No hay conexión. Tus datos siguen aquí; puedes reintentar cuando vuelva la red.» con el botón **Reintentar**. El servidor no duplica la visita al reintentar: una persona identificada tiene a lo sumo una visita abierta.

## Reiniciar

- **Entre ensayos o al terminar:** en `/`, «Controles de la demostración» → **Reiniciar demostración** → **Reiniciar**; o en el kiosco, **Operación** → **Reiniciar demostración** → **Reiniciar**.
- El reinicio borra visitas, invitaciones y relevos, devuelve los robots al estado normal, restablece el reloj (por defecto sábado 24 de octubre de 2026, 09:00) y deja la invitación de ejemplo de Valentina.
- **Reiniciar esta visita** (cajón «Operación») solo limpia la pantalla del kiosco; la visita abierta sigue en el servidor.
- Si el reinicio está desactivado en el despliegue (`CERBERUS_RESET_ENABLED=false`), responde «El reinicio está desactivado en este despliegue.» y hay que reiniciar desde la configuración del servidor.

## Problemas frecuentes

| Síntoma                                                                                     | Causa y solución                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| «Hubo demasiados intentos seguidos. Espera unos segundos e inténtalo de nuevo.»             | Límite de tasa por dirección IP (ventana de un minuto). Esperar unos segundos. Evitar abrir más pantallas de las necesarias.              |
| «Ya existe una invitación para este invitado en esa fecha.»                                 | Ya se creó una invitación con ese nombre. Usar otro nombre o reiniciar.                                                                   |
| «Ya tienes 5 invitaciones para esa fecha. Elige otro día o cancela una de las vigentes.»    | Límite diario por anfitrión. Reiniciar.                                                                                                   |
| «Los robots de acompañamiento están ocupados…» o «Ir con Sara» al asignar el acompañante    | R2 está en falla, o con otra visita en marcha sin registrar llegada. Pulsar **Marcar llegada al destino** en la otra visita, o reiniciar. |
| La solicitud de relevo ya no aparece o dice «La solicitud de relevo venció sin aceptación…» | Venció a los cinco minutos. Reiniciar y repetir el recorrido.                                                                             |
| El kiosco no muestra a la persona que ya está en una visita abierta                         | Reconocer de nuevo a una persona con visita abierta devuelve esa visita. Reiniciar si se quiere empezar de cero.                          |
| La pantalla de otro dispositivo no se actualiza                                             | En modo API se consulta cada 3 segundos. En modo local, solo comparten estado las pestañas del mismo navegador.                           |
| Se ve una versión antigua de la interfaz                                                    | Recargar sin caché (el service worker guarda el shell de la aplicación).                                                                  |
