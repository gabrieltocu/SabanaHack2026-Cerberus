"""Cliente del robot para la API real del club (la de Marshal; contrato en docs/mvp-app-api.md, rutas bajo /api).

Mismos metodos que hri/api_sim.py (registros, enviar_evento, estado_evento, crear_confirmacion, estado_confirmacion,
heartbeat), asi la recepcion y la simulacion no cambian. Si la API no responde:
- registros: usa la ultima copia buena (o los registros/*.json del repo);
- eventos: quedan en cola y se reenvian en la siguiente llamada (la API es idempotente por id).
La llave del robot va en X-Bot-Key: CERBERUS_BOT_KEY o ~/.config/nclub/bot-key.
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

LLAVE = Path.home() / '.config' / 'nclub' / 'bot-key'


class ApiError(Exception):
    def __init__(self, msg, codigo=None):
        super().__init__(msg)
        self.codigo = codigo


class ApiHttp:
    def __init__(self, url, llave=None, robot='x2-1', timeout=5):
        self.url, self.robot, self.timeout = url.rstrip('/'), robot, timeout
        self.llave = llave or os.environ.get('CERBERUS_BOT_KEY') or (LLAVE.read_text().strip() if LLAVE.exists() else None)
        if not self.llave:
            raise ApiError(f'falta la llave del robot (CERBERUS_BOT_KEY o {LLAVE})')
        self.copia, self.cola, self.latidos, self.rechazados = None, [], [], []
        self.respuestas = {}                     # (api_sim) aqui no aplica: responde el anfitrion en su app

    def _pedir(self, metodo, ruta, cuerpo=None):
        req = urllib.request.Request(f'{self.url}{ruta}', method=metodo,
                                     data=None if cuerpo is None else json.dumps(cuerpo).encode(),
                                     headers={'X-Bot-Key': self.llave, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            try:
                detalle = json.load(e)
            except ValueError:
                detalle = {}
            raise ApiError(f'{metodo} {ruta}: {e.code} {detalle.get("error", "")}', e.code) from e

    def _vaciar_cola(self):
        while self.cola:
            try:
                self._pedir('POST', '/bot/eventos', self.cola[0])
            except ApiError as e:
                if e.codigo is None or e.codigo >= 500:
                    raise                                  # la API fallo: se reintenta despues
                self.rechazados.append((self.cola[0], str(e)))   # invalido: reintentar no sirve
            self.cola.pop(0)

    # GET /bot/registros
    def registros(self, fecha=None):
        try:
            self.copia = self._pedir('GET', '/bot/registros' + (f'?fecha={fecha}' if fecha else ''))
        except (OSError, ApiError):
            if self.copia is None:
                from registros import _load   # sin API ni copia: los registros de prueba del repo
                self.copia = {n: _load(f'{n}.json') for n in ('socios', 'agenda', 'turnos', 'ordenes')}
        return self.copia

    # POST /bot/eventos (con cola si la API no responde)
    def enviar_evento(self, e):
        self.cola.append(e)
        try:
            self._vaciar_cola()
            return {'ok': True}
        except (OSError, ApiError) as err:
            return {'en_cola': len(self.cola), 'error': str(err)}

    def estado_evento(self, eid):
        try:
            self._vaciar_cola()
            r = self._pedir('GET', f'/bot/eventos/{eid}')
            return {'estado': r['estado'], 'atendido_por': r.get('atendido_por')}
        except (OSError, ApiError):
            return {'estado': 'NUEVO', 'atendido_por': None}       # sin respuesta: se sigue esperando

    def crear_confirmacion(self, c):
        try:
            return self._pedir('POST', '/bot/confirmaciones', {k: c.get(k) for k in
                                                               ('id', 'anfitrion_id', 'visitante_desc', 'evento_id', 'vence_en_s')})
        except (OSError, ApiError) as err:
            return {'error': str(err)}

    def estado_confirmacion(self, cid):
        try:
            return {'estado': self._pedir('GET', f'/bot/confirmaciones/{cid}')['estado']}
        except (OSError, ApiError):
            return {'estado': 'PENDIENTE'}

    def heartbeat(self, estado, detalle=''):
        self.latidos.append((None, estado, detalle))
        try:
            return self._pedir('POST', '/bot/heartbeat', {'robot': self.robot, 'estado': estado, 'detalle': detalle[:200]})
        except (OSError, ApiError) as err:
            return {'error': str(err)}

    def agregar(self, c):
        """(api_sim) La API real no agrega personas: los registros son los del club."""
        return None


class Apps:
    """Las apps del concierge y del socio, por su API (JWT), para probar sin personas: atiende alertas y responde
    confirmaciones. Solo para pruebas y la demo automatica; en la demo real lo hacen las personas en sus celulares."""

    def __init__(self, url, clave='nclub-demo-2026', timeout=5):
        self.url, self.clave, self.timeout, self.tokens = url.rstrip('/'), clave, timeout, {}

    def _pedir(self, metodo, ruta, cuerpo=None, quien=None):
        h = {'Content-Type': 'application/json'}
        if quien:
            h['Authorization'] = f'Bearer {self._token(quien)}'
        req = urllib.request.Request(f'{self.url}{ruta}', method=metodo,
                                     data=None if cuerpo is None else json.dumps(cuerpo).encode(), headers=h)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.load(r)

    def _token(self, quien):
        if quien not in self.tokens:
            self.tokens[quien] = self._pedir('POST', '/auth/login', {'email': f'{quien}@nclub.demo', 'clave': self.clave})['token']
        return self.tokens[quien]

    def atender(self, eid):
        return self._pedir('POST', f'/eventos/{eid}/atender', {}, 'concierge')

    def responder(self, cid, anfitrion, aprueba):
        return self._pedir('POST', f'/confirmaciones/{cid}/responder', {'aprueba': aprueba}, anfitrion)


if __name__ == '__main__':                 # python hri/api_cliente.py http://127.0.0.1:8080/api  (contra la API real)
    import sys
    import uuid
    from datetime import datetime, timedelta, timezone
    url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080/api'
    api, apps = ApiHttp(url), Apps(url)
    r = api.registros()
    assert {'socios', 'agenda', 'turnos', 'ordenes'} <= set(r), r.keys()
    assert all('en_turno' in t for t in r['turnos'].values()), 'turnos sin en_turno'
    print('registros:', len(r['socios']), 'socios,', len(r['agenda']), 'en agenda,', len(r['turnos']), 'turnos,',
          len(r['ordenes']), 'ordenes')
    ahora = datetime.now(timezone(timedelta(hours=-5))).isoformat(timespec='seconds')
    e = {'id': str(uuid.uuid4()), 'ts': ahora, 'tipo': 'ESCALADO_RECEPCION', 'categoria': 'EMPLEADO', 'persona_id': None,
         'nombre': None, 'anfitrion_id': None, 'destino': None, 'avisar': ['concierge'], 'severidad': 'urgente',
         'requiere_atencion': True, 'motivo': 'prueba del cliente del robot', 'evidencia': {}}
    from eventos import evento
    e = dict(evento('ESCALADO_RECEPCION', 'EMPLEADO', motivo='prueba del cliente del robot'), ts=ahora)
    assert api.enviar_evento(e) == {'ok': True}, api.rechazados
    assert api.enviar_evento(e) == {'ok': True}, 'el duplicado tambien responde 200'
    assert api.estado_evento(e['id'])['estado'] == 'NUEVO'
    apps.atender(e['id'])
    assert api.estado_evento(e['id'])['estado'] == 'ATENDIDO'
    c = {'id': str(uuid.uuid4()), 'anfitrion_id': 'andres', 'visitante_desc': 'prueba del cliente', 'evento_id': None,
         'vence_en_s': 45}
    api.crear_confirmacion(c)
    assert api.estado_confirmacion(c['id'])['estado'] == 'PENDIENTE'
    apps.responder(c['id'], 'andres', True)
    assert api.estado_confirmacion(c['id'])['estado'] == 'APROBADA'
    assert 'error' not in api.heartbeat('ok', 'prueba del cliente')
    caida = ApiHttp('http://127.0.0.1:9', llave='x', timeout=1)            # sin API: cola y copia local
    assert caida.enviar_evento(dict(e, id=str(uuid.uuid4())))['en_cola'] == 1
    assert 'socios' in caida.registros()
    print('api_cliente OK contra', url)
