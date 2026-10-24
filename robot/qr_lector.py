"""Lectura de QR para Cerberus: caras y pases QR en el mismo flujo, en el X2 o en el Mac.

Los pases son los de robotA/vision/qr_pass.py (firmados con HMAC y con vencimiento: socio, invitado, personal,
externo). Aqui se agrega:
- read_all / read: lector mas robusto que el de robotA. Usa QRCodeDetectorAruco (OpenCV 4.8+), que aguanta mejor
  la pantalla de un celular, y un QR ubicado pero ilegible se reintenta recortado y ampliado x3: un QR en un celular a
  1-1.5 m de la camara de 1280x720 del X2 ocupa pocos pixeles.
- SesionCaraQR: la Session de robotA, pero el pase QR se acepta EN CUALQUIER MOMENTO (la persona lo muestra al
  llegar), no solo cuando el rostro falla. Igual se cruza con la cara: se espera el veredicto del rostro antes
  de decidir, asi que mostrar la foto del QR de otra persona termina en recepcion.

Uso:  python qr_lector.py --camara 0            # visor: recuadro verde = pase valido, rojo = invalido (q: salir)
      python qr_lector.py --autotest            # pruebas sin camara
Pase de prueba: python ../robotA/vision/qr_pass.py --tipo invitado --id invitado_1 --nombre "Laura Diaz"
"""
import argparse
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get('CERBERUS_VISION', (ROOT.parent if (ROOT.parent / 'vision').is_dir() else ROOT.parent / 'robotA') / 'vision'))))  # repo del equipo: robotB dentro de el, o al lado (../robotA)
import qr_pass  # noqa: E402
from session import Session  # noqa: E402
from verify import next_step  # noqa: E402

_DETECTOR = (getattr(cv2, 'QRCodeDetectorAruco', None) or cv2.QRCodeDetector)()
ZOOM = 3                # un QR que se ubica pero no se lee se reintenta recortado y ampliado


def read_all(frame):
    """Todos los QR legibles del frame -> [dict(text, points 4x2 en pixeles del frame)].
    Una pasada barata sobre el frame (~14 ms a 1280x720); solo se amplia el recorte de un QR ubicado y no leido."""
    if frame is None or frame.size == 0:
        return []
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if frame.ndim == 3 else frame
    try:
        _, texts, points, _ = _DETECTOR.detectAndDecodeMulti(gray)
    except cv2.error:
        return []
    found = []
    for t, p in zip(texts or (), points if points is not None else ()):
        p = np.asarray(p, np.float32)
        if not t:
            x0, y0 = np.maximum(p.min(0) - 0.15 * np.ptp(p, 0), 0).astype(int)
            x1, y1 = (p.max(0) + 0.15 * np.ptp(p, 0)).astype(int)
            crop = cv2.resize(gray[y0:y1, x0:x1], None, fx=ZOOM, fy=ZOOM, interpolation=cv2.INTER_CUBIC)
            try:
                t = _DETECTOR.detectAndDecode(crop)[0] if crop.size else ''
            except cv2.error:
                t = ''
        if t:
            found.append(dict(text=t, points=p))
    return found


def read(frame):
    """Texto del primer QR visible, o None (misma firma que qr_pass.read)."""
    found = read_all(frame)
    return found[0]['text'] if found else None


qr_pass.read = read     # la Session de robotA llama a qr_pass.read en su etapa QR: que use este lector


