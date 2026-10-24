"""Gestor de dialogo de la recepcion (HRI). Solo voz: el robot habla y entiende palabras clave.

entrada(...) y salida(...) son generadores que entregan Pasos (lo que el robot dice y hace). En un paso
'preguntar' el que lo ejecuta (voz real, consola o pruebas) devuelve con .send() la intencion entendida o None.
El mismo guion sirve para el club simulado y para el X2 real.

Reglas: 0 preguntas en el caso normal, 1 cuando falta un dato; frases cortas; trato formal (senor/senora +
apellido) con VIP y externos; cada pregunta se repite una vez y si no se entiende -> recepcion.
"""
from dataclasses import dataclass, field
from datetime import datetime

from intenciones import CATEGORIA, DESTINO, SI_NO

LUGAR = {'VIP': 'el Lounge VIP', 'REGULAR': 'el salón principal', 'INVITADO': 'la sala de anfitriones',
         'PERSONAL': 'el área de personal', 'EXTERNO': 'la zona técnica',
         'gimnasio': 'el gimnasio', 'spa': 'el spa', 'piscina': 'la piscina', 'tenis': 'la cancha de tenis'}
RUTA = {'REGULAR': 'por el pasillo, primera puerta a la derecha', 'PERSONAL': 'por el pasillo, segunda puerta a la derecha'}
# supuestos declarados: espacios fuera de la planta simulada
OTROS = {'gimnasio': 'El gimnasio está en el segundo piso; la escalera y el ascensor quedan junto al lobby.',
         'piscina': 'La piscina está al aire libre, detrás del club.',
         'tenis': 'La cancha de tenis está afuera, al lado izquierdo del club, por el sendero de la entrada.',
         'spa': 'El spa y la terraza bar están en el segundo piso; la escalera y el ascensor quedan junto al lobby.'}
ESTILO = {  # gesto (sim/walker.GESTURES), color LED, emoji de la cara del X2 (PlayEmoji)
    'VIP': ('reverencia', 'dorado', 200), 'REGULAR': ('saludo_mano', 'azul', 90),
    'INVITADO': ('bienvenida', 'verde', 90), 'PERSONAL': ('asentir', 'blanco', 1),
    'EXTERNO': ('senalar_ruta', 'naranja', 160), 'ESCALAR': ('ninguno', 'rojo_suave', 170)}


@dataclass
class Paso:
    tipo: str                     # decir | gesto | led | cara | accion | guiar | preguntar | escalar | fin
    texto: str = ''
    dato: dict = field(default_factory=dict)


def saludo(ahora):
    h = ahora.hour
    return 'Buenos días' if h < 12 else 'Buenas tardes' if h < 19 else 'Buenas noches'


def g(f, masc, fem):
    """Concordancia de genero segun el trato del registro."""
    return fem if f.get('trato') == 'señora' else masc


def a(lugar):
    """'a' + lugar con contraccion: a el -> al."""
    return 'al ' + lugar[3:] if lugar.startswith('el ') else 'a ' + lugar


def formal(f):
    return f'{f["trato"]} {f["apellido"]}' if f.get('trato') and f.get('apellido') else f['nombre']


def _estilo(cat):
    g, led, cara = ESTILO[cat]
    yield Paso('led', led)
    yield Paso('cara', dato={'emoji': cara})
    if g != 'ninguno':
        yield Paso('gesto', g)


def _preguntar(texto, opciones, reintento):
    """Pregunta con un reintento. -> intencion o None (no se entendio dos veces)."""
    for t in (texto, reintento):
        resp = yield Paso('preguntar', t, {'opciones': opciones})
        if resp:
            return resp
    return None


def _escalar(motivo):
    yield from _estilo('ESCALAR')
    yield Paso('decir', 'Un momento, por favor. Ya lo atiende recepción.')
    yield Paso('escalar', motivo)
    yield Paso('fin', dato={'categoria': None, 'escalado': True, 'motivo': motivo})


def _a_donde():
    """¿A donde va hoy? -> destino (piscina, tenis, gimnasio, spa o REGULAR = salon) o None si no se entendio."""
    resp = yield from _preguntar('¿A dónde se dirige hoy?', DESTINO,
                                 'Disculpe, ¿va al salón, al gimnasio, a la piscina o a la cancha de tenis?')
    return 'REGULAR' if resp == 'salon' else resp if resp in OTROS else None


