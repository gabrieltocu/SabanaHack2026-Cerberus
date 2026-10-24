#!/usr/bin/env python3
"""Cambia el modo de interaccion del X2 Ultra: only_voice (lo que oye llega a Cerberus) o normal (voz de fabrica).

Corre EN EL ROBOT (unidad de desarrollo, 10.0.1.41), donde estan ROS 2 Humble y aimdk_msgs:
    python3 deploy/modo_agente.py only_voice     # antes de la demo: apaga el modelo de lenguaje del robot
    python3 deploy/modo_agente.py normal         # al terminar: le devuelve su conversacion de fabrica
    python3 deploy/modo_agente.py only_voice --no-reiniciar   # sin tocar el agente (lo reinicias a mano)

En modo normal el robot conversa con su propio modelo (LinkSoul) y lo que oye NO llega a nuestra API. En only_voice
se apaga ese modelo, el VAD queda activo despues de un solo "linchilinchi" y cada frase sale por
/agent/process_audio_output, que es lo que lee x2/cerberus_x2.py --escuchar.

Equivale a lo que documenta AimDK (FAQ 8.1, "Disable the Built-in Interaction System"):
    ros2 service call /aimdk_5Fmsgs/srv/SetAgentPropertiesRequest aimdk_msgs/srv/SetAgentPropertiesRequest \
        "contents: {properties: [{key: {value: 2}, value: 'only_voice'}]}"
    aima em stop-app agent && aima em start-app agent
Hacerlo aqui evita pelearse con el YAML anidado en la terminal y confirma que el servicio respondio.
https://x2-aimdk.agibot.com/en/latest/faq/temp_works.html
"""
import argparse
import subprocess
import sys

SERVICIO = '/aimdk_5Fmsgs/srv/SetAgentPropertiesRequest'
RUN_MODE = 2            # AGENT_PROPERTY_RUN_MODE = 0x02 (doc oficial)


def elemento(msg, campo):
    """Instancia del tipo de los elementos de msg.campo ('sequence<aimdk_msgs/AgentProperty>'), leido del propio
    mensaje: el nombre exacto cambia entre versiones del firmware, asi no hay que adivinarlo."""
    import importlib
    tipo = msg.get_fields_and_field_types()[campo]
    nombre = tipo[tipo.index('<') + 1:tipo.rindex('>')] if '<' in tipo else tipo
    partes = nombre.split('/')
    return getattr(importlib.import_module(f'{partes[0]}.msg'), partes[-1])()


def set_mode(modo, espera=10.0):
    import rclpy
    from aimdk_msgs.srv import SetAgentPropertiesRequest

    rclpy.init()
    node = rclpy.create_node('cerberus_modo_agente')
    cli = node.create_client(SetAgentPropertiesRequest, SERVICIO)
    if not cli.wait_for_service(timeout_sec=espera):
        node.get_logger().error(f'no responde {SERVICIO}: ¿es un X2 Ultra y esta el agente corriendo?')
        rclpy.shutdown()
        return False
    req = SetAgentPropertiesRequest.Request()
    prop = elemento(req.contents, 'properties')
    prop.key.value, prop.value = RUN_MODE, modo
    req.contents.properties = [prop]
    fut = cli.call_async(req)
    rclpy.spin_until_future_complete(node, fut, timeout_sec=espera)
    ok = fut.result() is not None
    print(f'SetAgentProperties({modo}): {"respondio " + str(fut.result()) if ok else "sin respuesta"}', flush=True)
    rclpy.shutdown()
    return ok


def reiniciar_agente():
    """aima em stop-app agent && aima em start-app agent (el cambio solo aplica al reiniciar el modulo)."""
    for accion in ('stop-app', 'start-app'):
        try:   # en el X2 Ultra del evento stop-app se quedo colgado: sin tope, el despliegue nunca arrancaba la camara
            r = subprocess.run(['aima', 'em', accion, 'agent'], capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            print(f'aima em {accion} agent: no respondio en 30 s', flush=True)
            return False
        print(f'aima em {accion} agent: rc={r.returncode} {(r.stdout or r.stderr).strip()[:200]}', flush=True)
        if r.returncode != 0:
            return False
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('modo', choices=['only_voice', 'normal'])
    ap.add_argument('--no-reiniciar', action='store_true', help='no ejecutar aima em stop-app/start-app agent')
    a = ap.parse_args()
    try:
        ok = set_mode(a.modo)
    except ImportError as e:
        sys.exit(f'falta ROS 2 o aimdk_msgs ({e}). Este script corre en la unidad de desarrollo del robot;\n'
                 'primero: source /opt/ros/humble/setup.bash && source ~/aimdk/install/setup.bash')
    if not ok:
        sys.exit('no se pudo cambiar el modo (ver deploy/deploy.md seccion 7)')
    if not a.no_reiniciar and not reiniciar_agente():
        sys.exit('el modo quedo escrito, pero falto reiniciar el agente: aima em stop-app agent && aima em start-app agent')
    print(f'\nModo {a.modo} activo.' + ('\nComprueba: ros2 topic echo /agent/process_audio_output --field audio_vad_state'
                                        if a.modo == 'only_voice' else ''), flush=True)


if __name__ == '__main__':
    main()
