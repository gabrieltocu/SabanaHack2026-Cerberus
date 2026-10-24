#!/usr/bin/env python3
"""Juan camina derecho N metros con la interfaz oficial de AimDK v1.1.0 (/aima/mc/locomotion/velocity, como el ejemplo
py_examples/mc_locomotion_velocity.py). Corre en el robot, con el entorno de ROS 2 y aimdk cargado.

  python3 x2/caminar.py                      # solo mira: modo, FSM, fuente de control y lo que tiene delante
  python3 x2/caminar.py --metros 3 --si      # camina 3 m (pedido del dueno: no se ejecuta sin --si)
  python3 x2/caminar.py --manual --si        # manual: cada linea de la entrada (w s a d) mueve 0.4 s (panel /robot)

Lazo abierto (la doc: sin precision de punto final): vel x tiempo. Se frena solo si el lidar del pecho ve algo a menos
de --parar m delante, si se pierde el lidar, o con Ctrl+C; al terminar manda velocidad 0 medio segundo."""
import argparse
import select
import signal
import sys
import termios
import time

import numpy as np
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import PointCloud2
from aimdk_msgs.msg import CommonRequest, McCommonState, McInputAction, McLocomotionVelocity, MessageHeader
from aimdk_msgs.srv import GetMcAction, SetMcInputSource

FUENTE = 'node.cerberus_caminar'
LIDAR = '/aima/hal/sensor/lidar_chest_front/lidar_pointcloud_down_sampling'
DE_PIE = (200, 201, 300, 301, 302)                         # McAction: de pie o caminando; si no, no se le manda velocidad
ORDEN = {'w': (1, 0), 's': (-0.6, 0), 'a': (0, 1.0), 'd': (0, -1.0)}   # (x vel, rad/s) por tecla
FSM = {0: 'UNKNOWN', 1: 'STARTING', 2: 'STABLE', 3: 'MOVING', 4: 'SAFE', 5: 'SPECIAL', 6: 'TEST'}


def delante(xyz):
    """Lo mas cercano en el pasillo por donde va a caminar: x > 0.7 m (deja fuera su propio cuerpo, que el lidar ve a
    ~0.6 m), |y| < 0.45 m (su ancho y un margen), z entre -0.9 y 0.6 m respecto al pecho (sin piso ni techo)."""
    x, y, z = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    sel = (x > 0.7) & (x < 6.0) & (np.abs(y) < 0.45) & (z > -0.9) & (z < 0.6)
    return float(x[sel].min()) if sel.any() else None


