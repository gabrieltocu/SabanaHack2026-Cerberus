"""Vista en vivo: camara -> sesion de verificacion (rostro REAL, club SIMULADO, respaldo QR/tercero/recepcion).

Uso:  python live.py [--camara 0]
Teclas:  n = la persona no tiene pase QR   s / x = anfitrion o supervisor confirma / niega (simulado)
         r = reiniciar   q = salir
Cada verificacion terminada se imprime como evento JSON por stdout: eso es lo que consume el cerebro.
"""
import argparse
import json
import textwrap
import time

import cv2

from camera import open_camera
from club_facial import load_socios
from face import FaceEngine, Gallery, load_calibration
from quality import assess
from session import Session

STAGE_COLOR = {'rostro': (255, 200, 0), 'qr': (0, 200, 255), 'tercero': (0, 140, 255), 'fin': (60, 200, 60)}


def draw(frame, sess, faces):
    color = STAGE_COLOR[sess.stage]
    if sess.result and sess.result['resultado'] == 'escalado_recepcion':
        color = (0, 0, 255)
    for f in faces[:1]:
        x, y, w, h = f['box']
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        q = assess(frame, f)
        if not q['ok']:
            cv2.putText(frame, 'calidad: ' + ', '.join(q['reasons']), (x, y + h + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    lines = textwrap.wrap(sess.message, width=max(30, frame.shape[1] // 11))[:2]
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 40 + 26 * len(lines)), (30, 30, 30), -1)
    cv2.putText(frame, f'[{sess.stage.upper()}] reintentos {sess.retries}', (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    for k, line in enumerate(lines):
        cv2.putText(frame, line, (10, 52 + 26 * k), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    if sess.result:
        club = sess.result['club']
        cv2.putText(frame, f'Club (SIMULADO): {"MIEMBRO" if club["miembro"] else "NO MIEMBRO"}', (10, frame.shape[0] - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--camara', type=int, default=0)
    a = ap.parse_args()
    engine = FaceEngine()
    sess = Session(engine, Gallery(), load_socios(), load_calibration())
    cap, _ = open_camera(a.camara)
    printed = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        sess.feed(frame, time.time())
        if sess.result and sess.result is not printed:
            printed = sess.result
            print(json.dumps(dict(t=round(time.time(), 2), **sess.result), ensure_ascii=False), flush=True)
        draw(frame, sess, engine.faces(frame) if sess.stage == 'rostro' else [])
        cv2.imshow('Cerberus - verificacion', frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        if key == ord('r'):
            sess.reset()
        if key == ord('n'):
            sess.no_qr()
        if key in (ord('s'), ord('x')):
            sess.third_party(key == ord('s'))
    cap.release()
    cv2.destroyAllWindows()


if __name__ == '__main__':
    main()