def _guiar(f, dest, escolta):
    """Acompana (VIP) o indica el camino (socio regular) a dest: una sala o un lugar fuera de ellas (piscina, tenis,
    gimnasio, spa)."""
    if dest in OTROS:
        yield Paso('decir', f'{OTROS[dest]} {g(f, "Lo", "La")} acompaño.' if escolta else OTROS[dest])
    elif escolta:
        yield Paso('decir', f'{g(f, "Lo", "La")} acompaño {a(LUGAR[dest])}.')
    else:
        yield Paso('decir', f'{LUGAR[dest].capitalize()} queda {RUTA.get(dest, "por el pasillo")}.')
    yield Paso('guiar', dato={'destino': dest, 'escolta': escolta})


def entrada(reg, persona_id=None, miembro=False, pase=None, ahora=None, vision=None):
    """Recepcion de una persona. vision: lo que entrega el modelo de vision ({'categoria', 'persona_id',
    'confianza'}; camino principal). Sin vision: persona_id/pase + facial del club (miembro)."""
    ahora = ahora or datetime.now()
    cat, f, motivo = reg.desde_vision(vision) if vision else reg.confirmar(persona_id, miembro, pase)
    yield Paso('accion', 'confirmacion', {'categoria': cat, 'motivo': motivo})
    if cat == 'CONTRADICCION':
        yield from _escalar(motivo)
        return
    preguntas = 0
    if cat is None or (cat == 'INVITADO' and not f):    # sin registro: preguntar lo que falta
        if cat is None:                                 # ni la vision lo conoce: 1 pregunta para saber que buscar
            preguntas += 1
            resp = yield from _preguntar('Bienvenido a N Club. ¿Viene invitado, trabaja aquí o viene a prestar un servicio?',
                                         CATEGORIA, 'Disculpe, ¿viene invitado, trabaja aquí o viene a prestar un servicio?')
            if resp != 'invitado':                       # personal/externo sin turno u OT, o no se entendio
                yield from _escalar(f'no registrado; dice: {resp or "no se entendio"}')
                return
        else:
            yield Paso('decir', 'Bienvenido a N Club.')
        preguntas += 1
        quien = yield Paso('preguntar', '¿Quién lo invita?', {'opciones': 'nombre_socio'})
        sid, socio = reg.socio_por_nombre(quien or '')
        if not socio:
            yield from _escalar('invitado sin anfitrion identificable')
            return
        yield Paso('decir', f'Le aviso a {socio["nombre"]} para que confirme su llegada.')
        ok = yield Paso('accion', 'confirmar_anfitrion', {'anfitrion': sid})
        if not ok:
            yield from _escalar(f'el anfitrion {socio["nombre"]} no confirmo')
            return
        cat, f = 'INVITADO', {'nombre': '', 'anfitrion': sid, 'lugar': 'INVITADO', 'trato': ''}   # sin nombre: no esta en agenda
        yield Paso('accion', 'confirmacion', {'categoria': cat, 'motivo': f'{socio["nombre"]} confirmó en la app que lo espera',
                                              'ficha': f})

    yield from _estilo(cat)
    s = saludo(ahora)
    if cat == 'VIP':
        yield Paso('decir', f'{s}, {formal(f)}. {g(f, "Bienvenido", "Bienvenida")} de nuevo.')
        yield Paso('accion', 'aviso_concierge', {'socio': f['nombre'] + ' ' + f['apellido']})
        habitual = f.get('destino') or 'VIP'                    # le confirma su destino de siempre
        preguntas += 1
        resp = yield from _preguntar(f'¿{g(f, "Lo", "La")} acompaño {a(LUGAR[habitual])}, como siempre?', SI_NO,
                                     f'Disculpe, ¿va {a(LUGAR[habitual])}?')
        dest = habitual
        if resp == 'no':                                        # hoy va a otra parte
            preguntas += 1
            dest = yield from _a_donde()
            if dest is None:
                yield from _escalar('socio VIP pide algo que el robot no resuelve')
                return
        if dest == habitual:
            yield Paso('decir', f'Con gusto. {g(f, "Lo", "La")} acompaño {a(LUGAR[dest])}.')
            yield Paso('guiar', dato={'destino': dest, 'escolta': True})
        else:
            yield from _guiar(f, dest, escolta=True)
        yield Paso('decir', 'Que disfrute su visita.')
    elif cat == 'REGULAR':
        yield Paso('decir', f'Hola {f["nombre"]}, {g(f, "bienvenido", "bienvenida")}.')
        yield Paso('accion', 'registro_ingreso', {'socio': f['nombre']})
        dest = f.get('destino')
        if dest:                                                 # destino de siempre: se lo confirma
            preguntas += 1
            resp = yield from _preguntar(f'¿Va {a(LUGAR[dest])}, como siempre?', SI_NO, f'Disculpe, ¿va {a(LUGAR[dest])}?')
            if resp == 'no':
                dest = None
        if not dest:
            preguntas += 1
            dest = yield from _a_donde()
            if dest is None:
                yield from _escalar('socio pide algo que el robot no resuelve')
                return
        yield from _guiar(f, dest, escolta=False)
        yield Paso('decir', 'Que disfrute.')
    elif cat == 'INVITADO':
        anfitrion = reg.socios[f['anfitrion']]['nombre']
        nombre = f' {f["nombre"]}' if f.get('nombre') else ''
        yield Paso('decir', f'Hola{nombre}, {g(f, "bienvenido", "bienvenida")} a N Club.')
        yield Paso('accion', 'aviso_anfitrion', {'anfitrion': f['anfitrion']})
        yield Paso('decir', f'{anfitrion} {g(f, "lo", "la")} espera en {LUGAR[f["lugar"]]}. {g(f, "Lo", "La")} acompaño.')
        yield Paso('guiar', dato={'destino': f['lugar'], 'escolta': True})
        yield Paso('decir', f'{anfitrion} ya viene. Que disfrute.')
    elif cat == 'PERSONAL':
        yield Paso('decir', f'{s}, {f["nombre"]}. Entrada marcada a las {ahora:%H:%M}.')
        yield Paso('accion', 'marcar_entrada', {'persona': f['nombre'], 'hora': f'{ahora:%H:%M}'})
        yield Paso('guiar', dato={'destino': 'PERSONAL', 'escolta': False})
    elif cat == 'EXTERNO':
        yield Paso('decir', f'{s}, {formal(f)}, de {f["empresa"]}. Viene por la orden {f["ot"].split("-")[-1]}: {f["motivo"]}.')
        yield Paso('accion', 'aviso_supervisor', {'supervisor': f['supervisor'], 'ot': f['ot']})
        yield Paso('decir', f'{g(f, "Lo", "La")} espera {f["supervisor"]}, de {f["area"]}. Por seguridad {g(f, "lo", "la")} acompaño; use su chaleco.')
        yield Paso('guiar', dato={'destino': 'EXTERNO', 'escolta': True})
        yield Paso('decir', 'Gracias. Que tenga un buen día de trabajo.')
    yield Paso('fin', dato={'categoria': cat, 'preguntas': preguntas, 'escalado': False})


