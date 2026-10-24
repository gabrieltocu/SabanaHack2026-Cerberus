"""Veredicto de verificacion sobre una ventana de frames + escalera de respaldo cuando el rostro no basta.

Veredictos:  RECONOCIDO | PROBABLE (confianza media o se parece a dos personas) | DESCONOCIDO |
             SIN_CALIDAD (no se pudo evaluar: lejos, oscuro, movido, perfil, cubierto) | VARIAS_PERSONAS | SIN_ROSTRO
Escalera:    continuar -> reintento_guiado (max 2) -> pedir_qr -> confirmar_tercero -> recepcion
Regla de seguridad: ante contradiccion (QR de una persona, cara fuertemente de otra) -> recepcion. Nunca se
abre acceso por defecto.
"""
from collections import Counter
from dataclasses import dataclass, field

from face import load_calibration

MIN_FRAMES = 8          # ~0.3 s a 30 fps
AGREE = 0.6             # fraccion de frames buenos que deben coincidir en la identidad
MIN_MARGIN = 0.08       # diferencia de coseno minima entre el 1er y 2do candidato
MAX_RETRIES = 2


@dataclass
class Obs:
    """Lo que vio un frame (solo la persona mas cercana)."""
    n_faces: int
    quality: dict | None = None      # salida de quality.assess
    identity: dict | None = None     # salida de Gallery.identify


@dataclass
class Verdict:
    state: str
    person_id: str | None = None
    name: str = ''
    cos: float = 0.0
    hints: list = field(default_factory=list)


def decide(observations, cal=None):
    cal = cal or load_calibration()
    seen = [o for o in observations if o.n_faces > 0]
    if len(seen) < MIN_FRAMES // 2:
        return Verdict('SIN_ROSTRO')
    if sum(o.n_faces > 1 for o in seen) > len(seen) / 2:
        return Verdict('VARIAS_PERSONAS', hints=['Por favor, de a una persona a la vez'])
    good = [o for o in seen if o.quality['ok']]
    if len(good) < len(seen) / 2:
        top = [r for r, _ in Counter(r for o in seen for r in o.quality['reasons']).most_common(2)]
        hints = [h for o in seen for r, h in zip(o.quality['reasons'], o.quality['hints']) if r in top]
        return Verdict('SIN_CALIDAD', hints=list(dict.fromkeys(hints)))
    votes = Counter(o.identity['person_id'] for o in good)
    pid, n = votes.most_common(1)[0]
    mine = [o.identity for o in good if o.identity['person_id'] == pid]
    cos = sum(i['cos'] for i in mine) / len(mine)
    margin = min(i['margin'] for i in mine)
    if pid is None:
        return Verdict('DESCONOCIDO', cos=cos)
    name = mine[0]['name']
    if n / len(good) >= AGREE and cos >= cal['cos_sure'] and margin >= MIN_MARGIN:
        return Verdict('RECONOCIDO', pid, name, cos)
    return Verdict('PROBABLE', pid, name, cos)


def next_step(verdict, retries=0, qr=None, third_party=None, cal=None):
    """Siguiente paso de la escalera.
    retries: reintentos guiados ya hechos. qr: None (aun no se pidio) | 'sin_qr' (la persona no tiene pase) |
    salida de qr_pass.validate. third_party: None (aun no se pregunto) | True | False (anfitrion/supervisor)."""
    cal = cal or load_calibration()
    if isinstance(qr, dict):
        if not qr['ok']:
            return 'recepcion'                                  # pase falso, alterado o vencido
        strong_other = (verdict.state == 'RECONOCIDO' and verdict.person_id != qr['persona_id']
                        and verdict.cos >= cal['cos_sure'])
        return 'recepcion' if strong_other else 'continuar'      # contradiccion cara vs pase
    if qr == 'sin_qr':
        return {None: 'confirmar_tercero', True: 'continuar', False: 'recepcion'}[third_party]
    if verdict.state == 'RECONOCIDO':
        return 'continuar'
    if verdict.state in ('SIN_CALIDAD', 'VARIAS_PERSONAS', 'SIN_ROSTRO') and retries < MAX_RETRIES:
        return 'reintento_guiado'
    return 'pedir_qr'
