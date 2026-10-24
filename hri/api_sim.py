"""API del club SIMULADA (docs/mvp-app-api.md) mientras la real esta lista.

En memoria, con las apps del socio y del concierge simuladas: responden solas pasado un tiempo. El cliente HTTP real
tendra los mismos metodos (registros, enviar_evento, estado_evento, crear_confirmacion, estado_confirmacion,
heartbeat), asi el robot no cambia. Las verificaciones de fecha (agenda) y horario (turnos) las hace la API, como
hara la real; el robot solo lee el resultado.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

DIR = Path(__file__).resolve().parents[1] / 'registros'
TOLERANCIA_TURNO = timedelta(minutes=30)       # puede marcar entrada hasta 30 min antes del inicio


def _load(nombre):
    data = json.loads((DIR / f'{nombre}.json').read_text(encoding='utf-8'))
    return {k: v for k, v in data.items() if not k.startswith('_')}


class ApiSimulada:
    def __init__(self, reloj=datetime.now, atiende_en_s=12, responde_en_s=6, respuestas=None):
        self.reloj = reloj                       # -> datetime del club (en la simulacion, la hora simulada)
        self.atiende_en_s, self.responde_en_s = atiende_en_s, responde_en_s
        self.respuestas = respuestas or {}       # anfitrion_id -> True/False: lo que respondera en su app
        self.base = {n: _load(n) for n in ('socios', 'agenda', 'turnos', 'ordenes')}
        self.estado_invitacion = {pid: 'PROGRAMADA' for pid in self.base['agenda']}
        self.eventos, self.confirmaciones, self.latidos, self.version = {}, {}, [], 1
        self.auto = True

    def _seg(self, t):
        return (self.reloj() - t).total_seconds()

    # GET /bot/registros?fecha=
    def registros(self, fecha=None):
        ahora = self.reloj()
        fecha = fecha or ahora.date().isoformat()
        agenda = {pid: a for pid, a in self.base['agenda'].items()
                  if a.get('fecha') == fecha and self.estado_invitacion[pid] in ('PROGRAMADA', 'LLEGO')}
        turnos = {}
        for pid, t in self.base['turnos'].items():
            ini, fin = (datetime.combine(ahora.date(), datetime.strptime(t[k], '%H:%M').time()) for k in ('inicio', 'fin'))
            turnos[pid] = dict(t, en_turno=ini - TOLERANCIA_TURNO <= ahora <= fin)
        return {'version': self.version, 'fecha': fecha, 'socios': self.base['socios'], 'agenda': agenda,
                'turnos': turnos, 'ordenes': self.base['ordenes']}

    def agregar(self, c):
        """SIMULADO: una persona que reconoce robotB (contrato de vision + nombre/anfitrion) y que los registros de
        prueba no tienen entra al registro del dia con su categoria, como la cargaria el club. -> nota o None.
        ponytail: se va cuando la API real tenga a las personas del equipo."""
        pid, cat = c.get('persona_id'), c.get('categoria')
        if not pid or any(pid in self.base[k] for k in ('socios', 'agenda', 'turnos')) or \
                any(o['persona'] == pid for o in self.base['ordenes'].values()):
            return None
        nombre, _, apellido = (c.get('nombre') or pid).partition(' ')
        f = {'nombre': nombre, 'apellido': apellido, 'trato': ''}
        hoy = self.reloj().date().isoformat()
        if cat in ('VIP', 'REGULAR'):
            self.base['socios'][pid] = dict(f, nivel=cat, accion='', destino=cat if cat == 'VIP' else None)
        elif cat == 'INVITADO' and c.get('anfitrion') in self.base['socios']:
            self.base['agenda'][pid] = dict(f, anfitrion=c['anfitrion'], lugar='INVITADO', hora='', fecha=hoy)
            self.estado_invitacion[pid] = 'PROGRAMADA'
        elif cat == 'EMPLEADO':
            self.base['turnos'][pid] = dict(f, area='personal', inicio='00:00', fin='23:59')
        elif cat == 'EXTERNO':
            self.base['ordenes'][f'OT-{pid}'] = dict(f, persona=pid, empresa='contratista', motivo='servicio programado',
                                                     supervisor='Jorge', area='mantenimiento', fecha=hoy, lugar='EXTERNO')
        else:
            return None
        self.version += 1
        return f'registro SIMULADO: {pid} entra como {cat} (lo reconoce robotB, no estaba en los datos de prueba)'

    # POST /bot/eventos (idempotente por id)
    def enviar_evento(self, e):
        if e['id'] in self.eventos:
            return {'duplicado': True}
        self.eventos[e['id']] = dict(e, estado='NUEVO', _t=self.reloj())
        nuevo = {'LLEGADA': 'LLEGO', 'SALIDA': 'SALIO'}.get(e['tipo'])
        if nuevo and e['persona_id'] in self.estado_invitacion:
            self.estado_invitacion[e['persona_id']] = nuevo
            self.version += 1
        return {'ok': True}

    # GET /bot/eventos/{id}: el robot sabe cuando el concierge lo atendio (pulso "Atender")
    def estado_evento(self, eid):
        e = self.eventos[eid]
        if self.auto and e['requiere_atencion'] and e['estado'] == 'NUEVO' and self._seg(e['_t']) >= self.atiende_en_s:
            e.update(estado='ATENDIDO', atendido_por='concierge (simulado)', atendido_at=self.reloj())
        return {'estado': e['estado'], 'atendido_por': e.get('atendido_por')}

    # POST /bot/confirmaciones y GET /bot/confirmaciones/{id}
    def crear_confirmacion(self, c):
        self.confirmaciones[c['id']] = dict(c, estado='PENDIENTE', _t=self.reloj())
        return {'ok': True}

    def estado_confirmacion(self, cid):
        c = self.confirmaciones[cid]
        if c['estado'] == 'PENDIENTE':
            if self.auto and c['anfitrion_id'] in self.respuestas and self._seg(c['_t']) >= self.responde_en_s:
                c['estado'] = 'APROBADA' if self.respuestas[c['anfitrion_id']] else 'RECHAZADA'
            elif self._seg(c['_t']) >= c.get('vence_en_s', 45):
                c['estado'] = 'VENCIDA'
        return {'estado': c['estado']}

    def automaticas(self, si):
        """Apps que responden solas (concierge a los 12 s, anfitriones segun respuestas) o a mano (botones)."""
        self.auto = si

    def atender(self, eid):                          # el concierge pulsa Atender en su app
        e = self.eventos.get(eid)
        if e and e['estado'] == 'NUEVO':
            e.update(estado='ATENDIDO', atendido_por='concierge', atendido_at=self.reloj())

    def responder(self, cid, aprueba):               # el anfitrion responde en su app
        c = self.confirmaciones.get(cid)
        if c and c['estado'] == 'PENDIENTE':
            c['estado'] = 'APROBADA' if aprueba else 'RECHAZADA'

    # POST /bot/heartbeat
    def heartbeat(self, estado, detalle=''):
        self.latidos.append((self.reloj(), estado, detalle))
        return {'ok': True}


if __name__ == '__main__':
    t = [datetime(2026, 10, 24, 9, 10)]
    api = ApiSimulada(reloj=lambda: t[0], respuestas={'andres': True})
    r = api.registros()
    assert 'laura' in r['agenda'] and 'camila' not in r['agenda'], 'agenda: solo la de hoy'
    assert r['turnos']['marta']['en_turno'] and not r['turnos']['pablo']['en_turno'], 'turnos: horario'
    t[0] = datetime(2026, 10, 24, 8, 35)
    assert api.registros()['turnos']['marta']['en_turno'], 'tolerancia antes del inicio'
    t[0] = datetime(2026, 10, 24, 21, 44)
    assert not api.registros()['turnos']['marta']['en_turno'], 'fuera de turno de noche'
    e = {'id': 'e1', 'tipo': 'ESCALADO_RECEPCION', 'persona_id': None, 'requiere_atencion': True}
    assert api.enviar_evento(e) == {'ok': True} and api.enviar_evento(e) == {'duplicado': True}
    assert api.estado_evento('e1')['estado'] == 'NUEVO'
    t[0] += timedelta(seconds=12)
    assert api.estado_evento('e1')['estado'] == 'ATENDIDO'
    api.crear_confirmacion({'id': 'c1', 'anfitrion_id': 'andres'})
    api.crear_confirmacion({'id': 'c2', 'anfitrion_id': 'sofia', 'vence_en_s': 45})
    t[0] += timedelta(seconds=6)
    assert api.estado_confirmacion('c1')['estado'] == 'APROBADA' and api.estado_confirmacion('c2')['estado'] == 'PENDIENTE'
    t[0] += timedelta(seconds=45)
    assert api.estado_confirmacion('c2')['estado'] == 'VENCIDA'
    api.enviar_evento({'id': 'e2', 'tipo': 'SALIDA', 'persona_id': 'laura', 'requiere_atencion': False})
    t[0] = datetime(2026, 10, 24, 12, 0)
    assert 'laura' not in api.registros()['agenda'], 'al salir deja la agenda'
    from registros import Registros                # el robot con lo que le da la API
    t[0] = datetime(2026, 10, 24, 9, 10)
    reg = Registros(datos=api.registros())
    assert reg.desde_vision({'categoria': 'EMPLEADO', 'persona_id': 'pablo'})[0] == 'CONTRADICCION'
    assert reg.desde_vision({'categoria': 'EMPLEADO', 'persona_id': 'marta'})[0] == 'PERSONAL'
    assert reg.desde_vision({'categoria': 'VISITANTE', 'persona_id': 'camila'})[1] == {}, 'invitada de otro dia: sin ficha'
    t[0] = datetime(2026, 10, 24, 9, 10)
    assert api.agregar({'persona_id': 'thomas', 'categoria': 'EMPLEADO', 'nombre': 'Thomas'})
    assert api.agregar({'persona_id': 'ana', 'categoria': 'INVITADO', 'nombre': 'Ana', 'anfitrion': 'andres'})
    assert api.agregar({'persona_id': 'sofia', 'categoria': 'VIP'}) is None, 'ya estaba: no se toca'
    reg = Registros(datos=api.registros())
    assert reg.desde_vision({'categoria': 'EMPLEADO', 'persona_id': 'thomas'})[0] == 'PERSONAL'
    assert reg.desde_vision({'categoria': 'INVITADO', 'persona_id': 'ana'})[1]['anfitrion'] == 'andres'
    assert reg.desde_vision({'categoria': 'ESCALAMIENTO', 'motivo': 'cedula de otra persona'})[0] == 'CONTRADICCION'
    print('api_sim OK')
