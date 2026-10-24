"""Diagnostico de calidad: POR QUE no se puede reconocer a alguien, y que pedirle para corregirlo.

Umbrales calibrados en LFW (300 caras nitidas vs las mismas desenfocadas): ver Obsidian
raw/sabanahack2026/2026-10-23-vision-fallback.md.
"""
import cv2
import numpy as np

MIN_FACE_PX = 80        # lado minimo de la cara (SFace trabaja a 112 px)
DARK, BRIGHT = 55, 190  # brillo medio de la cara (LFW: p1=73, p99=161)
MIN_SHARP = 50          # varianza del Laplaciano a 112 px con contraste normalizado (nitida p5=60; blur 9x9 p95=44;
                        # oscura p5=101: la poca luz ya no se confunde con imagen movida)
MIN_DET_SCORE = 0.85    # confianza de deteccion (cara despejada p5=0.91): menos => parcialmente cubierta
MAX_YAW = 0.35          # desplazamiento de la nariz respecto al centro de los ojos / distancia entre ojos

HINTS = {
    'lejos': 'Acerquese un poco, por favor',
    'oscuro': 'De un paso hacia la luz, por favor',
    'contraluz': 'Hay mucha luz detras; acerquese un poco',
    'movido': 'Quedese quieto un segundo, por favor',
    'perfil': 'Mire hacia mi pantalla, por favor',
    'cubierto': 'Podria retirarse un momento las gafas o la gorra?',
}


def yaw_ratio(lm):
    """~0 de frente; |valor| grande = de perfil (nariz corrida hacia un lado)."""
    right_eye, left_eye, nose = lm[0], lm[1], lm[2]
    eye_dist = max(np.linalg.norm(left_eye - right_eye), 1e-6)
    return float((nose[0] - (right_eye[0] + left_eye[0]) / 2) / eye_dist)


def assess(img, face):
    """-> dict(ok, reasons: [codigos], hints: [frases], metrics)."""
    x, y, w, h = face['box']
    crop = img[max(y, 0):y + h, max(x, 0):x + w]
    gray = cv2.resize(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), (112, 112)) if crop.size else np.zeros((112, 112), np.uint8)
    norm = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    m = dict(size=min(w, h), brightness=float(gray.mean()), sharpness=float(cv2.Laplacian(norm, cv2.CV_64F).var()),
             yaw=yaw_ratio(face['lm']), score=face['score'])
    reasons = []
    if m['size'] < MIN_FACE_PX:
        reasons.append('lejos')
    if m['brightness'] < DARK:
        reasons.append('oscuro')
    elif m['brightness'] > BRIGHT:
        reasons.append('contraluz')
    if m['sharpness'] < MIN_SHARP and 'lejos' not in reasons:   # lejos ya explica la falta de detalle
        reasons.append('movido')
    if abs(m['yaw']) > MAX_YAW:
        reasons.append('perfil')
    if m['score'] < MIN_DET_SCORE:
        reasons.append('cubierto')
    return dict(ok=not reasons, reasons=reasons, hints=[HINTS[r] for r in reasons], metrics=m)
