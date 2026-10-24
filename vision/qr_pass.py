"""Pases QR firmados: segundo factor cuando el rostro no basta.

Cada categoria ya tiene un pase natural: QR de la app del socio, invitacion enviada por el socio, carne del
personal, orden de trabajo del contratista. El contenido va firmado (HMAC-SHA256) y con vencimiento: una
foto del QR de otra persona sirve igual que el original, por eso ademas se cruza con la cara (verify.py).

Uso:  python qr_pass.py --tipo invitado --id laura --nombre "Laura Diaz" --horas 8   -> passes/laura.png
"""
import argparse
import hashlib
import hmac
import os
import time
from pathlib import Path

import cv2
import numpy as np

TIPOS = ('socio', 'invitado', 'personal', 'externo')
# ponytail: secreto por variable de entorno; en el club real lo emitiria y rotaria el sistema de accesos.
SECRET = os.environ.get('CERBERUS_QR_SECRET', 'demo-sabanahack-2026').encode()
PREFIX = 'NCLUB1'
PASSES = Path(__file__).resolve().parent / 'passes'


def _sign(body):
    return hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:20]


def make_pass(tipo, persona_id, nombre, horas=8.0, now=None):
    if tipo not in TIPOS:
        raise ValueError(f'tipo debe ser uno de {TIPOS}')
    if '|' in persona_id + nombre:
        raise ValueError('el id y el nombre no pueden tener "|"')
    exp = int((now or time.time()) + horas * 3600)
    body = '|'.join([PREFIX, tipo, persona_id, nombre, str(exp)])
    return f'{body}|{_sign(body)}'


def validate(text, now=None):
    """-> dict(ok, motivo, tipo, persona_id, nombre). motivo: formato | firma | vencido | ok"""
    parts = (text or '').split('|')
    if len(parts) != 6 or parts[0] != PREFIX or parts[1] not in TIPOS:
        return dict(ok=False, motivo='formato')
    body, sig = '|'.join(parts[:5]), parts[5]
    if not hmac.compare_digest(_sign(body), sig):
        return dict(ok=False, motivo='firma')
    info = dict(tipo=parts[1], persona_id=parts[2], nombre=parts[3])
    if int(parts[4]) < (now or time.time()):
        return dict(ok=False, motivo='vencido', **info)
    return dict(ok=True, motivo='ok', **info)


def to_image(text, scale=8):
    qr = cv2.QRCodeEncoder.create().encode(text)
    qr = cv2.resize(qr, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
    return cv2.copyMakeBorder(qr, 4 * scale, 4 * scale, 4 * scale, 4 * scale, cv2.BORDER_CONSTANT, value=255)


_detector = cv2.QRCodeDetector()


def read(frame):
    """Texto del primer QR visible en el frame, o None."""
    text, points, _ = _detector.detectAndDecode(frame)
    return text or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tipo', required=True, choices=TIPOS)
    ap.add_argument('--id', required=True)
    ap.add_argument('--nombre', required=True)
    ap.add_argument('--horas', type=float, default=8.0)
    a = ap.parse_args()
    PASSES.mkdir(exist_ok=True)
    out = PASSES / f'{a.id}.png'
    cv2.imwrite(str(out), to_image(make_pass(a.tipo, a.id, a.nombre, a.horas)))
    print(f'pase {a.tipo} para {a.nombre} (vence en {a.horas} h) -> {out}')


if __name__ == '__main__':
    main()
