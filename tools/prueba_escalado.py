"""Prueba del escalamiento contra la API real, vista de los dos lados: lo que hace el robot y lo que ve el concierge.

  python3 tools/prueba_escalado.py [--api http://127.0.0.1:8080/api]

Casos (sin camara ni ventanas; el robot en la entrada del club simulado):
1. La vision ya escalo: muestran la cedula de otra persona.
2. Un desconocido dice que lo invita Sofia y Sofia responde "No lo conozco" en su app.
En los dos: el robot manda ESCALADO_RECEPCION, se queda con la persona y consulta cada 2 s; el concierge lo ve en su
feed como NUEVO con el motivo, pulsa Atender (aqui lo hace Apps a los 8 s) y el robot lo suelta.
"""
import argparse
import os
import sys
import threading
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(RAIZ / 'sim'), str(RAIZ / 'hri')]
os.environ.setdefault('CERBERUS_LLM', 'no')
import run_club as rc  # noqa: E402
from api_cliente import ApiHttp, Apps  # noqa: E402

CASOS = [('Cedula de otra persona', {'categoria': 'ESCALAMIENTO', 'persona_id': None, 'confianza': 0.31,
                                     'metodo': 'rostro + cedula', 'motivo': 'la cedula es de otra persona'}),
         ('Desconocido; Sofia dice que no lo conoce', {'categoria': 'DESCONOCIDO', 'persona_id': None, 'confianza': 0.9,
                                                      'metodo': 'rostro', 'respuestas': ['vengo invitado', 'me invitó Sofía']})]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', default='http://127.0.0.1:8080/api')
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    api, apps = ApiHttp(a.api), Apps(a.api)
    t0 = time.perf_counter()
    lado_api = []                                         # (segundos, lo que dice la API)

    def ver(eid, cuando):
        r = apps._pedir('GET', '/eventos?despues_de=0', quien='concierge')
        e = next(x for x in (r.get('items', r) if isinstance(r, dict) else r) if x['id'] == eid)
        lado_api.append((time.perf_counter() - t0, f'{cuando}: feed del concierge -> {e["tipo"]} {e["estado"]}'
                         f'{" por " + e["atendido_por"] if e.get("atendido_por") else ""}, motivo "{e.get("motivo")}"'))

    enviar, crear = api.enviar_evento, api.crear_confirmacion

    def enviar_y_atender(e):
        r = enviar(e)
        if e['tipo'] == 'ESCALADO_RECEPCION':
            ver(e['id'], 'recien enviado')
            threading.Timer(8.0, lambda: (apps.atender(e['id']), ver(e['id'], 'concierge pulsa Atender'))).start()
        return r

    def crear_y_rechazar(c):
        r = crear(c)
        threading.Timer(4.0, lambda: (apps.responder(c['id'], c['anfitrion_id'], False),
                                      lado_api.append((time.perf_counter() - t0, f'{c["anfitrion_id"]} responde en su app: '
                                                       'No lo conozco')))).start()
        return r
    api.enviar_evento, api.crear_confirmacion = enviar_y_atender, crear_y_rechazar
    club = rc.Club(api)
    for titulo, c in CASOS:
        print(f'\n=== {titulo} ===')
        n_log, n_api = len(club.log), len(lado_api)
        for _ in club.atender(c):
            club.tick()
        for linea in club.log[n_log:]:
            print(f'  robot | {linea.strip()}')
        for t, txt in lado_api[n_api:]:
            print(f'  API   | ({t:5.1f} s reales) {txt}')
    club.seguidor.cam.cerrar()
    esc = [e for e in club.eventos_api if e['tipo'] == 'ESCALADO_RECEPCION']
    assert len(esc) == 2, esc
    assert all(api.estado_evento(e['id'])['estado'] == 'ATENDIDO' for e in esc)
    assert not api.cola and not api.rechazados, (api.cola, api.rechazados)
    print(f'\nprueba de escalamiento OK: {len(esc)} escalamientos recibidos por la API, atendidos por el concierge; '
          'el robot espero en cada uno hasta el Atender')


if __name__ == '__main__':
    main()
