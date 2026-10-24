"""Registros del club (SIMULADOS) y confirmacion de la categoria.

Dos entradas posibles:
- desde_vision(): el modelo de vision ya dice la categoria (VIP, regular, empleado, visitante, desconocido); los
  registros aportan la ficha y cruzan que no se contradigan. Es el camino principal.
- confirmar(): solo se sabe miembro / no miembro (facial del club) y la categoria sale de cruzar la identidad con
  el padron de socios, la agenda de invitados, los turnos del personal y las ordenes de trabajo.
"""
import json
from datetime import date
from pathlib import Path

from intenciones import normalizar

DIR = Path(__file__).resolve().parents[1] / 'registros'
# lo que puede decir el modelo de vision (docs/contrato-vision.md) -> categoria del dialogo
VISION = {'VIP': 'VIP', 'REGULAR': 'REGULAR', 'MIEMBRO': 'REGULAR', 'EMPLEADO': 'PERSONAL', 'PERSONAL': 'PERSONAL',
          'INVITADO': 'INVITADO', 'EXTERNO': 'EXTERNO', 'CONTRATISTA': 'EXTERNO', 'VISITANTE': 'VISITANTE',
          'DESCONOCIDO': 'DESCONOCIDO', 'ESCALAMIENTO': 'ESCALAMIENTO'}


def _load(name):
    data = json.loads((DIR / name).read_text(encoding='utf-8'))
    return {k: v for k, v in data.items() if not k.startswith('_')}


