# Bocetos de pantalla

Bocetos de baja fidelidad en texto. Muestran jerarquía, orden y agrupación, no medidas finales ni estilo gráfico. Los textos y estados exactos están en `screens.md`. Son bocetos de diseño: la versión implementada omite la cinta de demostración, el sello «Simulación», el botón «Reportar incidencia» y la tecla del presentador (ver «Alcance implementado» en `screens.md`). Las pantallas por rol del estilo vigente están descritas en `screens.md` §14. Convenciones:

- `[ Botón ]` acción; `( ) / (•)` opción de un grupo; `[x]` marcado.
- `░░░` imagen, cámara o código QR; `▓▓▓` superficie negra (`ink`, `#141414`) con texto dorado o blanco cálido.
- `» ` indica el foco inicial. El resto de las superficies es blanco cálido (`ivory`) con líneas negras.

---

## 1. Selector de demostración · móvil (375)

```
+-------------------------------------+
| <-                              (o) |
|                                     |
| » ¿Quién eres hoy?                  |
| Selecciona tu rol para continuar    |
| en N Club.                          |
|                                     |
| Visitantes                          |
| +---------------------------------+ |
| | [ ] Socio VIP                   | |
| |     Sofía · invitados y avisos  | |
| +---------------------------------+ |
| | [ ] Socia regular               | |
| |     {nombre} · reservas e invi- | |
| |     tados                       | |
| +---------------------------------+ |
| | [ ] Invitado                    | |
| |     pase sin cuenta             | |
| +---------------------------------+ |
| | [ ] Personal del club           | |
| |     {nombre} · agenda y turno   | |
| +---------------------------------+ |
| | [ ] Trabajador externo          | |
| |     pase de servicio sin cuenta | |
| +---------------------------------+ |
|                                     |
| Operación del club                  |
| +---------------------------------+ |
| | [ ] Concierge                   | |
| | [ ] Edecán                      | |
| | [ ] Robot R1                    | |
| | [ ] Administración              | |
| +---------------------------------+ |
|                                     |
| v Llegan como visitas               |
+-------------------------------------+
```

`(o)` abre los ajustes; `<-` vuelve a la bienvenida (`/entrar`). Cada fila se dibuja como una tarjeta propia; aquí se agrupan para abreviar.

Ajustes y bloque plegado abiertos:

```
| (o) Ajustes                         |
|   Fecha de trabajo                  |
|   (•) Sábado 24 oct 2026            |
|   ( ) Martes 27 oct 2026            |
|   Cambiar la fecha reinicia los     |
|   datos.                            |
|   [ Reiniciar datos ]               |
|   Sin visitas en curso              |
|   Datos en este navegador · ...     |
|   [ Catálogo de diseño ]            |
|                                     |
| ^ Llegan como visitas               |
|   Valentina · invitada              |
|   Su anfitrión le emite un pase QR. |
|   Laura · trabajadora externa       |
|   Permiso de acceso los sábados.    |
|   Valentina · pase de invitado      |
|                    [ Abrir su pase ]|
```

---

## 2. Selector de demostración · escritorio (1440)

La pantalla es la misma columna de 600 px centrada sobre fondo `sage`, con una línea negra a cada lado; no cambia de disposición.

---

## 3. Kiosco del robot · reconocimiento (768, R-02)

```
+------------------------------------------------------------+
| Robot R1                        [N]              (?)  (*)  |
| En línea                                                   |
+------------------------------------------------------------+
|                                                            |
| » Voy a confirmar tu visita                                |
|                                                            |
|       +--------------------------------------+             |
|       | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |             |
|       | ░░░░░░  +----------------+  ░░░░░░░░ |             |
|       | ░░░░░░  |                |  ░░░░░░░░ |             |
|       | ░░░░░░  |   encuadre     |  ░░░░░░░░ |             |
|       | ░░░░░░  +----------------+  ░░░░░░░░ |             |
|       | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |             |
|       +--------------------------------------+             |
|                                                            |
|   Bienvenido. Voy a confirmar tu visita. Si lo necesitas,  |
|   podemos usar tu QR o pedir ayuda en recepción.           |
|                                                            |
|             [ Usar mi QR ]                                 |
+------------------------------------------------------------+
| ^ Operación                                                |
+------------------------------------------------------------+
```

