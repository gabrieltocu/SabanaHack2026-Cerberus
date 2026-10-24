# El reto de Cerberus — N Club (ANS ROBEX) · Sabana Hack 2026

> Transcripción del enunciado oficial (`sabanHackGuide.pdf`, plataforma LeMarTek Hackatones, 23-oct-2026).
> Texto fiel al original; solo se le dio formato.

## Contexto

N Club es un club privado que funciona por membresía y ofrece varios servicios a quienes hacen parte de él.
Como en muchos lugares de este tipo, la entrada es el primer punto de contacto: ahí se recibe a cada persona,
se identifica quién es y se le indica hacia dónde debe dirigirse.

Hoy esa tarea recae en el personal de recepción. Una parte importante de su trabajo consiste en dar
indicaciones rutinarias: saludar, confirmar quién llega y orientar a cada persona según el motivo de su visita.

El club ya cuenta con un sistema de reconocimiento facial que permite saber si quien llega es miembro o no.
Esa información es útil, pero no es suficiente: a la entrada llegan personas con perfiles, permisos y
necesidades muy distintas, y saber solamente si alguien es miembro no basta para orientarlo bien.

N Club quiere que un robot asuma esa orientación rutinaria en la entrada, de manera que el personal de
recepción pueda dedicar su tiempo a situaciones que realmente requieren atención humana.

## El problema

A la entrada de N Club llegan cinco tipos de visitantes, y cada uno necesita una orientación diferente. Sin
embargo, la herramienta automática con la que cuenta el club, el reconocimiento facial, solo distingue entre
dos grupos: miembros y no miembros.

Eso deja un vacío. Saber que alguien es miembro no dice si es un miembro VIP o un miembro regular. Y saber que
alguien no es miembro tampoco permite distinguir, por sí solo, entre un invitado, una persona del personal del
club o un trabajador externo. Para orientar bien a cada persona hace falta confirmar su categoría específica, y
hoy esa confirmación depende de la recepción.

El desafío, entonces, no es solo reconocer a una persona. Es pasar de una identificación parcial a una
orientación correcta: saber con suficiente certeza quién llega y darle a cada visitante la guía que le
corresponde, sin que la experiencia se vuelva lenta, confusa o incómoda.

## ¿Por qué importa?

La entrada define la primera impresión del club. Un miembro espera ser reconocido; un invitado que llega por
primera vez necesita sentirse bienvenido y saber a dónde ir; una persona que viene a trabajar necesita llegar a
su destino sin rodeos.

También hay un componente de control. Si el robot clasifica mal a alguien, puede enviar a una persona a un
espacio al que no le corresponde entrar, o tratar como desconocido a alguien que sí pertenece al club. En un
lugar de acceso restringido, ambos errores tienen consecuencias.

Por último, está el trabajo del equipo de recepción. Cada indicación rutinaria que el robot resuelva bien es
tiempo que las personas pueden dedicar a casos que exigen criterio humano. Pero si el robot genera confusión,
la carga no disminuye: se traslada.

## El reto

¿Cómo podría un robot recibir a cada persona que llega a N Club, confirmar a cuál de las cinco categorías de
visitante pertenece y orientarla de una forma que tenga sentido para esa categoría, de manera que asuma las
indicaciones rutinarias que hoy da la recepción?

El robot es parte del planteamiento del club. Todo lo demás —cómo se ve, cómo interactúa, qué información usa
para confirmar la categoría, cómo se comporta en cada caso y qué tecnologías lo hacen posible— es una decisión
de cada equipo.

## Condiciones del reto

Estas son las condiciones establecidas por el club. Toda propuesta debe cumplirlas.

1. **Orientación a cargo de un robot.** La guía en la entrada debe estar liderada por un robot que asuma las
   indicaciones rutinarias del personal de recepción.
