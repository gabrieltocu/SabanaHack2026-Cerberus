"""Abrir la camara de forma robusta: prueba varios backends/formatos y se queda con el primero que entregue
imagen real (no negra ni corrupta). Algunas camaras HP entregan basura con DirectShow en su formato por defecto.

Uso directo (diagnostico):  python camera.py [indice]
"""
import sys
import time

import cv2
import numpy as np

cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)   # sin la avalancha de avisos de MSMF/DNN


def _modes(index):
    """(nombre, abrir) en orden de preferencia segun el sistema."""
    modes = []
    if sys.platform.startswith('win'):
        modes += [('MSMF', lambda: cv2.VideoCapture(index, cv2.CAP_MSMF)),
                  ('DSHOW+MJPG', lambda: _with_mjpg(cv2.VideoCapture(index, cv2.CAP_DSHOW))),
                  ('DSHOW', lambda: cv2.VideoCapture(index, cv2.CAP_DSHOW))]
    modes.append(('AUTO', lambda: cv2.VideoCapture(index)))
    return modes


def _with_mjpg(cap):
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    return cap


def looks_real(frame):
    """Una imagen de camara real tiene brillo y variacion; negra o de un solo color => no sirve."""
    if frame is None or frame.size == 0:
        return False
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return gray.mean() > 8 and gray.std() > 4


def open_camera(index=0, warmup=3.0, verbose=True):
    """-> (cap, nombre_modo). Lanza SystemExit con pistas si ningun modo entrega imagen."""
    tried = []
    for name, opener in _modes(index):
        cap = opener()
        if not cap.isOpened():
            tried.append(f'{name}: no abre')
            continue
        ok_frames, t0, last = 0, time.time(), None
        while time.time() - t0 < warmup:          # las camaras suelen dar frames negros al arrancar
            ok, frame = cap.read()
            if ok and looks_real(frame):
                ok_frames += 1
                last = frame
                if ok_frames >= 3:
                    break
        if ok_frames >= 3:
            if verbose:
                print(f'camara {index}: modo {name} {last.shape[1]}x{last.shape[0]}')
            return cap, name
        tried.append(f'{name}: imagen negra o vacia')
        cap.release()
    raise SystemExit('No se obtuvo imagen de la camara {}.\n  {}\nRevise: tapa/obturador de privacidad o tecla de '
                     'camara del laptop, permisos de camara de Windows (Configuracion > Privacidad > Camara), '
                     'y que ninguna otra app (Teams, Zoom, navegador) la este usando.'.format(index, '\n  '.join(tried)))


if __name__ == '__main__':
    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    for name, opener in _modes(idx):
        cap = opener()
        frames = [cap.read()[1] for _ in range(20)] if cap.isOpened() else []
        good = [f for f in frames if looks_real(f)]
        f = good[-1] if good else (frames[-1] if frames else None)
        info = f'{f.shape[1]}x{f.shape[0]} brillo {cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).mean():.0f}' if f is not None else 'sin frames'
        print(f'{name:11s} abre={cap.isOpened()}  frames reales {len(good)}/{len(frames)}  {info}')
        cap.release()