class Registros:
    def __init__(self, hoy=None, datos=None):
        """datos: lo que devuelve la API (GET /bot/registros, ya verificado: agenda de la fecha, turnos con en_turno);
        sin datos, la copia local registros/*.json (sin esas verificaciones)."""
        d = datos or {n: _load(f'{n}.json') for n in ('socios', 'agenda', 'turnos', 'ordenes')}
        self.socios, self.agenda, self.turnos, self.ordenes = d['socios'], d['agenda'], d['turnos'], d['ordenes']
        for tabla in (self.socios, self.agenda, self.turnos, self.ordenes):   # la API escribe senor / senora
            for f in tabla.values():
                f['trato'] = {'senor': 'señor', 'senora': 'señora'}.get(f.get('trato'), f.get('trato'))
        self.hoy = hoy or date.today().isoformat()

    def orden_de(self, persona_id):
        return next(((ot, o) for ot, o in self.ordenes.items() if o['persona'] == persona_id), (None, None))

    def confirmar(self, persona_id, miembro, pase=None):
        """-> (categoria | None, ficha, motivo). motivo explica la decision (se muestra en el panel).
        categoria None = no se pudo confirmar; 'CONTRADICCION' = las fuentes no coinciden (va a recepcion)."""
        if pase:                                         # verificado por pase QR: el tipo dice donde buscar
            persona_id = pase.get('persona_id', persona_id)
            fuente = {'socio': 'socios', 'invitado': 'agenda', 'personal': 'turnos', 'externo': 'ordenes'}[pase['tipo']]
            cat, ficha, motivo = self.confirmar(persona_id, pase['tipo'] == 'socio')
            if cat is None or cat == 'CONTRADICCION' or self._fuente(cat) != fuente:
                return 'CONTRADICCION', {}, f'el pase dice {pase["tipo"]} pero el registro no coincide'
            return cat, ficha, motivo + ' (verificado con pase QR)'
        if persona_id is None:
            return None, {}, 'rostro no identificado'
        if miembro:
            s = self.socios.get(persona_id)
            if not s:
                return 'CONTRADICCION', {}, 'el club dice MIEMBRO pero no esta en el padron'
            return s['nivel'], s, f'socio de nivel {s["nivel"]}'
        if persona_id in self.socios:
            return 'CONTRADICCION', {}, 'esta en el padron pero el club dice NO MIEMBRO'
        if persona_id in self.agenda:
            a = self.agenda[persona_id]
            return 'INVITADO', a, f'en la agenda de hoy, invitado por {self.socios[a["anfitrion"]]["nombre"]}'
        if persona_id in self.turnos:
            t = self.turnos[persona_id]
            if t.get('en_turno') is False:                # lo verifica la API con la hora del club
                return 'CONTRADICCION', {}, f'fuera de su turno ({t["area"]} {t["inicio"]}-{t["fin"]})'
            return 'PERSONAL', t, f'turno {t["area"]} {t["inicio"]}-{t["fin"]}'
        ot, o = self.orden_de(persona_id)
        if o:
            if o['fecha'] != self.hoy:
                return 'CONTRADICCION', {}, f'la orden {ot} es para el {o["fecha"]}, no para hoy'
            return 'EXTERNO', dict(o, ot=ot), f'orden de trabajo {ot} vigente hoy'
        return None, {}, 'no aparece en ningun registro del club'

    def rastro(self, pid):
        """Donde aparece la persona en cada registro (para el panel). -> [(registro, estado, detalle)],
        estado: 'si' | 'no' | 'ojo' (esta, pero no sirve hoy)."""
        s, a, t = self.socios.get(pid), self.agenda.get(pid), self.turnos.get(pid)
        ot, o = self.orden_de(pid)
        orden = ('no', 'no está') if not o else ('si', f'{ot} vigente hoy') if o['fecha'] == self.hoy \
            else ('ojo', f'{ot} es del {o["fecha"]}')
        return [('Padrón de socios', *(('si', f'socio {s["nivel"]}') if s else ('no', 'no está'))),
                ('Agenda de invitados', *(('si', f'invita {self.socios[a["anfitrion"]]["nombre"]}') if a else ('no', 'no está'))),
                ('Turnos del personal', *(('no', 'no está') if not t else ('ojo', f'fuera de turno {t["inicio"]}-{t["fin"]}')
                                          if t.get('en_turno') is False else ('si', f'{t["area"]} {t["inicio"]}-{t["fin"]}'))),
                ('Órdenes de trabajo', *orden)]

    def desde_vision(self, v):
        """Confirmacion que entrega el modelo de vision: {'categoria', 'persona_id' (opcional), 'confianza'}.
        La categoria viene de la vision; los registros solo aportan la ficha (nombre, anfitrion, orden) y cruzan
        que no se contradigan. -> (categoria | None, ficha, motivo), igual que confirmar()."""
        cat = VISION.get(str(v.get('categoria', '')).upper())
        pid, conf = v.get('persona_id'), v.get('confianza')
        dice = f'vision: {v.get("categoria")}' + (f' ({conf:.2f})' if conf is not None else '')
        if cat is None:
            return 'CONTRADICCION', {}, f'{dice}: categoria que no se conoce'
        if cat == 'DESCONOCIDO':
            return None, {}, f'{dice}: no esta enrolado'
        if cat == 'ESCALAMIENTO':                         # la vision ya decidio que no alcanza (p. ej. cedula ajena)
            return 'CONTRADICCION', {}, f'{dice}: {v.get("motivo") or "la vision no pudo confirmar"}'
        if cat == 'VISITANTE':                           # la vision no distingue invitado de contratista
            if pid in self.agenda:
                cat = 'INVITADO'
            elif self.orden_de(pid)[1]:
                cat = 'EXTERNO'
            else:
                return 'INVITADO', {}, f'{dice}: sin agenda ni orden de trabajo, se pregunta quien lo invita'
        if pid is None:
            if cat == 'INVITADO':
                return 'INVITADO', {}, f'{dice}: sin identidad, se pregunta quien lo invita'
            return 'CONTRADICCION', {}, f'{dice} pero sin identidad no hay ficha que confirmar'
        reg_cat, ficha, motivo = self.confirmar(pid, cat in ('VIP', 'REGULAR'))
        if reg_cat == cat:
            return cat, ficha, f'{dice}; registro: {motivo}'
        if reg_cat == 'CONTRADICCION':
            return 'CONTRADICCION', {}, f'{dice}; registro: {motivo}'
        if cat == 'INVITADO' and reg_cat is None:
            return 'INVITADO', {}, f'{dice}: no esta en la agenda, se pregunta quien lo invita'
        return 'CONTRADICCION', {}, f'{dice} pero el registro dice {reg_cat or "nada"} ({motivo})'

    @staticmethod
    def _fuente(cat):
        return {'VIP': 'socios', 'REGULAR': 'socios', 'INVITADO': 'agenda', 'PERSONAL': 'turnos', 'EXTERNO': 'ordenes'}[cat]

    def socio_por_nombre(self, texto):
        """Busca al anfitrion por nombre o apellido dicho en voz alta."""
        t = normalizar(texto)
        for sid, s in self.socios.items():
            if normalizar(s['nombre']) in t.split() or normalizar(s['apellido']) in t.split():
                return sid, s
        return None, None