2. **Dataset de reconocimiento facial.** Cada equipo debe crear su propio dataset con fotos de ellos mismos o
   participantes de la hackathon que den su consentimiento, y usarlo para que el robot identifique a las
   personas (o también podrían descargar alguno existente).
3. **Confirmación de la categoría específica.** Como el reconocimiento facial no basta para conocer la
   categoría exacta, cada equipo debe diseñar cómo confirmarla a partir de información adicional, de la
   interacción con la persona o de ambas.
4. **Un flujo de orientación distinto para cada categoría.** La propuesta debe demostrar una orientación
   diferenciada para cada uno de los cinco tipos de visitante.

Integrar el reconocimiento facial significa que la información que entrega ese sistema se usa como parte del
proceso del robot. Simularlo significa que no es necesario conectarse con el sistema real del club: basta con
representar su comportamiento de una manera que permita demostrar la integración.

## Los cinco tipos de visitante

- **Miembros VIP:** miembros del club con membresía de nivel VIP.
- **Miembros regulares:** miembros del club con membresía regular.
- **Invitados:** personas que llegan al club por invitación.
- **Personal del club:** personas que trabajan para N Club.
- **Trabajadores externos:** personas ajenas al club que llegan a realizar un trabajo o prestar un servicio.

El reto no define en detalle qué servicios, espacios o permisos corresponden a cada categoría. Los equipos
pueden plantear supuestos razonables sobre el funcionamiento del club, siempre que los expliquen y que sean
coherentes con la orientación que proponen.

## La oportunidad de explorar

Primero, piensa en la persona que llega. Después, explora todo lo que la tecnología podría hacer posible.

Cinco visitantes distintos llegan a la misma puerta con expectativas, permisos y urgencias diferentes. Entender
esa diferencia es el punto de partida. Estas preguntas pueden ayudar a explorar el problema; no es obligatorio
responderlas todas ni limitarse a ellas:

1. ¿Qué necesita cada tipo de visitante en el momento de llegar, y qué le resultaría molesto o innecesario?
2. ¿Qué información existe o podría existir en el club que ayude a confirmar quién es cada persona?
3. ¿Cuánta interacción es razonable antes de que la llegada se vuelva lenta o incómoda?
4. ¿Qué debería pasar cuando la información disponible no alcanza, es ambigua o se contradice?
5. ¿Qué decisiones puede asumir el robot por su cuenta y en qué casos tiene sentido involucrar a una persona?
6. ¿Cómo se cuida la privacidad de quienes llegan, considerando que el proceso parte de un reconocimiento facial?
7. ¿Cómo sabría el club si el robot está orientando bien a las personas?

El reto admite enfoques muy distintos. Un equipo puede concentrarse en la precisión de la clasificación, otro en
la experiencia de la llegada y otro en la forma en que el robot se integra con la operación del club. Lo
importante es que la propuesta responda al problema y que el equipo pueda explicar por qué tomó sus decisiones.

## Demostración y validación

La demostración es la evidencia principal del reto. Debe permitir a los jueces ver, no solo escuchar, que la
propuesta funciona.

Como mínimo, la demostración debe mostrar:

1. El uso de la información del reconocimiento facial, real o simulado, dentro del proceso del robot.
2. La confirmación de la categoría específica para visitantes de las cinco categorías.
3. Un flujo de orientación distinto para cada una de las cinco categorías.

El formato de la demostración lo define cada equipo. Si una parte se simula, el equipo debe explicar con
claridad qué es simulado y qué funciona realmente.

Los equipos pueden presentar, además, cualquier otra evidencia que consideren útil para demostrar que su
propuesta resuelve el problema.

## Criterios de evaluación (100 puntos)

Ningún criterio favorece una tecnología, un tipo de robot o una forma de interacción: lo que se evalúa es qué
tan bien responde la propuesta al problema y qué evidencia lo respalda.

