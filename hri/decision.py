"""Motor de decision: que hace el robot ante lo que pasa (lo normal y lo esporadico).

El que mueve el robot (club simulado o X2 real) le reporta una Situacion con lo que percibe; decidir() devuelve
UNA Decision: accion, frase, a quien avisar y el motivo (se muestra en el panel: el robot explica por que actua).
Reglas fijas y en orden de prioridad (la primera que aplica gana); el LLM nunca decide, solo conversa.

  1. bateria critica       -> se detiene, avisa a recepcion y mantenimiento (recepcion sigue con la persona)
  2. sin ruta en el mapa   -> avisar a mantenimiento y esperar; si no se despeja -> recepcion
  3. algo en el camino     -> detenerse ("Con permiso"), esperar a que pase; si sigue ahi -> rodear
  4. visitante atras       -> esperarlo ("Por aqui, por favor"); si no vuelve -> recepcion
  5. puerta que no abre    -> avisar a mantenimiento (y al anfitrion); esperar
  6. bateria baja, solo    -> avisa, va al area de mantenimiento del robot, se agacha y pide cambio de bateria
                              (si acompana a alguien, primero termina)
  7. nada                  -> seguir
Alarmas y emergencias (incendio, evacuacion): fuera de alcance.
"""
from dataclasses import dataclass, field

FRENO_M = 1.5            # m: algo en la ruta a menos de esto -> se detiene
SIGUE_M = 2.0            # m: ya detenido, solo sigue si lo que estorba queda mas lejos (histeresis)
ESPERA_PASO_S = 3.0      # s esperando a que se quite (una persona suele moverse) antes de rodear
ESPERA_BLOQUEO_S = 45.0  # s sin ruta antes de pasar el caso a recepcion
ESPERA_VISITANTE_S = 15.0
LEJOS_M = 2.8
PUERTA_S = 2.0           # s con la orden de abrir sin que la puerta se mueva
BATERIA_BAJA = 20.0      # %: al quedar libre va a cambiar la bateria
BATERIA_CRITICA = 8.0    # %: se detiene donde este


@dataclass
class Situacion:
    bloqueo_m: float = None          # distancia por la ruta a algo que la invade (None = libre)
    bloqueo_s: float = 0.0           # cuanto lleva detenido por eso
    detenido: bool = False           # ya freno por un bloqueo (para no arrancar y frenar en el borde)
    sin_ruta_s: float = None         # cuanto lleva sin ruta posible (None = hay ruta)
    visitante_m: float = None        # distancia al visitante que acompana (None = va solo)
    visitante_s: float = 0.0         # cuanto lleva esperandolo
    puerta_s: float = None           # cuanto lleva la puerta sin abrir tras la orden (None = no aplica)
    categoria: str = None
    bateria: float = None            # % (None = no se sabe / no aplica)


@dataclass
class Decision:
    accion: str                      # avisar_bloqueo | esperar | escalar | detenerse | rodear |
    motivo: str                      # esperar_visitante | puerta_falla | cambiar_bateria | bateria_critica | seguir
    frase: str = ''
    avisar: list = field(default_factory=list)


