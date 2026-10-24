"""Evaluacion del reconocedor y calibracion de umbrales (evidencia para la presentacion).

Uso:  python evaluate.py dataset/                 (dataset propio: una carpeta por persona)
      python evaluate.py ../../datasets/lfw --min 10 --personas 30
Por persona: las primeras --enrolar fotos se enrolan, el resto se usa para probar (fotos no vistas).
Ademas, cada persona se prueba como DESCONOCIDA (sin enrolarla) para medir falsos aceptados.
Escribe calibration.json con: cos_reject (falsos aceptados <= 1%) y cos_sure (aciertos >= 95% por encima).
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from face import CALIBRATION, FaceEngine, Gallery


def embed_folder(engine, folder, limit):
    embs = []
    for p in sorted(Path(folder).iterdir())[:limit]:
        img = cv2.imread(str(p))
        faces = engine.faces(img) if img is not None else []
        if faces:
            embs.append(faces[0]['emb'])
    return embs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--min', type=int, default=4, help='fotos minimas por persona')
    ap.add_argument('--personas', type=int, default=50)
    ap.add_argument('--enrolar', type=int, default=5)
    ap.add_argument('--no-guardar', action='store_true')
    a = ap.parse_args()

    engine = FaceEngine()
    people = [d for d in sorted(Path(a.root).iterdir()) if d.is_dir() and len(list(d.iterdir())) >= a.min][:a.personas]
    data = {d.name: embed_folder(engine, d, 40) for d in people}
    data = {k: v for k, v in data.items() if len(v) > a.enrolar}
    names = list(data)
    print(f'{len(names)} personas, {sum(len(v) for v in data.values())} caras detectadas')

    genuine, impostor, correct, total = [], [], 0, 0
    for out in names:                       # 'out' hace de visitante desconocido
        g = Gallery(path='__no_existe__.npz')
        for n in names:
            if n != out:
                g.add(n, n, data[n][:a.enrolar])
        for emb in data[out][a.enrolar:]:
            impostor.append(float((g.embs @ emb).max()))
    g = Gallery(path='__no_existe__.npz')
    for n in names:
        g.add(n, n, data[n][:a.enrolar])
    cal_open = {'cos_reject': -1.0, 'cos_sure': 1.0}
    for n in names:
        for emb in data[n][a.enrolar:]:
            r = g.identify(emb, cal_open)
            genuine.append(r['cos'])
            correct += r['person_id'] == n
            total += 1
    genuine, impostor = np.array(genuine), np.array(impostor)

    cos_reject = float(np.quantile(impostor, 0.99))             # <=1% de desconocidos pasa
    cos_sure = float(max(np.quantile(genuine, 0.05), cos_reject + 0.05))
    print(f'identificacion top-1 (sin umbral): {correct}/{total} = {correct / total:.1%}')
    print(f'{"umbral":>7} | {"aciertos (genuinos >=)":>22} | {"falsos aceptados":>16}')
    for th in sorted({0.30, 0.363, 0.40, 0.45, 0.50, round(cos_reject, 3), round(cos_sure, 3)}):
        print(f'{th:7.3f} | {np.mean(genuine >= th):22.1%} | {np.mean(impostor >= th):16.1%}')
    print(f'calibrado: cos_reject={cos_reject:.3f} (FAR 1%)  cos_sure={cos_sure:.3f}')
    if not a.no_guardar:
        CALIBRATION.write_text(json.dumps({'cos_reject': round(cos_reject, 3), 'cos_sure': round(cos_sure, 3),
                                           'fuente': str(a.root), 'personas': len(names),
                                           'top1': round(correct / total, 4)}, indent=2))
        print(f'-> {CALIBRATION}')


if __name__ == '__main__':
    main()
