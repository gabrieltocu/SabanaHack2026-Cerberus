"""Captura del dataset facial de Cerberus (integrantes del equipo) SIN sobreajuste: MacBook (camara), iPhone (fotos/videos) y frames del X2.

Problema que resuelve: un video a 30 fps da cientos de frames casi iguales; si entran todos a la galeria, una
persona "pesa" mas que otra y las pruebas salen infladas (se prueba con la misma foto con la que se enrolo).
Deteccion: YOLO publico preentrenado (yolo_face.py) + SFace. Aqui cada candidato pasa calidad (vision/quality.py) y luego se eligen los N MAS DISTINTOS entre si
(muestreo del punto mas lejano sobre embeddings SFace); los casi-duplicados (coseno >= DUP_COS) se descartan.
La validacion se toma en OTRA sesion y se descarta lo que se parezca demasiado a lo enrolado (fuga).

Uso (desde robotB/, con el venv activo):
  python captura/capturar.py camara   --id ana --nombre "Ana Perez"                 # Mac, ~25 s guiados
  python captura/capturar.py camara   --id ana --nombre "Ana Perez" --validacion -n 8
  python captura/capturar.py importar --id ana --nombre "Ana Perez" ~/Desktop/ana_iphone/
  python captura/capturar.py importar --id ana --nombre "Ana Perez" --validacion clip2.MOV
  python captura/capturar.py evaluar                                   # galeria=dataset/, prueba=validacion/
Cada persona queda con a lo sumo -n fotos en total (todas las fuentes suman): mismo peso para todos.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VISION = Path(os.environ.get('CERBERUS_VISION', (ROOT.parent if (ROOT.parent / 'vision').is_dir() else ROOT.parent / 'robotA') / 'vision'))  # repo del equipo: robotB dentro de el, o al lado (../robotA)
sys.path.insert(0, str(VISION))
from camera import open_camera  # noqa: E402
from enroll import face_patch  # noqa: E402
from face import Gallery, load_calibration  # noqa: E402
from quality import assess  # noqa: E402
sys.path.insert(0, str(ROOT))
from yolo_face import YoloFaceEngine  # noqa: E402

DATOS = Path(os.environ.get('CERBERUS_DATOS', ROOT / 'datos'))   # las pruebas usan una carpeta temporal
DATASET, VALIDACION = DATOS / 'dataset', DATOS / 'validacion'
GALERIA, CALIBRACION = DATOS / 'gallery.npz', DATOS / 'calibration.json'
SURE_CAP = 0.60         # tope de cos_sure (ver evaluate)
OTHER_COS = 0.438       # una toma tan parecida a OTRA persona registrada es esa persona (= cos_reject de LFW)
SELF_COS = 0.30         # una toma que no se parece al resto de la captura es de alguien mas
DUP_COS = 0.93          # coseno SFace >= esto = misma toma (frames seguidos de un video dan 0.95-0.99)
VIDEO_FPS = 4           # frames por segundo que se miran de un video
IMG_EXT = {'.jpg', '.jpeg', '.png', '.bmp'}
VIDEO_EXT = {'.mov', '.mp4', '.m4v', '.avi'}
PROMPTS = ['Mire de frente', 'Gire un poco a SU izquierda', 'Gire un poco a SU derecha', 'Mire un poco arriba',
           'Mire un poco abajo', 'Sonria', 'Acerquese un poco', 'De un paso atras']
PROMPT_S = 3.0


def candidate(engine, img, source):
    """-> dict(emb, patch, yaw, source) si hay UNA cara de buena calidad; si no, None."""
    faces = engine.faces(img)
    if len(faces) != 1 or faces[0]['score'] < 0.9:
        return None
    q = assess(img, faces[0])
    if not q['ok']:
        return None
    return dict(emb=faces[0]['emb'], patch=face_patch(img, faces[0]['box']), yaw=q['metrics']['yaw'], source=source)


def select_diverse(cands, n, seed_embs=(), dup_cos=DUP_COS):
    """Muestreo del punto mas lejano: elige hasta n candidatos maximizando la distancia al conjunto ya elegido
    (seed_embs = lo que la persona ya tiene). Nunca elige uno con coseno >= dup_cos a algo elegido."""
    chosen, pool = [], list(cands)
    ref = [np.asarray(e, np.float32) for e in seed_embs]
    if not ref and pool:                                    # arranca por la toma mas de frente
        chosen.append(pool.pop(min(range(len(pool)), key=lambda i: abs(pool[i]['yaw']))))
        ref.append(chosen[0]['emb'])
    while pool and len(chosen) < n:
        sims = np.max(np.array([c['emb'] for c in pool]) @ np.array(ref).T, axis=1)
        i = int(np.argmin(sims))
        if sims[i] >= dup_cos:
            break                                           # lo que queda es repetido
        chosen.append(pool.pop(i))
        ref.append(chosen[-1]['emb'])
    return chosen


def drop_intruders(cands, others, ref=()):
    """Saca las tomas que no son de la persona que se enrola (alguien mas paso frente a la camara).
    others: {id: embeddings} de las demas personas registradas -> fuera si se parece a una (>= OTHER_COS).
    ref: fotos que ya tiene la persona; si no tiene, manda la mayoria de la propia captura -> fuera si su
    mediana de similitud con esa referencia es < SELF_COS. -> (tomas que quedan, {id parecido: cuantas})."""
    kept, who = [], {}
    for c in cands:
        best = max(((float(np.max(e @ c['emb'])), pid) for pid, e in others.items() if len(e)), default=(-1.0, None))
        if best[0] >= OTHER_COS:
            who[best[1]] = who.get(best[1], 0) + 1
        else:
            kept.append(c)
    base = [np.asarray(e) for e in ref] or [c['emb'] for c in kept]
    if len(base) >= 3:
        B = np.array(base)
        own = [c for c in kept if float(np.median(B @ c['emb'])) >= SELF_COS]
        if len(kept) - len(own):
            who['?'] = len(kept) - len(own)
        kept = own
    return kept, who


def folder_embs(engine, folder):
    out = []
    for p in sorted(folder.glob('*.jpg')) if folder.exists() else []:
        faces = engine.faces(cv2.imread(str(p)))
        if faces:
            out.append(faces[0]['emb'])
    return out


def from_camera(engine, cam):
    cap, _ = open_camera(cam)
    cands, last = [], 0.0
    for k, prompt in enumerate(PROMPTS):
        t0 = time.time()
        while time.time() - t0 < PROMPT_S:
            ok, frame = cap.read()
            if not ok:
                raise SystemExit('no se pudo leer la camara')
            if time.time() - last > 0.2:
                last = time.time()
                c = candidate(engine, frame, f'camara:{prompt}')
                if c:
                    cands.append(c)
            view = cv2.flip(frame, 1)                       # espejo solo para mostrar: se guarda sin voltear
            cv2.putText(view, f'{k + 1}/{len(PROMPTS)} {prompt}', (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            cv2.putText(view, f'candidatos {len(cands)}  (q: salir)', (10, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.imshow('Captura Cerberus', view)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                cap.release()
                cv2.destroyAllWindows()
                return cands
    cap.release()
    cv2.destroyAllWindows()
    return cands


def read_image(p, tmp):
    if p.suffix.lower() in ('.heic', '.heif'):              # fotos de iPhone: sips (macOS) o heif-convert (Linux)
        out = Path(tmp) / (p.stem + '.jpg')
        if shutil.which('sips'):
            cmd = ['sips', '-s', 'format', 'jpeg', str(p), '--out', str(out)]
        elif shutil.which('heif-convert') or shutil.which('heif-dec'):
            cmd = [shutil.which('heif-convert') or shutil.which('heif-dec'), str(p), str(out)]
        else:
            raise SystemExit('para fotos HEIC: sudo apt install libheif-examples (o exporte las fotos como JPG)')
        subprocess.run(cmd, check=True, capture_output=True)
        p = out
    return cv2.imread(str(p))


def from_paths(engine, paths):
    files = []
    for p in map(Path, paths):
        files += sorted(f for f in p.rglob('*') if f.is_file()) if p.is_dir() else [p]
    cands = []
    with tempfile.TemporaryDirectory() as tmp:
        for f in files:
            ext = f.suffix.lower()
            if ext in VIDEO_EXT:
                cap = cv2.VideoCapture(str(f))             # OpenCV aplica la rotacion del iPhone
                step = max(int(round((cap.get(cv2.CAP_PROP_FPS) or 30) / VIDEO_FPS)), 1)
                i, before = 0, len(cands)
                while True:
                    ok = cap.grab()
                    if not ok:
                        break
                    if i % step == 0:
                        ok, frame = cap.retrieve()
                        c = candidate(engine, frame, f'{f.name}#{i}') if ok else None
                        if c:
                            cands.append(c)
                    i += 1
                cap.release()
                print(f'  {f.name}: {i} frames, {len(cands) - before} candidatos')
            elif ext in IMG_EXT or ext in ('.heic', '.heif'):
                img = read_image(f, tmp)
                c = candidate(engine, img, f.name) if img is not None else None
                if c:
                    cands.append(c)
                else:
                    print(f'  descartada (sin cara unica o mala calidad): {f.name}')
    return cands


def save_person(engine, a, cands):
    out_dir = (VALIDACION if a.validacion else DATASET) / a.id
    out_dir.mkdir(parents=True, exist_ok=True)
    have = folder_embs(engine, out_dir)
    if a.validacion:                                        # fuga: no probar con tomas casi iguales a las enroladas
        enrolled = folder_embs(engine, DATASET / a.id)
        if enrolled:
            ref = np.array(enrolled)
            n0 = len(cands)
            cands = [c for c in cands if float(np.max(ref @ c['emb'])) < DUP_COS]
            if n0 - len(cands):
                print(f'  {n0 - len(cands)} candidatos descartados por parecerse demasiado al enrolamiento')
    g = Gallery(GALERIA)
    others = {pid: g.embs[np.array(g.ids) == pid] for pid in set(g.ids) if pid != a.id}
    cands, intruders = drop_intruders(cands, others, ref=folder_embs(engine, DATASET / a.id))
    if intruders:
        print(f'  descartadas por no ser {a.id}: {intruders}  (alguien mas paso frente a la camara)')
    picked = select_diverse(cands, a.n - len(have), seed_embs=have)
    start = 1 + max((int(f.stem) for f in out_dir.glob('*.jpg') if f.stem.isdigit()), default=-1)   # nunca pisar una foto
    for k, c in enumerate(picked):
        cv2.imwrite(str(out_dir / f'{start + k:02d}.jpg'), c['patch'])
    total = len(have) + len(picked)
    print(f'{a.nombre}: {len(cands)} candidatos -> {len(picked)} nuevas distintas, {total}/{a.n} en {out_dir}')
    if total < a.n:
        print('  FALTAN variaciones: grabe otra toma con otra luz, angulo, gafas o peinado.')
    if not a.validacion:
        g = Gallery(GALERIA)
        g.add(a.id, a.nombre, folder_embs(engine, out_dir))   # la galeria sale siempre de las fotos guardadas
        g.save()
        print(f'  galeria: {len(g.people())} personas -> {GALERIA}')
    return dict(id=a.id, split='validacion' if a.validacion else 'enrolamiento', candidatos=len(cands),
                nuevas=len(picked), total=total, objetivo=a.n, faltan_variaciones=total < a.n, carpeta=str(out_dir),
                descartadas_otra_persona=intruders)


def export_yolo():
    """datos/yolo/{train,val}/<id>/*.jpg: formato de clasificacion de Ultralytics (una carpeta por persona).
    train = enrolamiento, val = validacion (otra sesion). Se rehace completo cada vez desde las fotos guardadas."""
    out = DATOS / 'yolo'
    shutil.rmtree(out, ignore_errors=True)
    counts = {}
    for split, src in (('train', DATASET), ('val', VALIDACION)):
        for d in sorted(src.iterdir()) if src.exists() else []:
            files = sorted(d.glob('*.jpg'))
            if files:
                (out / split / d.name).mkdir(parents=True, exist_ok=True)
                for f in files:
                    shutil.copy2(f, out / split / d.name / f.name)
                counts.setdefault(d.name, {})[split] = len(files)
    return dict(carpeta=str(out), personas=counts)


def evaluate(engine):
    """Galeria = dataset/, prueba = validacion/ (sesiones distintas). Calibra umbrales y escribe calibration.json."""
    data = {d.name: folder_embs(engine, d) for d in sorted(VALIDACION.iterdir()) if d.is_dir()} if VALIDACION.exists() else {}
    g = Gallery(GALERIA)
    data = {k: v for k, v in data.items() if v and k in g.ids}
    if len(data) < 2:
        raise ValueError('se necesitan al menos 2 personas con enrolamiento y validacion')
    open_cal = {'cos_reject': -1.0, 'cos_sure': 1.0}
    ids = np.array(g.ids)
    genuine, impostor, hits, total, per_person = [], [], 0, 0, {}
    for pid, embs in data.items():
        others, mine = g.embs[ids != pid], g.embs[ids == pid]
        ok = sum(g.identify(e, open_cal)['person_id'] == pid for e in embs)
        genuine += [float(np.max(mine @ e)) for e in embs]
        impostor += [float(np.max(others @ e)) for e in embs]   # la misma persona como si no estuviera enrolada
        hits, total = hits + ok, total + len(embs)
        per_person[pid] = f'{ok}/{len(embs)}'
        print(f'  {pid}: {ok}/{len(embs)}')
    genuine, impostor = np.array(genuine), np.array(impostor)
    lfw = load_calibration()['cos_reject']
    # shortcut: con 5-10 personas el q99 de impostores es ruidoso; nunca bajamos del umbral calibrado en LFW
    cos_reject = max(float(np.quantile(impostor, 0.99)), lfw)
    # El q05 de fotos de validacion limpias queda muy alto (con 2 personas dio 0.757 y en vivo una mano ya lo tumbaba):
    # se topa en SURE_CAP, que sigue muy por encima de los impostores medidos, y nunca a menos de 0.10 de cos_reject.
    cos_sure = max(cos_reject + 0.10, min(float(np.quantile(genuine, 0.05)), SURE_CAP))
    print(f'top-1: {hits}/{total} = {hits / total:.1%}  | genuinos >= reject: {np.mean(genuine >= cos_reject):.1%}'
          f'  | impostores aceptados: {np.mean(impostor >= cos_reject):.1%}')
    print(f'cos_reject={cos_reject:.3f} (LFW {lfw:.3f})  cos_sure={cos_sure:.3f}')
    cal = {'cos_reject': round(cos_reject, 3), 'cos_sure': round(cos_sure, 3),
           'fuente': 'dataset propio (validacion en otra sesion)', 'personas': len(data), 'top1': round(hits / total, 4)}
    CALIBRACION.write_text(json.dumps(cal, indent=2))
    print(f'-> {CALIBRACION}')
    return dict(cal, por_persona=per_person, genuinos_aceptados=round(float(np.mean(genuine >= cos_reject)), 4),
                impostores_aceptados=round(float(np.mean(impostor >= cos_reject)), 4))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('camara', 'importar'):
        s = sub.add_parser(name)
        s.add_argument('--id', required=True)
        s.add_argument('--nombre', required=True)
        s.add_argument('--validacion', action='store_true', help='fotos de prueba (otra sesion), no entran a la galeria')
        s.add_argument('-n', type=int, help='fotos en total por persona (15 enrolamiento, 8 validacion)')
    sub.choices['camara'].add_argument('--camara', type=int, default=0, help='0 = Mac; el iPhone (Continuity) suele ser 1')
    sub.choices['importar'].add_argument('rutas', nargs='+', help='fotos, videos o carpetas (iPhone, X2)')
    sub.add_parser('evaluar')
    a = ap.parse_args()
    engine = YoloFaceEngine()                              # el mismo detector que usa el robot: embeddings comparables
    if a.cmd == 'evaluar':
        try:
            return evaluate(engine)
        except ValueError as e:
            raise SystemExit(str(e))
    if not a.id.replace('_', '').isalnum() or not a.id.isascii():
        raise SystemExit('id sin espacios ni tildes (ana, maria_p)')
    a.n = a.n or (8 if a.validacion else 15)
    cands = from_camera(engine, a.camara) if a.cmd == 'camara' else from_paths(engine, a.rutas)
    if not cands:
        raise SystemExit('ninguna cara util (una sola persona en cuadro, buena luz, de frente)')
    save_person(engine, a, cands)


if __name__ == '__main__':
    main()