class Caminar(Node):
    def __init__(self):
        super().__init__('cerberus_caminar')
        self.pub = self.create_publisher(McLocomotionVelocity, '/aima/mc/locomotion/velocity', 10)
        self.fuente = self.create_client(SetMcInputSource, '/aimdk_5Fmsgs/srv/SetMcInputSource')
        self.modo = self.create_client(GetMcAction, '/aimdk_5Fmsgs/srv/GetMcAction')
        self.lidar_d, self.lidar_t, self.fsm, self.accion = None, 0.0, None, None
        self.create_subscription(PointCloud2, LIDAR, self.on_lidar, qos_profile_sensor_data)
        self.create_subscription(McCommonState, '/aima/mc/common/state', self.on_estado,
                                 QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT))

    def on_lidar(self, m):
        f = {c.name: c.offset for c in m.fields}
        dt = np.dtype({'names': ['x', 'y', 'z'], 'formats': ['<f4'] * 3,
                       'offsets': [f['x'], f['y'], f['z']], 'itemsize': m.point_step})
        p = np.frombuffer(bytes(m.data), dt)
        xyz = np.stack([p['x'], p['y'], p['z']], axis=1)
        self.lidar_d, self.lidar_t = delante(xyz[np.isfinite(xyz).all(1)]), time.time()

    def on_estado(self, m):
        self.fsm, self.accion = int(m.fsm_state.current_state), int(m.action_info.current_action.value)

    def llamar(self, cliente, req, campo_stamp):
        if not cliente.wait_for_service(timeout_sec=5.0):
            return None
        for _ in range(8):                                  # como los ejemplos: el par remoto a veces no contesta
            campo_stamp(req).stamp = self.get_clock().now().to_msg()
            fut = cliente.call_async(req)
            rclpy.spin_until_future_complete(self, fut, timeout_sec=0.25)
            if fut.done():
                return fut.result()
        return None

    def modo_actual(self):
        req = GetMcAction.Request()
        req.request = CommonRequest()
        r = self.llamar(self.modo, req, lambda q: q.request.header)
        return (r.info.action_desc, r.info.status.value) if r else (None, None)

    def registrar(self):
        for accion in (McInputAction.INPUTACTION_ADD, McInputAction.INPUTACTION_ENABLE):   # ya registrada: ENABLE
            req = SetMcInputSource.Request()
            req.action.value = accion
            req.input_source.name, req.input_source.priority, req.input_source.timeout = FUENTE, 40, 1000
            r = self.llamar(self.fuente, req, lambda q: q.request.header)
            if r is not None and r.response.header.code == 0:
                return True
        return False

    def velocidad(self, v, giro=0.0):
        m = McLocomotionVelocity()
        m.header = MessageHeader()
        m.header.stamp = self.get_clock().now().to_msg()
        m.source, m.forward_velocity, m.lateral_velocity, m.angular_velocity = FUENTE, float(v), 0.0, float(giro)
        self.pub.publish(m)

    def parar(self):
        for _ in range(25):                                 # 0.5 s de ceros a 50 Hz
            self.velocidad(0.0)
            time.sleep(0.02)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--metros', type=float, default=0.0)
    ap.add_argument('--vel', type=float, default=0.3, help='m/s hacia adelante (0.2 a 0.5; arranca desde ~0.1)')
    ap.add_argument('--parar', type=float, default=1.0, help='se frena si ve algo delante a menos de esto (m)')
    ap.add_argument('--manual', action='store_true', help='w/s/a/d por la entrada, una linea por orden')
    ap.add_argument('--si', action='store_true', help='sin esto no camina: solo muestra el estado')
    a = ap.parse_args()
    assert 0.2 <= a.vel <= 0.5 and 0 <= a.metros <= 5 and a.parar >= 0.8, 'fuera de los limites seguros'
    rclpy.init()
    n = Caminar()
    t0 = time.time()
    while time.time() - t0 < 2.0:                           # que lleguen lidar y estado
        rclpy.spin_once(n, timeout_sec=0.1)
    desc, st = n.modo_actual()
    print(f'modo: {desc} (estado {st}) · FSM {FSM.get(n.fsm, n.fsm)} · accion {n.accion} · '
          f'delante: {"libre hasta 6 m" if n.lidar_d is None else f"{n.lidar_d:.2f} m"} · '
          f'lidar {"OK" if time.time() - n.lidar_t < 1 else "SIN DATOS"}', flush=True)
    if not ((a.metros or a.manual) and a.si):
        return
    if time.time() - n.lidar_t > 1:
        sys.exit('sin lidar no camina (no veria obstaculos)')
    if not a.manual and n.lidar_d is not None and n.lidar_d < a.metros + a.parar:
        sys.exit(f'hay algo a {n.lidar_d:.2f} m delante: no caben {a.metros} m (+{a.parar} m de margen)')
    if n.accion not in DE_PIE:
        sys.exit(f'no esta de pie (accion {n.accion}, FSM {FSM.get(n.fsm, n.fsm)}): parelo con el control o la app')
    if not n.registrar():
        sys.exit('no se pudo registrar la fuente de control (SetMcInputSource)')

    def corte(*_):
        n.parar()
        sys.exit('detenido')
    for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):   # SIGHUP: el panel corta el ssh
        signal.signal(s, corte)
    if a.manual:
        return manual(n, a)
    dur, t0, motivo = a.metros / a.vel, time.time(), 'llego'
    print(f'caminando {a.metros} m a {a.vel} m/s (~{dur:.0f} s) ...', flush=True)
    try:
        while time.time() - t0 < dur:
            rclpy.spin_once(n, timeout_sec=0.0)
            if time.time() - n.lidar_t > 0.5:
                motivo = 'se perdio el lidar'
                break
            if n.lidar_d is not None and n.lidar_d < a.parar:
                motivo = f'obstaculo a {n.lidar_d:.2f} m'
                break
            n.velocidad(a.vel)
            time.sleep(0.02)                                # 50 Hz, lo que pide la doc
    finally:
        n.parar()
    print(f'parado: {motivo} tras {time.time() - t0:.1f} s (~{a.vel * (time.time() - t0):.1f} m) · '
          f'FSM {FSM.get(n.fsm, n.fsm)}', flush=True)


def manual(n, a):
    """Cada linea de la entrada es una orden que dura 0.4 s (el panel la repite mientras se mantiene el boton):
    w adelante, s atras (mas lento, sin lidar atras), a/d girar, q sale, cualquier otra cosa para."""
    if sys.stdin.isatty():                                  # que las teclas no ensucien el log
        at = termios.tcgetattr(0)
        at[3] &= ~termios.ECHO
        termios.tcsetattr(0, termios.TCSANOW, at)
    orden, t_orden, aviso = (0, 0), 0.0, ''
    print(f'manual listo: w s a d (q sale) · {a.vel} m/s', flush=True)
    try:
        while True:
            rclpy.spin_once(n, timeout_sec=0.0)
            if select.select([sys.stdin], [], [], 0)[0]:
                linea = sys.stdin.readline()
                if not linea or linea.strip() == 'q':
                    break
                orden, t_orden = ORDEN.get(linea.strip(), (0, 0)), time.time()
            x, g = orden if time.time() - t_orden < 0.4 else (0, 0)
            ciego = time.time() - n.lidar_t > 0.5
            if x > 0 and (ciego or (n.lidar_d is not None and n.lidar_d < a.parar)):
                x, nuevo = 0, 'sin lidar' if ciego else f'obstaculo a {n.lidar_d:.2f} m'
                if nuevo != aviso:
                    print(f'no avanza: {nuevo}', flush=True)
                aviso = nuevo
            n.velocidad(x * a.vel, g * 0.4)
            time.sleep(0.02)
    finally:
        n.parar()
    print('manual terminado', flush=True)


if __name__ == '__main__':
    main()
