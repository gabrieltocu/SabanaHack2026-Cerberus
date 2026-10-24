# Contenido de orientación por categoría

Este documento fija los textos que el robot (pantalla `/robot`) y el panel del edecán muestran en cada fase de la visita. Los textos proceden del guion de negocio del club; se conservan sin cambios salvo las adaptaciones señaladas en la columna de notas.

## Variables y convenciones

| Variable        | Significado                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `{nombre}`      | Nombre de pila de la persona confirmada.                                                                                         |
| `{anfitrión}`   | Nombre del socio que registró la invitación (en el guion original, Male). En la demostración es el socio que crea la invitación. |
| `{destino}`     | Destino confirmado de la visita.                                                                                                 |
| `{bebida}`      | Preferencia registrada, siempre presentada como ofrecimiento.                                                                    |
| `{acompañante}` | R2, R3, Sara, Sofía o Ramiro, según la asignación.                                                                               |

Reglas de redacción que se aplican a las cinco categorías:

1. Cada texto va entre comillas tipográficas en la pantalla del robot, como voz del robot, y sin comillas en el panel del edecán.
2. Tratamiento: tuteo con socios, invitada y personal; «usted» con la trabajadora externa.
3. Ningún texto afirma lo que el sistema no ha confirmado: no se dice que el anfitrión está en el destino, que la bebida será preparada ni que el trabajo técnico fue aprobado.
4. La categoría nunca se muestra como etiqueta de estatus frente a otras personas. El rótulo de categoría aparece solo en el panel del personal y en el detalle de visita.
5. Las preferencias (bebida, agenda) son un ofrecimiento. Rechazarlas no bloquea nada.

## Fases comunes

| Fase                      | Texto                                                                                                                                     | Cuándo se muestra                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Reposo                    | Bienvenido a N Club.                                                                                                                      | Pantalla de inicio del robot, antes de reconocer a nadie.                                    |
| Reconocimiento            | Bienvenido. Voy a confirmar tu visita. Si lo necesitas, podemos usar tu QR o pedir ayuda en recepción.                                    | Durante el reconocimiento facial simulado.                                                   |
| Confirmación de identidad | {nombre}, ¿eres tú?                                                                                                                       | Antes de saludar por nombre; nunca se saluda por nombre sin esta confirmación.               |
| Evaluación (opcional)     | Si quieres, cuéntanos cómo te fue con el servicio de los robots y con los servicios del club. Puedes responder por texto o no participar. | Después de confirmar la salida. Adaptación: la respuesta de voz queda fuera de esta versión. |
| Evaluación omitida        | Sin problema. Tu salida no cambia.                                                                                                        | Si la persona elige no participar.                                                           |

## VIP · Andrés

Destino de la demostración: Salón reservado. Acompañante: R2.

| Fase                | Texto                                                                                                                       | Notas                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saludo              | Andrés, bienvenido. ¿Te apetece un café, como tienes registrado, o prefieres otra cosa?                                     | Botones: «Café», «Otra bebida», «Nada por ahora». Tras elegir: «Anotado. Te indicaremos dónde recibirla.» (no se promete preparación ni traslado).                      |
| Pregunta de destino | Hoy tenemos actividades registradas por el club. ¿Quieres conocerlas o prefieres que te acompañemos a tu reserva del salón? | Botones: «Ver actividades de hoy» (abre la lista de `/actividades` dentro del kiosco) y «Ir a mi reserva del salón». Si elige una actividad, esa pasa a ser el destino. |
| Asignación          | R2 puede acompañarte al salón. ¿Te parece bien?                                                                             | Botones: «Sí, con R2», «Prefiero recibir indicaciones». Si no hay robot libre se ofrece una persona del equipo o una espera informada.                                  |
| Ruta                | Vamos hacia tu salón, Andrés. Si necesitas algo, puedes decírmelo.                                                          | Pantalla del robot que acompaña (R2).                                                                                                                                   |
| Llegada             | Llegamos al salón de tu reserva. Que disfrutes el día en el club.                                                           | La visita sigue activa; solo termina el acompañamiento.                                                                                                                 |
| Salida              | Andrés, bienvenido de nuevo a recepción. ¿Ya terminaste tu visita por hoy?                                                  | Se reconoce de nuevo a la persona o se usa el QR; no se presume que hizo todas las actividades.                                                                         |
| Despedida           | Hasta pronto, Andrés. Gracias por venir; esperamos verte de nuevo.                                                          |                                                                                                                                                                         |

