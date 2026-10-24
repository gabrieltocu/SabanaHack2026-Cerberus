"""API y paginas web de Cerberus: captura del dataset y prueba de identificacion con registro (log).

Arranque:  conda activate cerberus && python web/app.py      -> http://localhost:8000  (docs de la API: /docs)
Paginas:   /captura      toma los datos con la camara del navegador, guiada por voz, y los deja listos (galeria + YOLO)
           /identificar  con solo ver la cara dice quien es y su rol; cada decision queda en el log
Todo pasa por la API REST (/api/...): las paginas no hacen nada que otro cliente (el robot, un panel) no pueda hacer.

Log: SQLite en datos/registros.db; se descarga en CSV/JSON y cada registro se reenvia por POST JSON a la base de datos
externa configurada (PUT /api/config o variables CERBERUS_DB_URL / CERBERUS_DB_TOKEN). Lo no enviado se reintenta
con POST /api/registros/reenviar.
Solo escucha en 127.0.0.1: son datos biometricos y la API no tiene autenticacion.
"""
import csv
import io
import json
import os
import pty
import re
import shlex
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(Path(__file__).resolve().parent), str(ROOT), str(ROOT / 'captura'), str(ROOT / 'x2')]
import capturar as cap  # noqa: E402  (agrega robotA/vision al path y carga YOLO)
import cerberus_x2  # noqa: E402  (voz del robot: texto -> PCM 16 kHz para /api/tts)
import documentos  # noqa: E402
import textos  # noqa: E402
import voz  # noqa: E402
import qr_lector  # noqa: E402
import rag  # noqa: E402  (preguntas libres -> n8n + DeepSeek, ../rag)
from qr_lector import qr_pass  # noqa: E402
from face import Gallery, confidence, load_calibration  # noqa: E402
from quality import assess  # noqa: E402
from verify import MIN_FRAMES, Obs, Verdict, decide  # noqa: E402

STATIC = Path(__file__).resolve().parent / 'static'
PERSONAS = cap.DATOS / 'personas.json'
DB = cap.DATOS / 'registros.db'
CONFIG = cap.DATOS / 'config.json'
ROLES = ('VIP', 'REGULAR', 'INVITADO', 'PERSONAL', 'EXTERNO')
MAX_CANDS = 400         # tope de candidatos en memoria por captura (~80 s a 5 fps)
LOG_COOLDOWN = 15.0     # s: la misma persona frente a la misma camara no se registra dos veces seguidas
INTENTO_S = float(os.environ.get('CERBERUS_INTENTO_S', 5))   # s intentando reconocer ("retire la mano") antes de pedir documento
MAX_FOTO = 5_000_000    # bytes: tope de la foto de un invitado (base64 o URL)
MODELO = 'yolov11n-face + YuNet(puntos) + SFace 2021dec'
CONFIRM_TTL = 60.0      # s que vive una confirmacion pendiente por QR
# shortcut: umbral fijo para documento + cara no reconocida (SFace: extranos casi siempre < 0.3); calibrarlo con
# los impostores de /api/evaluar cuando haya 10+ personas
DOC_MIN_COS = 0.30
PASE_POR_ROL = {'VIP': 'socio', 'REGULAR': 'socio', 'INVITADO': 'invitado', 'PERSONAL': 'personal', 'EXTERNO': 'externo'}
PASES = Path(os.environ.get('CERBERUS_PASES', ROOT / 'pases'))
IDENT = Path(os.environ.get('CERBERUS_IDENT', ROOT / 'identificacion'))   # fotos de las cedulas, una carpeta por persona
ID_FACES = cap.DATOS / 'identificacion.npz'   # caras recortadas de esas cedulas (embeddings)
IMG_EXT = {'.jpg', '.jpeg', '.png', '.heic', '.heif'}

app = FastAPI(title='Cerberus API', version='1.0',
              description='Captura del dataset facial, identificacion por rol y registro de visitas (Sabana Hack 2026).')
lock = threading.Lock()                 # YOLO/SFace no son seguros entre hilos: un frame a la vez
engine = cap.YoloFaceEngine()
captures = {}                           # (id, split) -> [candidatos]
windows = {}                            # camara -> dict(obs=[...], embs=[...], last={persona: t})
pending = {}                            # id de confirmacion -> dict(candidato, nombre, emb, camara, expira)
camaras = {}                            # camara -> ultimo frame (ya girado), caras y ultima decision: el panel /robot
# girar=: camaras montadas giradas (la RGB-D de la cabeza del X2 entrega la imagen al reves). Sin girarla, YOLO y SFace
# no reconocen a nadie. Grados en sentido horario; lo manda el cliente porque depende de que camara use.
GIROS = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
app.mount('/static', StaticFiles(directory=STATIC), name='static')


@app.middleware('http')
async def no_cache(request, call_next):
    """Paginas y scripts siempre revalidados (ETag, 304 si no cambiaron): tras actualizar el codigo el navegador no se
    queda con un JS viejo que rompe la pagina nueva."""
    response = await call_next(request)
    if not request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-cache'
    return response
cap.DATOS.mkdir(parents=True, exist_ok=True)


# ---------- utilidades ----------

def load_personas():
    return json.loads(PERSONAS.read_text(encoding='utf-8')) if PERSONAS.exists() else {}


def save_personas(p):
    PERSONAS.write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding='utf-8')


def calibration():
    return {**load_calibration(), **(json.loads(cap.CALIBRACION.read_text()) if cap.CALIBRACION.exists() else {})}


def girar(img, grados):
    g = GIROS.get(grados % 360)
    return cv2.rotate(img, g) if g is not None else img