def decidir(s):
    if s.bateria is not None and s.bateria <= BATERIA_CRITICA:
        return Decision('bateria_critica', f'bateria al {s.bateria:.0f}%: no alcanza para seguir',
                        'Disculpe, me queda muy poca batería. Recepción ya viene a ayudarle.', ['recepcion', 'mantenimiento'])
    if s.sin_ruta_s is not None:
        if s.sin_ruta_s >= ESPERA_BLOQUEO_S:
            return Decision('escalar', f'sin ruta hace {s.sin_ruta_s:.0f} s',
                            'Por ahora no puedo llegar. Recepción lo atiende enseguida.', ['recepcion'])
        if s.sin_ruta_s == 0:
            return Decision('avisar_bloqueo', 'el paso esta bloqueado: no hay ruta en el mapa',
                            'El paso está bloqueado. Un momento, por favor: ya aviso para que lo despejen.',
                            ['mantenimiento'])
        return Decision('esperar', f'esperando que despejen el paso ({s.sin_ruta_s:.0f} s)')
    if s.bloqueo_m is not None and s.bloqueo_m < (SIGUE_M if s.detenido else FRENO_M):
        if s.bloqueo_s < ESPERA_PASO_S:
            return Decision('detenerse', f'algo en el camino a {s.bloqueo_m:.1f} m', 'Con permiso.')
        return Decision('rodear', f'sigue en el camino tras {s.bloqueo_s:.0f} s: busca otra ruta',
                        'Un momento, tomamos otro camino.' if s.visitante_m is not None else '')
    if s.visitante_m is not None and s.visitante_m > LEJOS_M:
        if s.visitante_s >= ESPERA_VISITANTE_S:
            return Decision('escalar', f'el visitante no vuelve hace {s.visitante_s:.0f} s',
                            'Voy a pedir apoyo a recepción para que lo acompañen.', ['recepcion'])
        return Decision('esperar_visitante', f'visitante a {s.visitante_m:.1f} m', 'Por aquí, por favor.')
    if s.puerta_s is not None and s.puerta_s >= PUERTA_S:
        quien = ['mantenimiento'] + (['anfitrion'] if s.categoria == 'INVITADO' else [])
        return Decision('puerta_falla', f'la puerta no abre hace {s.puerta_s:.0f} s',
                        'La puerta no abre. Ya aviso a mantenimiento; un momento, por favor.', quien)
    if s.bateria is not None and s.bateria <= BATERIA_BAJA and s.visitante_m is None:
        return Decision('cambiar_bateria', f'bateria al {s.bateria:.0f}%: va al area de mantenimiento y pide cambio',
                        'Voy a cambiar mi batería. Ya le avisé a recepción.', ['recepcion', 'mantenimiento'])
    return Decision('seguir', 'camino libre')


if __name__ == '__main__':                 # prueba: python hri/decision.py
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    d = decidir
    assert d(Situacion()).accion == 'seguir'
    assert d(Situacion(bloqueo_m=1.0)).frase == 'Con permiso.'
    assert d(Situacion(bloqueo_m=1.0, bloqueo_s=3.5)).accion == 'rodear'
    assert d(Situacion(bloqueo_m=1.0, bloqueo_s=3.5)).frase == ''                         # solo: no habla
    assert d(Situacion(bloqueo_m=1.0, bloqueo_s=3.5, visitante_m=1.3)).frase                # acompanado: avisa
    assert d(Situacion(bloqueo_m=2.5)).accion == 'seguir'                                 # lejos: aun no frena
    assert d(Situacion(bloqueo_m=1.6)).accion == 'seguir'
    assert d(Situacion(bloqueo_m=1.6, detenido=True)).accion == 'detenerse'               # histeresis
    assert d(Situacion(sin_ruta_s=0)).avisar == ['mantenimiento']
    assert d(Situacion(sin_ruta_s=10)).accion == 'esperar'
    assert d(Situacion(sin_ruta_s=50)).accion == 'escalar'
    assert d(Situacion(sin_ruta_s=0, bloqueo_m=0.5)).accion == 'avisar_bloqueo'           # sin ruta gana a frenar
    assert d(Situacion(visitante_m=3.0)).frase == 'Por aquí, por favor.'
    assert d(Situacion(visitante_m=3.0, visitante_s=20)).accion == 'escalar'
    assert d(Situacion(puerta_s=1.0)).accion == 'seguir'
    assert d(Situacion(puerta_s=2.5, categoria='INVITADO')).avisar == ['mantenimiento', 'anfitrion']
    assert d(Situacion(bateria=50)).accion == 'seguir'
    assert d(Situacion(bateria=18)).accion == 'cambiar_bateria'
    assert d(Situacion(bateria=18, visitante_m=1.2)).accion == 'seguir'                   # acompanando: termina
    assert d(Situacion(bateria=5, visitante_m=1.2, bloqueo_m=0.5)).accion == 'bateria_critica'
    print('decision OK')
