# Enunciado del reto (Sabana Hack 2026)

> Resumen del enunciado oficial entregado por los organizadores (criterios y pesos tal cual).


Contexto: club privado por membresia. Ya existe reconocimiento facial que solo distingue miembro / no miembro. Quieren que un robot asuma la orientacion rutinaria de la entrada.

Cinco tipos de visitante: Miembros VIP; Miembros regulares; Invitados; Personal del club; Trabajadores externos.
Problema: facial -> miembro (VIP o regular?) / no miembro (invitado, personal o externo?). Hay que confirmar la categoria especifica y orientar distinto a cada una, sin que la llegada sea lenta, confusa o incomoda. Errores tienen consecuencias (mandar a alguien a zona restringida; tratar como desconocido a alguien del club).

Condiciones obligatorias:
1. Orientacion liderada por un robot.
2. Dataset de reconocimiento facial propio (fotos del equipo o participantes con consentimiento) o uno existente descargado.
3. Confirmacion de la categoria especifica con informacion adicional, interaccion o ambas.
4. Un flujo de orientacion distinto para cada una de las 5 categorias.
- El reconocimiento facial puede simularse (representar su comportamiento para demostrar la integracion). Supuestos sobre espacios/servicios/permisos deben declararse.

Preguntas guia: que necesita cada visitante y que le molesta; que informacion existe para confirmar; cuanta interaccion es razonable; que pasa si la info no alcanza/es ambigua/se contradice; que decide el robot solo y cuando involucrar humano; privacidad; como saber si orienta bien.

Demostracion minima: (1) uso de la info facial (real o simulada) dentro del proceso del robot; (2) confirmacion de categoria para las 5; (3) flujo distinto para las 5. Explicar que es simulado y que es real.

Evaluacion (100 pts): Comprension del problema 10; Integracion con reconocimiento facial 15; Confirmacion de la categoria 20; Flujos diferenciados 20; Experiencia del visitante 10; Funcionamiento de la demostracion 15; Justificacion y comunicacion 10.
Niveles: Sobresaliente 80-100%, Aceptable 40-79%, Insuficiente 0-39%.
- Confirmacion sobresaliente: distingue las 5 de forma consistente y explica casos dudosos.
- Flujos sobresaliente: 5 flujos con diferencias claras y justificadas.
- Demostracion sobresaliente: la mayor parte funciona y queda claro que es real y que es simulado.