def realzar(img):
    """Frame oscuro (de noche, a contraluz de una ventana): gamma + CLAHE sobre la luminancia, para que YOLO y la
    calidad vean la cara. Con buena luz no se toca."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    media = float(lab[::8, ::8, 0].mean())
    if media >= 70:
        return img
    gamma = 0.5 if media < 40 else 0.7
    l = cv2.LUT(lab[..., 0], (255 * (np.arange(256) / 255) ** gamma).astype(np.uint8))
    lab[..., 0] = cv2.createCLAHE(2.0, (8, 8)).apply(l)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def decode(body):
    img = cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR) if body else None
    if img is None:
        raise HTTPException(400, 'el cuerpo debe ser una imagen JPEG o PNG')
    return img


def valid_id(pid):
    if not re.fullmatch(r'[a-z0-9_]{1,40}', pid):
        raise HTTPException(422, 'id: solo minusculas, numeros y _ (ej. ana_perez)')
    return pid


def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("""CREATE TABLE IF NOT EXISTS registros (
        id TEXT PRIMARY KEY, fecha TEXT, camara TEXT, estado TEXT, persona_id TEXT, nombre TEXT, rol TEXT,
        miembro INTEGER, confianza REAL, coseno REAL, accion TEXT, modelo TEXT, enviado INTEGER DEFAULT 0, error_envio TEXT,
        idioma TEXT)""")
    if 'idioma' not in [r[1] for r in con.execute('PRAGMA table_info(registros)')]:   # bases creadas antes de los idiomas
        con.execute('ALTER TABLE registros ADD COLUMN idioma TEXT')
    return con


def db_config():
    cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
    env = {'url': 'CERBERUS_DB_URL', 'token': 'CERBERUS_DB_TOKEN', 'invitados_url': 'CERBERUS_INVITADOS_URL',
           'invitados_token': 'CERBERUS_INVITADOS_TOKEN'}
    return {k: os.environ.get(v, cfg.get(k, '')) for k, v in env.items()}


def forward(ids):
    """POST JSON de cada registro a la base de datos externa; marca enviado o guarda el error (se reintenta luego)."""
    cfg = db_config()
    if not cfg['url']:
        return
    con = db()
    for rid in ids:
        row = con.execute('SELECT * FROM registros WHERE id = ?', (rid,)).fetchone()
        if row is None:
            continue
        body = {k: row[k] for k in row.keys() if k not in ('enviado', 'error_envio')}
        req = urllib.request.Request(cfg['url'], data=json.dumps(body, ensure_ascii=False).encode(), method='POST',
                                     headers={'Content-Type': 'application/json',
                                              **({'Authorization': f'Bearer {cfg["token"]}'} if cfg['token'] else {})})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                ok, err = 200 <= r.status < 300, None if 200 <= r.status < 300 else f'HTTP {r.status}'
        except Exception as e:                            # red caida, URL mala, 4xx/5xx: queda pendiente
            ok, err = False, str(e)[:300]
        con.execute('UPDATE registros SET enviado = ?, error_envio = ? WHERE id = ?', (int(ok), err, rid))
        con.commit()
    con.close()


def orientation(rol, nombre, lang='es', anfitrion=None):
    return textos.t(lang, f'flujo.{rol}', nombre=(nombre or '').split(' ')[0], anfitrion=anfitrion)


# ---------- Salida (despedida) ----------
# Una visita se abre al registrar la entrada. Si la misma persona deja de verse AUSENTE_S y vuelve a aparecer frente al
# robot pasados SALIDA_MIN_S desde la entrada, va de salida: despedida de su categoria, se cierra la visita y, si era
# invitado, su rostro sale de la galeria (dato biometrico solo para esa visita, Ley 1581). "Adios" por voz: /api/salida.
SALIDA_MIN_S = float(os.environ.get('CERBERUS_SALIDA_MIN_S', 60))
# Apagada por defecto: en la demo la misma persona va y vuelve, y la despedida automatica sobraba (y a un invitado le
# borraba el rostro). La despedida queda por voz ("adios, Juan"). CERBERUS_SALIDA_AUTO=1 la vuelve a prender.
SALIDA_AUTO = os.environ.get('CERBERUS_SALIDA_AUTO') == '1'
AUSENTE_S = float(os.environ.get('CERBERUS_AUSENTE_S', 20))
visitas, vistos = {}, {}       # shortcut: en memoria (se pierden al reiniciar el cerebro); pasar a SQLite si hace falta


def visto(pid, now):
    """La cara de pid aparece en un frame. Si llevaba AUSENTE_S sin verse y tiene la visita abierta, volvio."""
    if pid in visitas and now - vistos.get(pid, now) > AUSENTE_S:
        visitas[pid]['volvio'] = True
    vistos[pid] = now


def va_saliendo(pid, now):
    v = visitas.get(pid)
    return bool(SALIDA_AUTO and v and v.get('volvio') and now - v['entrada'] > SALIDA_MIN_S)


def salida(pid, personas, camara, background, lang='es'):
    """Despedida y registro de la salida (estado SALIDA). Persona desconocida: solo la despedida generica."""
    p = personas.get(pid or '', {})
    rol = effective_role(p)[0] if p else None
    if not rol:
        return {'estado': 'SALIDA', 'sentido': 'sale', 'rol': 'ESCALAMIENTO', 'persona_id': None, 'nombre': 'desconocido',
                'accion': textos.t(lang, 'salida.ESCALAMIENTO'), 'registrado': False, 'pregunta': None}
    nombre = p.get('nombre') or pid
    accion = textos.t(lang, f'salida.{rol}', nombre=nombre.split(' ')[0], trato=p.get('trato') or nombre,
                      hora=datetime.now().strftime('%H:%M'))
    visitas.pop(pid, None)
    record = dict(id=uuid.uuid4().hex, fecha=datetime.now(timezone.utc).isoformat(timespec='seconds'), camara=camara,
                  estado='SALIDA', persona_id=pid, nombre=nombre, rol=rol, miembro=int(rol in ('VIP', 'REGULAR')),
                  confianza=None, coseno=None, accion=accion, modelo=MODELO, idioma=lang)
    out = {**log_record(record, background), 'sentido': 'sale', 'pregunta': None}
    if rol == 'INVITADO':
        delete_persona(pid)                             # su rostro y sus fotos: solo valian para esta visita
        out['rostro_borrado'] = True
    return out


def entrada(pid, now):
    visitas[pid] = {'entrada': now, 'volvio': False}
    vistos[pid] = now


def pregunta(rol, lang='es'):
    """Lo que el robot le pregunta a un socio despues de saludarlo (la respuesta va a /api/voz?contexto=tenis)."""
    return textos.t(lang, 'pregunta.tenis') if rol in ('VIP', 'REGULAR') else None


def effective_role(p):
    """(rol, invitacion_vencida). Un invitado con valido_hasta pasado ya no tiene acceso."""
    rol = p.get('rol')
    hasta = p.get('valido_hasta')
    if rol == 'INVITADO' and hasta:
        try:
            limit = datetime.fromisoformat(hasta)
        except ValueError:
            return rol, False
        limit = limit if limit.tzinfo else limit.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if len(hasta) == 10:                            # solo fecha: vale todo ese dia
            limit = limit.replace(hour=23, minute=59, second=59)
        return rol, datetime.now(timezone.utc) > limit
    return rol, False


# ---------- paginas ----------

@app.get('/', include_in_schema=False)
def home():
    return RedirectResponse('/captura')


@app.get('/captura', include_in_schema=False)
def page_captura():
    return FileResponse(STATIC / 'captura.html')


@app.get('/identificar', include_in_schema=False)
def page_identificar():
    return FileResponse(STATIC / 'identificar.html')


@app.get('/roles', include_in_schema=False)
def page_roles():
    return FileResponse(STATIC / 'roles.html')


@app.get('/confirmar', include_in_schema=False)
def page_confirmar():
    return FileResponse(STATIC / 'confirmar.html')


# ---------- API: personas ----------

class Persona(BaseModel):
    nombre: str
    rol: str
    cedula: str = ''                # opcional: numero de cedula, para identificar con el documento si la cara no basta
    anfitrion: str | None = None    # solo INVITADO: id o nombre del socio que invita (None = no cambiarlo)
    valido_hasta: str | None = None  # solo INVITADO: fecha ISO; '' = sin vencimiento (None = no cambiarlo)


def find_host(personas, text):
    """id del socio (VIP o REGULAR) que coincide con un id o un nombre, o None."""
    t = (text or '').strip().lower()
    return next((k for k, q in personas.items() if q.get('rol') in ('VIP', 'REGULAR') and t in (k, q['nombre'].lower())), None)


@app.get('/api/salud', tags=['sistema'])
def salud():
    g = Gallery(cap.GALERIA)
    return {'ok': True, 'modelo': MODELO, 'personas_en_galeria': len(g.people()), 'calibracion': calibration(),
            'db_externa': bool(db_config()['url']), 'robot_activo': robot_activo()}


@app.get('/api/personas', tags=['personas'])
def list_personas():
    out = []
    for pid, p in sorted(load_personas().items()):
        count = lambda root: len(list((root / pid).glob('*.jpg'))) if (root / pid).exists() else 0
        out.append(dict(id=pid, nombre=p['nombre'], rol=p['rol'], cedula=documentos.mask(p['cedula']) if p.get('cedula') else '',
                        enrolamiento=count(cap.DATASET), validacion=count(cap.VALIDACION), anfitrion=p.get('anfitrion'),
                        valido_hasta=p.get('valido_hasta'), vencida=effective_role(p)[1]))
    return out


@app.put('/api/personas/{pid}', tags=['personas'])
def put_persona(pid: str, p: Persona):
    valid_id(pid)
    if p.rol not in ROLES:
        raise HTTPException(422, f'rol debe ser uno de {ROLES}')
    personas = load_personas()
    old = personas.get(pid, {})
    cedula = documentos.normalize(p.cedula) if p.cedula.strip() else old.get('cedula', '')   # vacio = no cambiarla
    if cedula and not 6 <= len(cedula) <= 10:
        raise HTTPException(422, 'cedula: 6 a 10 digitos')
    if cedula and any(documentos.normalize(q.get('cedula', '')) == cedula for k, q in personas.items() if k != pid):
        raise HTTPException(409, 'esa cedula ya esta registrada para otra persona')
    rec = {**old, 'nombre': p.nombre.strip(), 'rol': p.rol}   # se conserva lo demas (foto del invitado, origen...)
    if cedula:
        rec['cedula'] = cedula
    if p.rol != 'INVITADO':                             # anfitrion y vigencia solo tienen sentido para invitados
        for k in ('anfitrion', 'anfitrion_id', 'valido_hasta'):
            rec.pop(k, None)
    else:
        if p.anfitrion is not None:
            host = find_host(personas, p.anfitrion)
            rec['anfitrion'], rec['anfitrion_id'] = (personas[host]['nombre'] if host else p.anfitrion.strip()), host
        if p.valido_hasta is not None:
            try:
                p.valido_hasta and datetime.fromisoformat(p.valido_hasta)
            except ValueError:
                raise HTTPException(422, 'valido_hasta: fecha ISO (2026-10-25 o 2026-10-25T22:00)')
            rec['valido_hasta'] = p.valido_hasta or None
    if old.get('nombre') and old['nombre'] != rec['nombre']:   # la identificacion muestra el nombre de la galeria
        with lock:
            g = Gallery(cap.GALERIA)
            if pid in g.ids:
                g.names = [rec['nombre'] if i == pid else n for i, n in zip(g.ids, g.names)]
                g.save()
    personas[pid] = rec
    save_personas(personas)
    return {'id': pid, 'nombre': rec['nombre'], 'rol': p.rol, 'cedula': documentos.mask(cedula) if cedula else '',
            'anfitrion': rec.get('anfitrion'), 'valido_hasta': rec.get('valido_hasta')}


@app.delete('/api/personas/{pid}', tags=['personas'])
def delete_persona(pid: str):
    """Borra a la persona: fotos de enrolamiento y validacion, su entrada en la galeria y en personas.json."""
    valid_id(pid)
    personas = load_personas()
    personas.pop(pid, None)
    save_personas(personas)
    for root in (cap.DATASET, cap.VALIDACION):
        shutil.rmtree(root / pid, ignore_errors=True)
    g = Gallery(cap.GALERIA)
    if pid in g.ids:
        keep = [i for i, x in enumerate(g.ids) if x != pid]
        g.ids, g.names, g.embs = [g.ids[i] for i in keep], [g.names[i] for i in keep], g.embs[keep]
        g.save()
    return {'borrado': pid}


# ---------- API: captura ----------

@app.get('/api/captura/guion', tags=['captura'])
def guion():
    return {'instrucciones': cap.PROMPTS, 'segundos_por_instruccion': cap.PROMPT_S,
            'fotos_objetivo': {'enrolamiento': 15, 'validacion': 8}}


@app.post('/api/captura/{pid}/frame', tags=['captura'])
async def capture_frame(pid: str, request: Request, split: str = 'enrolamiento', instruccion: str = '', lang: str = 'es'):
    """Cuerpo: un frame JPEG de la camara. Si tiene una cara util se guarda como candidato (en memoria)."""
    valid_id(pid)
    if split not in ('enrolamiento', 'validacion'):
        raise HTTPException(422, 'split: enrolamiento | validacion')
    return await run_in_threadpool(capture_one, pid, split, instruccion, lang, await request.body())


def capture_one(pid, split, instruccion, lang, body):
    img = decode(body)
    with lock:
        faces = engine.faces(img)
        c = cap.candidate(engine, img, f'web:{instruccion}') if len(faces) == 1 else None
    buf = captures.setdefault((pid, split), [])
    if c and len(buf) < MAX_CANDS:
        buf.append(c)
    q = assess(img, faces[0]) if faces else None
    return {'caras': len(faces), 'box': faces[0]['box'] if faces else None, 'util': bool(c),
            'motivos': q['reasons'] if q else ['sin_cara'], 'pistas': textos.hints(lang, q['hints']) if q else [], 'candidatos': len(buf)}


@app.post('/api/captura/{pid}/finalizar', tags=['captura'])
def capture_finish(pid: str, split: str = 'enrolamiento'):
    """Elige las tomas mas distintas, las guarda, rehace la galeria y deja el dataset en formato YOLO."""
    valid_id(pid)
    persona = load_personas().get(pid)
    if not persona:
        raise HTTPException(404, 'primero registre la persona (PUT /api/personas/{id})')
    cands = captures.pop((pid, split), [])
    if not cands:
        raise HTTPException(422, 'no hay candidatos: ninguna cara util en esta captura')
    a = SimpleNamespace(id=pid, nombre=persona['nombre'], validacion=split == 'validacion',
                        n=8 if split == 'validacion' else 15)
    with lock:
        result = cap.save_person(engine, a, cands)
    return {**result, 'yolo': cap.export_yolo()}


@app.post('/api/evaluar', tags=['captura'])
def evaluar():
    """Galeria = enrolamiento, prueba = validacion (otra sesion). Calibra umbrales (datos/calibration.json)."""
    with lock:
        try:
            return cap.evaluate(engine)
        except ValueError as e:
            raise HTTPException(422, str(e))


@app.post('/api/exportar-yolo', tags=['captura'])
def exportar_yolo():
    return cap.export_yolo()


# ---------- API: identificacion y registro ----------

@app.post('/api/identificar', tags=['identificacion'])
async def identificar(request: Request, background: BackgroundTasks, camara: str = 'web', lang: str = 'es', girar: int = 0,
                      min_cara: float = 0.0):
    """Cuerpo: frame JPEG. Devuelve cada cara con identidad y rol. Cada 8 frames decide (veredicto de robotA:
    RECONOCIDO / PROBABLE / DESCONOCIDO / SIN_CALIDAD / VARIAS_PERSONAS) y registra la decision en el log.
    Cara dudosa o desconocida: primero MAX_REINTENTOS reintentos guiados; despues pide cedula o pase (/confirmar).
    lang: es | en | zh | pt, el idioma de los textos para el visitante. girar: 90, 180 o 270 si la camara esta montada girada.
    min_cara: ancho minimo de la cara como fraccion del ancho del frame; las mas chicas (gente lejos) se ignoran."""
    if camara != 'x2' and robot_activo():
        raise HTTPException(409, 'el robot X2 esta identificando: la camara de este equipo queda en pausa')
    # YOLO + SFace en un hilo: en el hilo del servidor bloquean a los demas (frames del robot, panel, voz)
    return await run_in_threadpool(identify_frame, await request.body(), background, camara, lang, girar, min_cara)


def caras(img, cal, personas, gallery, min_cara=0.0):
    """YOLO + SFace -> (caras crudas, caras para el panel con nombre, rol y confianza), la mas cercana primero."""
    with lock:
        faces = engine.faces(img)
    # las caras chicas son gente lejos que no se esta acercando: no cuentan
    faces = sorted((f for f in faces if f['box'][2] >= min_cara * img.shape[1]), key=lambda f: -f['box'][2])
    out = []
    for f in faces:
        ident = gallery.identify(f['emb'], cal)
        p = personas.get(ident['person_id'] or '', {})
        out.append(dict(box=f['box'], persona_id=ident['person_id'], nombre=ident['name'], rol=p.get('rol'),
                        confianza=round(ident['conf'], 3), coseno=round(ident['cos'], 3)))
    return faces, out


def identify_frame(body, background, camara, lang, grados=0, min_cara=0.0):
    img = realzar(girar(decode(body), grados))
    t0 = time.time()
    cal, personas, gallery = calibration(), load_personas(), Gallery(cap.GALERIA)
    faces, out = caras(img, cal, personas, gallery, min_cara)
    w = windows.setdefault(camara, {'obs': [], 'embs': [], 'last': {}})
    for o in out:
        if o['persona_id']:
            visto(o['persona_id'], t0)
            if o['persona_id'] in w['last']:            # sigue enfrente: no se registra de nuevo hasta que se vaya
                w['last'][o['persona_id']] = t0
            if o['coseno'] >= cal['cos_sure']:          # conocida segura en este frame (aunque no sea la mas cercana)
                n, _, _ = w.setdefault('seguros', {}).get(o['persona_id'], (0, '', 0.0))
                w['seguros'][o['persona_id']] = (n + 1, o['nombre'], o['coseno'])
    if faces:
        # varias personas cerca: siempre la misma (la de id menor; conocidas primero) para que los votos no se repartan;
        # las otras se saludan en con_acompanantes
        cerca = [i for i, g in enumerate(faces) if g['box'][2] > 0.6 * faces[0]['box'][2]]
        f = faces[min(cerca, key=lambda i: (out[i]['persona_id'] is None, out[i]['persona_id'] or ''))]
        w['obs'].append(Obs(1, assess(img, f), gallery.identify(f['emb'], cal)))
        w['embs'].append(f['emb'])
    else:
        w['obs'].append(Obs(0))
    decision = None
    if not faces:                                       # sin cara pero con un pase QR o una cedula amarilla a la vista
        doc_decision = document_without_face(img, camara, w, background, cal, personas, gallery, textos.lang_of(lang))
        if doc_decision:
            w['obs'], w['embs'] = [], []
            camaras[camara] = dict(img=img, t=time.time(), caras=out, decision=doc_decision)
            return {'caras': out, 'decision': doc_decision, 'ms': round((time.time() - t0) * 1000)}
    if len(w['obs']) >= MIN_FRAMES:
        v = decide(w['obs'], cal)
        emb = np.mean(w['embs'], axis=0) if w['embs'] else None
        w['obs'], w['embs'] = [], []
        decision = make_decision(v, personas, camara, w, background, cal, emb, textos.lang_of(lang))
        seguros = {pid: x for pid, x in w.pop('seguros', {}).items() if x[0] >= MIN_FRAMES // 2}
        decision = con_acompanantes(decision, seguros, personas, camara, w, background, cal, textos.lang_of(lang))
    camaras[camara] = dict(img=img, t=time.time(), caras=out, decision=decision or camaras.get(camara, {}).get('decision'))
    return {'caras': out, 'decision': decision, 'ms': round((time.time() - t0) * 1000)}


def con_acompanantes(decision, seguros, personas, camara, w, background, cal, lang):
    """Caras conocidas seguras en la mayoria de la ventana ({pid: (frames, nombre, coseno)}), ademas de la decidida:
    cada una se registra y se saluda como si llegara sola (rol, destino, anfitrion), en decision['acompanantes']. Si la
    decidida no se pudo saludar (ya atendida, o la mas cercana es desconocida o esta de espaldas), saluda a la conocida."""
    ya = decision.get('persona_id') if decision.get('estado') == 'RECONOCIDO' else None
    otros = [make_decision(Verdict('RECONOCIDO', pid, nombre, cos), personas, camara, w, background, cal, None, lang)
             for pid, (_, nombre, cos) in seguros.items() if pid != ya]
    otros = [o for o in otros if o.get('registrado') and o.get('sentido') != 'sale']
    if otros and not (ya and decision.get('registrado')):
        decision, otros = otros[0], otros[1:]
    return {**decision, 'acompanantes': otros} if otros else decision


def document_without_face(img, camara, w, background, cal, personas, gallery, lang):
    """Nadie de frente a la camara (o la cara no se detecta) pero alguien muestra su pase QR o su cedula amarilla:
    se reconoce solo con el documento, sin esperar. El motivo del registro lo dice: 'cara no visible'. La cedula
    digital necesita OCR (lento): esa sigue pidiendose en /confirmar."""
    with lock:
        doc = documentos.detect(img, ocr=False)
    if doc['tipo'] not in ('pase', 'cedula_amarilla'):
        return None
    c = dict(candidato=None, nombre=None, emb=None, camara=camara, expira=time.time() + CONFIRM_TTL)
    estado, pid, motivo, label = check_document(c, doc, personas, gallery, cal)
    if time.time() - w['last'].get(pid or 'documento', 0) < LOG_COOLDOWN:
        return None                                     # el mismo documento sigue a la vista: ya se registro
    w['last'][pid or 'documento'] = time.time()
    return finish_confirmation(uuid.uuid4().hex, c, estado, pid, motivo, background, cal, label, lang)


def make_decision(v, personas, camara, w, background, cal, emb=None, lang='es'):
    rol = personas.get(v.person_id or '', {}).get('rol')
    now = time.time()
    if v.state in ('PROBABLE', 'DESCONOCIDO', 'SIN_CALIDAD'):
        start = w.setdefault('intento_desde', now)      # mano en la cara, gafas, de lado: se sigue intentando
        if now - start < INTENTO_S:
            pistas = textos.hints(lang, v.hints) if v.state == 'SIN_CALIDAD' else [textos.t(lang, 'reintento')]
            return {'estado': v.state, 'reintento': True, 'segundos_restantes': round(INTENTO_S - (now - start), 1),
                    'pistas': pistas}
        if v.state == 'SIN_CALIDAD':                    # 5 s sin una cara evaluable: tambien se pide el documento
            v = Verdict('DESCONOCIDO', cos=0.0)
    if v.state != 'VARIAS_PERSONAS':                    # decidio, o la persona se fue: la proxima empieza de cero
        w.pop('intento_desde', None)
    rol, vencida = effective_role(personas.get(v.person_id or '', {}))
    if v.state == 'RECONOCIDO' and vencida:
        rol, accion = 'ESCALAMIENTO', textos.t(lang, 'invitacion_vencida')
    elif v.state == 'RECONOCIDO' and rol:
        accion = orientation(rol, v.name, lang, personas[v.person_id].get('anfitrion'))
    elif v.state == 'RECONOCIDO':
        rol, accion = 'ESCALAMIENTO', textos.t(lang, 'sin_rol')
    elif v.state in ('PROBABLE', 'DESCONOCIDO') and emb is None:   # sin una cara evaluable no hay con que cruzar
        return {'estado': 'SIN_CALIDAD', 'pistas': [textos.t(lang, 'reintento')]}
    elif v.state == 'PROBABLE':                         # no se registra aun: lo decide el QR en /confirmar
        cid = uuid.uuid4().hex
        pending[cid] = dict(candidato=v.person_id, nombre=v.name, emb=emb / np.linalg.norm(emb), camara=camara,
                            expira=time.time() + CONFIRM_TTL)
        return {'estado': v.state, 'rol': 'POR_CONFIRMAR', 'persona_id': v.person_id, 'nombre': v.name,
                'confianza': round(confidence(v.cos, cal), 3), 'coseno': round(v.cos, 3), 'confirmacion': cid,
                'accion': textos.t(lang, 'probable', nombre=v.name.split(' ')[0]),
                'registrado': False}
    elif v.state == 'DESCONOCIDO':                      # tampoco se registra aun: puede identificarse con documento
        cid = uuid.uuid4().hex
        pending[cid] = dict(candidato=None, nombre=None, emb=emb / np.linalg.norm(emb), camara=camara,
                            expira=time.time() + CONFIRM_TTL)
        return {'estado': v.state, 'rol': 'POR_CONFIRMAR', 'persona_id': None, 'nombre': 'desconocido',
                'confianza': round(confidence(v.cos, cal), 3), 'coseno': round(v.cos, 3), 'confirmacion': cid,
                'accion': textos.t(lang, 'desconocido'), 'registrado': False}
    else:                                               # sin cara, mala calidad o varias personas: no se registra
        return {'estado': v.state, 'pistas': textos.hints(lang, v.hints)}
    key, now = v.person_id or 'desconocido', time.time()
    if v.state == 'RECONOCIDO' and v.person_id and va_saliendo(v.person_id, now):
        w['last'][key] = now
        return salida(v.person_id, personas, camara, background, lang)
    record = dict(id=uuid.uuid4().hex, fecha=datetime.now(timezone.utc).isoformat(timespec='seconds'), camara=camara,
                  estado=v.state, persona_id=v.person_id, nombre=v.name if v.person_id else 'desconocido', rol=rol,
                  miembro=int(rol in ('VIP', 'REGULAR')), confianza=round(confidence(v.cos, cal), 3),
                  coseno=round(v.cos, 3), accion=accion, modelo=MODELO, idioma=lang)
    if now - w['last'].get(key, 0) < LOG_COOLDOWN:
        return {**record, 'registrado': False}
    w['last'][key] = now
    if v.person_id and rol != 'ESCALAMIENTO':
        entrada(v.person_id, now)
    cumple = v.state == 'RECONOCIDO' and personas.get(v.person_id or '', {}).get('cumple') == datetime.now().strftime('%m-%d')
    if cumple:                                          # personas.json: "cumple": "MM-DD" -> lo felicita (y corazon)
        record['accion'] += ' ' + textos.t(lang, 'cumple', nombre=v.name.split(' ')[0])
    return {**log_record(record, background), 'pregunta': pregunta(rol, lang), 'cumple': cumple}


def log_record(record, background):
    con = db()
    con.execute(f'INSERT INTO registros ({",".join(record)}) VALUES ({",".join("?" * len(record))})', tuple(record.values()))
    con.commit()
    con.close()
    background.add_task(forward, [record['id']])
    return {**record, 'registrado': True}


# ---------- API: confirmacion por pase QR ----------

def get_pending(cid):
    c = pending.get(cid)
    if not c or c['expira'] < time.time():
        pending.pop(cid, None)
        raise HTTPException(404, 'confirmacion inexistente o vencida: vuelva a /identificar')
    return c


def face_matches(c, holder, gallery, cal):
    """La cara que se vio, frente al titular del documento -> (ok, motivo).
    Cara dudosa (PROBABLE) y titular con fotos: debe parecerse como siempre (coseno >= cos_reject).
    Cara no reconocida (DESCONOCIDO): por definicion no llego a cos_reject con nadie, asi que se pide menos
    (DOC_MIN_COS) frente a sus fotos o a la foto de su cedula (identificacion/): que no sea un extrano con la cedula
    de otro. Titular sin ninguna foto (p. ej. invitado registrado solo con el numero): decide el documento."""
    if c['emb'] is None:                                # document_without_face: no hubo cara con que cruzarlo
        return True, 'cara no visible: identificado solo por el documento'
    ids = np.array(gallery.ids)
    cos_g = float(np.max(gallery.embs[ids == holder] @ c['emb'])) if holder in gallery.ids else None
    refs = id_faces().get(holder)
    cos_i = float(np.max(refs @ c['emb'])) if refs is not None else None
    if c['candidato'] and cos_g is not None:
        if cos_g < cal['cos_reject']:
            return False, f'la cara no corresponde al titular (coseno {cos_g:.2f} < {cal["cos_reject"]:.2f})'
        return True, f'documento valido y cara compatible con el titular (coseno {cos_g:.2f})'
    if cos_g is None and cos_i is None:
        return True, 'titular sin fotos: identificado por el documento'
    best, src = max((x for x in ((cos_g, 'sus fotos'), (cos_i, 'la foto de su cedula')) if x[0] is not None))
    if best < DOC_MIN_COS:
        return False, f'la cara no corresponde al titular (coseno {best:.2f} < {DOC_MIN_COS:.2f} con {src})'
    return True, f'documento valido y cara compatible con {src} (coseno {best:.2f})'


def check_document(c, doc, personas, gallery, cal):
    """-> (estado, persona_id, motivo, documento). Pase: firma, vigencia y tipo segun el rol. Cedula: numero registrado."""
    if doc['tipo'] == 'pase':
        qr = qr_pass.validate(doc['texto'])
        if not qr['ok']:
            why = {'formato': 'no es un pase de N Club', 'firma': 'pase alterado (firma invalida)', 'vencido': 'pase vencido'}
            return 'ESCALAMIENTO', c['candidato'], why.get(qr['motivo'], qr['motivo']), 'pase QR'
        holder = qr['persona_id']
        rol = personas.get(holder, {}).get('rol')
        if not rol:
            return 'ESCALAMIENTO', holder, 'el titular del pase no esta registrado', 'pase QR'
        if PASE_POR_ROL[rol] != qr['tipo']:
            return 'ESCALAMIENTO', holder, f'pase de {qr["tipo"]} para alguien con rol {rol}', 'pase QR'
        label = 'pase QR'
    else:
        label = 'cédula'
        by_number = {documentos.normalize(p['cedula']): pid for pid, p in personas.items() if p.get('cedula')}
        holder = next((by_number[n] for n in doc['numeros'] if n in by_number), None)
        if not holder:
            return 'ESCALAMIENTO', c['candidato'], f'cedula {documentos.mask(doc["numero"])} no esta en los registros del club', label
    ok, why = face_matches(c, holder, gallery, cal)
    return ('CONFIRMADO_' + ('QR' if label == 'pase QR' else 'CEDULA')) if ok else 'ESCALAMIENTO', holder, why, label


def finish_confirmation(cid, c, estado, pid, motivo, background, cal, documento='pase QR', lang='es'):
    pending.pop(cid, None)
    personas, gallery = load_personas(), Gallery(cap.GALERIA)
    p = personas.get(pid or '', {})
    ok = estado.startswith('CONFIRMADO')
    rol, vencida = effective_role(p)
    if ok and vencida:
        ok, estado, motivo = False, 'ESCALAMIENTO', 'invitacion vencida'
    rol = rol if ok else 'ESCALAMIENTO'
    nombre = p.get('nombre') or c['nombre'] or 'desconocido'
    doc = textos.t(lang, 'doc.cedula' if documento.startswith('cédula') else 'doc.pase')
    first = nombre.split(' ')[0]
    accion = (f"{textos.t(lang, 'listo', nombre=first, documento=doc)} {orientation(rol, nombre, lang, p.get('anfitrion'))}" if ok
              else textos.t(lang, 'invitacion_vencida') if motivo == 'invitacion vencida' else orientation('ESCALAMIENTO', nombre, lang))
    ids = np.array(gallery.ids)
    cos = float(np.max(gallery.embs[ids == pid] @ c['emb'])) if pid in gallery.ids and c['emb'] is not None else 0.0
    record = dict(id=uuid.uuid4().hex, fecha=datetime.now(timezone.utc).isoformat(timespec='seconds'), camara=c['camara'],
                  estado=estado, persona_id=pid, nombre=nombre, rol=rol, miembro=int(rol in ('VIP', 'REGULAR')),
                  confianza=round(confidence(cos, cal), 3), coseno=round(cos, 3), accion=accion,
                  modelo=f'{MODELO} + {documento}', idioma=lang)
    if ok and pid:
        entrada(pid, time.time())
    return {**log_record(record, background), 'motivo': motivo, 'documento': doc, 'pregunta': pregunta(rol, lang) if ok else None}


@app.get('/api/confirmar/{cid}', tags=['identificacion'])
def confirm_info(cid: str):
    c = get_pending(cid)
    return {'modo': 'por_confirmar' if c['candidato'] else 'desconocido', 'candidato': c['candidato'],
            'nombre': c['nombre'], 'segundos_restantes': round(c['expira'] - time.time())}


@app.post('/api/confirmar/{cid}', tags=['identificacion'])
async def confirmar(cid: str, request: Request, background: BackgroundTasks, lang: str = 'es', girar: int = 0):
    """Cuerpo: frame JPEG con la cedula o el pase QR; detecta solo cual es. Sin documento legible -> ESPERANDO
    (con una pista si se ve algo a medias). Con documento -> decision final registrada en el log."""
    c = get_pending(cid)
    return await run_in_threadpool(confirm_frame, cid, c, await request.body(), background, lang, girar)


def confirm_frame(cid, c, body, background, lang, grados=0):
    img = realzar(girar(decode(body), grados))
    prev = camaras.get(c['camara'], {})                 # el panel sigue viendo la camara mientras pide el documento
    camaras[c['camara']] = dict(img=img, t=time.time(), caras=[], decision=prev.get('decision'))
    c['n'] = c.get('n', 0) + 1
    with lock:
        doc = documentos.detect(img, ocr=c['n'] % 2 == 0)     # OCR (~60-300 ms) en 1 de cada 2 frames
    if doc['tipo'] == 'qr_cifrado':
        return {'estado': 'ESPERANDO', 'pista': textos.t(lang, 'pista.qr_cifrado')}
    if doc['tipo'] is None:
        return {'estado': 'ESPERANDO', 'pista': textos.t(lang, 'pista.' + doc['pista']) if doc.get('pista') else None}
    cal = calibration()
    estado, pid, motivo, label = check_document(c, doc, load_personas(), Gallery(cap.GALERIA), cal)
    out = finish_confirmation(cid, c, estado, pid, motivo, background, cal, label, textos.lang_of(lang))
    return {**out, 'tipo_documento': doc['tipo'], 'qr': doc.get('puntos')}


def confirm_spoken(cid, c, numero, background, lang):
    """Cedula dicha en voz alta: cuenta como la cedula fisica, pero solo junto a la cara del titular (un numero dicho
    se copia facil). Sin cara, o titular sin fotos con que compararla -> recepcion."""
    personas, gallery, cal = load_personas(), Gallery(cap.GALERIA), calibration()
    doc = {'tipo': 'cedula', 'numeros': [numero], 'numero': numero}
    estado, pid, motivo, _ = check_document(c, doc, personas, gallery, cal)
    if estado.startswith('CONFIRMADO') and (c['emb'] is None or (pid not in gallery.ids and pid not in id_faces())):
        estado, motivo = 'ESCALAMIENTO', 'cedula dicha sin una cara del titular con que compararla'
    return finish_confirmation(cid, c, estado, pid, motivo, background, cal, 'cédula dicha', lang)


@app.post('/api/confirmar/{cid}/sin-pase', tags=['identificacion'])
def confirmar_sin_pase(cid: str, background: BackgroundTasks, lang: str = 'es'):
    """La persona no tiene cedula ni pase (o se acabo el tiempo): recepcion."""
    c = get_pending(cid)
    return finish_confirmation(cid, c, 'ESCALAMIENTO', c['candidato'], 'no mostro cedula ni pase', background, calibration(),
                               lang=textos.lang_of(lang))


# ---------- API: fotos de cedulas (carpeta identificacion/) ----------

def id_faces():
    """{persona_id: matriz de embeddings de la cara impresa en sus cedulas}"""
    if not ID_FACES.exists():
        return {}
    z = np.load(ID_FACES, allow_pickle=False)
    return {pid: z['embs'][z['ids'] == pid] for pid in set(z['ids'].tolist())}


def process_ids():
    """Lee identificacion/<id>/*: numero de cedula (OCR del frente o PDF417 del reverso) -> personas.json, y la cara de
    la foto -> datos/identificacion.npz. Se rehace completo cada vez desde las fotos (borrar una foto la olvida)."""
    import tempfile
    personas, results, ids, embs, found = load_personas(), [], [], [], {}
    IDENT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for folder in sorted(d for d in IDENT.iterdir() if d.is_dir()):
            pid = folder.name
            for f in sorted(x for x in folder.iterdir() if x.suffix.lower() in IMG_EXT):
                r = {'persona': pid, 'archivo': f.name}
                results.append(r)
                if pid not in personas:
                    r['error'] = 'la carpeta no corresponde a una persona registrada (use su id, ej. gabriel)'
                    continue
                img = cap.read_image(f, tmp)
                if img is None:
                    r['error'] = 'no se pudo abrir la imagen'
                    continue
                k = 2000 / max(img.shape[:2])                   # fotos de celular de 12 MP: basta con 2000 px
                img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else img
                with lock:
                    doc = documentos.detect(img, ocr=True)
                    faces = engine.faces(img)
                r['documento'] = doc['tipo']
                if faces:
                    ids.append(pid)
                    embs.append(faces[0]['emb'])
                r['cara'] = bool(faces)
                if doc['tipo'] in ('cedula_digital', 'cedula_amarilla') and doc.get('numero'):
                    found[pid] = (documentos.normalize(doc['numero']), r)
    with lock:                                          # se relee: alguien pudo registrar personas mientras tanto
        personas = load_personas()
        for pid, (num, r) in found.items():
            owner = next((k for k, q in personas.items() if k != pid and documentos.normalize(q.get('cedula', '')) == num), None)
            if owner:
                r['error'] = f'el numero {documentos.mask(num)} ya es la cedula de {owner}'
            elif pid in personas:
                personas[pid]['cedula'] = num
                r['cedula'] = documentos.mask(num)
        save_personas(personas)
    if ids:
        np.savez(ID_FACES, ids=np.array(ids), embs=np.asarray(embs, np.float32))
    else:
        ID_FACES.unlink(missing_ok=True)
    return {'carpeta': str(IDENT), 'fotos': results,
            'personas_con_cedula': sorted(k for k, q in personas.items() if q.get('cedula'))}


@app.post('/api/identificacion/procesar', tags=['identificacion por documento'])
def identificacion_procesar():
    """Vuelve a leer toda la carpeta identificacion/ (tambien se hace sola al arrancar el servidor)."""
    return process_ids()


@app.post('/api/identificacion/{pid}', tags=['identificacion por documento'])
async def identificacion_subir(pid: str, request: Request):
    """Cuerpo: una foto de la cedula (JPEG, PNG o HEIC). Se guarda en identificacion/<id>/ y se procesa."""
    valid_id(pid)
    if pid not in load_personas():
        raise HTTPException(404, 'primero registre la persona (PUT /api/personas/{id})')
    body = await request.body()
    if not body:
        raise HTTPException(400, 'el cuerpo debe ser una imagen')
    ext = '.heic' if body[4:12] in (b'ftypheic', b'ftypheix', b'ftypmif1') else '.png' if body[:4] == b'\x89PNG' else '.jpg'
    if ext == '.jpg' and cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR) is None:
        raise HTTPException(400, 'el cuerpo debe ser una imagen JPEG, PNG o HEIC')
    folder = IDENT / pid
    folder.mkdir(parents=True, exist_ok=True)
    f = folder / f'{datetime.now():%Y%m%d_%H%M%S_%f}{ext}'
    f.write_bytes(body)
    out = process_ids()
    return {'guardada': f.name, **next(r for r in out['fotos'] if r['archivo'] == f.name)}


# ---------- API: voz ----------

@app.post('/api/salida/{pid}', tags=['identificacion'])
def salida_endpoint(pid: str, background: BackgroundTasks, camara: str = 'x2', lang: str = 'es'):
    """La persona se despide ("adios, Juan"): despedida de su categoria, se cierra su visita y, si es invitado, se
    borra su rostro. pid 'desconocido': solo la despedida generica, sin registro."""
    if pid != 'desconocido':
        valid_id(pid)
    return salida(None if pid == 'desconocido' else pid, load_personas(), camara, background, textos.lang_of(lang))


@app.post('/api/voz', tags=['voz'])
async def voz_endpoint(request: Request, background: BackgroundTasks, lang: str = 'es', contexto: str | None = None,
                       pid: str | None = None, cid: str | None = None):
    """Cuerpo: audio de lo que dijo el visitante (webm/opus del navegador, wav, ogg, mp3...). Whisper local -> texto e
    idioma (es/en/zh/pt; solo cambia si la deteccion es segura) + intencion y respuesta en ese idioma.
    contexto=tenis: la frase responde a la `pregunta` de la decision ("¿quieres ir a la cancha de tenis?") ->
    intencion tenis_si ("¡Ven, te acompaño!") o tenis_no. pid: la persona que el robot esta atendiendo (su trato,
    categoria y destino van al LLM). cid: la confirmacion abierta (el robot pide documento): si la persona dice su numero
    de cedula, se confirma aqui y la decision vuelve en `confirmacion`. El numero nunca vuelve en el texto."""
    body = await request.body()
    quien = rag.visitante(load_personas().get(pid)) if pid else None
    if not body:
        raise HTTPException(400, 'el cuerpo debe ser audio')
    try:
        r = await run_in_threadpool(voz.listen, body, lang, contexto, quien, False)   # oye en el idioma pedido (el robot: el de la app)   # Whisper ~2 s: fuera del hilo del servidor
    except Exception as e:                              # contenedor roto, formato desconocido
        raise HTTPException(400, f'audio no valido: {str(e)[:200]}')
    if r.get('intencion') == 'cedula':
        numero = r.pop('numero')
        oculto = textos.t(r['idioma'], 'voz.cedula_dicha', numero=documentos.mask(numero))
        r.update(texto=oculto, texto_detectado=oculto)  # ni en el log del robot ni en el panel
        c = pending.get(cid or '')
        if c and c['expira'] >= time.time():
            r['confirmacion'] = await run_in_threadpool(confirm_spoken, cid, c, numero, background, r['idioma'])
            r['respuesta'] = ''
        else:                                           # sin cara pendiente: primero mirarlo
            r['respuesta'] = textos.t(r['idioma'], 'voz.cedula_mirar')
    return r


@app.post('/api/tts', tags=['voz'])
async def tts_endpoint(request: Request, lang: str = 'es', formato: str = 'pcm'):
    """Cuerpo: el texto. Devuelve la voz de Cerberus en ese idioma: PCM S16LE 16 kHz mono (lo que pide
    /aima/hal/audio/playback del X2) o WAV. Asi el host del robot no necesita espeak-ng ni ffmpeg: el audio
    lo genera el cerebro. El TTS nativo del X2 solo habla chino e ingles; el espanol y el portugues salen de aqui."""
    text = (await request.body()).decode('utf-8', 'replace').strip()
    if not text:
        raise HTTPException(400, 'el cuerpo debe ser el texto a decir')
    pcm = await run_in_threadpool(cerberus_x2.voice_pcm, text[:1000], textos.lang_of(lang))
    if not pcm:
        raise HTTPException(503, 'falta espeak-ng o ffmpeg en el servidor (sudo apt install espeak-ng ffmpeg)')
    if formato == 'wav':
        return Response(cerberus_x2.pcm_to_wav(pcm), media_type='audio/wav')
    return Response(pcm, media_type='audio/L16; rate=16000; channels=1')


@app.get('/api/textos', tags=['voz'])
def get_textos(lang: str = 'es'):
    """Todas las frases que Cerberus le dice al visitante, en un idioma (para el robot u otra interfaz)."""
    return {'idioma': textos.lang_of(lang), 'idiomas': textos.IDIOMAS, 'textos': textos.T[textos.lang_of(lang)]}


def startup_tasks():
    documentos.warm_up()                                # la 1a llamada al OCR tarda ~20 s
    try:
        out = process_ids()
        print(f'identificacion/: {len(out["fotos"])} fotos leidas; con cedula: {", ".join(out["personas_con_cedula"]) or "nadie"}',
              flush=True)
    except Exception as e:                              # una foto rara no debe tumbar el servidor
        print(f'identificacion/: error al leer las fotos: {e}', flush=True)
    try:
        voz.warm_up()                                   # carga Whisper (la 1a vez lo descarga, ~460 MB)
        print('voz: Whisper listo', flush=True)
    except Exception as e:                              # sin modelo de voz el resto sigue funcionando
        print(f'voz: no se pudo cargar Whisper: {e}', flush=True)
    try:
        print(f'llm: {rag.ingestar()} documento(s) del club cargados en n8n', flush=True)   # su memoria se borra al reiniciar
    except Exception as e:                              # n8n apagado: modo clasico hasta que arranque (panel /llm)
        print(f'llm: n8n no disponible ({str(e)[:80]})', flush=True)


threading.Thread(target=startup_tasks, daemon=True).start()


# ---------- API: pases QR ----------

def pass_text(pid, variante, horas):
    p = load_personas().get(pid)
    if not p:
        raise HTTPException(404, f'{pid} no esta registrado')
    text = qr_pass.make_pass(PASE_POR_ROL[p['rol']], pid, p['nombre'], -1 if variante == 'vencido' else horas)
    if variante == 'alterado':                          # firma rota: como si alguien editara el nombre del pase
        text = text[:-1] + ('0' if text[-1] != '0' else '1')
    return p, text


def render_pass(p, pid, text, variante, horas):
    """PNG vertical para el celular: QR grande + titular, rol y vencimiento."""
    from PIL import Image, ImageDraw, ImageFont

    def font(size):
        for f in ('/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
            if Path(f).exists():
                return ImageFont.truetype(f, size)
        return ImageFont.load_default(size)
    W, H = 1080, 1560
    img = Image.new('RGB', (W, H), 'white')
    qr = Image.fromarray(qr_pass.to_image(text, scale=10)).resize((900, 900), Image.NEAREST)
    img.paste(qr, ((W - 900) // 2, 150))
    d = ImageDraw.Draw(img)
    tipo = PASE_POR_ROL[p['rol']]
    d.text((W // 2, 70), f'N Club · pase de {tipo}', fill='#16181d', font=font(52), anchor='mm')
    d.text((W // 2, 1140), p['nombre'], fill='#16181d', font=font(72), anchor='mm')
    d.text((W // 2, 1230), f'{p["rol"]} · id {pid}', fill='#5d6470', font=font(44), anchor='mm')
    exp = datetime.fromtimestamp(time.time() + (-3600 if variante == 'vencido' else horas * 3600))
    d.text((W // 2, 1310), f'vence {exp:%d/%m %H:%M}', fill='#5d6470', font=font(40), anchor='mm')
    if variante != 'valido':
        d.rectangle((0, 1390, W, H), fill='#c62828')
        d.text((W // 2, 1475), f'PRUEBA: pase {variante.upper()}', fill='white', font=font(60), anchor='mm')
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


@app.get('/api/pases/{pid}.png', tags=['pases QR'])
def get_pass(pid: str, variante: str = 'valido', horas: float = 48):
    """Pase QR firmado de una persona registrada, como imagen. variante: valido | vencido | alterado (casos trampa)."""
    if variante not in ('valido', 'vencido', 'alterado'):
        raise HTTPException(422, 'variante: valido | vencido | alterado')
    p, text = pass_text(valid_id(pid), variante, horas)
    return Response(render_pass(p, pid, text, variante, horas), media_type='image/png')


@app.post('/api/pases/generar', tags=['pases QR'])
def generate_passes(horas: float = 48):
    """Escribe robotB/pases/: un PNG valido por persona, dos de prueba (vencido y alterado) y todo en un PDF."""
    from PIL import Image
    personas = load_personas()
    if not personas:
        raise HTTPException(422, 'no hay personas registradas')
    shutil.rmtree(PASES, ignore_errors=True)
    PASES.mkdir(parents=True)
    files = []
    first = sorted(personas)[0]
    jobs = [(pid, 'valido') for pid in sorted(personas)] + [(first, 'vencido'), (first, 'alterado')]
    for pid, variante in jobs:
        p, text = pass_text(pid, variante, horas)
        f = PASES / (f'{pid}.png' if variante == 'valido' else f'PRUEBA_{variante}_{pid}.png')
        f.write_bytes(render_pass(p, pid, text, variante, horas))
        files.append(f)
    pages = [Image.open(f).convert('RGB') for f in files]
    pdf = PASES / 'pases_cerberus.pdf'
    pages[0].save(pdf, save_all=True, append_images=pages[1:])
    return {'carpeta': str(PASES), 'archivos': [f.name for f in files] + [pdf.name], 'vencen_en_horas': horas}


@app.get('/api/registros', tags=['registro'])
def registros(limit: int = 50):
    return all_rows(min(limit, 1000))


def all_rows(limit=-1):                                  # -1 = sin limite (SQLite)
    con = db()
    rows = [dict(r) for r in con.execute('SELECT * FROM registros ORDER BY rowid DESC LIMIT ?', (limit,))]
    con.close()
    return rows


@app.get('/api/registros/descargar', tags=['registro'])
def descargar(formato: str = 'csv'):
    rows = all_rows()
    stamp = datetime.now().strftime('%Y%m%d_%H%M')
    if formato == 'json':
        return Response(json.dumps(rows, ensure_ascii=False, indent=2), media_type='application/json',
                        headers={'Content-Disposition': f'attachment; filename=cerberus_registros_{stamp}.json'})
    buf = io.StringIO()
    if rows:
        wr = csv.DictWriter(buf, fieldnames=list(rows[0]))
        wr.writeheader()
        wr.writerows(rows)
    return Response(buf.getvalue(), media_type='text/csv',
                    headers={'Content-Disposition': f'attachment; filename=cerberus_registros_{stamp}.csv'})


@app.post('/api/registros/reenviar', tags=['registro'])
def reenviar():
    if not db_config()['url']:
        raise HTTPException(422, 'no hay base de datos externa configurada (PUT /api/config)')
    con = db()
    ids = [r['id'] for r in con.execute('SELECT id FROM registros WHERE enviado = 0')]
    con.close()
    forward(ids)
    con = db()
    pend = con.execute('SELECT COUNT(*) FROM registros WHERE enviado = 0').fetchone()[0]
    con.close()
    return {'intentados': len(ids), 'pendientes': pend}


class DbConfig(BaseModel):
    url: str = ''
    token: str = ''
    invitados_url: str = ''     # base de datos externa de invitaciones (GET -> lista JSON), ver /api/invitados/sincronizar
    invitados_token: str = ''


@app.get('/api/config', tags=['registro'])
def get_config():
    cfg = db_config()
    return {'url': cfg['url'], 'token_configurado': bool(cfg['token']), 'invitados_url': cfg['invitados_url'],
            'invitados_token_configurado': bool(cfg['invitados_token'])}


@app.put('/api/config', tags=['registro'])
def put_config(c: DbConfig):
    """Solo cambia los campos que vienen en el JSON (los demas se conservan)."""
    new = c.model_dump(exclude_unset=True)
    for k in ('url', 'invitados_url'):
        if new.get(k) and not re.match(r'https?://', new[k]):
            raise HTTPException(422, f'{k}: la URL debe empezar por http:// o https://')
    cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
    CONFIG.write_text(json.dumps({**cfg, **new}))
    return get_config()


# ---------- API: umbrales ----------

class Umbrales(BaseModel):
    cos_reject: float | None = None
    cos_sure: float | None = None


@app.get('/api/umbrales', tags=['identificacion'])
def get_umbrales():
    """cos_reject: debajo es DESCONOCIDO. cos_sure: desde ahi RECONOCIDO sin preguntar. Entre ambos: POR CONFIRMAR."""
    cal = calibration()
    return {**cal, 'confianza_por_confirmar': [0.60, 0.85], 'intento_segundos': INTENTO_S}


@app.put('/api/umbrales', tags=['identificacion'])
def put_umbrales(u: Umbrales):
    """Ajuste manual (queda en datos/calibration.json; /api/evaluar lo recalcula). Limites de seguridad: cos_reject entre
    0.363 (umbral 'misma persona' de OpenCV para SFace) y 0.7; cos_sure al menos 0.05 por encima de cos_reject."""
    cal = calibration()
    rej = cal['cos_reject'] if u.cos_reject is None else u.cos_reject
    sure = cal['cos_sure'] if u.cos_sure is None else u.cos_sure
    if not 0.363 <= rej <= 0.7:
        raise HTTPException(422, 'cos_reject debe estar entre 0.363 y 0.7')
    if not rej + 0.05 <= sure <= 0.95:
        raise HTTPException(422, f'cos_sure debe estar entre {rej + 0.05:.3f} y 0.95')
    saved = json.loads(cap.CALIBRACION.read_text()) if cap.CALIBRACION.exists() else {}
    cap.CALIBRACION.write_text(json.dumps({**saved, 'cos_reject': round(rej, 3), 'cos_sure': round(sure, 3),
                                           'ajuste_manual': True}, indent=2))
    return get_umbrales()


# ---------- API: invitados con una sola foto ----------

class Invitado(BaseModel):
    nombre: str
    anfitrion: str              # id o nombre del socio que invita
    foto_base64: str = ''       # la foto (JPEG/PNG), en base64 o data URL...
    foto_url: str = ''          # ...o una URL http(s) de donde bajarla
    id: str = ''                # opcional: si no viene, se genera del nombre
    valido_hasta: str = ''      # opcional: fecha o fecha-hora ISO (2026-10-25 o 2026-10-25T22:00)
    cedula: str = ''            # opcional


def fetch(url, token='', limit=MAX_FOTO):
    if not re.match(r'https?://', url):
        raise ValueError('la URL debe empezar por http:// o https://')
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'} if token else {})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f'respuesta de mas de {limit // 1_000_000} MB')
    return data


def slug(text):
    import unicodedata
    plain = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', plain).strip('_')[:40]


def enroll_guest(inv):
    """Enrola a un invitado con UNA foto: rol INVITADO, su anfitrion y su vigencia. -> dict del invitado."""
    import base64
    nombre = inv.nombre.strip()
    if not nombre or not inv.anfitrion.strip():
        raise ValueError('faltan nombre o anfitrion')
    pid = valid_id(inv.id.strip() or slug(nombre))
    if inv.valido_hasta:
        datetime.fromisoformat(inv.valido_hasta)        # ValueError si no es ISO
    if inv.foto_base64:
        raw = inv.foto_base64.split(',', 1)[1] if inv.foto_base64.startswith('data:') else inv.foto_base64
        if len(raw) > MAX_FOTO * 4 // 3 + 4:
            raise ValueError('foto de mas de 5 MB')
        data = base64.b64decode(raw, validate=True)
    elif inv.foto_url:
        data = fetch(inv.foto_url, db_config()['invitados_token'])
    else:
        raise ValueError('falta la foto (foto_base64 o foto_url)')
    import hashlib
    sha = hashlib.sha256(data).hexdigest()[:16]
    old = load_personas().get(pid, {})
    if old.get('foto_sha') == sha and old.get('valido_hasta') == (inv.valido_hasta or None) and \
            inv.anfitrion.strip().lower() in (str(old.get('anfitrion_id')).lower(), str(old.get('anfitrion')).lower()):
        return {'id': pid, 'nombre': old['nombre'], 'anfitrion': old.get('anfitrion'), 'sin_cambios': True}
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('la foto no es una imagen JPEG o PNG')
    with lock:
        faces = engine.faces(img)
    if not faces:
        raise ValueError('no hay ninguna cara en la foto')
    f = faces[0]                                        # la mas grande
    q = assess(img, f)
    personas = load_personas()
    host_id = find_host(personas, inv.anfitrion)
    if pid in personas and personas[pid].get('rol') != 'INVITADO':
        raise ValueError(f'el id {pid} ya es de una persona con rol {personas[pid]["rol"]}')
    folder = cap.DATASET / pid
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    from enroll import face_patch
    cv2.imwrite(str(folder / '00.jpg'), face_patch(img, f['box']))
    with lock:
        g = Gallery(cap.GALERIA)
        g.add(pid, nombre, [f['emb']])
        g.save()
        personas = load_personas()
        personas[pid] = {'nombre': nombre, 'rol': 'INVITADO', 'anfitrion': personas[host_id]['nombre'] if host_id else inv.anfitrion.strip(),
                         'anfitrion_id': host_id, 'origen': 'invitacion', 'valido_hasta': inv.valido_hasta or None, 'foto_sha': sha,
                         **({'cedula': documentos.normalize(inv.cedula)} if inv.cedula.strip() else {})}
        save_personas(personas)
    return {'id': pid, 'nombre': nombre, 'anfitrion': personas[pid]['anfitrion'], 'anfitrion_registrado': bool(host_id),
            'valido_hasta': inv.valido_hasta or None, 'calidad_foto': q['reasons'] or ['ok']}


@app.post('/api/invitados', tags=['invitados'])
def post_invitado(inv: Invitado):
    """Un socio (o el sistema del club) registra a un invitado con UNA foto. Desde ese momento Cerberus lo reconoce como
    INVITADO y le dice quien lo espera. Re-enviar el mismo id reemplaza la foto."""
    try:
        return enroll_guest(inv)
    except (ValueError, OSError) as e:
        raise HTTPException(422, str(e))


@app.get('/api/invitados', tags=['invitados'])
def get_invitados():
    return [dict(id=k, nombre=p['nombre'], anfitrion=p.get('anfitrion'), valido_hasta=p.get('valido_hasta'),
                 vencida=effective_role(p)[1]) for k, p in sorted(load_personas().items()) if p.get('rol') == 'INVITADO']


@app.post('/api/invitados/sincronizar', tags=['invitados'])
def sync_invitados():
    """Trae las invitaciones de la base de datos externa (config invitados_url): GET -> lista JSON (o {"invitados": [...]})
    con los campos de POST /api/invitados. Enrola las nuevas o cambiadas; las ya enroladas con la misma foto no se tocan."""
    cfg = db_config()
    if not cfg['invitados_url']:
        raise HTTPException(422, 'no hay invitados_url configurada (PUT /api/config)')
    try:
        data = json.loads(fetch(cfg['invitados_url'], cfg['invitados_token'], limit=50_000_000))
    except (ValueError, OSError) as e:
        raise HTTPException(502, f'no se pudo leer la base de invitados: {e}')
    rows = data.get('invitados', []) if isinstance(data, dict) else data
    out = []
    for row in rows:
        try:
            out.append({'ok': True, **enroll_guest(Invitado(**row))})
        except Exception as e:                          # una invitacion mala no frena las demas
            out.append({'ok': False, 'nombre': (row or {}).get('nombre'), 'error': str(e)[:200]})
    return {'leidas': len(rows), 'enroladas': sum(r['ok'] for r in out), 'detalle': out}


# ---------- API: panel del robot (camaras en vivo, log y despliegue) ----------
# Los botones de /robot corren los scripts de deploy/ en este equipo, uno a la vez, dentro de una pseudo-terminal:
# asi `ssh -t` reserva terminal en el robot (al detener, el cliente del X2 recibe SIGHUP y para) y las preguntas de
# contrasena de ssh/sudo se ven y se contestan desde el panel (POST /api/robot/entrada).
MAC = sys.platform == 'darwin'
ACCIONES = {
    'red': ['deploy-mac/preparar_mac.sh', '--red'] if MAC else ['deploy/preparar_host.sh', '--red'],
    'ssh': ['deploy-mac/preparar_mac.sh', '--ssh'] if MAC else ['ssh-copy-id', f'{os.environ.get("USUARIO", "agi")}@{os.environ.get("ROBOT", "10.0.1.41")}'],
    'comprobar': ['deploy-mac/comprobar_mac.sh'] if MAC else ['deploy/comprobar_cerebro.sh'],
    'compilar_sdk': ['deploy/compilar_sdk.sh'],
    'diagnostico': ['deploy/desplegar.sh', '--diagnostico'],
    'probar': ['deploy/desplegar.sh', '--probar', 'todos'],
    'recepcion': ['deploy/desplegar.sh'],     # microfonos del robot (--mic solo): sin only_voice ni reiniciar el agente
    'normal': ['deploy/desplegar.sh', '--normal'],
}
ANSI = re.compile(r'\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07')
# Fast DDS del robot imprime miles de avisos de descubrimiento (Host.hpp, RTPS_PARTICIPANT...) que tapan el log
DDS_RUIDO = re.compile(r'^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+ \[(Warning|Info)\] \[')
robot = SimpleNamespace(proc=None, fd=None, accion=None, codigo=None, lineas=deque(maxlen=3000), n=0, parcial='')


def robot_activo():
    """El X2 esta en recepcion (lanzada desde el panel, o manda frames: modo A o desde la terminal). Entonces solo
    identifica el robot: dos camaras decidiendo a la vez registrarian dos veces a la misma persona."""
    x2 = camaras.get('x2')
    return (robot.accion == 'recepcion' and bool(robot.proc and robot.proc.poll() is None)) or bool(x2 and time.time() - x2['t'] < 5)


def solo_local(request):
    """Estas rutas ejecutan comandos: ni otra pagina web (Origin ajeno) ni un DNS que apunte aqui (Host ajeno)."""
    host = request.headers.get('host', '')
    if host.split(':')[0] not in ('127.0.0.1', 'localhost'):
        raise HTTPException(403, 'solo desde este equipo')
    origin = request.headers.get('origin')
    if origin and origin.split('://', 1)[-1] != host:
        raise HTTPException(403, 'origen no permitido')


CONVERSACION = deque(maxlen=60)
OYO = re.compile(r'<<< OYO: "(.*)" \((\w*)[^)]*\)(.*)$')   # (intencion, seguridad 0.8)
DICE = re.compile(r'voz del robot: (.*)$')


def conversacion(linea):
    """Del log del cliente del X2 a la conversacion en vivo del panel /llm: lo que oye (y si contesto) y lo que dice."""
    m, d = OYO.search(linea), DICE.search(linea)
    if m:
        CONVERSACION.appendleft({'hora': time.strftime('%H:%M:%S'), 'quien': 'visitante', 'texto': m.group(1),
                                 'intencion': m.group(2), 'ignorado': 'no contesta' in m.group(3)})
    elif d:
        CONVERSACION.appendleft({'hora': time.strftime('%H:%M:%S'), 'quien': 'juan', 'texto': d.group(1).strip()})


def robot_log(texto):
    texto = robot.parcial + ANSI.sub('', texto).replace('\r\n', '\n').replace('\r', '\n')
    *completas, robot.parcial = texto.split('\n')
    completas = [l for l in completas if not DDS_RUIDO.match(l)]
    for linea in completas:
        conversacion(linea)
    robot.lineas.extend(completas)
    robot.n += len(completas)


def robot_leer(proc, fd):
    while True:
        try:
            chunk = os.read(fd, 4096)
        except OSError:                                 # EIO: el proceso cerro la terminal
            chunk = b''
        if not chunk:
            break
        robot_log(chunk.decode('utf-8', 'replace'))
    robot.codigo = proc.wait()
    os.close(fd)
    robot_log(f'\n[{robot.accion}: termino con codigo {robot.codigo}]\n')


@app.get('/robot', include_in_schema=False)
def page_robot():
    return FileResponse(STATIC / 'robot.html')


# ---------- LLM: RAG de n8n con DeepSeek, o la forma de antes (solo palabras clave) ----------

@app.get('/llm', include_in_schema=False)
def page_llm():
    return FileResponse(STATIC / 'llm.html')


class LlmConfig(BaseModel):
    activo: bool


class LlmPregunta(BaseModel):
    texto: str
    idioma: str = 'es'


@app.get('/api/llm', tags=['llm'])
def llm_estado():
    """Interruptor, n8n y modelo arriba, las ultimas preguntas que fueron al RAG y la conversacion en vivo del robot."""
    return {**rag.estado(), 'conversacion': list(CONVERSACION)}


@app.put('/api/llm', tags=['llm'])
def llm_config(c: LlmConfig):
    """activo=true: lo que las palabras clave no entienden va a DeepSeek (RAG). false: solo frases fijas, como antes."""
    rag.activar(c.activo)
    return rag.estado()


@app.post('/api/llm/preguntar', tags=['llm'])
def llm_preguntar(p: LlmPregunta):
    """Probar el RAG sin microfono (aunque el interruptor este en modo clasico)."""
    texto = p.texto.strip()[:500]
    if not texto:
        raise HTTPException(400, 'falta el texto')
    return {'respuesta': rag.preguntar(texto, textos.lang_of(p.idioma)), **rag.HISTORIAL[0]}


@app.post('/api/llm/recargar', tags=['llm'])
def llm_recargar():
    """Vuelve a mandar ../rag/conocimiento/*.md a n8n (despues de editar los documentos del club)."""
    try:
        return {'documentos': rag.ingestar()}
    except Exception as e:
        raise HTTPException(503, f'n8n no recibio los documentos: {str(e)[:200]}')


@app.get('/api/camaras', tags=['robot'])
def get_camaras():
    """Camaras que mandan frames a /api/identificar (el X2 es 'x2'), con sus caras y su ultima decision."""
    now = time.time()
    return [{'camara': k, 'edad_s': round(now - c['t'], 1), 'caras': c['caras'], 'decision': c['decision']}
            for k, c in camaras.items()]


ROL_BGR = {'VIP': (39, 162, 201), 'REGULAR': (255, 111, 47), 'INVITADO': (85, 157, 31), 'PERSONAL': (128, 114, 107),
           'EXTERNO': (10, 113, 232)}                    # los colores de comun.css; sin rol: rojo de recepcion


def anotar(c, ancho=None):
    """El frame (ya girado) con lo que vio YOLO: un recuadro por cara con nombre, rol y confianza -> JPEG."""
    img, k = c['img'], 1.0
    if ancho and img.shape[1] > ancho:                  # para mostrar basta 1280 px: menos bytes, menos lag
        k = ancho / img.shape[1]
        img = cv2.resize(img, (ancho, int(img.shape[0] * k)), interpolation=cv2.INTER_AREA)
    else:
        img = img.copy()
    for f in c['caras']:
        x, y, w, h = (int(v * k) for v in f['box'])
        color = ROL_BGR.get(f['rol'], (47, 47, 211))
        texto = f"{f['nombre'] if f['persona_id'] else '?'} {f['rol'] or ''} {f['confianza']:.2f}"
        cv2.rectangle(img, (x, y), (x + w, y + h), color, 3)
        cv2.rectangle(img, (x, max(0, y - 30)), (x + 12 * len(texto) + 10, y), color, -1)
        cv2.putText(img, texto, (x + 5, max(20, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    return cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes()


@app.post('/api/camaras/{camara}', tags=['robot'])
async def camara_ver(camara: str, request: Request, girar_: int = Query(0, alias='girar')):
    """Cuerpo: frame JPEG solo para mostrar en el panel (sin identificar): el robot lo manda mientras atiende a
    alguien, para que la camara en vivo no se congele."""
    body = await request.body()

    def ver():                                          # los recuadros siguen en el panel mientras atiende (sin decidir)
        img = realzar(girar(decode(body), girar_))
        return img, caras(img, calibration(), load_personas(), Gallery(cap.GALERIA))[1]
    img, out = await run_in_threadpool(ver)
    prev = camaras.get(camara, {})
    camaras[camara] = dict(img=img, t=time.time(), caras=out, decision=prev.get('decision'))
    return {'ok': True, 'caras': len(out), 'ids': [o['persona_id'] for o in out if o['persona_id']]}   # quien sigue enfrente


@app.get('/api/camaras/{camara}.jpg', tags=['robot'])
def get_camara(camara: str):
    """Ultimo frame de la camara, a resolucion completa, con los recuadros de YOLO."""
    c = camaras.get(camara) or {}
    if not c:
        raise HTTPException(404, f'la camara {camara} no ha mandado frames')
    return Response(anotar(c), media_type='image/jpeg', headers={'Cache-Control': 'no-store'})


@app.get('/api/camaras/{camara}.mjpg', tags=['robot'])
def stream_camara(camara: str):
    """Video en vivo (MJPEG, 1280 px) con los recuadros de YOLO: cada frame sale apenas lo procesa el cerebro, sin que
    la pagina tenga que pedirlo. Un <img src> basta para verlo."""
    if camara not in camaras:
        raise HTTPException(404, f'la camara {camara} no ha mandado frames')

    def frames():
        visto, hasta = 0.0, time.time() + 3600         # una hora por conexion: la pagina la reabre sola
        while time.time() < hasta:
            c = camaras.get(camara)
            if not c or c['t'] == visto:
                time.sleep(0.02)
                continue
            visto = c['t']
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + anotar(c, 1280) + b'\r\n'
    return StreamingResponse(frames(), media_type='multipart/x-mixed-replace; boundary=frame',
                             headers={'Cache-Control': 'no-store'})


ROBOT_IP = os.environ.get('ROBOT', '10.0.1.41')
ROBOT_SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', '-o', 'StrictHostKeyChecking=accept-new',
             f'{os.environ.get("USUARIO", "agi")}@{ROBOT_IP}']
SDK_CHECK = ('bash -lc "source /opt/ros/humble/setup.bash 2>/dev/null; [ -f ~/aimdk/install/local_setup.bash ] && '
             'source ~/aimdk/install/local_setup.bash; python3 -c \'import rclpy, aimdk_msgs\' && echo SDK_OK"')


def corre(cmd, timeout):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (subprocess.TimeoutExpired, OSError):
        return None


@app.get('/api/robot/conexion', tags=['robot'])
def robot_conexion():
    """Semaforo del panel: que esta conectado y que funciona, de lo mas cercano (este equipo) a lo mas lejano (el X2)."""
    x2 = camaras.get('x2')
    red = corre(['ping', '-c', '1', ROBOT_IP], 2)
    red = bool(red and red.returncode == 0)
    sdk = corre(ROBOT_SSH + [SDK_CHECK], 8) if red else None   # un solo ssh: si entra, ssh ok; si imprime SDK_OK, SDK ok
    ssh = bool(sdk and sdk.returncode in (0, 1) and 'Permission denied' not in sdk.stderr)
    return [
        {'id': 'cerebro', 'ok': True, 'detalle': MODELO},
        {'id': 'galeria', 'ok': len(Gallery(cap.GALERIA).people()) > 0, 'detalle': f'{len(Gallery(cap.GALERIA).people())} personas'},
        {'id': 'voz', 'ok': bool(shutil.which('espeak-ng') or shutil.which('say')), 'detalle': 'espeak-ng' if shutil.which('espeak-ng') else 'say'},
        {'id': 'red', 'ok': red, 'detalle': ROBOT_IP},
        {'id': 'ssh', 'ok': ssh, 'detalle': ROBOT_SSH[-1]},
        {'id': 'sdk', 'ok': bool(sdk and 'SDK_OK' in sdk.stdout), 'detalle': 'rclpy + aimdk_msgs'},
        {'id': 'cliente', 'ok': robot.accion == 'recepcion' and bool(robot.proc and robot.proc.poll() is None), 'detalle': 'cerberus_x2.py'},
        {'id': 'camara', 'ok': bool(x2 and time.time() - x2['t'] < 5), 'detalle': f'x2 hace {time.time() - x2["t"]:.0f} s' if x2 else 'sin frames'},
    ]


@app.get('/api/robot/estado', tags=['robot'])
def robot_estado(desde: int = 0):
    """Lineas del log desde la n-esima (el panel pide solo las nuevas) y la pregunta a medias (p. ej. 'password:')."""
    nuevas = min(max(robot.n - desde, 0), len(robot.lineas))
    corriendo = bool(robot.proc and robot.proc.poll() is None)
    return {'accion': robot.accion, 'corriendo': corriendo, 'codigo': robot.codigo, 'n': robot.n,
            'lineas': list(robot.lineas)[len(robot.lineas) - nuevas:], 'parcial': robot.parcial,
            'acciones': list(ACCIONES)}


@app.post('/api/robot/detener', tags=['robot'])
def robot_detener(request: Request):
    solo_local(request)
    if robot.proc and robot.proc.poll() is None:
        os.killpg(robot.proc.pid, signal.SIGTERM)
    return robot_estado(robot.n)


# '[c]erberus': el patron no coincide con la propia linea de comando de este bash (si no, pkill lo mata a el)
PARAR_EN_ROBOT = ('pkill -INT -f "[c]aminar.py"; pkill -INT -f "[c]erberus_x2.py"; pkill -f "[m]odo_agente.py"; sleep 1; pkill -9 -f "[c]erberus_x2.py"; '
                  'source /opt/ros/humble/setup.bash; source ~/aimdk/install/setup.bash; '
                  'timeout 6 ros2 service call /aimdk_5Fmsgs/srv/StopAudioPlay aimdk_msgs/srv/StopAudioPlay "{}" '
                  '>/dev/null 2>&1; echo PARADO')


@app.post('/api/robot/parar_todo', tags=['robot'])
def robot_parar_todo(request: Request):
    """Boton rojo: corta el despliegue en curso, mata el cliente en el robot y calla su parlante."""
    solo_local(request)
    if robot.proc and robot.proc.poll() is None:
        os.killpg(robot.proc.pid, signal.SIGKILL)
    caminar_parar(request)
    r = corre(ROBOT_SSH + [f'bash -lc {shlex.quote(PARAR_EN_ROBOT)}'], 15)
    ok = bool(r and 'PARADO' in r.stdout)
    camaras.pop('x2', None)                             # la camara del computador vuelve a quedar libre
    robot_log(f'\n■ PARAR TODO: {"robot detenido y callado" if ok else "no se pudo entrar al robot por ssh"}\n')
    return {**robot_estado(robot.n), 'robot_parado': ok}


class Entrada(BaseModel):
    texto: str


# ---------- Caminar (x2/caminar.py en el robot, por deploy/caminar.sh): aparte del despliegue, asi la recepcion sigue ----------
paseo = SimpleNamespace(proc=None)


class Paseo(BaseModel):
    metros: float = 0.0
    manual: bool = False


def paseo_leer(proc):
    for linea in proc.stdout:
        linea = linea.decode('utf-8', 'replace')
        if not DDS_RUIDO.match(linea):
            robot_log('[caminar] ' + linea)
    robot_log(f'[caminar: termino con codigo {proc.wait()}]\n')


@app.get('/api/robot/caminar', tags=['robot'])
def caminar_estado():
    return {'caminando': bool(paseo.proc and paseo.proc.poll() is None)}


@app.post('/api/robot/caminar', tags=['robot'])
def caminar(p: Paseo, request: Request):
    """Automatico: camina derecho `metros` (0.1 a 5, frena solo ante un obstaculo). Manual: queda esperando teclas
    (POST /api/robot/caminar/tecla). Lazo abierto, y solo si el robot ya esta de pie."""
    solo_local(request)
    if caminar_estado()['caminando']:
        raise HTTPException(409, 'ya esta caminando: detenlo primero')
    if not p.manual and not 0.1 <= p.metros <= 5:
        raise HTTPException(400, 'metros entre 0.1 y 5')
    cmd = ['deploy/caminar.sh', *(['--manual'] if p.manual else ['--metros', str(p.metros)]), '--si']
    robot_log(f'\n$ {" ".join(cmd)}\n')
    paseo.proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, start_new_session=True)
    threading.Thread(target=paseo_leer, args=(paseo.proc,), daemon=True).start()
    return caminar_estado()


class Tecla(BaseModel):
    tecla: str


@app.post('/api/robot/caminar/tecla', tags=['robot'])
def caminar_tecla(t: Tecla, request: Request):
    """Modo manual: w adelante, s atras, a/d girar; cada una dura 0.4 s (el panel la repite mientras se aprieta)."""
    solo_local(request)
    if t.tecla not in ('w', 's', 'a', 'd') or not caminar_estado()['caminando']:
        raise HTTPException(409, 'no esta en modo manual')
    try:
        paseo.proc.stdin.write(t.tecla.encode() + b'\n')
        paseo.proc.stdin.flush()
    except OSError:
        raise HTTPException(409, 'el proceso de caminar ya termino')
    return {'ok': True}


@app.post('/api/robot/caminar/parar', tags=['robot'])
def caminar_parar(request: Request):
    solo_local(request)
    if caminar_estado()['caminando']:
        os.killpg(paseo.proc.pid, signal.SIGTERM)       # corta el ssh: caminar.py recibe SIGHUP y manda velocidad 0
    return {'caminando': False}


@app.post('/api/robot/entrada', tags=['robot'])
def robot_entrada(e: Entrada, request: Request):
    """Una linea al proceso en curso: la contrasena que pide ssh o sudo (no se escribe en el log: la terminal no la repite)."""
    solo_local(request)
    if not (robot.proc and robot.proc.poll() is None):
        raise HTTPException(409, 'no hay nada corriendo')
    os.write(robot.fd, e.texto.encode() + b'\n')
    return {'ok': True}


TELEMETRIA = {}
IDIOMA = {'actual': 'es'}          # en que idioma oye y habla Juan: espanol hasta que la app diga otro (no se guarda)


class IdiomaConfig(BaseModel):
    idioma: str


@app.get('/api/idioma', tags=['robot'])
def idioma_get():
    return {'idioma': IDIOMA['actual'], 'idiomas': list(textos.IDIOMAS)}


@app.put('/api/idioma', tags=['robot'])
def idioma_put(c: IdiomaConfig):
    """La app fija el idioma de Juan (es, en, zh, pt). El robot lo toma en <= 5 s (respuesta de la telemetria)."""
    if c.idioma not in textos.IDIOMAS:
        raise HTTPException(400, f'idioma no soportado: {c.idioma} (es, en, zh, pt)')
    IDIOMA['actual'] = c.idioma
    return idioma_get()


@app.post('/api/robot/telemetria', tags=['robot'])
async def robot_telemetria_post(request: Request):
    """El cliente del X2 manda cada 5 s bateria, modo de movimiento, alertas y estado del Orin (llega por el tunel)."""
    solo_local(request)
    TELEMETRIA.clear()
    TELEMETRIA.update(await request.json(), t=time.time())
    return {'ok': True, 'idioma': IDIOMA['actual']}


@app.get('/api/robot/telemetria', tags=['robot'])
def robot_telemetria_get():
    """Lo ultimo que mando el robot y hace cuantos segundos (edad None: nunca mando nada)."""
    return {**TELEMETRIA, 'edad_s': round(time.time() - TELEMETRIA['t'], 1) if TELEMETRIA else None}


@app.post('/api/robot/{accion}', tags=['robot'])
def robot_accion(accion: str, request: Request):
    """Corre un paso del despliegue (deploy/deploy.md): red, ssh, comprobar, compilar_sdk, diagnostico, probar,
    recepcion (only_voice + recepcion en vivo) o normal. Solo uno a la vez."""
    solo_local(request)
    if accion not in ACCIONES:
        raise HTTPException(404, f'accion desconocida: {accion}')
    if robot.proc and robot.proc.poll() is None:
        raise HTTPException(409, f'ya corre {robot.accion}: detenlo primero')
    master, slave = pty.openpty()
    robot.accion, robot.codigo, robot.fd = accion, None, master
    robot_log(f'\n$ {" ".join(ACCIONES[accion])}\n')
    robot.proc = subprocess.Popen(ACCIONES[accion], cwd=ROOT, stdin=slave, stdout=slave, stderr=slave,
                                  start_new_session=True, env={**os.environ, 'TERM': 'dumb'})
    os.close(slave)
    threading.Thread(target=robot_leer, args=(robot.proc, master), daemon=True).start()
    return robot_estado(robot.n)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('PORT', 8000)))