## Regular · Camila

Destino de la demostración: Cancha de tenis. Acompañante: Sara.

| Fase                | Texto                                                                                  | Notas                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Saludo              | Camila, bienvenida. ¿Quieres un té o prefieres otra bebida?                            | Botones: «Té», «Otra bebida», «Nada por ahora».                                                                   |
| Pregunta de destino | ¿Vienes a tu reserva de tenis o quieres ir a otro lugar del club?                      | Botones: «Voy a mi reserva de tenis», «Otro lugar», «Ver actividades de hoy». No se obliga a seguir un recorrido. |
| Asignación          | Sara puede acompañarte a la cancha. ¿Prefieres ir con ella o recibir las indicaciones? | Botones: «Ir con Sara», «Recibir indicaciones».                                                                   |
| Ruta                | Camila, soy Sara. Vamos a la cancha que confirmaste en recepción.                      | Adaptación: el texto se muestra como mensaje de Sara en el kiosco; Sara figura como recurso humano del equipo.    |
| Llegada             | Aquí está tu cancha, Camila. Que disfrutes el día en el club.                          |                                                                                                                   |
| Salida              | Camila, ¿ya terminaste tu visita? Podemos confirmar tu salida.                         | No se le pide repetir su registro.                                                                                |
| Despedida           | Gracias por venir, Camila. Esperamos que vuelvas pronto.                               |                                                                                                                   |

## Invitada · Valentina

Destino de la demostración: Terraza con {anfitrión}. Acompañante: R2.

| Fase                | Texto                                                                                                                          | Notas                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saludo              | Hola, Valentina, bienvenida. {anfitrión} indicó que te gusta el agua aromática. ¿Quieres una o prefieres otra bebida?          | Solo se menciona la preferencia si la invitación la registró. Botones: «Agua aromática», «Otra bebida», «Nada por ahora». Los datos previos no se dan por vigentes.                                                  |
| Pregunta de destino | {anfitrión} indicó que te espera en la terraza. ¿Quieres que te acompañemos hasta allí?                                        | Botones: «Sí, acompáñame», «Prefiero esperar aquí». Solo se afirma que el anfitrión está en el punto si la información es reciente o fue confirmada; si no responde se ofrece esperar asistida en un punto atendido. |
| Asignación          | R2 puede acompañarte a la terraza. ¿Quieres ir con él?                                                                         | Botones: «Sí, con R2», «Prefiero ir con una persona del equipo».                                                                                                                                                     |
| Ruta                | Valentina, seguimos hacia la terraza, el punto que acordaste con {anfitrión}.                                                  |                                                                                                                                                                                                                      |
| Llegada             | Esta es la terraza, Valentina. Si {anfitrión} no está aquí, podemos contactarla. Que disfrutes el día en el club.              | Botón de apoyo: «Contactar a {anfitrión}».                                                                                                                                                                           |
| Salida              | Valentina, gracias por visitarnos. ¿Te gustaría conocer cómo hacerte miembro? Si quieres, podemos ayudarte con la inscripción. | Botones: «Quiero saber más», «No, gracias». La oferta es opcional; aceptar no activa membresía ni cambia su categoría.                                                                                               |
| Despedida           | Gracias por venir, Valentina. Esperamos que hayas disfrutado la visita y que vuelvas pronto.                                   |                                                                                                                                                                                                                      |

## Personal del club · Mario

Destino de la demostración: Operaciones. Sin acompañamiento solicitado.

