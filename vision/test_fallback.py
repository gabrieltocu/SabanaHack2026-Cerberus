"""Pruebas del plan de respaldo cuando el rostro no basta.

Uso: python test_fallback.py ../../datasets/lfw
1) calidad: foto normal OK; oscura, borrosa, lejana y de perfil se diagnostican con su causa.
2) veredicto + escalera: reconocido, probable, desconocido, sin calidad, varias personas, contradiccion.
3) pase QR: valido, alterado, vencido, foto del QR (leido por camara simulada) y QR de otra persona.
"""
import sys
import time
from pathlib import Path

import cv2
import numpy as np

import qr_pass
from face import FaceEngine, Gallery, load_calibration
from quality import assess
from verify import Obs, Verdict, decide, next_step


def check_quality(engine, root):
    img = cv2.imread(str(root / 'Colin_Powell' / 'Colin_Powell_0001.jpg'))
    big = cv2.resize(img, None, fx=2, fy=2)                      # LFW es 250 px: en camara la cara se ve mas grande
    face = engine.faces(big)[0]
    assert assess(big, face)['ok'], assess(big, face)
    cases = {
        'oscuro': (big * 0.25).astype(np.uint8),
        'movido': cv2.GaussianBlur(big, (21, 21), 0),
        'lejos': cv2.copyMakeBorder(cv2.resize(img, None, fx=0.25, fy=0.25), 200, 200, 200, 200, cv2.BORDER_CONSTANT),
    }
    for want, im in cases.items():
        faces = engine.faces(im)
        got = assess(im, faces[0])['reasons'] if faces else ['sin_rostro']
        assert want in got, f'{want}: diagnostico {got}'
        print(f'OK calidad "{want}" detectada -> {assess(im, faces[0])["hints"]}')
    fake = dict(face, lm=face['lm'].copy())
    fake['lm'][2, 0] += 0.6 * np.linalg.norm(face['lm'][1] - face['lm'][0])   # nariz corrida = de perfil
    assert 'perfil' in assess(big, fake)['reasons']
    print('OK calidad "perfil" detectada')


def check_verdicts():
    cal = load_calibration()
    q_ok = dict(ok=True, reasons=[], hints=[])
    q_bad = dict(ok=False, reasons=['oscuro'], hints=['De un paso hacia la luz, por favor'])
    ident = lambda pid, cos, margin=0.3: dict(person_id=pid, name=pid or 'desconocido', cos=cos, margin=margin, conf=0)
    sure, mid = cal['cos_sure'] + 0.1, (cal['cos_reject'] + cal['cos_sure']) / 2
    cases = [
        ('RECONOCIDO', [Obs(1, q_ok, ident('ana', sure))] * 10, 'continuar'),
        ('PROBABLE', [Obs(1, q_ok, ident('ana', mid))] * 10, 'pedir_qr'),
        ('PROBABLE', [Obs(1, q_ok, ident('ana', sure, margin=0.02))] * 10, 'pedir_qr'),   # se parece a dos
        ('DESCONOCIDO', [Obs(1, q_ok, ident(None, 0.2))] * 10, 'pedir_qr'),
        ('SIN_CALIDAD', [Obs(1, q_bad, ident(None, 0.1))] * 10, 'reintento_guiado'),
        ('VARIAS_PERSONAS', [Obs(3, q_ok, ident('ana', sure))] * 10, 'reintento_guiado'),
        ('SIN_ROSTRO', [Obs(0)] * 10, 'reintento_guiado'),
    ]
    for state, obs, step in cases:
        v = decide(obs, cal)
        assert v.state == state, (state, v)
        assert next_step(v, 0, cal=cal) == step, (state, next_step(v, 0, cal=cal))
        print(f'OK {state:15s} -> {step}  {v.hints if v.hints else ""}')
    v = decide([Obs(1, q_bad, ident(None, 0.1))] * 10, cal)
    assert next_step(v, retries=2, cal=cal) == 'pedir_qr'
    assert next_step(v, 2, qr='sin_qr', cal=cal) == 'confirmar_tercero'
    assert next_step(v, 2, qr='sin_qr', third_party=True, cal=cal) == 'continuar'
    assert next_step(v, 2, qr='sin_qr', third_party=False, cal=cal) == 'recepcion'
    print('OK escalera: 2 reintentos -> QR -> sin QR: tercero confirma/niega -> continuar/recepcion')


