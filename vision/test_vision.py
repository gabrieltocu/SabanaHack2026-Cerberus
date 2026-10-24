"""Prueba de la cadena de vision con fotos de LFW (personas publicas como reemplazo del dataset del equipo).

Uso: python test_vision.py ../../datasets/lfw
Enrola 3 personas (5 fotos c/u) en una galeria temporal, identifica fotos NO vistas, rechaza a un desconocido
y verifica lo que diria el facial del club (SIMULADO) segun el padron de socios.
"""
import sys
import tempfile
from pathlib import Path

import cv2

from club_facial import club_says
from face import FaceEngine, Gallery, load_calibration

PEOPLE = ['Colin_Powell', 'Serena_Williams', 'Hugo_Chavez']   # socio VIP, socio regular, no socio
UNKNOWN = 'Tony_Blair'


def first_face(engine, path):
    faces = engine.faces(cv2.imread(str(path)))
    return faces[0]['emb'] if faces else None


def main(root):
    root = Path(root)
    engine, cal = FaceEngine(), load_calibration()
    g = Gallery(path=Path(tempfile.gettempdir()) / 'cerberus_test_gallery.npz')
    held_out = {}
    for p in PEOPLE:
        files = sorted((root / p).iterdir())
        g.add(p, p.replace('_', ' '), [e for e in (first_face(engine, f) for f in files[:5]) if e is not None])
        held_out[p] = files[5:10]
    socios = {'Colin_Powell': {'nivel': 'VIP'}, 'Serena_Williams': {'nivel': 'REGULAR'}}

    for p, files in held_out.items():
        for f in files:
            r = g.identify(first_face(engine, f), cal)
            assert r['person_id'] == p, f'{f.name}: esperaba {p}, salio {r}'
        club = club_says(r, socios)
        assert club['miembro'] == (p in socios) and club['fuente'] == 'SIMULADO', club
        print(f'OK {p}: {len(files)} fotos no vistas identificadas | ultima cos {r["cos"]:.2f} conf {r["conf"]:.2f} | club: {"MIEMBRO" if club["miembro"] else "NO MIEMBRO"}')

    for f in sorted((root / UNKNOWN).iterdir())[:10]:
        r = g.identify(first_face(engine, f), cal)
        assert r['person_id'] is None, f'desconocido aceptado como {r}'
        assert club_says(r, socios)['miembro'] is False
    print(f'OK {UNKNOWN}: 10 fotos rechazadas como desconocido (club: NO MIEMBRO)')
    print('test_vision OK')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../../datasets/lfw')