`[N]` es el sello; `(?)` es «Necesito ayuda» y `(*)` «Ajustes del robot». En la cabecera visible el robot se nombra sin «· Recepción».

Cajón de operación abierto (botón «Operación»; la lista de rostros completa está en `screens.md` §6):

```
+------------------------------------------------------------+
| v Operación   Ajustes del robot                            |
|   Rostro a reconocer                                       |
|   (•) Andrés · miembro      ( ) Camila · miembro           |
|   ( ) Valentina · no miembro ( ) Mario · no miembro        |
|   ( ) Laura · no miembro    ( ) Rostro desconocido         |
|   ( ) Error de cámara                                      |
|   Fecha de trabajo                                         |
|   [ Sábado 24 oct 2026 ] [ Martes 27 oct 2026 ]           |
|   [ Reiniciar datos ]                                      |
|   [ Marcar llegada al destino ] [ Marcar regreso a         |
|   recepción ] [ Reportar falla del robot ]                 |
|   [ Reiniciar esta visita ]                                |
+------------------------------------------------------------+
```

---

## 4. Kiosco del robot · orientación (768, R-05 y R-07)

Pregunta de destino (R-05, ejemplo VIP):

```
+------------------------------------------------------------+
| Robot R1                        [N]              (?)  (*)  |
| En línea                                                   |
+------------------------------------------------------------+
|                                                            |
| » Hoy tenemos actividades registradas por el club.         |
|   ¿Quieres conocerlas o prefieres que te acompañemos a     |
|   tu reserva del salón?                                    |
|                                                            |
|   Destino registrado: Salón reservado                      |
|                                                            |
|   [ Ver actividades de hoy ]  [ Ir a mi reserva del salón ]|
+------------------------------------------------------------+
```

Acompañamiento (R-07, ejemplo VIP con R2):

```
+------------------------------------------------------------+
| Robot R2                        [N]              (?)  (*)  |
| En línea                                                   |
+------------------------------------------------------------+
|                                                            |
| » Vamos hacia tu salón, Andrés.                            |
|   Si necesitas algo, puedes decírmelo.                     |
|                                                            |
|   R2 te acompaña                                           |
|                                                            |
|    (1) Recepción ----- (2) Pasillo ----- ( ) Salón         |
|         hecho            ● aquí             reservado      |
|                                                            |
|   Sin tiempos estimados: el recorrido avanza paso a paso.  |
|                                                            |
|                             [ Necesito ayuda ]             |
+------------------------------------------------------------+
| ^ Operación                                                |
+------------------------------------------------------------+
```

Falla y ayuda (R-09):

```
| » Tengo un inconveniente                                    |
|   Voy a pedir ayuda para que puedas continuar.              |
|                                                             |
|    (✓) Ayuda solicitada ---- ( ) Sofía va hacia ti          |
|                                                             |
|   [ Mostrar mi QR ]                                         |
```

---

## 5. Panel del edecán · tarea de relevo (768)

```
+----------------------------------------------------------------------------+
| Sofía · Edecán                         [ Disponible v ]     1 tarea        |
+---------------------------+------------------------------------------------+
| EQUIPO                    | » Relevo solicitado                            |
|  R1  Recepción            |   [Solicitado]                                 |
|  R2  Detenido             |                                                |
|  R3  Disponible           |   Solicitado > Aceptado > Contexto > Confirmado|
|  Sara     Disponible      |   (•)----------( )--------( )--------( )       |
|  Sofía    Disponible      |                                                |
|  Ramiro   Disponible      |   +------------------------------------------+ |
|                           |   | R2 sigue siendo el responsable de la     | |
| TAREAS                    |   | visita hasta que confirmes el relevo.    | |
|  +---------------------+  |   +------------------------------------------+ |
|  | Relevo  [Solicitado]|  |                                                |
|  | Andrés · Socio VIP  |  |   De: R2  ->  A: Sofía                         |
|  | De R2 a Sofía       |  |   Andrés · Socio VIP                           |
|  | Salón reservado     |  |   Destino: Salón reservado                     |
|  | Vence 10:25         |  |   Último punto confirmado: Pasillo principal   |
|  +---------------------+  |   Motivo: Falla de R2 (simulación)             |
|                           |   Solicitado 10:15 · Vence 10:25               |
| [ Validar QR ]            |                                                |
|                           |   Contexto de la visita                        |
|                           |   (aparece al aceptar)                         |
|                           |                                                |
|                           |   [ Rechazar ]         [ Aceptar relevo ]      |
+---------------------------+------------------------------------------------+
```

