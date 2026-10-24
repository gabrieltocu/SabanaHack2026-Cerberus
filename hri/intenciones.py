"""Entender respuestas habladas por palabras clave (tolerante a tildes y a errores del reconocimiento de voz)."""
import difflib
import re
import unicodedata


def normalizar(texto):
    t = unicodedata.normalize('NFD', (texto or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]+', ' ', t).strip()


def _hits(texto, frases):
    palabras = texto.split()
    n = 0
    for f in frases:
        f = normalizar(f)
        if ' ' in f:
            n += f in texto
        elif f in palabras or any(difflib.SequenceMatcher(None, f, p).ratio() >= 0.85 for p in palabras if len(p) > 3):
            n += 1
    return n


def entender(texto, opciones):
    """opciones: {intencion: [frases]}. -> intencion con mas coincidencias, o None si no hay o hay empate."""
    t = normalizar(texto)
    if not t:
        return None
    scores = sorted(((_hits(t, frases), k) for k, frases in opciones.items()), reverse=True)
    if scores[0][0] == 0 or (len(scores) > 1 and scores[0][0] == scores[1][0]):
        return None
    return scores[0][1]


SI_NO = {'si': ['si', 'claro', 'por favor', 'dale', 'bueno', 'listo', 'perfecto', 'de acuerdo', 'como siempre'],
         'no': ['no', 'no gracias', 'no hace falta', 'no es necesario', 'conozco el camino', 'yo voy solo', 'yo voy sola',
                'hoy no', 'otra parte', 'otro lado']}

CATEGORIA = {
    'invitado': ['invitado', 'invitada', 'me invito', 'me invitaron', 'visita', 'vengo a ver a', 'socio me invito'],
    'personal': ['trabajo aqui', 'trabajo en el club', 'empleado', 'empleada', 'personal', 'mi turno', 'turno'],
    'externo': ['servicio', 'prestar un servicio', 'proveedor', 'contratista', 'mantenimiento', 'reparar', 'arreglar',
                'orden de trabajo', 'empresa', 'tecnico', 'domicilio', 'entrega'],
}

DESTINO = {
    'salon': ['salon', 'salon principal', 'restaurante', 'comer', 'almorzar', 'cenar', 'reunion'],
    'gimnasio': ['gimnasio', 'gym', 'entrenar', 'hacer ejercicio'],
    'piscina': ['piscina', 'nadar', 'natacion'],
    'tenis': ['tenis', 'cancha', 'raqueta', 'jugar tenis'],
    'spa': ['spa', 'sauna', 'jacuzzi', 'masaje', 'terraza'],
    'otro': ['otro', 'otra cosa', 'no se', 'informacion', 'recepcion'],
}
