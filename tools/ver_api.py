"""Lo que ve el concierge en la API del club: estado del robot, alertas y eventos que el robot envio.

  python3 tools/ver_api.py                       # resumen: robot, indicadores y los ultimos eventos
  python3 tools/ver_api.py --seguir              # en vivo: cada evento nuevo que llega (Ctrl+C para salir)
  python3 tools/ver_api.py --api http://127.0.0.1:8080/api --n 20

Entra como concierge con la cuenta de prueba (concierge@nclub.demo); la API es la de AWS por defecto.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'hri'))
from api_cliente import Apps  # noqa: E402


def eventos(apps, despues_de=0):
    r = apps._pedir('GET', f'/eventos?despues_de={despues_de}', quien='concierge')
    return r.get('items', r) if isinstance(r, dict) else r


def linea(e):
    hora = (e.get('ts') or '')[11:19]
    quien = e.get('nombre') or e.get('persona_id') or '-'
    estado = e.get('estado', '')
    if e.get('atendido_por'):
        estado += f' por {e["atendido_por"]}'
    return (f'{e.get("seq", ""):>4}  {hora}  {e.get("tipo", ""):<19} {str(e.get("categoria") or "-"):<9} {quien:<16} '
            f'{estado:<22} {e.get("motivo") or ""}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', default='http://127.0.0.1:8080/api')
    ap.add_argument('--n', type=int, default=12)
    ap.add_argument('--seguir', action='store_true')
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    apps = Apps(a.api)
    rob = apps._pedir('GET', '/robot/estado', quien='concierge')
    print(f'Robot {rob.get("robot")}: {"EN LINEA" if rob.get("en_linea") else "SIN CONEXION"} · {rob.get("estado")} '
          f'{rob.get("detalle") or ""} · ultimo latido {rob.get("ultimo_latido")}')
    k = apps._pedir('GET', '/panel/resumen', quien='concierge').get('kpis', {})
    print('Hoy: ' + ' · '.join(f'{n} {v}' for n, v in k.items()))
    todos = eventos(apps)
    print(f'\n {"seq":>3}  hora      tipo                categoria quien            estado                 motivo')
    for e in todos[-a.n:]:
        print(linea(e))
    if not a.seguir:
        return
    ultimo = max((e.get('seq', 0) for e in todos), default=0)
    print('\nEsperando eventos nuevos... (Ctrl+C para salir)')
    estados = {e['id']: e.get('estado') for e in todos}
    while True:
        time.sleep(2)
        for e in eventos(apps):                          # nuevos y cambios de estado (atendido, resuelto)
            if e.get('seq', 0) > ultimo or estados.get(e['id']) != e.get('estado'):
                print(linea(e), flush=True)
                ultimo, estados[e['id']] = max(ultimo, e.get('seq', 0)), e.get('estado')


if __name__ == '__main__':
    main()