Misma tarjeta tras aceptar y recibir el contexto (paso previo a confirmar):

```
|   Solicitado > Aceptado > Contexto > Confirmado                            |
|   (✓)----------(✓)--------(•)--------( )                                   |
|   Contexto de la visita                                                    |
|   Andrés · Socio VIP · V-201          Destino: Salón reservado             |
|   Permisos: membresía VIP vigente, reserva confirmada                      |
|   Preferencias: Café                  Avance: acompañando, pasillo         |
|                                                 [ Confirmar relevo ]       |
```

Diálogo de confirmación:

```
|        +--------------------------------------------+                      |
|        | ¿Ya estás con Andrés?                      |                      |
|        | Al confirmar serás la responsable de esta  |                      |
|        | visita. R2 queda liberado.                 |                      |
|        |        [ Todavía no ]  [ Sí, asumo la visita ]                    |
|        +--------------------------------------------+                      |
```

Móvil (375): la lista de tareas ocupa la pantalla y el detalle abre como hoja inferior a pantalla completa, con el botón principal fijo al pie.

```
+-------------------------------------+
| Sofía · Edecán   [ Disponible v ]   |
| ----------------------------------- |
| » Relevo solicitado    [Solicitado] |
|   Andrés · Socio VIP                |
|   De R2 a Sofía · Salón reservado   |
|   (•)---( )---( )---( )             |
|   R2 sigue siendo el responsable    |
|   hasta que confirmes el relevo.    |
|   Falla de R2 (simulación)          |
|                                     |
| [      Aceptar relevo           ]   |
| [ Rechazar ]                        |
+-------------------------------------+
```

---

## 6. Pase QR del invitado (375)

Pase vigente:

```
+-------------------------------------+
|▓ N Club                            ▓|
|▓» Tu pase de visita                ▓|
+-------------------------------------+
|                                     |
|  Hola, Valentina        [Vigente]   |
|  Invitación de Camila               |
|  Punto de encuentro: Terraza        |
|  Válido el sáb 24 oct 2026          |
|                                     |
|  +-------------------------------+  |
|  | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |  |
|  | ░░  ▄▄▄▄▄  ░░░░░  ▄▄▄▄▄  ░░░░ |  |
|  | ░░  █   █  ░░░░░  █   █  ░░░░ |  |
|  | ░░  ▀▀▀▀▀  ░░░░░  ▀▀▀▀▀  ░░░░ |  |
|  | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ |  |
|  +-------------------------------+  |
|                                     |
|  [ Mostrar a pantalla completa ]    |
|                                     |
|  Preséntalo en recepción. El robot  |
|  lo leerá y confirmará tu visita.   |
|                                     |
|  ¿Sin teléfono o sin QR?            |
|  Dile tu nombre a una persona de    |
|  recepción. Podemos ayudarte sin    |
|  que instales nada.                 |
|                                     |
|  [ Copiar enlace ]                  |
|  Este pase se valida en recepción.  |
|  Una captura de pantalla no es      |
|  suficiente por sí sola.            |
+-------------------------------------+
```

Pase vencido (el QR no se muestra):

```
+-------------------------------------+
|▓» Tu pase de visita                ▓|
+-------------------------------------+
|  Hola, Valentina        [Vencido]   |
|  Invitación de Camila               |
|                                     |
|  (!) Este pase venció. Pide a tu    |
|      anfitrión que te envíe uno     |
|      nuevo.                         |
|      Código: QR_EXPIRED             |
+-------------------------------------+
```
