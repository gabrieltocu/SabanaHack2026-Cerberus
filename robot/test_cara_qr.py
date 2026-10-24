"""Prueba de punta a punta de cara + QR con frames reales (YOLO + SFace + pases firmados + categoria).

Uso: python test_cara_qr.py FOTO_DE_UNA_CARA.jpg      (cualquier foto de frente; no toca datos/)
Enrola la cara como invitado_1 en una galeria temporal y simula frames de camara 1280x720 con la cara y un pase.
"""
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'x2'))
from qr_lector import SesionCaraQR, qr_pass  # noqa: E402  (agrega robotA/vision al path)
from cerberus_x2 import categorize  # noqa: E402
from face import Gallery, load_calibration  # noqa: E402
from yolo_face import YoloFaceEngine  # noqa: E402

SOCIOS = {}
HOY = {'invitados': {'invitado_1': {'anfitrion': 'Andres'}}, 'personal': {'personal_1': {}}}


def frame_with(face, pass_text=None):
    f = np.full((720, 1280, 3), 120, np.uint8)
    face = cv2.resize(face, (420, int(420 * face.shape[0] / face.shape[1])))
    f[100:100 + face.shape[0], 150:570] = face[:620]
    if pass_text:
        code = cv2.resize(qr_pass.to_image(pass_text, 10), (260, 260), interpolation=cv2.INTER_AREA)
        f[200:460, 850:1110] = cv2.cvtColor(code, cv2.COLOR_GRAY2BGR)
    return f


def run(engine, gallery, frames):
    sess = SesionCaraQR(engine, gallery, SOCIOS, load_calibration())
    for k in range(40):
        sess.feed(frames[k % len(frames)], k / 10)
        if sess.stage == 'fin':
            return sess.result, categorize(sess.result, SOCIOS, HOY)[0]
    return None, sess.stage


def main(photo):
    engine, face = YoloFaceEngine(), cv2.imread(photo)
    assert face is not None, f'no se pudo leer {photo}'
    g = Gallery(path=Path(tempfile.gettempdir()) / 'cerberus_test_cara_qr.npz')
    faces = engine.faces(frame_with(face))
    assert faces, 'YOLO no encontro la cara en la foto'
    g.add('invitado_1', 'Laura Diaz', [faces[0]['emb']])

    own = qr_pass.make_pass('invitado', 'invitado_1', 'Laura Diaz')
    other = qr_pass.make_pass('personal', 'personal_1', 'Marta Ruiz')
    expired = qr_pass.make_pass('invitado', 'invitado_1', 'Laura Diaz', horas=-1)
    cases = [('solo cara', None, 'INVITADO', 'rostro'),
             ('cara + su propio pase', own, 'INVITADO', 'qr'),
             ('cara + pase de OTRA persona', other, 'ESCALAMIENTO', 'qr'),
             ('cara + pase vencido', expired, 'ESCALAMIENTO', 'qr')]
    for name, text, want, metodo in cases:
        result, cat = run(engine, g, [frame_with(face, text)])
        assert result, f'{name}: la sesion no termino (etapa {cat})'
        assert (cat, result['metodo']) == (want, metodo), f'{name}: {cat} via {result["metodo"]}, esperado {want} via {metodo}'
        print(f'  {name:28s} -> {cat:12s} ({result["resultado"]}, via {result["metodo"]}, pase {result["pase"]})')
    print('test_cara_qr OK')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
