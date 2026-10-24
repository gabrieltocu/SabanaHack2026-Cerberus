"""Reconocimiento facial propio (REAL): YuNet detecta la cara, SFace la convierte en un embedding de 128-D
normalizado y la galeria (dataset propio del equipo) la identifica por similitud coseno.

Solo se guardan embeddings en la galeria; las fotos del dataset quedan en dataset/ (fuera de git).
"""
import json
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
MODELS = HERE / 'models'
GALLERY = HERE / 'gallery.npz'
CALIBRATION = HERE / 'calibration.json'

# Umbral de coseno de SFace recomendado por OpenCV para "misma persona". Se reemplaza por el calibrado
# (evaluate.py escribe calibration.json) cuando existe.
DEFAULT_CAL = {'cos_reject': 0.363, 'cos_sure': 0.50}


def load_calibration():
    return {**DEFAULT_CAL, **json.loads(CALIBRATION.read_text())} if CALIBRATION.exists() else dict(DEFAULT_CAL)


def confidence(cos, cal):
    """Coseno -> confianza 0..1 para el cerebro: cos_reject = 0.60 (zona de pregunta), cos_sure = 0.85 (actuar).
    ponytail: mapa lineal por tramos con dos anclas calibradas; cambiar por regresion logistica si hace falta."""
    lo, hi = cal['cos_reject'], cal['cos_sure']
    if cos >= hi:
        return float(min(0.85 + 0.15 * (cos - hi) / max(1 - hi, 1e-6), 1.0))
    if cos >= lo:
        return float(0.60 + 0.25 * (cos - lo) / max(hi - lo, 1e-6))
    return float(max(0.60 * cos / max(lo, 1e-6), 0.0))


class FaceEngine:
    def __init__(self, det_score=0.8):
        self.det = cv2.FaceDetectorYN.create(str(MODELS / 'face_detection_yunet_2023mar.onnx'), '', (320, 320), det_score)
        self.rec = cv2.FaceRecognizerSF.create(str(MODELS / 'face_recognition_sface_2021dec.onnx'), '')

    def faces(self, img):
        """Caras de la imagen, la mas grande primero: lista de dict(box=(x,y,w,h), score, lm, emb).
        lm: 5 puntos (ojo der, ojo izq, nariz, boca der, boca izq) en pixeles de la imagen."""
        h, w = img.shape[:2]
        self.det.setInputSize((w, h))
        _, dets = self.det.detect(img)
        if dets is None:
            return []
        out = []
        for f in sorted(dets, key=lambda f: -f[2] * f[3]):
            emb = self.rec.feature(self.rec.alignCrop(img, f)).flatten().astype(np.float32)
            out.append(dict(box=tuple(int(v) for v in f[:4]), score=float(f[14]), lm=f[4:14].reshape(5, 2).copy(),
                            emb=emb / np.linalg.norm(emb)))
        return out


class Gallery:
    """Embeddings enrolados: ids[i], names[i], embs[i]. Identifica por la mejor similitud por persona."""

    def __init__(self, path=GALLERY):
        self.path = Path(path)
        if self.path.exists():
            z = np.load(self.path, allow_pickle=False)
            self.ids, self.names, self.embs = list(z['ids']), list(z['names']), z['embs']
        else:
            self.ids, self.names, self.embs = [], [], np.zeros((0, 128), np.float32)

    def add(self, person_id, name, embs):
        keep = [i for i, pid in enumerate(self.ids) if pid != person_id]   # re-enrolar reemplaza
        self.ids = [self.ids[i] for i in keep] + [person_id] * len(embs)
        self.names = [self.names[i] for i in keep] + [name] * len(embs)
        self.embs = np.vstack([self.embs[keep], np.asarray(embs, np.float32)])

    def save(self):
        np.savez(self.path, ids=np.array(self.ids), names=np.array(self.names), embs=self.embs)

    def people(self):
        return sorted(set(zip(self.ids, self.names)))

    def identify(self, emb, cal=None):
        """-> dict(person_id|None, name, cos, margin, conf). None si no supera cos_reject."""
        cal = cal or load_calibration()
        if not self.ids:
            return dict(person_id=None, name='desconocido', cos=0.0, margin=0.0, conf=0.0)
        sims = self.embs @ emb
        best = {}
        for pid, name, s in zip(self.ids, self.names, sims):
            if s > best.get(pid, (None, -1))[1]:
                best[pid] = (name, float(s))
        ranked = sorted(best.items(), key=lambda kv: -kv[1][1])
        pid, (name, cos) = ranked[0]
        margin = cos - (ranked[1][1][1] if len(ranked) > 1 else 0.0)
        conf = confidence(cos, cal)
        if cos < cal['cos_reject']:
            return dict(person_id=None, name='desconocido', cos=cos, margin=margin, conf=conf)
        return dict(person_id=pid, name=name, cos=cos, margin=margin, conf=conf)
