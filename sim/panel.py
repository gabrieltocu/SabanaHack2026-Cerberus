"""Panel de decision: lo que el robot sabe y decide, para que se vea (ventana aparte junto al club).

1. Vision: lo que entrega el modelo (categoria, persona, confianza).
2. Registros: donde la busco y que encontro.
3. Resultado: la categoria confirmada y por que.
4. Flujo: los pasos que va a seguir, con el actual resaltado.
5. Decisiones: imprevistos y lo que decidio, con el motivo.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ANCHO, ALTO = 620, 800
FONDO, TEXTO, TENUE, LINEA = (24, 26, 32), (235, 235, 240), (140, 145, 155), (60, 64, 74)
VERDE, ROJO, AMBAR, AZUL = (70, 190, 110), (225, 85, 85), (235, 170, 60), (90, 160, 240)
COLOR_CAT = {'VIP': (240, 200, 40), 'REGULAR': (60, 120, 250), 'INVITADO': (60, 200, 90), 'PERSONAL': (235, 235, 235),
             'EXTERNO': (250, 120, 20), 'CONTRADICCION': ROJO, None: TENUE}
COLOR_DEC = {'seguir': VERDE, 'detenerse': AMBAR, 'rodear': AMBAR, 'esperar_visitante': AMBAR, 'esperar': AMBAR,
             'avisar_bloqueo': ROJO, 'puerta_falla': ROJO, 'escalar': ROJO, 'cambiar_bateria': AMBAR, 'bateria_critica': ROJO, 'INCIDENTE': TENUE}


def _fuente(tam, negrita=False):
    nombres = (['segoeuib.ttf', 'DejaVuSans-Bold.ttf'] if negrita else ['segoeui.ttf', 'DejaVuSans.ttf'])
    dirs = ['C:/Windows/Fonts', '/usr/share/fonts/truetype/dejavu']
    for d in dirs:
        for n in nombres:
            if Path(d, n).exists():
                return ImageFont.truetype(str(Path(d, n)), tam)
    return ImageFont.load_default(tam)


F = {'t': _fuente(22, True), 'h': _fuente(15, True), 'n': _fuente(15), 'g': _fuente(26, True), 's': _fuente(13)}


def _envolver(d, texto, fuente, ancho):
    lineas, actual = [], ''
    for palabra in texto.split():
        prueba = f'{actual} {palabra}'.strip()
        if d.textlength(prueba, font=fuente) <= ancho:
            actual = prueba
        else:
            lineas.append(actual)
            actual = palabra
    return lineas + ([actual] if actual else [])


def etiqueta(paso):
    """Paso del dialogo -> linea del flujo (o None si no se muestra)."""
    t, txt, dato = paso.tipo, paso.texto, paso.dato
    if t == 'decir':
        return f'Dice: "{txt}"'
    if t == 'preguntar':
        return f'Pregunta: "{txt}"'
    if t == 'gesto' and txt != 'ninguno':
        return f'Gesto: {txt.replace("_", " ")}'
    if t == 'accion' and txt != 'confirmacion':
        return f'Aviso / registro: {txt.replace("_", " ")}'
    if t == 'guiar':
        from dialogo import LUGAR, a
        return ('Acompaña ' if dato.get('escolta') else 'Indica la ruta ') + a(LUGAR[dato['destino']])
    if t == 'escalar':
        return f'Pasa a recepción: {txt}'
    return None


def imagen(estado):
    """estado: dict con vision, rastro, categoria, motivo, flujo [(texto, hecho)], actual, decisiones
    [(t, accion, motivo)]. -> imagen BGR para cv2.imshow."""
    im = Image.new('RGB', (ANCHO, ALTO), FONDO)
    d = ImageDraw.Draw(im)
    x, y = 20, 16
    d.text((x, y), 'Panel de decisión del robot', font=F['t'], fill=TEXTO)
    y += 40

    def seccion(n, titulo):
        nonlocal y
        d.line((x, y, ANCHO - x, y), fill=LINEA)
        d.text((x, y + 8), f'{n}. {titulo}', font=F['h'], fill=AZUL)
        y += 34

    v = estado.get('vision')
    seccion(1, 'Lo que dice la visión')
    if v:
        d.text((x, y), str(v['categoria']), font=F['g'], fill=TEXTO)
        d.text((x + 220, y + 8), f'{v.get("persona_id") or "sin identidad"}  ·  ' + (f'{v["metodo"]}  ·  ' if v.get('metodo') else '')
               + f'confianza {v.get("confianza", 0):.2f}',
               font=F['n'], fill=TENUE)
    else:
        d.text((x, y), 'Esperando a la próxima persona', font=F['n'], fill=TENUE)
    y += 44

    seccion(2, 'Dónde la buscó en los registros del club')
    for nombre, est, detalle in estado.get('rastro') or []:
        color = {'si': VERDE, 'no': LINEA, 'ojo': AMBAR}[est]
        d.ellipse((x, y + 3, x + 14, y + 17), fill=color)
        d.text((x + 24, y), nombre, font=F['n'], fill=TEXTO if est != 'no' else TENUE)
        d.text((x + 230, y), detalle, font=F['n'], fill=TEXTO if est != 'no' else TENUE)
        y += 24
    y += 8

    seccion(3, 'Resultado')
    cat = estado.get('categoria')
    if v or cat:
        nombre = {None: 'SIN REGISTRO', 'CONTRADICCION': 'CONTRADICCIÓN: RECEPCIÓN'}.get(cat, cat)
        ancho = d.textlength(nombre, font=F['h']) + 24
        d.rounded_rectangle((x, y, x + ancho, y + 28), 8, fill=COLOR_CAT.get(cat, TENUE))
        d.text((x + 12, y + 5), nombre, font=F['h'], fill=(20, 20, 20))
        y += 36
        for linea in _envolver(d, estado.get('motivo', ''), F['s'], ANCHO - 2 * x)[:3]:
            d.text((x, y), linea, font=F['s'], fill=TENUE)
            y += 18
    y += 8

    seccion(4, 'Flujo que sigue')
    flujo, actual = estado.get('flujo') or [], estado.get('actual', -1)
    for i, texto in enumerate(flujo[:11]):
        hecho, es_actual = i < actual, i == actual
        if es_actual:
            d.rounded_rectangle((x - 6, y - 3, ANCHO - x + 6, y + 21), 6, fill=(45, 60, 90))
        if hecho:                                           # figuras: no todas las fuentes traen los simbolos
            d.line((x + 1, y + 10, x + 5, y + 15, x + 13, y + 4), fill=VERDE, width=3)
        elif es_actual:
            d.polygon((x + 2, y + 3, x + 2, y + 17, x + 13, y + 10), fill=AZUL)
        else:
            d.ellipse((x + 5, y + 8, x + 9, y + 12), fill=TENUE)
        linea = _envolver(d, texto, F['n'], ANCHO - 2 * x - 24)[0]
        d.text((x + 22, y), linea, font=F['n'], fill=TEXTO if es_actual else TENUE if hecho else TEXTO)
        y += 26
    y += 8

    seccion(5, 'Decisiones ante imprevistos')
    for t, accion, motivo in list(estado.get('decisiones') or [])[-7:]:
        color = COLOR_DEC.get(accion, TEXTO)
        d.text((x, y), f'{t:5.0f}s', font=F['s'], fill=TENUE)
        d.text((x + 56, y), 'Imprevisto' if accion == 'INCIDENTE' else accion.replace('_', ' '), font=F['h'], fill=color)
        d.text((x + 210, y + 1), _envolver(d, motivo, F['s'], ANCHO - x - 210)[0], font=F['s'], fill=TEXTO)
        y += 24
        if y > ALTO - 24:
            break
    return np.array(im)[:, :, ::-1].copy()


def cuadro_video(rgb, caso, subtitulo, esquina='', inserto=None):
    """Cuadro del video (RGB del render) con el titulo del caso arriba, subtitulos abajo y, si se da, la ventana de
    camaras del robot (BGR) en la esquina. -> BGR para cv2.VideoWriter."""
    im = Image.fromarray(rgb).convert('RGBA')
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    W, H = im.size
    if caso:
        d.rectangle((0, 0, W, 56), fill=(15, 17, 22, 200))
        d.text((24, 12), caso, font=FV['caso'], fill=(255, 255, 255, 255))
        d.text((W - 24 - d.textlength(esquina, font=FV['s']), 18), esquina, font=FV['s'], fill=(200, 205, 215, 255))
    if subtitulo:
        lineas = _envolver(d, subtitulo, FV['sub'], W - 160)[:2]
        y0 = H - 24 - 40 * len(lineas)
        d.rectangle((60, y0 - 12, W - 60, H - 16), fill=(0, 0, 0, 170))
        for i, linea in enumerate(lineas):
            d.text((W / 2 - d.textlength(linea, font=FV['sub']) / 2, y0 + 40 * i), linea, font=FV['sub'],
                   fill=(255, 235, 150, 255) if subtitulo.startswith('Visitante') else (255, 255, 255, 255))
    im = Image.alpha_composite(im, capa).convert('RGB')
    if inserto is not None:
        ins = Image.fromarray(inserto[:, :, ::-1]).resize((480, 201))
        im.paste(ins, (W - 480 - 16, 70))
    return np.array(im)[:, :, ::-1].copy()


FV = {'caso': _fuente(26, True), 'sub': _fuente(30, True), 's': _fuente(18)}


# bitacora: cada linea del log del robot con su tipo y color
TIPOS = [('API ', 'APP', (180, 130, 250)), ('DECISION', 'DECIDE', AMBAR), ('INCIDENTE', 'MUNDO', ROJO),
         ('ROBOT:', 'DICE', AZUL), ('VISITANTE:', 'OYE', VERDE), ('ESCALADO', 'ESCALA', ROJO),
         (': vision ', 'VE', (240, 200, 40)), ('(vision:', 'CONFIRMA', (240, 200, 40)), ('accion ', 'HACE', TEXTO)]


def _tipo(texto):
    return next(((et, c) for clave, et, c in TIPOS if clave in texto[:40]), ('ROBOT', TENUE))


def bitacora(log, ancho=760, alto=800):
    """log: lineas 't s  texto' del robot -> imagen BGR con las ultimas, la mas nueva abajo."""
    im = Image.new('RGB', (ancho, alto), FONDO)
    d = ImageDraw.Draw(im)
    d.text((20, 16), 'Bitácora del robot', font=F['t'], fill=TEXTO)
    d.text((20, 46), 'VE visión · CONFIRMA registro · OYE persona · DICE robot · DECIDE motor · HACE · APP evento a la API · MUNDO imprevisto',
           font=F['s'], fill=TENUE)
    filas = []
    for linea in log[-40:]:
        t, _, texto = linea.strip().partition('s  ')
        et, color = _tipo(texto)
        for prefijo in ('ROBOT: ', 'VISITANTE: ', 'DECISION ', 'accion '):
            texto = texto.removeprefix(prefijo)
        for i, parte in enumerate(_envolver(d, texto, F['s'], ancho - 160)):
            filas.append((t if i == 0 else '', et if i == 0 else '', color, parte))
    y = alto - 22
    for t, et, color, parte in reversed(filas):
        if y < 76:
            break
        d.text((20, y), t, font=F['s'], fill=TENUE)
        d.text((68, y), et, font=F['s'], fill=color)
        d.text((144, y), parte, font=F['s'], fill=TEXTO if et != 'ROBOT' else TENUE)
        y -= 19
    return np.array(im)[:, :, ::-1].copy()


if __name__ == '__main__':                     # vista de prueba: python sim/panel.py [salida.png]
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'hri'))
    from registros import Registros
    reg = Registros(hoy='2026-10-24')
    e = {'vision': {'categoria': 'VISITANTE', 'persona_id': 'luis', 'confianza': 0.94}, 'rastro': reg.rastro('luis'),
         'categoria': 'EXTERNO', 'motivo': reg.desde_vision({'categoria': 'VISITANTE', 'persona_id': 'luis'})[2],
         'flujo': ['Gesto: senalar ruta', 'Dice: "Buenos días, señor Peña, de Climatec."', 'Aviso / registro: aviso supervisor',
                   'Acompaña a la zona técnica', 'Dice: "Gracias. Que tenga un buen día de trabajo."'], 'actual': 3,
         'decisiones': [(423, 'INCIDENTE', 'una valla de mantenimiento cierra el pasillo'),
                        (431, 'detenerse', 'algo en el camino a 1.4 m'), (434, 'rodear', 'busca otra ruta'),
                        (436, 'avisar_bloqueo', 'el paso esta bloqueado: aviso a mantenimiento')]}
    import cv2
    img = imagen(e)
    if len(sys.argv) > 1:
        cv2.imwrite(sys.argv[1], img)
    else:
        cv2.imshow('Panel de decision', img)
        cv2.waitKey(0)
    print('panel OK', img.shape)
