"""Prueba de la sesion de verificacion completa alimentandola con imagenes como si fueran la camara.

Uso: python test_session.py ../../datasets/lfw
"""
import sys
from pathlib import Path

import cv2
import numpy as np

import qr_pass
from face import FaceEngine, Gallery, load_calibration
from session import Session


def frames_of(root, person, start, n, transform=lambda im: im):
    files = sorted((root / person).iterdir())[start:start + n]
    return [cv2.resize(transform(cv2.imread(str(f))), None, fx=2, fy=2) for f in files]


def run(sess, frames, t0=0.0, fps=10):
    for k, fr in enumerate(frames):
        sess.feed(fr, t0 + k / fps)
        if sess.stage == 'fin':
            break
    return t0 + len(frames) / fps


def qr_scene(text):
    qr = qr_pass.to_image(text, scale=5)
    scene = np.full((720, 1280), 200, np.uint8)
    scene[150:150 + qr.shape[0], 450:450 + qr.shape[1]] = qr
    return cv2.cvtColor(scene, cv2.COLOR_GRAY2BGR)


def main(root):
    root = Path(root)
    engine, cal = FaceEngine(), load_calibration()
    g = Gallery(path='__no_existe__.npz')
    for p in ('Colin_Powell', 'Serena_Williams'):
        g.add(p, p.replace('_', ' '), [engine.faces(f)[0]['emb'] for f in frames_of(root, p, 0, 5)])
    socios = {'Colin_Powell': {'nivel': 'VIP'}}
    new = lambda: Session(engine, g, socios, cal)

    s = new()                                                  # 1) socio reconocido por rostro
    run(s, frames_of(root, 'Colin_Powell', 5, 12))
    assert s.result and s.result['metodo'] == 'rostro' and s.result['club']['miembro'], s.result
    print('OK socio reconocido por rostro ->', s.message)

    s = new()                                                  # 2) mala luz: reintento guiado con la causa
    run(s, frames_of(root, 'Colin_Powell', 5, 8, lambda im: (im * 0.18).astype(np.uint8)))
    assert s.stage == 'rostro' and s.retries == 1 and 'luz' in s.message, (s.stage, s.retries, s.message)
    print('OK mala luz -> reintento guiado:', s.message)
    run(s, frames_of(root, 'Colin_Powell', 13, 12), t0=1.0)    # se corrige la luz -> reconocido
    assert s.result and s.result['persona_id'] == 'Colin_Powell' and s.result['reintentos'] == 1
    print('OK tras corregir la luz -> reconocido en el reintento')

    s = new()                                                  # 3) desconocido con pase valido de invitado
    t = run(s, frames_of(root, 'Tony_Blair', 0, 8))
    assert s.stage == 'qr', s.stage
    print('OK desconocido -> pide QR:', s.message)
    passe = qr_pass.make_pass('invitado', 'tony', 'Tony Blair', horas=4)
    run(s, [qr_scene(passe)], t0=t)
    assert s.result['resultado'] == 'verificado' and s.result['metodo'] == 'qr' and s.result['pase'] == 'invitado'
    print('OK pase de invitado valido ->', s.message)

    s = new()                                                  # 4) pase alterado -> recepcion
    t = run(s, frames_of(root, 'Tony_Blair', 0, 8))
    run(s, [qr_scene(passe.replace('invitado', 'socio'))], t0=t)
    assert s.result['resultado'] == 'escalado_recepcion' and s.result['motivo_pase'] == 'firma'
    print('OK pase alterado ->', s.message)

    s = new()                                                  # 5) sin pase: anfitrion confirma / niega
    t = run(s, frames_of(root, 'Tony_Blair', 0, 8))
    s.no_qr(); s.third_party(True)
    assert s.result['resultado'] == 'verificado' and s.result['metodo'] == 'tercero'
    s2 = new(); run(s2, frames_of(root, 'Tony_Blair', 0, 8)); s2.no_qr(); s2.third_party(False)
    assert s2.result['resultado'] == 'escalado_recepcion'
    print('OK sin pase -> anfitrion confirma: verificado | niega: recepcion')

    s = new()                                                  # 6) la persona se va: se reinicia
    t = run(s, frames_of(root, 'Tony_Blair', 0, 8))
    run(s, [np.zeros((500, 500, 3), np.uint8)] * 30, t0=t)
    assert s.stage == 'rostro' and s.result is None
    print('OK la persona se fue -> sesion reiniciada')
    print('test_session OK')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../../datasets/lfw')