| # | Criterio | Puntos | Qué se evalúa |
|---|---|---|---|
| 1 | Comprensión del problema | 10 | Qué tan bien entiende el equipo a los cinco tipos de visitante, sus necesidades al llegar y la limitación del reconocimiento facial |
| 2 | Integración con el reconocimiento facial | 15 | Si la información de miembro o no miembro, real o simulada, se usa de verdad dentro del proceso del robot |
| 3 | Confirmación de la categoría | 20 | Qué tan confiable y razonable es la forma de llegar desde "miembro / no miembro" hasta la categoría específica |
| 4 | Flujos de orientación diferenciados | 20 | Si existen cinco flujos, si de verdad se diferencian y si cada uno tiene sentido para su categoría |
| 5 | Experiencia del visitante | 10 | Si la llegada resulta clara, ágil y adecuada para cada tipo de persona |
| 6 | Funcionamiento de la demostración | 15 | Qué tanto de lo propuesto se ve funcionando y qué tan clara es la separación entre lo real y lo simulado |
| 7 | Justificación y comunicación | 10 | Si el equipo explica sus decisiones, sus supuestos y sus límites de forma clara y honesta |
| | **Total** | **100** | |

### Niveles de desempeño

Para cada criterio, el jurado asigna un puntaje dentro de uno de tres niveles: **Sobresaliente** (80 % a 100 %
de los puntos del criterio), **Aceptable** (40 % a 79 %) e **Insuficiente** (0 % a 39 %).

| Criterio | Sobresaliente | Aceptable | Insuficiente |
|---|---|---|---|
| 1. Comprensión del problema | Describe con precisión qué necesita cada categoría y por qué el reconocimiento facial no basta; sus decisiones se derivan de ese análisis | Identifica las cinco categorías y la limitación, pero el análisis de necesidades es general | No muestra comprensión clara de las diferencias entre visitantes |
| 2. Integración con el reconocimiento facial | La salida del sistema, real o simulado, alimenta de forma visible y coherente las decisiones del robot | La integración existe, pero es parcial o poco clara en la demostración | No hay integración, o el reconocimiento facial aparece solo como mención |
| 3. Confirmación de la categoría | El mecanismo distingue las cinco categorías de forma consistente y el equipo explica cómo maneja los casos dudosos | Distingue las categorías en los casos presentados, pero con vacíos o supuestos sin explicar | No logra distinguir las cinco categorías o depende de supuestos no razonables |
| 4. Flujos de orientación diferenciados | Se demuestran los cinco flujos, con diferencias claras y justificadas según la categoría | Se demuestran los cinco flujos, pero algunos son muy similares entre sí o poco justificados | Faltan flujos o no hay diferencias reales entre ellos |
| 5. Experiencia del visitante | La interacción es clara y adecuada para cada perfil, sin pasos innecesarios | La interacción funciona, pero resulta lenta, confusa o igual para todos en algunos puntos | La interacción es difícil de seguir o inadecuada para varios perfiles |
| 6. Funcionamiento de la demostración | La mayor parte de la propuesta se ve funcionando y queda claro qué es real y qué es simulado | Funcionan partes centrales, pero otras solo se describen o la frontera con lo simulado es confusa | La propuesta se presenta principalmente de forma descriptiva, sin funcionamiento demostrable |
| 7. Justificación y comunicación | Explica con claridad decisiones, supuestos y limitaciones, y responde con solidez a las preguntas del jurado | Explica las decisiones principales, pero deja supuestos o límites sin abordar | No justifica sus decisiones o la presentación es difícil de seguir |

## Consideraciones adicionales

1. El reconocimiento facial puede simularse durante la hackathon; no es necesario acceder al sistema real del club.
2. Cualquier supuesto sobre el funcionamiento de N Club (espacios, servicios, permisos o información disponible)
   debe declararse durante la presentación.
3. Las dudas sobre el alcance del reto pueden resolverse con el equipo organizador de Sabana Hack durante el evento.