def salida(reg, persona_id, ahora=None):
    """Despedida al salir, segun la categoria. ponytail: version base; se afina despues (encuesta, etc.)."""
    ahora = ahora or datetime.now()
    cat, f, motivo = reg.confirmar(persona_id, persona_id in reg.socios)
    if cat in (None, 'CONTRADICCION'):
        yield Paso('decir', 'Gracias por su visita. Hasta pronto.')
        yield Paso('fin', dato={'categoria': None})
        return
    yield from _estilo(cat)
    if cat in ('VIP', 'REGULAR'):
        quien = formal(f) if cat == 'VIP' else f['nombre']
        yield Paso('decir', f'Hasta pronto, {quien}. Gracias por su visita; {g(f, "lo", "la")} esperamos de vuelta.')
    elif cat == 'INVITADO':
        yield Paso('decir', f'Hasta pronto, {f["nombre"]}. Gracias por visitarnos.')
        yield Paso('decir', 'Si le interesa ser socio, recepción con gusto le cuenta cómo.')
    elif cat == 'PERSONAL':
        yield Paso('decir', f'Nos vemos pronto, {f["nombre"]}. Salida marcada a las {ahora:%H:%M}.')
        yield Paso('accion', 'marcar_salida', {'persona': f['nombre'], 'hora': f'{ahora:%H:%M}'})
    elif cat == 'EXTERNO':
        yield Paso('decir', f'Gracias por su trabajo, {formal(f)}. Su salida quedó registrada.')
        yield Paso('accion', 'aviso_supervisor_salida', {'supervisor': f['supervisor'], 'ot': f['ot']})
    yield Paso('fin', dato={'categoria': cat})


def ejecutar(conversacion, responder, al_paso=lambda p: None):
    """Corre un dialogo. responder(paso) -> intencion/texto/bool para 'preguntar' y 'confirmar_anfitrion'.
    al_paso(paso) se llama con cada paso (hablar, mover el robot, actualizar el panel). -> lista de pasos."""
    pasos, resp = [], None
    while True:
        try:
            paso = conversacion.send(resp)
        except StopIteration:
            return pasos
        resp = None
        pasos.append(paso)
        al_paso(paso)
        if paso.tipo == 'preguntar' or (paso.tipo == 'accion' and paso.texto == 'confirmar_anfitrion'):
            resp = responder(paso)
