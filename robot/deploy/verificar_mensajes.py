#!/usr/bin/env python3
"""Comprueba que los mensajes del SDK AimDK compilado tienen TODOS los campos que usa Cerberus.

Nuestro codigo del robot (`x2/cerberus_x2.py`, `deploy/modo_agente.py`) se escribio contra la documentacion
oficial de AimDK. La documentacion y el firmware pueden no coincidir: el SDK tiene que ser de la misma version
que el firmware, y los campos cambian entre versiones. Este script compara, campo por campo, lo que usamos contra
los mensajes que de verdad quedaron compilados en el robot. Tarda 2 segundos y se corre DESPUES de `colcon build`:

    source /opt/ros/humble/setup.bash && source ~/aimdk/install/local_setup.bash
    python3 deploy/verificar_mensajes.py            # solo las definiciones (no necesita el robot encendido)
    python3 deploy/verificar_mensajes.py --vivo     # ademas: que los topics y servicios esten publicando

Si algo sale FALTA, el campo cambio de nombre en esta version del SDK: hay que ajustar `x2/cerberus_x2.py` antes
de la demo. Mejor descubrirlo aqui que con el jurado delante.
"""
import argparse
import importlib
import sys

# (modulo, tipo, [rutas de campos]) — cada ruta es lo que el codigo de Cerberus escribe o lee.
# 'Request'/'Response' delante significa la mitad correspondiente del servicio.
USO = [
    ('aimdk_msgs.srv', 'PlayTts', ['Request.tts_req.text', 'Request.tts_req.domain',
                                   'Request.tts_req.is_interrupted', 'Request.tts_req.priority_weight',
                                   'Request.tts_req.priority_level.value']),
    ('aimdk_msgs.msg', 'TtsPriorityLevel', ['INTERACTION_L6']),
    ('aimdk_msgs.srv', 'PlayEmoji', ['Request.emotion_id', 'Request.mode', 'Request.priority',
                                     'Response.success']),
    ('aimdk_msgs.srv', 'SetPmuLed', ['Request.led_strip_mode', 'Request.r', 'Request.g', 'Request.b',
                                     'Request.priority', 'Request.trace_id']),
    ('aimdk_msgs.srv', 'RequestAudioFocus', ['Request.focus_requester.pkg_name',
                                             'Request.focus_requester.priority',
                                             'Response.focus_response.focus_gain']),
    ('aimdk_msgs.srv', 'AbandonAudioFocus', ['Request.focus_requester.pkg_name',
                                             'Request.focus_requester.priority']),
    ('aimdk_msgs.srv', 'SetVolume', ['Request.audio_volume']),
    ('aimdk_msgs.msg', 'AudioPlayback', ['pkg_name', 'token_id', 'info.channels', 'info.sample_rate',
                                         'data.data']),
    ('aimdk_msgs.msg', 'FocusResponse', ['pkg_name', 'focus_gain']),
    ('aimdk_msgs.msg', 'ProcessedAudioOutput', ['audio_vad_state.value', 'audio_data', 'stream_id']),
    ('aimdk_msgs.msg', 'AudioCapture', ['mic_channels', 'info.channels', 'data.data']),
    # modo only_voice: properties es una secuencia; se entra por el tipo de sus elementos (key.value = 2, value = 'only_voice')
    ('aimdk_msgs.srv', 'SetAgentPropertiesRequest', ['Request.contents.properties',
                                                     'Request.contents.properties.key.value',
                                                     'Request.contents.properties.value']),
    ('sensor_msgs.msg', 'CompressedImage', ['data', 'format']),
]

# Lo que el robot tiene que estar publicando y sirviendo (--vivo).
TOPICS = ['/aima/hal/sensor/rgbd_head_front/rgb_image/compressed', '/aima/hal/audio/playback',
          '/aima/hal/audio/focus_response', '/aima/hal/audio/capture', '/agent/process_audio_output']
SERVICIOS = ['/aimdk_5Fmsgs/srv/PlayTts', '/aimdk_5Fmsgs/srv/PlayEmoji', '/aimdk_5Fmsgs/srv/SetPmuLed',
             '/aimdk_5Fmsgs/srv/RequestAudioFocus', '/aimdk_5Fmsgs/srv/AbandonAudioFocus',
             '/aimdk_5Fmsgs/srv/SetVolume', '/aimdk_5Fmsgs/srv/SetAgentPropertiesRequest']

VERDE, ROJO, GRIS, FIN = '\033[32m', '\033[31m', '\033[90m', '\033[0m'


def instancia(tipo, mitad):
    """Mensaje suelto, o la Request/Response de un servicio."""
    return getattr(tipo, mitad)() if mitad else tipo()


def elemento_de_secuencia(msg, campo):
    """Para 'sequence<pkg/Tipo>': instancia del tipo de los elementos, leida del propio mensaje."""
    t = msg.get_fields_and_field_types().get(campo, '')
    if '<' not in t:
        return None
    partes = t[t.index('<') + 1:t.rindex('>')].split('/')
    if len(partes) < 2:
        return None
    return getattr(importlib.import_module(f'{partes[0]}.msg'), partes[-1])()


