"""Teleop D1 (zsl-1) por teclado, enviando move() a 20 Hz para no disparar el watchdog de 3 s.

Requiere Ubuntu 22.04 + Python 3.10. Usa el SDK oficial incluido en robots/d1/sdk (o D1_SDK=/ruta).
Uso:  python3 d1_teleop.py <IP_PC> [IP_ROBOT=192.168.234.1]
      python3 d1_teleop.py --selftest
Teclas: w/s adelante/atras, a/d lateral, q/e girar, espacio = parar,
        1 = standUp, 2 = lieDown, p = passive (emergencia), x = salir (se echa).
"""
import os
import platform
import select
import sys
import termios
import time
import tty

STEP = {'w': (0.1, 0, 0), 's': (-0.1, 0, 0), 'a': (0, 0.1, 0), 'd': (0, -0.1, 0), 'q': (0, 0, 0.2), 'e': (0, 0, -0.2)}
# Rangos del SDK (api_zsl-1.md): por debajo del minimo el robot no arranca, se manda 0.
LIMITS = ((0.05, 1.0), (0.1, 0.6), (0.02, 1.0))  # ponytail: maximos recortados vs SDK (3 / 1 / 3) por seguridad en interiores


def clamp(v, lo, hi):
    if abs(v) < lo:
        return 0.0
    return max(-hi, min(hi, v))


def apply_key(vel, key):
    if key == ' ':
        return [0.0, 0.0, 0.0]
    if key in STEP:
        return [round(max(-hi, min(hi, v + d)), 3) for v, d, (lo, hi) in zip(vel, STEP[key], LIMITS)]
    return vel


def to_cmd(vel):
    return [clamp(v, *lim) for v, lim in zip(vel, LIMITS)]


def selftest():
    v = [0.0, 0.0, 0.0]
    v = apply_key(v, 'w')
    assert to_cmd(v) == [0.1, 0.0, 0.0], v
    v = apply_key(v, 'a')                      # 0.1 lateral = minimo -> se manda
    assert to_cmd(v)[1] == 0.1, v
    v = apply_key(v, 'd'); v = apply_key(v, 'd')
    assert to_cmd(v)[1] == -0.1, v
    for _ in range(30):
        v = apply_key(v, 'w')
    assert to_cmd(v)[0] == 1.0, v              # tope
    assert apply_key(v, ' ') == [0.0, 0.0, 0.0]
    assert to_cmd([0.01, 0.05, 0.01]) == [0.0, 0.0, 0.0]  # zona muerta
    print('selftest OK')


def main():
    if '--selftest' in sys.argv:
        return selftest()
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    local_ip = sys.argv[1]
    dog_ip = sys.argv[2] if len(sys.argv) > 2 else '192.168.234.1'

    arch = platform.machine().replace('amd64', 'x86_64').replace('arm64', 'aarch64')
    sdk = os.environ.get('D1_SDK', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sdk'))   # SDK oficial incluido
    sys.path.insert(0, os.path.join(sdk, 'lib', 'zsl-1', arch))
    import mc_sdk_zsl_1_py

    app = mc_sdk_zsl_1_py.HighLevel()
    app.initRobot(local_ip, 43988, dog_ip)  # puerto = target_port de /opt/export/config/sdk_config.yaml
    time.sleep(1)
    # la doc dice checkConnection; el .so expone checkConnect
    print('conexion:', app.checkConnect(), '| bateria:', app.getBatteryPower(), '% | modo:', app.getCurrentCtrlmode())
    if not app.checkConnect():
        sys.exit('Sin conexion: revisa target_ip en /opt/export/config/sdk_config.yaml (= tu IP) y reinicia el robot')
    if app.getBatteryPower() < 25:
        print('AVISO: bateria baja, con <20% el SDK se desconecta')

    vel, standing, last_info = [0.0, 0.0, 0.0], False, 0.0
    old = termios.tcgetattr(sys.stdin)
    tty.setcbreak(sys.stdin.fileno())
    try:
        while True:
            if select.select([sys.stdin], [], [], 0)[0]:
                k = sys.stdin.read(1).lower()
                if k == 'x':
                    break
                if k == '1':
                    vel = [0.0] * 3; print('standUp ->', hex(app.standUp())); standing = True; time.sleep(2)
                elif k == '2':
                    vel = [0.0] * 3; print('lieDown ->', hex(app.lieDown())); standing = False; time.sleep(2)
                elif k == 'p':
                    vel = [0.0] * 3; print('passive ->', hex(app.passive())); standing = False
                else:
                    vel = apply_key(vel, k)
            if standing:
                ret = app.move(*to_cmd(vel))  # tambien en 0,0,0: mantiene vivo el watchdog
                if ret:
                    print('move error', hex(ret))
            if time.time() - last_info > 2:
                last_info = time.time()
                print(f'cmd={to_cmd(vel)} bat={app.getBatteryPower()}% modo={app.getCurrentCtrlmode()} rpy={[round(a, 2) for a in app.getRPY()]}')
            time.sleep(0.05)  # 20 Hz
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old)
        app.move(0, 0, 0)
        app.lieDown()
        print('lieDown, salida')


if __name__ == '__main__':
    main()
