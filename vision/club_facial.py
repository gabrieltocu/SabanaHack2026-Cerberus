"""Sistema de reconocimiento facial del club (SIMULADO, como permite el reto).

El sistema real del club solo responde "miembro" / "no miembro". Aqui se imita con el padron de socios
(registros/socios.json) y la identificacion de nuestro reconocedor propio: si la persona es socia, el club
dice MIEMBRO; si no, NO MIEMBRO. No devuelve identidad ni nivel: eso lo confirma el cerebro con otras fuentes.
"""
import json
from pathlib import Path

SOCIOS = Path(__file__).resolve().parents[1] / 'registros' / 'socios.json'


def load_socios(path=SOCIOS):
    return json.loads(Path(path).read_text(encoding='utf-8')) if Path(path).exists() else {}


def club_says(identity, socios):
    """identity: salida de Gallery.identify. -> {'miembro': bool, 'confianza': float, 'fuente': 'SIMULADO'}"""
    if identity['person_id'] is None:
        # cara no reconocida: el sistema del club tampoco la tiene como socio
        return {'miembro': False, 'confianza': round(1.0 - identity['conf'] * 0.5, 2), 'fuente': 'SIMULADO'}
    return {'miembro': identity['person_id'] in socios, 'confianza': round(identity['conf'], 2), 'fuente': 'SIMULADO'}