class SesionCaraQR(Session):
    QR_EVERY = 2        # en la etapa de rostro se busca QR 1 de cada 2 frames (~14 ms cada vez)

    def reset(self):
        super().reset()
        self.pending_qr, self.n = None, 0

    def feed(self, frame, now):
        self.n += 1
        if self.stage == 'rostro' and self.pending_qr is None and self.n % self.QR_EVERY == 0:
            text = read(frame)
            if text:
                self.pending_qr = qr_pass.validate(text)
        super().feed(frame, now)
        # Hace falta un veredicto de la cara para cruzarlo con el pase (sin cara, sigue la escalera normal de robotA).
        ready = self.verdict is not None and self.verdict.state != 'SIN_ROSTRO'
        if self.pending_qr and ready and (self.stage != 'fin' or self.result['metodo'] == 'rostro'):
            qr, self.pending_qr = self.pending_qr, None
            self._finish('qr', next_step(self.verdict, self.retries, qr=qr, cal=self.cal), qr)
        elif self.pending_qr and self.stage == 'rostro':
            self.message = 'Pase leido. Mire a la camara un momento, por favor.'
        return self.message


def viewer(cam):
    from camera import open_camera
    cap, _ = open_camera(cam)
    last = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        for q in read_all(frame):
            v = qr_pass.validate(q['text'])
            color = (0, 200, 0) if v['ok'] else (0, 0, 255)
            pts = q['points'].astype(np.int32)
            cv2.polylines(frame, [pts], True, color, 3)
            label = f"{v.get('tipo', '?')}: {v.get('nombre', '')} [{v['motivo']}]"
            cv2.putText(frame, label, tuple(pts[0]), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            if q['text'] != last:
                print(v, flush=True)
                last = q['text']
        cv2.imshow('Cerberus - QR (q: salir)', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cap.release()
    cv2.destroyAllWindows()


def autotest():
    from verify import Verdict
    text = qr_pass.make_pass('invitado', 'invitado_1', 'Laura Diaz')
    other = qr_pass.make_pass('externo', 'externo_1', 'Luis Pena')
    bg = np.random.default_rng(0).integers(90, 160, (720, 1280, 3), np.uint8)

    def put(frame, t, size, x, y=300):                      # como lo ve una camara: reducido y un poco borroso
        c = cv2.GaussianBlur(cv2.resize(qr_pass.to_image(t, 10), (size, size), interpolation=cv2.INTER_AREA), (0, 0), 1.0)
        frame[y:y + size, x:x + size] = cv2.cvtColor(c, cv2.COLOR_GRAY2BGR)
        return frame

    # El pase es denso (45 modulos con borde): desde ~150 px se lee siempre (borde ~130); el de robotA pedia ~230 px.
    for size in (150, 200, 300):
        assert read(put(bg.copy(), text, size, 500)) == text, f'no leyo el QR de {size}px'
    two = put(put(bg.copy(), text, 240, 100, 200), other, 240, 700, 200)
    assert {q['text'] for q in read_all(two)} == {text, other}, 'no leyo dos QR a la vez'
    assert read(bg) is None and read(None) is None
    t0 = time.time()
    for _ in range(10):
        read(bg)
    print(f'  frame sin QR: {(time.time() - t0) * 100:.0f} ms')

    class Fake:                                             # Session sin camara: solo probamos el cruce cara + QR
        def __init__(self, state, pid):
            self.v = Verdict(state, pid, pid, 0.9)
    good = qr_pass.validate(text)
    expired = qr_pass.validate(qr_pass.make_pass('invitado', 'invitado_1', 'Laura Diaz', horas=-1))
    cal = {'cos_reject': 0.44, 'cos_sure': 0.58}
    assert next_step(Fake('PROBABLE', 'invitado_1').v, qr=good, cal=cal) == 'continuar'        # cara dudosa + pase
    assert next_step(Fake('RECONOCIDO', 'personal_1').v, qr=good, cal=cal) == 'recepcion'      # pase de otra persona
    assert next_step(Fake('RECONOCIDO', 'invitado_1').v, qr=expired, cal=cal) == 'recepcion'   # pase vencido
    print('qr_lector autotest OK')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--camara', type=int, default=0)
    ap.add_argument('--autotest', action='store_true')
    a = ap.parse_args()
    autotest() if a.autotest else viewer(a.camara)


if __name__ == '__main__':
    main()
