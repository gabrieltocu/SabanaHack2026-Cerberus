"""Eventos que el robot le manda a la API del club (POST /bot/eventos, docs/mvp-app-api.md §7.4).

El robot decide el tipo, a quien avisar y la severidad; la API solo guarda y reparte. Aqui solo se ARMA el evento
(la simulacion lo muestra en la bitacora); el envio con cola local es el cliente de §12 (pendiente).
"""
import uuid
from datetime import datetime, timedelta, timezone

BOGOTA = timezone(timedelta(hours=-5))
# (tipo, categoria) -> (avisar, severidad, requiere_atencion), tabla de §7.4
REGLAS = {('LLEGADA', 'VIP'): (['concierge'], 'atencion', True),
          ('LLEGADA', 'INVITADO'): (['anfitrion', 'concierge'], 'info', False),
          ('LLEGADA', 'REGULAR'): (['concierge'], 'info', False),
          ('LLEGADA', 'PERSONAL'): (['concierge'], 'info', False),
          ('LLEGADA', 'EXTERNO'): (['concierge', 'supervisor'], 'atencion', True),
          ('ESCALADO_RECEPCION', None): (['concierge'], 'urgente', True),
          ('IMPREVISTO', None): (['concierge', 'mantenimiento'], 'atencion', True),
          ('SALIDA', None): (['concierge'], 'info', False)}
VALIDOS = {'concierge', 'anfitrion', 'supervisor', 'mantenimiento', 'seguridad'}
CATEGORIAS = {'VIP', 'REGULAR', 'INVITADO', 'PERSONAL', 'EXTERNO'}   # las que acepta la API
DE_VISION = {'EMPLEADO': 'PERSONAL', 'MIEMBRO': 'REGULAR', 'VISITANTE': 'INVITADO', 'CONTRATISTA': 'EXTERNO'}
ALIAS = {'recepcion': 'concierge'}          # "recepcion" en el robot = el concierge en la app


def evento(tipo, categoria=None, persona_id=None, ficha=None, destino=None, motivo='', evidencia=None, avisar=None):
    """-> dict listo para POST /bot/eventos. avisar: el de la decision (si no, el de la tabla)."""
    ficha = ficha or {}
    categoria = DE_VISION.get(categoria, categoria) if DE_VISION.get(categoria, categoria) in CATEGORIAS else None
    base, sev, atencion = REGLAS.get((tipo, categoria)) or REGLAS[(tipo, None)]
    avisar = sorted({ALIAS.get(a, a) for a in (avisar or base)} | {'concierge'})   # el concierge siempre lo ve
    assert set(avisar) <= VALIDOS, avisar
    if tipo == 'SALIDA' and categoria == 'INVITADO':
        avisar = sorted(set(avisar) | {'anfitrion'})
    if tipo == 'SALIDA' and categoria == 'EXTERNO':
        avisar = sorted(set(avisar) | {'supervisor'})
    nombre = ' '.join(x for x in (ficha.get('nombre'), ficha.get('apellido')) if x) or None
    return {'id': str(uuid.uuid4()), 'ts': datetime.now(BOGOTA).isoformat(timespec='seconds'), 'tipo': tipo,
            'categoria': categoria, 'persona_id': persona_id, 'nombre': nombre, 'anfitrion_id': ficha.get('anfitrion'),
            'destino': destino, 'avisar': avisar, 'severidad': sev, 'requiere_atencion': atencion, 'motivo': motivo,
            'evidencia': evidencia or {}}


def resumen(e):
    """Una linea para la bitacora."""
    quien = e['nombre'] or e['persona_id'] or ''
    return (f'API POST /bot/eventos {e["tipo"]}' + (f' {e["categoria"]}' if e['categoria'] else '') +
            (f' {quien}' if quien else '') + f' -> {", ".join(e["avisar"])} [{e["severidad"]}]')


if __name__ == '__main__':
    e = evento('LLEGADA', 'INVITADO', 'laura', {'nombre': 'Laura', 'apellido': 'Diaz', 'anfitrion': 'andres'})
    assert e['avisar'] == ['anfitrion', 'concierge'] and e['anfitrion_id'] == 'andres' and not e['requiere_atencion']
    assert evento('LLEGADA', 'VIP')['severidad'] == 'atencion'
    assert evento('ESCALADO_RECEPCION', avisar=['recepcion'])['avisar'] == ['concierge']
    assert evento('IMPREVISTO', avisar=['mantenimiento', 'anfitrion'])['avisar'] == ['anfitrion', 'concierge', 'mantenimiento']
    assert evento('ESCALADO_RECEPCION', motivo='x')['severidad'] == 'urgente'
    assert evento('SALIDA', 'INVITADO')['avisar'] == ['anfitrion', 'concierge']
    assert evento('ESCALADO_RECEPCION', 'EMPLEADO')['categoria'] == 'PERSONAL'
    assert evento('ESCALADO_RECEPCION', 'ESCALAMIENTO')['categoria'] is None
    assert evento('SALIDA', 'EXTERNO')['avisar'] == ['concierge', 'supervisor']
    print(resumen(e))
    print('eventos OK')
