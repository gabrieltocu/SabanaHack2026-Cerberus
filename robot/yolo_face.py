"""Detector YOLO (modelo publico preentrenado yolov11n-face, akanametov/yolo-face, WIDER FACE) delante del
reconocedor SFace de robotA. Misma interfaz que robotA/vision/face.FaceEngine: faces(img) -> lista de
dict(box, score, lm, emb), la cara mas grande primero. Asi Session, quality y Gallery funcionan sin cambios.

YOLO encuentra la cara (mejor que YuNet lejos, de lado o con poca luz); YuNet corre solo dentro de ese recorte
para dar los 5 puntos que SFace necesita para alinear. `score` es el de YuNet en el recorte porque los
umbrales de quality.py estan calibrados con el; la confianza de YOLO queda en `yolo`.

Pesos: curl -L -o modelos/yolov11n-face.pt https://github.com/akanametov/yolo-face/releases/download/1.0.0/yolov11n-face.pt
"""
import os
import sys
import warnings
from pathlib import Path

import numpy as np

# numpy para Python 3.10 en macOS (BLAS Accelerate) avisa divide/overflow en matmul float32 con datos finitos y
# resultado correcto (probado contra float64); sin esto cada frame de Gallery.identify llena la consola.
warnings.filterwarnings('ignore', message='.*encountered in matmul', category=RuntimeWarning)

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(Path(os.environ.get('CERBERUS_VISION', (ROOT.parent if (ROOT.parent / 'vision').is_dir() else ROOT.parent / 'robotA') / 'vision'))))  # repo del equipo: robotB dentro de el, o al lado (../robotA)
from face import FaceEngine  # noqa: E402

WEIGHTS = ROOT / 'modelos' / 'yolov11n-face.pt'
YOLO_CONF = 0.5
MARGIN = 0.35           # recorte alrededor de la caja de YOLO para que YuNet vea la cara completa


class YoloFaceEngine(FaceEngine):
    def __init__(self, weights=WEIGHTS, det_score=0.5):
        super().__init__(det_score=det_score)              # YuNet mas permisivo: YOLO ya confirmo que hay cara
        from ultralytics import YOLO
        if not Path(weights).exists():
            raise SystemExit(f'faltan los pesos YOLO en {weights} (ver docstring de yolo_face.py)')
        self.yolo = YOLO(str(weights))

    def faces(self, img):
        if img is None:
            return []
        H, W = img.shape[:2]
        res = self.yolo.predict(img, conf=YOLO_CONF, verbose=False)[0]
        out = []
        for (x1, y1, x2, y2), conf in zip(res.boxes.xyxy.cpu().numpy(), res.boxes.conf.cpu().numpy()):
            m = MARGIN * max(x2 - x1, y2 - y1)
            cx1, cy1 = int(max(x1 - m, 0)), int(max(y1 - m, 0))
            crop = img[cy1:int(min(y2 + m, H)), cx1:int(min(x2 + m, W))]
            if crop.size == 0:
                continue
            inner = super().faces(crop)                      # YuNet + SFace dentro del recorte
            if not inner:
                continue                                     # sin puntos no se puede alinear: no sirve para reconocer
            f = inner[0]
            bx, by, bw, bh = f['box']
            f['box'] = (bx + cx1, by + cy1, bw, bh)
            f['lm'] = f['lm'] + np.array([cx1, cy1], np.float32)
            f['yolo'] = float(conf)
            out.append(f)
        return sorted(out, key=lambda f: -f['box'][2] * f['box'][3])
