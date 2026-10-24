"""Edecan: lo que el robot dice MIENTRAS acompana caminando (VIP, invitado, externo).

- charla(cat, f, reg): frases cortas para el camino, distintas por categoria (el externo recibe normas de seguridad).
- narrar(izq, der): lo que va quedando a cada lado ("A su izquierda, el Lounge VIP").
- responder(texto, restante_m): preguntas frecuentes del visitante en el camino; lo que no sabe -> recepcion.
- POR_AQUI: si el visitante se queda atras, el robot se detiene, lo mira y lo llama.
Lo que decide CUANDO decir cada cosa (al pasar una puerta, al quedar el visitante atras) es del que mueve el
robot: el club simulado (sim/run_club.py) o el X2 real.
"""
from dialogo import LUGAR, OTROS, formal, g
from intenciones import entender

POR_AQUI = 'Por aquí, por favor.'
NO_SE = 'Eso se lo resuelven con gusto en recepción; por ahora seguimos hacia su destino.'

# preguntas frecuentes en el camino. Datos del club SIMULADOS (horario, wifi, parqueadero).
PREGUNTAS = {
    'bano': ['bano', 'banos', 'sanitario', 'tocador', 'lavarme las manos'],
    'horario': ['horario', 'a que hora', 'cierra', 'abre', 'hasta que hora'],
    'wifi': ['wifi', 'internet', 'clave', 'contrasena', 'red'],
    'parqueadero': ['parqueadero', 'parqueo', 'carro', 'estacionar', 'valet'],
    'falta': ['falta', 'lejos', 'cuanto queda', 'ya llegamos', 'donde queda'],
    'gimnasio': ['gimnasio', 'gym'],
    'piscina': ['piscina'],
    'tenis': ['tenis', 'cancha'],
    'spa': ['spa', 'sauna', 'jacuzzi', 'terraza'],
}
RESPUESTAS = {
    'bano': 'Los baños están en el lobby, junto a recepción.',
    'horario': 'El club abre de seis de la mañana a diez de la noche.',
    'wifi': 'La red se llama N Club Invitados; la clave se la da recepción.',
    'parqueadero': 'Hay valet en la entrada principal; al salir se lo piden en recepción.',
    **OTROS,
}


def charla(cat, f, reg):
    """Frases para el camino segun la categoria. f: ficha del registro (puede faltar, p. ej. invitado no agendado)."""
    f = f or {}
    if cat == 'VIP':
        return ['El concierge ya sabe que usted llegó; cualquier cosa que necesite, me dice.',
                f'Es un gusto tenerl{g(f, "o", "a")} de nuevo por aquí.']
    if cat == 'INVITADO':
        anfitrion = reg.socios.get(f.get('anfitrion'), {}).get('nombre', 'Su anfitrión')
        return [f'{anfitrion} ya sabe que usted llegó.',
                'Si durante su visita necesita algo, el personal del club con gusto le ayuda.']
    if cat == 'EXTERNO':
        sup = f.get('supervisor', 'el supervisor')
        return ['Por seguridad, mantenga el chaleco puesto durante todo el trabajo.',
                'En la zona técnica solo puede ingresar personal autorizado.',
                f'Al terminar, avísele a {sup} y pase por recepción para registrar su salida.']
    return []


def narrar(izquierda=None, derecha=None):
    """izquierda/derecha: categorias de las salas que van quedando a cada lado. -> frase o None."""
    partes = [f'a su {lado}, {LUGAR[c]}' for lado, c in (('izquierda', izquierda), ('derecha', derecha)) if c]
    if not partes:
        return None
    frase = '; '.join(partes)
    return frase[0].upper() + frase[1:] + '.'


def llegada(cat, f=None):
    cortesia = f', {formal(f)}' if cat in ('VIP', 'EXTERNO') and f and f.get('apellido') else ''
    return f'Llegamos{cortesia}. Es aquí, {LUGAR[cat]}.'


def responder(texto, restante_m=None):
    """Pregunta del visitante caminando -> respuesta corta. No adivina: si no entiende, lo remite a recepcion."""
    k = entender(texto, PREGUNTAS)
    if k == 'falta':
        if restante_m is None or restante_m < 3:
            return 'Ya casi llegamos.'
        return f'Ya casi: faltan unos {round(restante_m)} metros.'
    return RESPUESTAS.get(k, NO_SE)


if __name__ == '__main__':                      # prueba rapida: python hri/edecan.py
    import sys
    from registros import Registros
    sys.stdout.reconfigure(encoding='utf-8')
    reg = Registros(hoy='2026-10-24')
    assert responder('¿Dónde están los baños?') == RESPUESTAS['bano']
    assert responder('cual es la clave del wi fi') == RESPUESTAS['wifi']
    assert responder('¿cuánto falta?', 9.6) == 'Ya casi: faltan unos 10 metros.'
    assert responder('¿me presta una sombrilla?') == NO_SE
    assert responder('a que hora cierran') == RESPUESTAS['horario']
    assert narrar('VIP', 'REGULAR') == 'A su izquierda, el Lounge VIP; a su derecha, el salón principal.'
    assert narrar() is None
    assert 'Andrés' in charla('INVITADO', reg.agenda['laura'], reg)[0]
    assert 'Jorge' in charla('EXTERNO', reg.orden_de('luis')[1], reg)[-1]
    assert 'tenerla' in charla('VIP', reg.socios['sofia'], reg)[1]
    assert llegada('VIP', reg.socios['sofia']) == 'Llegamos, señora Restrepo. Es aquí, el Lounge VIP.'
    print('edecan OK')