def check_qr(engine, root):
    now = time.time()
    good = qr_pass.make_pass('invitado', 'laura', 'Laura Diaz', horas=4, now=now)
    assert qr_pass.validate(good, now)['ok']
    tampered = good.replace('invitado', 'socio')
    assert qr_pass.validate(tampered, now)['motivo'] == 'firma'
    assert qr_pass.validate(good, now + 5 * 3600)['motivo'] == 'vencido'
    assert qr_pass.validate('hola', now)['motivo'] == 'formato'
    print('OK pase QR: valido / alterado->firma / vencido / basura->formato')

    # el pase en el celular frente a la camara: QR pequeno, girado y con ruido dentro de una escena
    qr = qr_pass.to_image(good, scale=5)
    scene = np.full((720, 1280), 180, np.uint8)
    rot = cv2.warpAffine(qr, cv2.getRotationMatrix2D((qr.shape[1] / 2, qr.shape[0] / 2), 12, 1.0),
                         (qr.shape[1], qr.shape[0]), borderValue=255)
    scene[200:200 + rot.shape[0], 500:500 + rot.shape[1]] = rot
    noisy = cv2.cvtColor(np.clip(scene + np.random.default_rng(0).normal(0, 8, scene.shape), 0, 255).astype(np.uint8),
                         cv2.COLOR_GRAY2BGR)
    text = qr_pass.read(noisy)
    assert text == good, text
    print('OK pase QR leido desde la "camara" (girado 12 grados, con ruido)')

    # contradiccion: pase de Laura, pero la cara es claramente de otra persona enrolada
    cal = load_calibration()
    strong = Verdict('RECONOCIDO', 'colin', 'Colin Powell', cal['cos_sure'] + 0.1)
    assert next_step(strong, qr=qr_pass.validate(good, now), cal=cal) == 'recepcion'
    weak = Verdict('DESCONOCIDO', None, '', 0.2)
    assert next_step(weak, qr=qr_pass.validate(good, now), cal=cal) == 'continuar'
    print('OK cruce cara vs pase: pase ajeno con cara de otra persona -> recepcion; cara desconocida + pase valido -> continuar')


def check_real_degradation(engine, root):
    """Fotos reales degradadas de una persona enrolada: el sistema no debe confundirla con otra."""
    cal = load_calibration()
    g = Gallery(path='__no_existe__.npz')
    for p in ('Colin_Powell', 'Tony_Blair', 'Hugo_Chavez'):
        g.add(p, p, [engine.faces(cv2.imread(str(f)))[0]['emb'] for f in sorted((root / p).iterdir())[:5]])
    wrong = 0
    for f in sorted((root / 'Colin_Powell').iterdir())[5:25]:
        img = cv2.GaussianBlur((cv2.imread(str(f)) * 0.5).astype(np.uint8), (7, 7), 0)    # oscura y algo borrosa
        faces = engine.faces(img)
        if faces:
            r = g.identify(faces[0]['emb'], cal)
            wrong += r['person_id'] not in (None, 'Colin_Powell')
    assert wrong == 0, f'{wrong} confusiones con otra persona'
    print('OK 20 fotos degradadas: 0 confusiones con otra persona (en el peor caso queda como desconocido)')


def main(root):
    root = Path(root)
    engine = FaceEngine()
    check_quality(engine, root)
    check_verdicts()
    check_qr(engine, root)
    check_real_degradation(engine, root)
    print('test_fallback OK')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../../datasets/lfw')
