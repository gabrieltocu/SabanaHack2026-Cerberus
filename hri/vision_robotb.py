"""Conector con robotB (la vision de Gabo: cara + cedula / pase QR, robotB/web/app.py) -> contrato de vision.

robotB registra cada decision final en GET /api/registros (rol, persona_id, nombre, confianza, estado). Aqui se
traduce al contrato de docs/contrato-vision.md ({categoria, persona_id, confianza}) para que la recepcion (registros,
dialogo, motor de decision) haga el resto. No toca el codigo de robotB: solo lee su API.
"""
import json
import urllib.request

# rol de robotB -> categoria del contrato de vision
CATEGORIA = {'VIP': 'VIP', 'REGULAR': 'REGULAR', 'INVITADO': 'INVITADO', 'PERSONAL': 'EMPLEADO', 'EXTERNO': 'EXTERNO',
             'ESCALAMIENTO': 'ESCALAMIENTO'}
METODO = {'RECONOCIDO': 'rostro', 'CONFIRMADO_CEDULA': 'rostro + cedula', 'CONFIRMADO_QR': 'rostro + pase QR'}


def a_vision(r, persona=None):
    """Registro de robotB (+ su ficha de /api/personas) -> contrato de vision, con lo que sirve para el panel."""
    persona = persona or {}
    cat = CATEGORIA.get(r.get('rol'), 'DESCONOCIDO')
    pid = r.get('persona_id') or None
    return {'categoria': cat, 'persona_id': pid, 'confianza': float(r.get('confianza') or 0.0),
            'nombre': r.get('nombre') if r.get('nombre') != 'desconocido' else None,
            'anfitrion': persona.get('anfitrion'), 'metodo': METODO.get(r.get('estado'), r.get('estado')),
            'motivo': r.get('motivo') or (f'robotB: {r.get("estado")}' if cat == 'ESCALAMIENTO' else None),
            'origen': 'robotB', 'id': r.get('id')}


def nuevos(filas, vistos):
    """Registros que no se habian visto, del mas viejo al mas nuevo (la API los da del mas nuevo al mas viejo)."""
    frescos = [r for r in filas if r['id'] not in vistos]
    vistos.update(r['id'] for r in frescos)
    return list(reversed(frescos))


class RobotB:
    def __init__(self, url='http://127.0.0.1:8000', timeout=3):
        self.url, self.timeout, self.vistos = url.rstrip('/'), timeout, None

    def _get(self, ruta):
        with urllib.request.urlopen(f'{self.url}{ruta}', timeout=self.timeout) as r:
            return json.load(r)

    def decisiones(self):
        """-> contratos de vision de las decisiones nuevas. La primera llamada solo marca la historia como vista."""
        filas = self._get('/api/registros?limit=50')
        if self.vistos is None:
            self.vistos = {r['id'] for r in filas}
            return []
        frescos = nuevos(filas, self.vistos)
        if not frescos:
            return []
        personas = {p['id']: p for p in self._get('/api/personas')}
        return [a_vision(r, personas.get(r.get('persona_id'))) for r in frescos]


if __name__ == '__main__':
    v = a_vision({'id': '1', 'rol': 'PERSONAL', 'persona_id': 'thomas', 'nombre': 'Thomas', 'confianza': 0.88,
                  'estado': 'CONFIRMADO_CEDULA'})
    assert v['categoria'] == 'EMPLEADO' and v['persona_id'] == 'thomas' and v['metodo'] == 'rostro + cedula'
    v = a_vision({'id': '2', 'rol': 'INVITADO', 'persona_id': 'ana', 'nombre': 'Ana', 'confianza': 0.7,
                  'estado': 'RECONOCIDO'}, {'anfitrion': 'andres'})
    assert v['categoria'] == 'INVITADO' and v['anfitrion'] == 'andres'
    v = a_vision({'id': '3', 'rol': 'ESCALAMIENTO', 'persona_id': None, 'nombre': 'desconocido', 'confianza': 0.2,
                  'estado': 'ESCALAMIENTO'})
    assert v['categoria'] == 'ESCALAMIENTO' and v['nombre'] is None and v['motivo']
    vistos = {'a'}
    assert [r['id'] for r in nuevos([{'id': 'c'}, {'id': 'b'}, {'id': 'a'}], vistos)] == ['b', 'c']
    print('vision_robotb OK')
