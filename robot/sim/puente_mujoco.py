"""Puente API -> club simulado (MuJoCo de robotA): cada decision de Cerberus mueve al X2 simulado a la sala de esa categoria.

Uso (con la API corriendo: ./run.sh):
  python sim/puente_mujoco.py                 # abre el club simulado (robotA/sim/run_club.py --manual) y lo maneja
  python sim/puente_mujoco.py --lite          # modelo liviano del X2 (laptops; mismo comportamiento)
  python sim/puente_mujoco.py --sin-sim       # solo imprime los comandos (sin MuJoCo)
  python sim/puente_mujoco.py --api http://IP:8000   # la API en otra maquina (p. ej. la sim en AWS por tunel)

No toca el codigo de robotA: la simulacion en modo manual lee comandos por la terminal (vip, regular, invitado,
personal, externo, home) y este puente se los escribe. Lee GET /api/registros cada 0.5 s; solo actua sobre registros
NUEVOS (no repite la historia al arrancar). ESCALAMIENTO no tiene sala: el robot se queda en HOME y avisa en consola.
En macOS el visor de MuJoCo exige `mjpython` (viene con el paquete mujoco).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN_CLUB = (ROOT.parent if (ROOT.parent / 'vision').is_dir() else ROOT.parent / 'robotA') / 'sim' / 'run_club.py'  # repo del equipo: robotB dentro de el, o al lado (../robotA)
COMANDO = {'VIP': 'vip', 'REGULAR': 'regular', 'INVITADO': 'invitado', 'PERSONAL': 'personal', 'EXTERNO': 'externo'}


def new_records(rows, seen):
    """Registros que no se habian visto, del mas viejo al mas nuevo (la API los da del mas nuevo al mas viejo)."""
    fresh = [r for r in rows if r['id'] not in seen]
    seen.update(r['id'] for r in fresh)
    return list(reversed(fresh))


class Puente:
    def __init__(self, get_rows, sim_cmd=None, retry_s=2.0, out=print):
        self.get_rows, self.retry_s, self.out = get_rows, retry_s, out
        self.queue, self.busy_until, self.seen = deque(), 0.0, None
        self.sim = None
        if sim_cmd:
            self.sim = subprocess.Popen(sim_cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                        text=True, bufsize=1)
            self.last_sent = None
            threading.Thread(target=self._read_sim, daemon=True).start()

    def _read_sim(self):
        for line in self.sim.stdout:
            line = line.rstrip()
            if line.strip('> '):
                self.out(f'  [sim] {line.lstrip("> ")}')
            if 'ocupado' in line and self.last_sent:       # el robot simulado no termino: se reintenta despues
                self.queue.appendleft(self.last_sent)
                self.busy_until = time.time() + self.retry_s

    def send(self, cmd):
        if self.sim is None:
            self.out(f'  [sin sim] > {cmd}')
            return
        self.last_sent = cmd
        self.sim.stdin.write(cmd + '\n')
        self.sim.stdin.flush()

    def step(self):
        """Una vuelta: lee registros nuevos, encola comandos y manda el siguiente si el robot no esta ocupado."""
        rows = self.get_rows()
        if self.seen is None:                               # primera lectura: la historia no se repite
            self.seen = {r['id'] for r in rows}
            return
        for r in new_records(rows, self.seen):
            cmd = COMANDO.get(r['rol'])
            self.out(f'{r["fecha"]}  {r["nombre"]} -> {r["rol"]}' + (f'  => {cmd}' if cmd else '  (recepcion: el robot se queda en HOME)'))
            if cmd:
                self.queue.append(cmd)
        if self.queue and time.time() >= self.busy_until:
            self.send(self.queue.popleft())
            self.busy_until = time.time() + 1.0             # deja que la sim conteste "ocupado" antes del siguiente

    def alive(self):
        return self.sim is None or self.sim.poll() is None

    def close(self):
        if self.sim and self.sim.poll() is None:
            try:
                self.sim.stdin.write('salir\n')
                self.sim.stdin.flush()
                self.sim.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self.sim.kill()


def sim_command(lite, speed):
    py = Path(sys.executable)
    mj = py.with_name('mjpython')                          # macOS: el visor pasivo necesita mjpython
    exe = str(mj) if sys.platform == 'darwin' and mj.exists() else (shutil.which('mjpython') if sys.platform == 'darwin' else None) or str(py)
    return [exe, '-u', str(RUN_CLUB), '--manual', '--speed', str(speed)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', default='http://127.0.0.1:8000')
    ap.add_argument('--sin-sim', action='store_true')
    ap.add_argument('--lite', action='store_true', help='modelo liviano del X2 (CERBERUS_MODELO=lite)')
    ap.add_argument('--speed', type=float, default=2.0)
    ap.add_argument('--autotest', action='store_true')
    a = ap.parse_args()
    if a.autotest:
        return autotest()
    if a.lite:
        os.environ['CERBERUS_MODELO'] = 'lite'
    if not a.sin_sim and not RUN_CLUB.exists():
        sys.exit(f'no esta {RUN_CLUB}: robotB debe estar dentro del repo del equipo o al lado (../robotA)')

    def get_rows():
        with urllib.request.urlopen(f'{a.api}/api/registros?limit=50', timeout=5) as r:
            return json.load(r)
    try:
        get_rows()
    except OSError as e:
        sys.exit(f'la API no responde en {a.api} ({e}): arranque primero ./run.sh')
    p = Puente(get_rows, None if a.sin_sim else sim_command(a.lite, a.speed))
    print(f'Puente listo: {a.api} -> {"(sin sim)" if a.sin_sim else "club simulado"}. Ctrl+C para salir.')
    try:
        while p.alive():
            try:
                p.step()
            except OSError as e:                            # la API se reinicio: se sigue intentando
                print(f'  API no disponible: {e}')
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        p.close()


def autotest():
    """Sin MuJoCo: una 'simulacion' falsa que contesta ocupado la primera vez; verifica orden, reintento y escalamiento."""
    rows = [{'id': 'viejo', 'fecha': 't0', 'nombre': 'Historia', 'rol': 'VIP'}]
    fake_sim = [sys.executable, '-u', '-c', (
        "import sys\nbusy=True\nfor line in sys.stdin:\n    c=line.strip()\n    if c=='salir': break\n"
        "    if busy: print('el robot esta ocupado; usa \"home\" para interrumpir'); busy=False\n"
        "    else: print('OK '+c)\n")]
    log = []
    p = Puente(lambda: rows, fake_sim, retry_s=0.2, out=log.append)
    p.step()                                                # primera lectura: no repite 'viejo'
    rows[:0] = [{'id': 'b', 'fecha': 't2', 'nombre': 'Luis', 'rol': 'EXTERNO'},
                {'id': 'x', 'fecha': 't1b', 'nombre': 'Alguien', 'rol': 'ESCALAMIENTO'},
                {'id': 'a', 'fecha': 't1', 'nombre': 'Ana', 'rol': 'INVITADO'}]
    deadline = time.time() + 10
    while time.time() < deadline and sum('OK ' in x for x in log) < 2:
        p.step()
        time.sleep(0.1)
    p.close()
    sent = [x.split('OK ')[1] for x in log if 'OK ' in x]
    assert sent == ['invitado', 'externo'], log            # en orden, 'invitado' reintentado tras "ocupado"
    assert not any('Historia' in x for x in log) and any('recepcion' in x for x in log), log
    print('puente autotest OK:', ' | '.join(log))


if __name__ == '__main__':
    main()
