"""Prueba de la API completa sin camara ni navegador (usa una carpeta de datos temporal, no toca datos/).

Uso: python web/test_api.py CARA1.jpg CARA2.jpg      (dos fotos de frente de personas distintas)
Cubre: personas, captura por frames + seleccion + galeria + export YOLO, evaluar, identificar con decision y log,
envio a una base de datos externa (servidor falso local), cooldown, descarga CSV, reenvio y borrado.
"""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import cv2
import numpy as np

TMP = tempfile.mkdtemp(prefix='cerberus_api_')
os.environ['CERBERUS_DATOS'] = TMP
os.environ['CERBERUS_PASES'] = str(Path(TMP) / 'pases')
os.environ['CERBERUS_IDENT'] = str(Path(TMP) / 'identificacion')
os.environ['CERBERUS_INTENTO_S'] = '0'         # la ventana de 5 s se prueba aparte
import sqlite3  # noqa: E402
_old = sqlite3.connect(Path(TMP) / 'registros.db')   # base creada antes de los idiomas: debe migrarse sola
_old.execute('CREATE TABLE registros (id TEXT PRIMARY KEY, fecha TEXT, camara TEXT, estado TEXT, persona_id TEXT, nombre TEXT, '
             'rol TEXT, miembro INTEGER, confianza REAL, coseno REAL, accion TEXT, modelo TEXT, enviado INTEGER DEFAULT 0, error_envio TEXT)')
_old.commit()
_old.close()
os.environ.pop('CERBERUS_DB_URL', None)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fastapi.testclient import TestClient  # noqa: E402

import app as web  # noqa: E402

received = []


