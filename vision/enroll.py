"""Enrolamiento del dataset propio (REAL). Solo personas que dieron consentimiento.

Uso:  python enroll.py --id ana --nombre "Ana Perez" --consentimiento --camara 0      (toma 15 fotos)
      python enroll.py --id ana --nombre "Ana Perez" --consentimiento --carpeta fotos/ana
      python enroll.py --id ana --nombre "Ana Perez" --consentimiento --camara 0 --validacion -n 8   (fotos de prueba)
Guarda las fotos en dataset/<id>/ (fuera de git) y los embeddings en gallery.npz.
"""
import argparse
import time
from pathlib import Path

import cv2

from camera import open_camera
from face import HERE, FaceEngine, Gallery

DATASET = HERE / 'dataset'
VALIDATION = HERE / 'validacion'


def face_patch(img, box, margin=0.6):
    """Recorte de la cara con margen (para re-detectarla al evaluar) en vez de la foto completa."""
    x, y, w, h = box
    m = int(max(w, h) * margin)
    return img[max(y - m, 0):y + h + m, max(x - m, 0):x + w + m]


def from_camera(engine, cam, n, out_dir):
    cap, _ = open_camera(cam)
    embs, last = [], 0.0
    while len(embs) < n:
        ok, frame = cap.read()
        if not ok:
            raise SystemExit('no se pudo leer la camara')
        faces = engine.faces(frame)
        view = frame.copy()
        if len(faces) == 1 and faces[0]['score'] > 0.9 and time.time() - last > 0.4:
            f = faces[0]
            cv2.imwrite(str(out_dir / f'{len(embs):02d}.jpg'), face_patch(frame, f['box']))
            embs.append(f['emb'])
            last = time.time()
        for f in faces:
            x, y, w, h = f['box']
            cv2.rectangle(view, (x, y), (x + w, y + h), (0, 200, 0) if len(faces) == 1 else (0, 0, 255), 2)
        cv2.putText(view, f'{len(embs)}/{n}  mueve un poco la cabeza  (q: salir)', (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.imshow('Enrolamiento', view)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cap.release()
    cv2.destroyAllWindows()
    return embs


def from_folder(engine, folder, out_dir):
    embs = []
    for p in sorted(Path(folder).iterdir()):
        img = cv2.imread(str(p))
        faces = engine.faces(img) if img is not None else []
        if not faces:
            print(f'  sin cara: {p.name}')
            continue
        cv2.imwrite(str(out_dir / f'{len(embs):02d}.jpg'), face_patch(img, faces[0]['box']))
        embs.append(faces[0]['emb'])
    return embs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--nombre', required=True)
    ap.add_argument('--consentimiento', action='store_true', help='la persona acepto ser parte del dataset')
    ap.add_argument('--camara', type=int)
    ap.add_argument('--carpeta')
    ap.add_argument('-n', type=int, default=15)
    ap.add_argument('--validacion', action='store_true',
                    help='solo guarda fotos de prueba en validacion/<id>/ (no entran a la galeria): sirven para medir precision')
    a = ap.parse_args()
    if not a.consentimiento:
        raise SystemExit('Falta --consentimiento: solo se enrola a quien acepto (condicion 2 del reto).')
    out_dir = (VALIDATION if a.validacion else DATASET) / a.id
    out_dir.mkdir(parents=True, exist_ok=True)
    engine = FaceEngine()
    embs = from_folder(engine, a.carpeta, out_dir) if a.carpeta else from_camera(engine, a.camara or 0, a.n, out_dir)
    if not embs:
        raise SystemExit('no se capturo ninguna cara')
    if a.validacion:
        print(f'{a.nombre}: {len(embs)} fotos de validacion -> {out_dir} (no se agregaron a la galeria)')
        return
    g = Gallery()
    g.add(a.id, a.nombre, embs)
    g.save()
    print(f'{a.nombre}: {len(embs)} fotos -> {out_dir} | galeria: {len(g.people())} personas')


if __name__ == '__main__':
    main()