| Fase                | Texto                                                                                                     | Notas                                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Saludo              | Hola, Mario. Buen día. ¿Quieres consultar en privado un resumen rápido de tu agenda de hoy?               | Botones: «Verlo en mi teléfono», «Ahora no».                                                                                                                                                                                                                                                     |
| Pregunta de destino | Tienes una reunión hoy a las 7 p. m. en operaciones. ¿Necesitas ayuda para llegar o sigues por tu cuenta? | Adaptación de privacidad: la frase con el detalle de la reunión se muestra solo en `/personal` (pantalla privada de Mario). En el kiosco se muestra: «Te envié el resumen a tu teléfono. ¿Necesitas ayuda para llegar o sigues por tu cuenta?». Botones: «Sigo por mi cuenta», «Necesito ayuda». |
| Asignación          | Perfecto, Mario. Puedes continuar. Si necesitas orientación, estamos aquí.                                | No se asigna acompañante ni se ocupa un robot.                                                                                                                                                                                                                                                   |
| Ruta                | Operaciones queda por el corredor de servicio. ¿Necesitas alguna otra indicación?                         | Indicación breve; no se sigue ni interrumpe al trabajador.                                                                                                                                                                                                                                       |
| Llegada             | Que tengas un gran día de trabajo, Mario.                                                                 | Cierra la orientación breve; la visita sigue activa.                                                                                                                                                                                                                                             |
| Salida              | Mario, ¿terminaste tu visita de hoy? Si quieres, puedes contarnos cómo te fue con la orientación.         | El cierre no registra ni sustituye el control de asistencia laboral.                                                                                                                                                                                                                             |
| Despedida           | Nos vemos pronto, Mario. Gracias por tu trabajo de hoy.                                                   |                                                                                                                                                                                                                                                                                                  |

## Trabajadora externa · Laura

Destino de la demostración: Recepción de proveedores. Acompañante: Sara. Permiso de acceso: sábados.

| Fase                | Texto                                                                                                                            | Notas                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saludo              | Buenos días, Laura. Bienvenida. Su visita de mantenimiento está registrada para hoy.                                             | Trato formal ligado al servicio; sin ofrecimiento de bebida.                                                                                                    |
| Pregunta de destino | El responsable de su servicio indicó recepción de proveedores como punto de presentación. Vamos a confirmar que la esperan allí. | Botones: «Sí, vamos», «Necesito ayuda en recepción». Si falta el nombre del responsable o la autorización, se consulta a recepción; no se concede acceso libre. |
| Asignación          | Sara la acompañará al punto autorizado para su servicio.                                                                         | Botón único: «Entendido».                                                                                                                                       |
| Ruta                | Laura, por aquí está el punto de presentación. Espere la confirmación del responsable antes de entrar al área de trabajo.        |                                                                                                                                                                 |
| Llegada             | Aquí está recepción de proveedores. Que tenga un gran día de trabajo.                                                            | La entrega no autoriza el acceso a otras áreas ni aprueba el trabajo técnico.                                                                                   |
| Salida              | Laura, vamos a confirmar su salida. Si lo desea, puede comentar cómo fue la orientación.                                         |                                                                                                                                                                 |
| Despedida           | Gracias por su visita y por su aporte al club, Laura. Que tenga un buen día.                                                     |                                                                                                                                                                 |

## Denegación del externo fuera de su día autorizado

Texto nuevo, redactado con el mismo tono formal; no existe en el guion original.

| Fase        | Texto                                                    | Notas                                               |
| ----------- | -------------------------------------------------------- | --------------------------------------------------- |
| Resultado   | Laura, no puedo confirmar su visita hoy.                 | Código `EXTERNAL_DAY_NOT_ALLOWED`.                  |
| Explicación | Su permiso de acceso aplica los sábados y hoy es martes. | El día de la semana se toma de la fecha simulada.   |
| Salida      | Recepción puede ayudarle a coordinar una nueva fecha.    | Botón: «Avisar a recepción». No se concede ingreso. |

## Verificación incompleta y alternativas

Textos procedentes de los casos de relevo y recuperación del guion de negocio.

| Situación                                        | Texto                                                                                            | Código                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Rostro desconocido                               | No pude confirmar tu identidad. Podemos usar tu QR o pedir apoyo a recepción.                    | `RECOGNITION_UNKNOWN`                                                                                     |
| Comprobar el pase                                | Vamos a comprobar tu visita registrada para hoy.                                                 |                                                                                                           |
| Pase verificado, asigna responsable              | Sofía continuará contigo y ya tiene tu destino confirmado.                                       | Adaptación: el guion nombra a Sara; en la demostración la persona que opera el panel del edecán es Sofía. |
| Pase o identidad no coinciden                    | No puedo confirmar esta visita. Recepción puede ayudarte.                                        | `CLASSIFICATION_MANUAL_REVIEW`                                                                            |
| Sin teléfono, sin QR o sin consentimiento facial | Podemos ayudarte en recepción aunque no tengas teléfono o no quieras usar reconocimiento facial. |                                                                                                           |
| Visita confirmada por una persona del equipo     | Ya tenemos tu visita confirmada. No necesitas instalar una aplicación para continuar.            |                                                                                                           |
| Orientar tras la verificación manual             | Te indicaremos quién te acompaña y hacia dónde vamos.                                            |                                                                                                           |
| Robots ocupados                                  | Los robots de acompañamiento están ocupados. Puedo ofrecerte ayuda humana ahora.                 | `ROBOT_BUSY`                                                                                              |
| Elegir con persona del equipo                    | Puedes ir con Sara o esperar a un robot. ¿Qué prefieres?                                         |                                                                                                           |
| Anfitrión sin ubicación reciente                 | El último dato de {anfitrión} no está actualizado. Voy a confirmar el encuentro.                 | `HOST_LOCATION_STALE`                                                                                     |