class FakeDb(BaseHTTPRequestHandler):
    served = b'[]'                                  # lo que devuelve un GET (base de invitaciones)

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(FakeDb.served)

    def do_POST(self):
        received.append((self.headers.get('Authorization'), json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
        self.send_response(201)
        self.end_headers()

    def log_message(self, *a):
        pass


def normalize(img, face_px=220):
    """Recorta alrededor de la cara y la deja de ~face_px de alto: fotos de distinto tamano dan frames comparables."""
    assert img is not None, 'no se pudo leer una foto'
    fc = web.engine.faces(img)
    assert fc, 'no hay cara en una de las fotos'
    x, y, w, h = fc[0]['box']
    crop = img[max(y - h, 0):y + 2 * h, max(x - w, 0):x + 2 * w]
    return cv2.resize(crop, None, fx=face_px / h, fy=face_px / h)


def frames(face, n, seed):
    """Frames 1280x720 con la cara en distinta escala, giro, posicion y luz (como una persona moviendose)."""
    rng, out = np.random.default_rng(seed), []
    for _ in range(n):
        s = rng.uniform(0.55, 0.8)
        f = cv2.resize(face, None, fx=s, fy=s)
        M = cv2.getRotationMatrix2D((f.shape[1] / 2, f.shape[0] / 2), rng.uniform(-12, 12), 1)
        f = cv2.warpAffine(f, M, (f.shape[1], f.shape[0]), borderMode=cv2.BORDER_REPLICATE)
        f = np.clip(f.astype(np.float32) * rng.uniform(0.8, 1.2), 0, 255).astype(np.uint8)
        canvas = np.full((720, 1280, 3), 110, np.uint8)
        x, y = int(rng.uniform(200, 1280 - f.shape[1] - 200)), int(rng.uniform(0, 720 - f.shape[0]))
        canvas[y:y + f.shape[0], x:x + f.shape[1]] = f
        out.append(cv2.imencode('.jpg', canvas)[1].tobytes())
    return out


def main(p1, p2):
    a, b = (normalize(cv2.imread(p)) for p in (p1, p2))
    c = TestClient(web.app)
    jpg = {'Content-Type': 'image/jpeg'}
    assert c.get('/api/salud').json()['ok']
    assert all(c.get(f'/{pg}').status_code == 200 for pg in ('captura', 'identificar', 'confirmar', 'roles', 'robot'))
    assert c.get('/static/comun.js').headers['cache-control'] == 'no-cache'          # nunca JS viejo tras actualizar

    assert c.put('/api/personas/ana_perez', json={'nombre': 'Ana Perez', 'rol': 'VIP'}).status_code == 200
    assert c.put('/api/personas/luis_pena', json={'nombre': 'Luis Pena', 'rol': 'EXTERNO'}).status_code == 200
    assert c.put('/api/personas/x', json={'nombre': 'X', 'rol': 'JEFE'}).status_code == 422          # rol invalido
    assert c.put('/api/personas/Mal Id', json={'nombre': 'X', 'rol': 'VIP'}).status_code == 422      # id invalido
    assert c.post('/api/captura/ana_perez/frame', content=b'no es imagen', headers=jpg).status_code == 400
    assert c.post('/api/captura/ana_perez/finalizar').status_code == 422                             # sin frames

    for pid, face, seed in (('ana_perez', a, 1), ('luis_pena', b, 2)):
        useful = sum(c.post(f'/api/captura/{pid}/frame?split=enrolamiento', content=f, headers=jpg).json()['util']
                     for f in frames(face, 30, seed))
        assert useful >= 10, f'{pid}: solo {useful} frames utiles'
        r = c.post(f'/api/captura/{pid}/finalizar?split=enrolamiento').json()
        assert 1 <= r['nuevas'] <= 15 and r['yolo']['personas'][pid]['train'] == r['total'], r
        print(f'  captura {pid}: {useful} utiles -> {r["nuevas"]} distintas guardadas')
    assert c.get('/api/salud').json()['personas_en_galeria'] == 2
    yolo = Path(TMP) / 'yolo' / 'train'
    assert sorted(d.name for d in yolo.iterdir()) == ['ana_perez', 'luis_pena']

    # validacion: el filtro de fuga descartaria tomas de la misma foto, asi que aqui se escriben directo
    for pid, face, seed in (('ana_perez', a, 7), ('luis_pena', b, 8)):
        d = Path(TMP) / 'validacion' / pid
        d.mkdir(parents=True)
        for k, f in enumerate(frames(face, 4, seed)):
            img = cv2.imdecode(np.frombuffer(f, np.uint8), cv2.IMREAD_COLOR)
            fc = web.engine.faces(img)
            if fc:
                x, y, w, h = fc[0]['box']
                cv2.imwrite(str(d / f'{k:02d}.jpg'), img[max(y - h // 2, 0):y + h + h // 2, max(x - w // 2, 0):x + w + w // 2])
    ev = c.post('/api/evaluar').json()
    assert ev['top1'] == 1.0 and ev['cos_reject'] + 0.10 <= ev['cos_sure'] <= 0.60, ev   # cos_sure topado
    print(f'  evaluar: top-1 {ev["top1"]:.0%}, cos_reject {ev["cos_reject"]}, cos_sure {ev["cos_sure"]}')

    srv = HTTPServer(('127.0.0.1', 0), FakeDb)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_port}/registros'
    assert c.put('/api/config', json={'url': 'ftp://x', 'token': ''}).status_code == 422
    assert c.put('/api/config', json={'url': url, 'token': 's3cret'}).json()['token_configurado']

    def identify(face, seed, cam='test', lang='es'):
        dec = None
        for f in frames(face, 8, seed):
            r = c.post(f'/api/identificar?camara={cam}&lang={lang}', content=f, headers=jpg).json()
            dec = r['decision'] or dec
        return dec, r

    d, r = identify(a, 20)
    assert r['caras'] and r['caras'][0]['persona_id'] == 'ana_perez' and r['caras'][0]['rol'] == 'VIP'
    assert d['estado'] == 'RECONOCIDO' and d['rol'] == 'VIP' and d['miembro'] == 1 and d['registrado'], d
    assert len(received) == 1 and received[0][0] == 'Bearer s3cret' and received[0][1]['rol'] == 'VIP'
    print(f'  identificar: {d["nombre"]} -> {d["rol"]} (conf {d["confianza"]}); enviado a la DB externa: "{d["accion"]}"')
    d2, _ = identify(a, 21)
    assert d2['rol'] == 'VIP' and not d2['registrado'] and len(received) == 1        # cooldown: no duplica
    d3, _ = identify(b, 22)
    assert d3['rol'] == 'EXTERNO' and d3['miembro'] == 0 and d3['registrado'] and len(received) == 2
    empty = cv2.imencode('.jpg', np.full((720, 1280, 3), 110, np.uint8))[1].tobytes()
    for _ in range(8):
        r = c.post('/api/identificar?camara=vacia', content=empty, headers=jpg).json()
    assert r['decision']['estado'] == 'SIN_ROSTRO' and 'registrado' not in r['decision']   # nadie: no se registra

    rows = c.get('/api/registros').json()
    assert len(rows) == 2 and all(x['enviado'] == 1 for x in rows)
    csv = c.get('/api/registros/descargar?formato=csv').text
    assert csv.splitlines()[0].startswith('id,fecha,camara,estado') and len(csv.splitlines()) == 3
    srv.shutdown()
    srv.server_close()
    d4, _ = identify(a, 30, cam='otra')                                                  # DB externa caida
    assert d4['registrado'], d4
    assert c.get('/api/registros').json()[0]['enviado'] == 0
    assert c.post('/api/registros/reenviar').json()['pendientes'] == 1
    print('  DB externa caida: el registro queda pendiente y se puede reenviar')
    dec = None                                          # dos personas conocidas a la vez: saluda a las dos
    for x, y in zip(frames(a, 8, 40), frames(b, 8, 41)):
        par = np.hstack([cv2.imdecode(np.frombuffer(z, np.uint8), cv2.IMREAD_COLOR) for z in (x, y)])
        r = c.post('/api/identificar?camara=pareja', content=cv2.imencode('.jpg', par)[1].tobytes(), headers=jpg).json()
        dec = r['decision'] or dec
    assert len(r['caras']) == 2 and dec['persona_id'] == 'ana_perez' and dec['registrado'], (r['caras'], dec)
    assert [x['persona_id'] for x in dec.get('acompanantes', [])] == ['luis_pena'] and dec['acompanantes'][0]['accion'], dec
    print(f'  dos personas: "{dec["accion"]}" + "{dec["acompanantes"][0]["accion"]}"')

    # --- idiomas: la misma decision en ingles, mandarin y portugues; el log guarda el idioma ---
    for k, (lang, start) in enumerate((('en', 'Welcome back, Ana!'), ('zh', 'Ana，欢迎回来'), ('pt', 'Bem-vindo de volta, Ana!'))):
        d, _ = identify(a, 70 + k, cam=f'lang{lang}', lang=lang)
        assert d['registrado'] and d['accion'].startswith(start), (lang, d['accion'])
        assert c.get('/api/registros?limit=1').json()[0]['idioma'] == lang
    print(f'  idiomas: "{d["accion"][:40]}..." (pt) y el log guarda el idioma')

    # --- umbrales ---
    u = c.get('/api/umbrales').json()
    assert c.put('/api/umbrales', json={'cos_reject': 0.2}).status_code == 422               # por debajo del piso de SFace
    assert c.put('/api/umbrales', json={'cos_sure': u['cos_reject'] + 0.01}).status_code == 422
    assert c.put('/api/umbrales', json={'cos_sure': 0.55}).json()['cos_sure'] == 0.55
    assert c.put('/api/umbrales', json={'cos_sure': u['cos_sure']}).json()['ajuste_manual']

    # --- el robot como cliente de la API (x2/cerberus_x2.py --api): mismo cerebro, otro cuerpo ---
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'x2'))
    from cerberus_x2 import FLOWS, ApiBrain

    class FakeRobot:
        def __init__(self):
            self.log = []

        def say(self, text, lang='es'):
            self.log.append(('say', lang, text))

        def light(self, rgb, mode):
            self.log.append(('led', rgb))

        def face(self, emotion_id):
            self.log.append(('cara', emotion_id))

        def gesture(self, motion, area, interrupt=False):
            self.log.append(('gesto', motion))
    robot = FakeRobot()
    brain = ApiBrain(robot, lambda path, body=None, ctype='image/jpeg': c.post(path, content=body or b'', headers={'Content-Type': ctype}).json(),
                     camara='x2-prueba', lang='en')
    for f in frames(a, 8, 95):
        brain.step(f)
    assert ('led', FLOWS['VIP']['led']) in robot.log and any(x[0] == 'say' and x[2].startswith('Welcome back, Ana') for x in robot.log), robot.log
    dicho = [x for x in robot.log if x[0] == 'say'][-1][2]
    assert ('gesto', 3001) in robot.log and dicho.endswith('Would you like to go to the tennis court?'), robot.log
    assert brain.pregunta == 'tenis'                                                   # la proxima frase responde a esa pregunta
    print(f'  robot cliente de la API: {dicho[:50]}... + LED VIP + saludo con la mano + pregunta del tenis')

    # --- cara dudosa: primero 5 s (aqui 0.6 s) intentando, con la pista "retira la mano"; despues el documento ---
    cal_file = Path(TMP) / 'calibration.json'
    saved_cal = cal_file.read_text()
    cal_file.write_text(json.dumps({'cos_reject': 0.438, 'cos_sure': 0.999}))   # fuerza PROBABLE con la misma cara
    web.INTENTO_S = 0.6
    d, _ = identify(a, 80, cam='ventana', lang='en')
    assert d['reintento'] and 'confirmacion' not in d and d['pistas'][0].startswith('I cannot see you well'), d
    import time as _time
    _time.sleep(0.7)
    d, _ = identify(a, 81, cam='ventana', lang='en')
    assert d['confirmacion'] and d['accion'].startswith('You look like Ana'), d
    web.INTENTO_S = 0.0
    cal_file.write_text(saved_cal)
    print('  ventana: primero "retira la mano", y pasado el tiempo pide cedula o pase')

    # --- cedula: registro (la API nunca devuelve el numero completo) ---
    person = lambda pid, nombre, rol, ced='': c.put(f'/api/personas/{pid}', json={'nombre': nombre, 'rol': rol, 'cedula': ced})
    assert person('ana_perez', 'Ana Perez', 'VIP', '1.012.345.678').json()['cedula'] == '******5678'
    assert person('luis_pena', 'Luis Pena', 'EXTERNO', '1012345678').status_code == 409       # cedula de otra persona
    assert person('luis_pena', 'Luis Pena', 'EXTERNO', '12').status_code == 422
    assert person('luis_pena', 'Luis Pena', 'EXTERNO', '79123456').status_code == 200
    assert person('ana_perez', 'Ana Perez', 'VIP').json()['cedula'] == '******5678'           # vacio no la borra
    assert '1012345678' not in json.dumps(c.get('/api/personas').json())

    # --- cara dudosa (PROBABLE) -> /confirmar con cedula o pase QR, detectado solo ---
    cal_file = Path(TMP) / 'calibration.json'
    cal_file.write_text(json.dumps({'cos_reject': 0.438, 'cos_sure': 0.999}))   # fuerza PROBABLE con la misma cara
    qp, docs = web.qr_pass, web.documentos

    def put_frame(small, x=400, y=200):
        f = np.full((720, 1280, 3), 110, np.uint8)
        f[y:y + small.shape[0], x:x + small.shape[1]] = small
        return cv2.imencode('.jpg', f)[1].tobytes()

    qr_frame = lambda text: put_frame(cv2.cvtColor(cv2.resize(qp.to_image(text, 10), (300, 300),
                                                              interpolation=cv2.INTER_AREA), cv2.COLOR_GRAY2BGR), 500)

    def confirm(seed, frame=None, modo='por_confirmar'):
        d, _ = identify(a, seed, cam=f'conf{seed}')
        assert d['rol'] == 'POR_CONFIRMAR' and d['confirmacion'] and not d['registrado'], d
        cid = d['confirmacion']
        assert c.get(f'/api/confirmar/{cid}').json()['modo'] == modo
        assert c.post(f'/api/confirmar/{cid}', content=empty, headers=jpg).json()['estado'] == 'ESPERANDO'
        r = (c.post(f'/api/confirmar/{cid}', content=frame, headers=jpg) if frame
             else c.post(f'/api/confirmar/{cid}/sin-pase')).json()
        assert r['registrado'] and c.get(f'/api/confirmar/{cid}').status_code == 404   # no se reutiliza
        return r

    r = confirm(40, qr_frame(qp.make_pass('socio', 'ana_perez', 'Ana Perez')))
    assert (r['estado'], r['rol'], r['documento']) == ('CONFIRMADO_QR', 'VIP', 'pase QR'), r
    print(f'  confirmar: pase propio            -> {r["rol"]} ({r["motivo"]})')
    pase = qr_frame(qp.make_pass('socio', 'ana_perez', 'Ana Perez'))                   # sin ninguna cara en el frame
    r = c.post('/api/identificar?camara=solo-doc', content=pase, headers=jpg).json()
    assert not r['caras'] and r['decision']['rol'] == 'VIP' and 'cara no visible' in r['decision']['motivo'], r
    assert c.post('/api/identificar?camara=solo-doc', content=pase, headers=jpg).json()['decision'] is None   # una vez
    print(f'  sin cara, solo el pase QR         -> {r["decision"]["rol"]} ({r["decision"]["motivo"]})')
    r = confirm(41, put_frame(docs.tarjeta_prueba(1012345678)))
    assert (r['estado'], r['rol'], r['tipo_documento']) == ('CONFIRMADO_CEDULA', 'VIP', 'cedula_digital'), r
    assert r['accion'].startswith('¡Listo, Ana! Ya le identifiqué con su cédula.'), r['accion']
    print(f'  confirmar: cedula digital propia  -> {r["rol"]}: "{r["accion"][:46]}..."')
    # --- cedula dicha en voz alta (Whisper simulado): solo con la cara del titular; el numero nunca vuelve completo ---
    escucha = web.voz.listen

    def dice(texto, cid=None):
        web.voz.listen = lambda *a: {'texto': texto, 'idioma': 'es', 'cambio_idioma': False, **web.voz.understand(texto, 'es')}
        return c.post('/api/voz' + (f'?cid={cid}' if cid else ''), content=b'audio').json()
    d, _ = identify(a, 70, cam='conf70')
    r = dice('mi cédula es 1.012.345.678', d['confirmacion'])
    assert (r['confirmacion']['estado'], r['confirmacion']['rol']) == ('CONFIRMADO_CEDULA', 'VIP'), r
    assert '1012345678' not in json.dumps(r) and '******5678' in r['texto'], r
    print(f'  confirmar: cedula dicha propia    -> {r["confirmacion"]["rol"]} ("{r["texto"]}")')
    d, _ = identify(a, 71, cam='conf71')
    r = dice('setenta y nueve doce treinta y cuatro cincuenta y seis', d['confirmacion'])     # en palabras: la de Luis
    assert r['confirmacion']['rol'] == 'ESCALAMIENTO' and 'no corresponde al titular' in r['confirmacion']['motivo'], r
    print(f'  confirmar: cedula dicha de otro   -> recepcion ({r["confirmacion"]["motivo"]})')
    r = dice('mi cedula es 1012345678')                          # sin confirmacion abierta: que lo mire primero
    assert 'confirmacion' not in r and 'míreme' in r['respuesta'], r
    web.voz.listen = escucha
    cases = [(qr_frame(qp.make_pass('externo', 'luis_pena', 'Luis Pena')), 'la cara no corresponde al titular'),
             (put_frame(docs.pdf417_prueba(79123456), 300), 'la cara no corresponde al titular'),
             (put_frame(docs.tarjeta_prueba(52000111)), 'no esta en los registros'),
             (qr_frame(qp.make_pass('socio', 'ana_perez', 'Ana Perez', horas=-1)), 'pase vencido'),
             (qr_frame(qp.make_pass('socio', 'ana_perez', 'Ana Perez')[:-1] + 'x'), 'pase alterado'),
             (qr_frame(qp.make_pass('invitado', 'ana_perez', 'Ana Perez')), 'pase de invitado para alguien con rol VIP'),
             (None, 'no mostro cedula ni pase')]
    names = ['pase de otra persona', 'cedula amarilla de otra persona', 'cedula no registrada', 'pase vencido',
             'pase alterado', 'pase de tipo equivocado', 'sin documento']
    for k, ((frame, why), name) in enumerate(zip(cases, names)):
        r = confirm(42 + k, frame)
        assert r['rol'] == 'ESCALAMIENTO' and why in r['motivo'], (why, r)
        print(f'  confirmar: {name:24s} -> recepcion ({r["motivo"]})')
    d, _ = identify(a, 50, cam='conf50')                       # un QR ajeno no cierra: pide el frente de la cedula
    r = c.post(f'/api/confirmar/{d["confirmacion"]}', content=qr_frame('https://otra-cosa.com'), headers=jpg).json()
    assert r['estado'] == 'ESPERANDO' and 'no es un pase de N Club' in r['pista'], r
    cal_file.unlink()

    png = c.get('/api/pases/ana_perez.png')
    assert png.status_code == 200 and png.headers['content-type'] == 'image/png'
    img = cv2.imdecode(np.frombuffer(png.content, np.uint8), cv2.IMREAD_COLOR)
    assert qp.validate(web.qr_lector.read(img))['ok'], 'el PNG del pase no se lee como valido'
    assert not qp.validate(web.qr_lector.read(cv2.imdecode(np.frombuffer(
        c.get('/api/pases/ana_perez.png?variante=vencido').content, np.uint8), 1)))['ok']
    g = c.post('/api/pases/generar').json()
    assert {'ana_perez.png', 'luis_pena.png', 'pases_cerberus.pdf'} <= set(g['archivos']), g
    print(f'  pases: {", ".join(g["archivos"])}')

    # --- cara NO reconocida (DESCONOCIDO): tambien va a /confirmar ---
    assert c.delete('/api/personas/ana_perez').json() == {'borrado': 'ana_perez'}     # su cara ya no esta en la galeria
    assert person('ana_dos', 'Ana Dos', 'INVITADO', '52000111').status_code == 200    # invitada registrada solo con cedula
    r = confirm(60, put_frame(docs.tarjeta_prueba(52000111)), modo='desconocido')
    assert (r['estado'], r['rol']) == ('CONFIRMADO_CEDULA', 'INVITADO') and 'sin fotos' in r['motivo'], r
    print(f'  desconocido + cedula de invitada sin fotos -> {r["rol"]}')
    r = confirm(61, put_frame(docs.pdf417_prueba(79123456), 300), modo='desconocido')
    assert r['rol'] == 'ESCALAMIENTO' and 'no corresponde al titular' in r['motivo'], r
    print(f'  desconocido + cedula de Luis (extrano)     -> recepcion ({r["motivo"]})')
    assert confirm(62, None, modo='desconocido')['rol'] == 'ESCALAMIENTO'

    # --- carpeta identificacion/: fotos de la cedula -> numero registrado + cara de la cedula como referencia ---
    def id_photo(numero, face):
        card = docs.tarjeta_prueba(numero).copy()
        card[65:225, 15:140] = cv2.resize(face, (125, 160))       # la foto impresa en la cedula
        big = cv2.resize(card, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)   # como una foto de celular
        return cv2.imencode('.jpg', big)[1].tobytes()

    for pid, face, num in (('ana_tres', a, 33000444), ('eva_ruiz', b, 41000222)):
        assert person(pid, pid.replace('_', ' ').title(), 'INVITADO').status_code == 200
        r = c.post(f'/api/identificacion/{pid}', content=id_photo(num, face), headers=jpg).json()
        assert r['documento'] == 'cedula_digital' and r['cedula'] == docs.mask(num) and r['cara'], r
    assert c.post('/api/identificacion/nadie', content=id_photo(1, a), headers=jpg).status_code == 404
    (Path(TMP) / 'identificacion' / 'no_registrado').mkdir()
    (Path(TMP) / 'identificacion' / 'no_registrado' / 'x.jpg').write_bytes(id_photo(55000666, a))
    out = c.post('/api/identificacion/procesar').json()
    assert {'ana_tres', 'eva_ruiz'} <= set(out['personas_con_cedula'])
    assert any(f['persona'] == 'no_registrado' and 'error' in f for f in out['fotos'])
    print(f'  identificacion/: {len(out["fotos"])} fotos -> cedulas de {", ".join(out["personas_con_cedula"])}')
    r = confirm(63, put_frame(docs.tarjeta_prueba(33000444)), modo='desconocido')
    assert r['estado'] == 'CONFIRMADO_CEDULA' and 'foto de su cedula' in r['motivo'], r
    print(f'  desconocido + su cedula (cara = foto de la cedula) -> {r["rol"]} ({r["motivo"]})')
    r = confirm(64, put_frame(docs.tarjeta_prueba(41000222)), modo='desconocido')
    assert r['rol'] == 'ESCALAMIENTO' and 'foto de su cedula' in r['motivo'], r
    print(f'  desconocido + cedula de Eva (otra cara)         -> recepcion ({r["motivo"]})')

    # --- invitado con UNA foto (push y sincronizacion desde una base externa) ---
    import base64
    foto = base64.b64encode(cv2.imencode('.jpg', a)[1].tobytes()).decode()
    assert person('socio_x', 'Socio Xavier', 'REGULAR').status_code == 200            # el anfitrion
    bad = c.post('/api/invitados', json={'nombre': 'Laura Diaz', 'anfitrion': 'socio_x', 'foto_base64': 'no-es-base64!'})
    assert bad.status_code == 422
    assert c.post('/api/invitados', json={'nombre': 'Nadie', 'anfitrion': 'socio_x',
                                           'foto_base64': base64.b64encode(cv2.imencode('.jpg', np.full((300, 300, 3), 90, np.uint8))[1].tobytes()).decode()}).status_code == 422
    g = c.post('/api/invitados', json={'nombre': 'Laura Diaz', 'anfitrion': 'socio_x', 'foto_base64': foto,
                                       'valido_hasta': '2099-12-31'}).json()
    assert g['id'] == 'laura_diaz' and g['anfitrion'] == 'Socio Xavier' and g['anfitrion_registrado'], g
    d, _ = identify(a, 90, cam='inv')
    assert (d['estado'], d['rol']) == ('RECONOCIDO', 'INVITADO') and 'Socio Xavier le espera' in d['accion'], d
    d, _ = identify(a, 91, cam='inv_en', lang='en')
    assert 'Socio Xavier is waiting for you' in d['accion'], d['accion']
    print(f'  invitado con 1 foto -> {d["rol"]}: "{d["accion"][:60]}..."')
    c.post('/api/invitados', json={'nombre': 'Laura Diaz', 'anfitrion': 'socio_x', 'foto_base64': foto, 'valido_hasta': '2020-01-01'})
    d, _ = identify(a, 92, cam='inv_vencida')
    assert d['rol'] == 'ESCALAMIENTO' and 'venció' in d['accion'], d
    print(f'  invitacion vencida -> recepcion: "{d["accion"]}"')
    FakeDb.served = json.dumps([{'nombre': 'Laura Diaz', 'anfitrion': 'Socio Xavier', 'foto_base64': foto, 'valido_hasta': '2099-12-31'},
                                {'nombre': 'Sin Foto', 'anfitrion': 'socio_x'}]).encode()
    srv = HTTPServer(('127.0.0.1', 0), FakeDb)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    assert c.put('/api/config', json={'invitados_url': f'http://127.0.0.1:{srv.server_port}/invitados'}).json()['url']  # no borra url
    s1 = c.post('/api/invitados/sincronizar').json()
    assert (s1['leidas'], s1['enroladas']) == (2, 1) and 'falta la foto' in s1['detalle'][1]['error'], s1
    s2 = c.post('/api/invitados/sincronizar').json()
    assert s2['detalle'][0].get('sin_cambios'), s2                                    # misma foto: no se reprocesa
    srv.shutdown()
    srv.server_close()
    assert 'laura_diaz' in [x['id'] for x in c.get('/api/invitados').json()]
    print('  sincronizacion: 1 de 2 invitaciones enrolada (la otra sin foto), la segunda vez sin cambios')

    # --- editar personas (panel de administracion): no se pierde el anfitrion, el nombre llega a la galeria ---
    r = person('laura_diaz', 'Laura Diaz', 'INVITADO').json()                         # re-guardar sin tocar invitacion
    assert r['anfitrion'] == 'Socio Xavier' and r['valido_hasta'] == '2099-12-31', r
    r = c.put('/api/personas/laura_diaz', json={'nombre': 'Laura D', 'rol': 'INVITADO', 'anfitrion': 'socio_x',
                                                 'valido_hasta': ''}).json()
    assert r['nombre'] == 'Laura D' and r['valido_hasta'] is None
    assert c.put('/api/personas/laura_diaz', json={'nombre': 'Laura D', 'rol': 'INVITADO', 'valido_hasta': 'mañana'}).status_code == 422
    d, _ = identify(a, 96, cam='editada')
    assert d['nombre'] == 'Laura D' and 'Socio Xavier' in d['accion'], d                # renombrada en la galeria
    r = person('laura_diaz', 'Laura D', 'PERSONAL').json()
    assert r['anfitrion'] is None and r['valido_hasta'] is None                        # ya no es invitada
    d, _ = identify(a, 97, cam='editada2')
    assert d['rol'] == 'PERSONAL', d
    print('  editar: re-guardar conserva el anfitrion; renombrar llega a la galeria; cambiar rol limpia la invitacion')

    # --- voz: audio real (voz del Mac) en ingles; el idioma lo fija la app (PUT /api/idioma), no la voz ---
    import shutil
    import subprocess
    tts = shutil.which('say') or shutil.which('espeak-ng')
    if tts and shutil.which('ffmpeg'):
        aiff, webm = Path(TMP) / 'v.wav', Path(TMP) / 'v.webm'
        subprocess.run(['say', '-v', 'Samantha', 'Hello, where is the restroom?', '-o', str(aiff), '--data-format=LEI16@22050']
                       if tts.endswith('say') else ['espeak-ng', '-v', 'en-us', '-w', str(aiff), 'Hello, where is the restroom?'], check=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(aiff), '-c:a', 'libopus', str(webm)], check=True)
        assert c.get('/api/idioma').json()['idioma'] == 'es' and c.put('/api/idioma', json={'idioma': 'fr'}).status_code == 400
        assert c.put('/api/idioma', json={'idioma': 'en'}).json()['idioma'] == 'en'
        assert c.post('/api/robot/telemetria', json={}, headers={'Host': '127.0.0.1'}).json()['idioma'] == 'en'          # el robot lo toma de aqui
        v = c.post('/api/voz?lang=en', content=webm.read_bytes(), headers={'Content-Type': 'audio/webm'}).json()
        assert (v['idioma'], v['cambio_idioma'], v['intencion']) == ('en', False, 'bano') and v['respuesta'].startswith('The restrooms'), v
        c.put('/api/idioma', json={'idioma': 'es'})
        print(f'  voz: "{v["texto"]}" -> {v["idioma"]}, {v["intencion"]}: "{v["respuesta"]}"')
    assert c.post('/api/voz', content=b'no es audio').status_code == 400

    # --- panel /robot: ultimo frame por camara, y un paso del despliegue en pseudo-terminal que pide una respuesta ---
    import time
    assert any(x['camara'] == 'editada2' and x['decision'] for x in c.get('/api/camaras').json())
    g = a                                                                               # el X2 entrega la imagen al reves
    r = c.post('/api/identificar?camara=x2&girar=180', content=cv2.imencode('.jpg', cv2.rotate(g, cv2.ROTATE_180))[1].tobytes(), headers=jpg).json()
    assert r['caras'] and r['caras'][0]['persona_id'], r                               # girada de vuelta: la reconoce
    assert np.array_equal(web.camaras['x2']['img'].shape, g.shape)
    web.camaras.pop('x2')
    assert c.get('/api/camaras/editada2.jpg').content[:2] == b'\xff\xd8' and c.get('/api/camaras/nadie.jpg').status_code == 404
    local = {'host': '127.0.0.1:8000'}
    web.camaras['x2'] = dict(img=np.zeros((8, 8, 3), np.uint8), t=time.time(), caras=[], decision=None)   # el X2 manda frames
    assert c.get('/api/salud').json()['robot_activo']
    assert c.post('/api/identificar?camara=web', content=b'x', headers=jpg).status_code == 409   # el laptop en pausa
    web.camaras['x2']['t'] -= 10                                                       # el robot paro
    assert not c.get('/api/salud').json()['robot_activo']
    luces = {x['id']: x['ok'] for x in c.get('/api/robot/conexion').json()}
    assert luces['cerebro'] and luces['galeria'] and not luces['cliente'] and not luces['camara'], luces
    web.ACCIONES['eco'] = ['bash', '-c', 'printf "password: "; read x; echo "dijo $x"; sleep 30']
    assert c.post('/api/robot/eco', headers={**local, 'origin': 'http://malo.example'}).status_code == 403   # otra web
    assert c.post('/api/robot/eco').status_code == 403                                  # Host ajeno (DNS rebinding)
    assert c.post('/api/robot/rm', headers=local).status_code == 404                     # solo las acciones de la lista
    assert c.post('/api/robot/eco', headers=local).json()['corriendo']
    assert c.post('/api/robot/eco', headers=local).status_code == 409                    # uno a la vez
    for _ in range(50):
        if c.get('/api/robot/estado').json()['parcial'].endswith('password: '):
            break
        time.sleep(0.1)
    assert c.post('/api/robot/entrada', json={'texto': 'hola'}, headers=local).json()['ok']
    for _ in range(50):
        if 'dijo hola' in c.get('/api/robot/estado').json()['lineas']:
            break
        time.sleep(0.1)
    else:
        raise AssertionError(c.get('/api/robot/estado').json())
    c.post('/api/robot/detener', headers=local)
    for _ in range(50):
        r = c.get('/api/robot/estado').json()
        if not r['corriendo'] and r['codigo'] is not None:
            break
        time.sleep(0.1)
    assert not r['corriendo'] and r['codigo'] != 0, r
    print('  panel robot: frame por camara; paso en pseudo-terminal con pregunta y respuesta; detener; rechaza otra web')

    now = time.time()                                   # salida: entro hace 100 s, no se le vio y vuelve a aparecer
    web.entrada('luis_pena', now - 100)
    assert not web.va_saliendo('luis_pena', now - 90)
    web.visto('luis_pena', now)
    assert not web.va_saliendo('luis_pena', now)        # la despedida automatica por cara viene apagada
    web.SALIDA_AUTO = True
    assert web.va_saliendo('luis_pena', now)
    web.SALIDA_AUTO = False
    s = c.post('/api/salida/luis_pena').json()
    assert s['estado'] == 'SALIDA' and s['sentido'] == 'sale' and s['registrado'], s
    assert s['accion'].startswith('Gracias por su trabajo, Luis Pena.') and 'luis_pena' not in web.visitas, s
    assert c.post('/api/salida/desconocido').json()['accion'] == 'Gracias por su visita. Hasta pronto.'
    assert c.put('/api/personas/ines', json={'nombre': 'Ines', 'rol': 'INVITADO', 'anfitrion': 'luis_pena'}).status_code == 200
    s = c.post('/api/salida/ines?lang=en').json()
    assert s.get('rostro_borrado') and 'ines' not in c.get('/api/personas').json().__repr__(), s   # invitado: se borra
    assert 'reception will gladly tell you how' in s['accion'], s
    print('  salida: despedida por categoria al volver a verse; invitado borrado de la galeria; desconocido generico')

    assert c.delete('/api/personas/luis_pena').json() == {'borrado': 'luis_pena'}
    assert 'luis_pena' not in web.Gallery(web.cap.GALERIA).ids                          # quedan solo los invitados
    assert not (Path(TMP) / 'dataset' / 'luis_pena').exists()
    print(f'test_api OK  (datos temporales en {TMP})')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