def revisa_ruta(obj, ruta):
    """Recorre 'a.b.c' sobre un mensaje. Devuelve (ok, detalle)."""
    actual = obj
    for i, parte in enumerate(ruta):
        if not hasattr(actual, parte):
            disponibles = getattr(actual, 'get_fields_and_field_types', lambda: {})()
            return False, f'falta .{parte} (hay: {", ".join(disponibles) or "nada"})'
        siguiente = getattr(actual, parte)
        if i < len(ruta) - 1 and isinstance(siguiente, (list, tuple)):
            # campo de secuencia a medio camino: seguimos por el tipo de sus elementos
            siguiente = elemento_de_secuencia(actual, parte)
            if siguiente is None:
                return False, f'.{parte} es una secuencia de tipo desconocido'
        actual = siguiente
    return True, type(actual).__name__


def verifica_definiciones():
    fallos = []
    for modulo, nombre, rutas in USO:
        try:
            tipo = getattr(importlib.import_module(modulo), nombre)
        except (ImportError, AttributeError) as e:
            print(f'  {ROJO}FALTA{FIN} {modulo}.{nombre}  ({e})')
            fallos.append(f'{modulo}.{nombre}')
            continue
        print(f'  {VERDE}OK{FIN}    {modulo}.{nombre}')
        for ruta in rutas:
            partes = ruta.split('.')
            mitad = partes.pop(0) if partes[0] in ('Request', 'Response') else None
            try:
                obj = instancia(tipo, mitad)
            except Exception as e:                      # servicio sin esa mitad: raro, pero lo decimos
                print(f'          {ROJO}FALTA{FIN} {ruta} (no se pudo crear {mitad}: {e})')
                fallos.append(f'{nombre}.{ruta}')
                continue
            if not partes:                             # constante del mensaje (p. ej. INTERACTION_L6)
                ok, detalle = hasattr(tipo, ruta), 'constante'
                if ok:
                    detalle = f'constante = {getattr(tipo, ruta)}'
            else:
                ok, detalle = revisa_ruta(obj, partes)
            marca = f'{VERDE}OK{FIN}   ' if ok else f'{ROJO}FALTA{FIN}'
            print(f'          {marca} {ruta}  {GRIS}{detalle}{FIN}')
            if not ok:
                fallos.append(f'{nombre}.{ruta}')
    return fallos


def verifica_vivo():
    """Topics y servicios realmente presentes en el robot (necesita el robot encendido y la red puesta)."""
    import rclpy
    rclpy.init()
    node = rclpy.create_node('cerberus_verificador')
    for _ in range(20):                                # el grafo de ROS tarda un momento en poblarse
        rclpy.spin_once(node, timeout_sec=0.1)
    topics = dict(node.get_topic_names_and_types())
    servicios = dict(node.get_service_names_and_types())
    fallos = []
    for t in TOPICS:
        ok = t in topics
        print(f'  {VERDE + "OK   " + FIN if ok else ROJO + "FALTA" + FIN} topic {t}'
              f'  {GRIS}{",".join(topics.get(t, []))}{FIN}')
        if not ok:
            fallos.append(f'topic {t}')
    for s in SERVICIOS:
        ok = s in servicios
        print(f'  {VERDE + "OK   " + FIN if ok else ROJO + "FALTA" + FIN} srv   {s}')
        if not ok:
            fallos.append(f'servicio {s}')
    node.destroy_node()
    rclpy.shutdown()
    return fallos


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--vivo', action='store_true', help='comprobar tambien topics y servicios en el robot')
    a = ap.parse_args()
    try:
        importlib.import_module('aimdk_msgs')
    except ImportError as e:
        sys.exit(f'{ROJO}No se puede importar aimdk_msgs{FIN} ({e}).\n'
                 'Falta compilar el SDK o sourcearlo:\n'
                 '  source /opt/ros/humble/setup.bash\n'
                 '  cd ~/aimdk && colcon build --packages-up-to aimdk_msgs\n'
                 '  source ~/aimdk/install/local_setup.bash\n'
                 'Desde el laptop:  ./deploy/compilar_sdk.sh')

    print('\nCampos del SDK que usa Cerberus\n')
    fallos = verifica_definiciones()
    if a.vivo:
        print('\nTopics y servicios en el robot\n')
        fallos += verifica_vivo()
    print()
    if fallos:
        print(f'{ROJO}{len(fallos)} problema(s):{FIN} ' + ', '.join(fallos[:12]))
        print('Un campo que falta = cambio de nombre en esta version del SDK: ajusta x2/cerberus_x2.py.')
        sys.exit(1)
    print(f'{VERDE}Todo coincide con el SDK compilado en este equipo.{FIN}')


if __name__ == '__main__':
    main()