## Falla del robot y relevo a una persona del equipo

Recorrido de la demostración (g, ver `flows.md`): R2 falla acompañando a Andrés al Salón reservado y Sofía recibe el relevo.

| Estado del relevo                               | Texto en el kiosco                                                                           | Texto en el panel del edecán                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Falla detectada, relevo `REQUESTED`             | Tengo un inconveniente. Voy a pedir ayuda para que puedas continuar.                         | Solicitud de relevo: R2 necesita ayuda para continuar la visita de Andrés.                                     |
| `ACCEPTED`                                      | Soy Sofía, voy a ayudarte. ¿Estás junto al robot?                                            | Aceptaste el relevo. R2 sigue siendo el responsable de la visita hasta que lo confirmes.                       |
| `CONTEXT_TRANSFERRED`                           | Ya tengo tu destino. Continuaremos desde aquí.                                               | Recibiste el contexto: destino, permisos, preferencias y avance de la visita.                                  |
| `CONFIRMED`                                     | Yo sigo contigo; nuestro equipo revisará el robot.                                           | Eres la responsable de la visita.                                                                              |
| Confirmación de entrega por la persona que sale | Gracias, Sofía. La visita queda a tu cargo. Andrés, que disfrutes el recorrido.              | Entrega y recepción confirmadas: un solo responsable registrado.                                               |
| Solicitud vencida sin aceptación                | Seguimos buscando a una persona del equipo. Puedes mostrar tu QR o pedir ayuda en recepción. | Texto nuevo; el guion solo indica que la solicitud vence sin cambiar de responsable. Código `HANDOFF_EXPIRED`. |

## Textos previstos que no están en esta versión

Se conservan como referencia: la verificación por QR tras un rostro no reconocido sigue el guion de la categoría del invitado (no hay «Vamos a comprobar tu visita registrada para hoy.» ni «Sofía continuará contigo y ya tiene tu destino confirmado.»), no hay «Puedes ir con Sara o esperar a un robot. ¿Qué prefieres?» (si el acompañante no está disponible se ofrece el botón «Ir con Sara») y no existe el mensaje de confirmación de entrega «Gracias, Sofía. La visita queda a tu cargo. …». Tampoco se implementaron «Orientar tras la verificación manual», «Ya tenemos tu visita confirmada…» ni «Podemos ayudarte en recepción aunque no tengas teléfono…». El texto de evaluación omite la respuesta por voz.

## Relevo entre persona y robot (referencia)

Casos propuestos en el guion de negocio que no son parte de los siete recorridos de la demostración. Se conservan para fases posteriores.

| Caso                          | Texto                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| Regular: el robot pide ayuda  | Sofía, ¿puedes continuar con Camila hasta tenis? Necesito regresar a carga. |
| Regular: se propone el cambio | Camila, Sofía puede seguir contigo. ¿Te parece bien?                        |
| VIP: robot ofrece continuar   | Sara, estoy disponible. ¿Andrés desea continuar conmigo hasta su reserva?   |
| VIP: aceptar sin imponer      | Andrés, puedes seguir conmigo o continuar con el robot. ¿Qué prefieres?     |
| Invitado: robot libre         | Valentina, ¿te gustaría seguir el recorrido con nuestro anfitrión robot?    |
| Relevo sin validar            | Antes de transferir la visita, necesito confirmar tu asignación.            |
| Relevo rechazado              | No puedo confirmar esta solicitud. Recepción puede ayudarte.                |
| Pérdida de conexión           | Perdí la conexión. Voy a coordinar apoyo para continuar.                    |
| Obstáculo o riesgo            | Voy a detenerme. Hay una dificultad en el recorrido.                        |
