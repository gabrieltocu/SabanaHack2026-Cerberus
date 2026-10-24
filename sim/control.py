"""Tablero de control del club simulado: el club se ve en la ventana de MuJoCo y esta pagina del navegador junta lo
que antes eran ventanas sueltas (panel de decision, camaras del robot, mapa SLAM, bitacora, apps del concierge y del anfitrion) y
botones para mandar gente, provocar imprevistos y controlar la simulacion.

  python sim/run_club.py --control            # visor de MuJoCo + http://127.0.0.1:8090 (en Mac: mjpython)
  python sim/run_club.py --control --api http://127.0.0.1:8080/api   # con la API real del club

El simulador corre en el hilo principal (MuJoCo y el render fuera de pantalla); el servidor solo entrega lo ultimo
que se dibujo y encola lo que se pulsa.
"""
import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

PUERTO = 8090

# botones "mandar persona": contrato de vision + lo que contestaria (datos de prueba del club simulado)
PERSONAS = {
    'vip': ('Socia VIP', {'categoria': 'VIP', 'persona_id': 'sofia', 'confianza': 0.96, 'respuestas': ['sí, como siempre'],
                          'preguntas_m': [(3, '¿Mi esposo ya llegó?'), (8, '¿Hoy hay algún evento en el club?')]}),
    'vip_gimnasio': ('Socia VIP que hoy va al gimnasio', {'categoria': 'VIP', 'persona_id': 'sofia', 'confianza': 0.96,
                                                          'respuestas': ['no, hoy voy al gimnasio', 'al gimnasio'],
                                                          'preguntas_m': [(3, '¿Hoy hay entrenador?'), (9, '¿Dónde quedan los casilleros?')]}),
    'vip_spa': ('Miembro VIP que hoy va al spa', {'categoria': 'VIP', 'persona_id': 'ricardo', 'confianza': 0.95,
                                                  'respuestas': ['no, hoy no', 'voy al spa'],
                                                  'preguntas_m': [(3, '¿El spa tiene masajes hoy?'), (10, '¿Puedo pedir algo en la terraza?')]}),
    'regular_siempre': ('Socio con su destino de siempre', {'categoria': 'REGULAR', 'persona_id': 'andres', 'confianza': 0.94,
                                                           'respuestas': ['sí, como siempre']}),
    'regular_confuso': ('Socio al que no se le entiende', {'categoria': 'REGULAR', 'persona_id': 'carlos', 'confianza': 0.93,
                                                          'respuestas': ['eh, pues...', 'mmm, no sé']}),
    'sin_orden': ('Técnico sin orden de trabajo', {'categoria': 'DESCONOCIDO', 'persona_id': None, 'confianza': 0.6,
                                                   'respuestas': ['vengo a hacer un mantenimiento']}),
    'regular': ('Socio regular', {'categoria': 'REGULAR', 'persona_id': 'carlos', 'confianza': 0.93,
                                  'respuestas': ['al restaurante']}),
    'invitada': ('Invitada en la agenda', {'categoria': 'VISITANTE', 'persona_id': 'laura', 'confianza': 0.97}),
    'desconocido_ok': ('Desconocido: el anfitrión lo espera', {'categoria': 'DESCONOCIDO', 'persona_id': None,
                                                              'confianza': 0.9,
                                                              'respuestas': ['vengo invitado', 'me invitó Andrés']}),
    'desconocido_no': ('Desconocido: el anfitrión no lo conoce', {'categoria': 'DESCONOCIDO', 'persona_id': None,
                                                                 'confianza': 0.9,
                                                                 'respuestas': ['vengo invitado', 'me invitó Sofía']}),
    'piscina': ('Socia va a la piscina (le indica el camino)', {'categoria': 'REGULAR', 'persona_id': 'valentina', 'confianza': 0.95,
                                                      'respuestas': ['voy a nadar a la piscina'],
                    'preguntas_m': [(6, '¿Hay toallas en la piscina?'), (20, '¿Hasta qué hora está abierta la piscina?')]}),
    'tenis': ('Socio va a la cancha de tenis (le indica)', {'categoria': 'REGULAR', 'persona_id': 'mateo', 'confianza': 0.94,
                                                'respuestas': ['vengo a jugar tenis'],
                    'preguntas_m': [(4, '¿Se pueden alquilar raquetas?'), (9, '¿Hay que reservar la cancha?')]}),
    'gimnasio': ('Socio va al gimnasio (le indica el ascensor)', {'categoria': 'REGULAR', 'persona_id': 'carlos', 'confianza': 0.93,
                                                     'respuestas': ['al gimnasio'],
                    'preguntas_m': [(3, '¿Hoy hay entrenador en el gimnasio?'), (9, '¿Dónde quedan los casilleros?')]}),
    'spa': ('Socia va al spa (le indica el ascensor)', {'categoria': 'REGULAR', 'persona_id': 'valentina', 'confianza': 0.95,
                                          'respuestas': ['voy al spa'],
                    'preguntas_m': [(3, '¿Tengo que reservar el masaje?'), (9, '¿La terraza bar ya está abierta?')]}),
    'timida': ('Invitada que se queda lejos', {'categoria': 'VISITANTE', 'persona_id': 'laura', 'confianza': 0.97,
                                               'timido': True}),
    'personal': ('Empleada en turno', {'categoria': 'EMPLEADO', 'persona_id': 'marta', 'confianza': 0.95}),
    'fuera_turno': ('Empleado fuera de turno', {'categoria': 'EMPLEADO', 'persona_id': 'pablo', 'confianza': 0.94}),
    'contratista': ('Contratista con orden', {'categoria': 'VISITANTE', 'persona_id': 'luis', 'confianza': 0.94}),
    'cedula_ajena': ('Cédula de otra persona', {'categoria': 'ESCALAMIENTO', 'persona_id': None, 'confianza': 0.31,
                                               'metodo': 'rostro + cedula', 'motivo': 'la cedula es de otra persona'}),
}
CON_API_REAL = {'regular': 'andres', 'invitada': 'inv-00000001'}     # ids de los datos de la API de Marshal
# escenarios posibles: (cuando, que, cual) en segundos simulados desde que se lanza. La gente que llega con el robot
# ocupado espera su turno; los imprevistos pasan cuando pasan (el robot no los conoce).
ESCENARIOS = {
    'rol_vip': ('Miembros VIP', 'Sofía va al lounge como siempre (un carrito en la ruta y la puerta no abre); Ricardo hoy '
                'va al spa: lo acompaña en ascensor',
                [(0, 'persona', 'vip'), (0, 'imprevisto', 'carrito'), (0, 'imprevisto', 'puerta'), (20, 'persona', 'vip_spa')]),
    'rol_socio': ('Socios', 'Carlos al restaurante, Andrés al salón como siempre, Valentina a la piscina y Mateo a la cancha: '
                  'les indica el camino; a uno no se le entiende: recepción',
                  [(0, 'persona', 'regular'), (4, 'persona', 'regular_siempre'), (8, 'persona', 'piscina'),
                   (12, 'persona', 'tenis'), (16, 'persona', 'regular_confuso')]),
    'rol_invitado': ('Invitados', 'Laura en la agenda (un mesero se atraviesa y la puerta no abre); un invitado sin cita '
                     'al que el anfitrión espera (valla en el pasillo); una invitada que se queda lejos',
                     [(0, 'persona', 'invitada'), (0, 'imprevisto', 'mesero'), (0, 'imprevisto', 'puerta'),
                      (15, 'persona', 'desconocido_ok'), (60, 'imprevisto', 'valla'), (30, 'persona', 'timida')]),
    'rol_personal': ('Personal', 'Marta llega en su turno y marca su entrada; Pablo llega fuera de su turno: recepción; '
                     'a Juan se le baja la batería y va a cambiarla',
                     [(0, 'persona', 'personal'), (4, 'persona', 'fuera_turno'), (8, 'imprevisto', 'bateria')]),
    'rol_contratista': ('Contratistas', 'Luis viene con orden de trabajo: lo acompaña con chaleco y una valla le cierra el '
                        'pasillo; un técnico sin orden pasa a recepción',
                        [(0, 'persona', 'contratista'), (0, 'imprevisto', 'valla'), (10, 'persona', 'sin_orden')]),
    'rol_sin_registro': ('Sin registro', 'Un desconocido al que nadie espera y una cédula de otra persona: recepción',
                         [(0, 'persona', 'desconocido_no'), (5, 'persona', 'cedula_ajena')]),
    'manana': ('Mañana normal', 'Llegan una socia VIP, un socio, una invitada, una empleada y un contratista',
               [(0, 'persona', 'vip'), (20, 'persona', 'regular'), (40, 'persona', 'invitada'),
                (60, 'persona', 'personal'), (80, 'persona', 'contratista')]),
    'lejos': ('Alguien se queda lejos', 'Una invitada se detiene lejos: el robot le pide que se acerque, dos veces, hasta verla bien',
              [(0, 'persona', 'timida')]),
    'deportes': ('Piscina, tenis y gimnasio', 'A dos socios les indica el camino a la piscina y a la cancha; a la socia '
                 'VIP la acompaña en ascensor al gimnasio',
                 [(0, 'persona', 'piscina'), (5, 'persona', 'tenis'), (10, 'persona', 'vip_gimnasio')]),
    'pico': ('Hora pico', 'Cuatro personas casi a la vez: hacen fila y el robot atiende a una a la vez',
             [(0, 'persona', 'invitada'), (3, 'persona', 'vip'), (6, 'persona', 'regular'), (9, 'persona', 'contratista')]),
    'sin_cita': ('Gente sin cita', 'Un desconocido al que el anfitrión espera, otro al que no conoce y una cédula ajena',
                 [(0, 'persona', 'desconocido_ok'), (5, 'persona', 'desconocido_no'), (10, 'persona', 'cedula_ajena')]),
    'camino': ('Problemas en el camino', 'Acompaña a una invitada: carrito, mesero en el pasillo y la puerta no abre',
               [(0, 'imprevisto', 'carrito'), (0, 'imprevisto', 'puerta'), (0, 'persona', 'invitada'),
                (25, 'imprevisto', 'mesero')]),
    'pasillo': ('Pasillo cerrado', 'Un contratista y una valla que cierra el pasillo: avisa, espera y sigue',
                [(0, 'persona', 'contratista'), (12, 'imprevisto', 'valla')]),
    'turnos': ('Turnos', 'Una empleada en turno y un empleado fuera de su turno (pasa a recepción)',
               [(0, 'persona', 'personal'), (5, 'persona', 'fuera_turno')]),
    'jornada': ('Jornada completa', 'Entran socia VIP, socio, invitada, empleada y contratista; luego van saliendo uno a uno',
                [(0, 'persona', 'vip'), (5, 'persona', 'regular'), (10, 'persona', 'invitada'), (15, 'persona', 'personal'),
                 (20, 'persona', 'contratista'), (25, 'salida', 'INVITADO'), (26, 'salida', 'VIP'),
                 (27, 'salida', 'EXTERNO'), (28, 'salida', 'PERSONAL'), (29, 'salida', 'REGULAR')]),
    'bateria': ('Batería baja con gente', 'Se le baja la batería: va a cambiarla y luego atiende a quien llegó',
                [(0, 'imprevisto', 'bateria'), (2, 'persona', 'vip'), (4, 'persona', 'regular')]),
    'nadie_atiende': ('El concierge tarda', 'Apps a mano: una cédula ajena y nadie pulsa Atender hasta que usted lo haga',
                      [(0, 'apps', False), (0, 'persona', 'cedula_ajena')]),
}
SALIDAS = {'VIP': 'Sale el socio VIP', 'REGULAR': 'Sale el socio regular', 'INVITADO': 'Sale el invitado',
           'PERSONAL': 'Sale la empleada (marca salida)', 'EXTERNO': 'Sale el contratista'}
IMPREVISTOS = {'carrito': 'Carrito en el pasillo', 'mesero': 'Mesero que se detiene', 'valla': 'Valla que cierra el paso',
               'puerta': 'Próxima puerta atascada', 'bateria': 'Batería baja'}


class Estado:
    """Lo ultimo que dibujo el simulador (lo lee el servidor desde otro hilo)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.img, self.json = {}, b'{}'
        self.ordenes = queue.Queue()

    def poner(self, **imgs):
        with self.lock:
            self.img.update(imgs)


def jpg(bgr, calidad=80):
    return cv2.imencode('.jpg', bgr, [cv2.IMWRITE_JPEG_QUALITY, calidad])[1].tobytes()


def servidor(estado, puerto=PUERTO):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _enviar(self, cuerpo, tipo):
            self.send_response(200)
            self.send_header('Content-Type', tipo)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(cuerpo)

        def do_GET(self):
            ruta = self.path.split('?')[0]
            if ruta == '/':
                return self._enviar(PAGINA.encode(), 'text/html; charset=utf-8')
            if ruta == '/estado':
                with estado.lock:
                    return self._enviar(estado.json, 'application/json')
            if ruta.startswith('/img/'):
                with estado.lock:
                    b = estado.img.get(ruta[5:].removesuffix('.jpg'))
                if b:
                    return self._enviar(b, 'image/jpeg')
            self.send_error(404)

        def do_POST(self):
            n = int(self.headers.get('Content-Length') or 0)
            try:
                estado.ordenes.put(json.loads(self.rfile.read(n) or b'{}'))
            except ValueError:
                return self.send_error(400)
            self._enviar(b'{"ok":true}', 'application/json')

    srv = ThreadingHTTPServer(('127.0.0.1', puerto), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def correr(club, visor, tipo_log, api_real=False, puerto=PUERTO, abrir=True):
    """Bucle del simulador con el tablero web. club: run_club.Club; visor: run_club.Visor (la ventana de MuJoCo)."""
    from api_sim import ApiSimulada
    import panel
    import percepcion as P
    estado = Estado()
    servidor(estado, puerto)
    url = f'http://127.0.0.1:{puerto}'
    print(f'Interfaz de control: {url}  (Ctrl+C para salir)')
    if abrir:
        import webbrowser
        threading.Timer(1.0, webbrowser.open, (url,)).start()
    vista = {'modo': 'sigue', 'piso2': True}                      # camara del visor: sigue | general
    task, extras, pendientes = club.reconocer(), [], []
    velocidad, pausa, apps_auto = 2.0, False, True
    objetivo, ultimo = club.d.time, time.perf_counter()        # hasta donde deberia ir la simulacion
    t_visor = t_vistas = t_camaras = 0.0
    simulada = isinstance(club.api_bot, ApiSimulada)
    apps = None
    if not simulada:
        from api_cliente import Apps
        apps = Apps(club.api_bot.url)

    def guion(pasos):
        """Lanza los pasos de un escenario a su tiempo (simulado)."""
        t0 = club.d.time
        for cuando, que, cual in sorted(pasos, key=lambda p: p[0]):
            while club.d.time - t0 < cuando:
                yield
            if que == 'salida':                                  # espera a que alguien de esa categoria este adentro
                while not any(i['cat'] == cual for i in club.adentro.values()):
                    yield
            orden({'accion': {'persona': 'persona', 'imprevisto': 'imprevisto', 'apps': 'apps_auto',
                              'salida': 'salida'}[que], 'arg': cual})

    def ocupado():
        return task is not None

    def orden(o):
        nonlocal task, velocidad, pausa, apps_auto
        a, arg = o.get('accion'), o.get('arg')
        if a == 'persona' and arg in PERSONAS:
            c = dict(PERSONAS[arg][1])
            if api_real and arg in CON_API_REAL:
                c['persona_id'] = CON_API_REAL[arg]
            c.setdefault('metodo', 'boton del simulador')
            c['caso'] = PERSONAS[arg][0]
            c['body'] = club.encolar(c)                          # espera en la fila de la entrada
            pendientes.append(c)
            club.note(f'control: llega {PERSONAS[arg][0].lower()}')
        elif a == 'salida' and arg in SALIDAS:
            ya = {c.get('body') for c in pendientes}
            quien = next((b for b, i in club.adentro.items() if i['cat'] == arg and b not in ya), None)
            if quien is None:
                club.note(f'control: no hay nadie adentro de la categoria {arg}')
            else:
                pendientes.append({'sentido': 'sale', 'body': quien, 'categoria': arg, 'confianza': 1.0})
                club.note(f'control: {SALIDAS[arg].lower()}')
        elif a == 'imprevisto' and arg in IMPREVISTOS:
            extras.append(club.imprevisto(arg))
        elif a == 'escenario' and arg in ESCENARIOS:
            nombre, _, pasos = ESCENARIOS[arg]
            club.note(f'control: escenario "{nombre}"')
            extras.append(guion(pasos))
        elif a == 'demo' and not ocupado():
            task = club.scenario()
        elif a == 'home':
            pendientes.clear()
            task = club.go_home()
        elif a == 'velocidad':
            velocidad = float(arg)
        elif a == 'pausa':
            pausa = not pausa
        elif a == 'piso2':
            vista['piso2'] = not vista['piso2']
            visor.piso2(vista['piso2'])
        elif a == 'vista':
            vista['modo'] = arg
            visor.seguir = arg == 'sigue'
            if not visor.seguir:
                visor.general()
        elif a == 'apps_auto':
            apps_auto = bool(arg)
            if simulada:
                club.api_bot.automaticas(apps_auto)
        elif a == 'atender':
            (club.api_bot.atender if simulada else apps.atender)(arg)
            club.note(f'APP concierge: Atender ({arg[:8]})')
        elif a == 'responder':
            cid, si = arg['id'], bool(arg['si'])
            c = club.confirmaciones.get(cid, {})
            if simulada:
                club.api_bot.responder(cid, si)
            else:
                apps.responder(cid, c.get('anfitrion_id'), si)
            club.note(f'APP {c.get("anfitrion_id", "anfitrion")}: {"Si lo espero" if si else "No lo conozco"}')

    while visor.v.is_running():
        while not estado.ordenes.empty():
            orden(estado.ordenes.get())
        if task is None and club.bateria() <= 20:              # libre y sin bateria: primero cambiarla
            task = club.revisar_bateria()
        if task is None and pendientes:
            task = club.atender(pendientes.pop(0))
        ahora = time.perf_counter()
        if not pausa:                                            # fisica al ritmo pedido, sin pasarse del cuadro
            objetivo = min(objetivo + (ahora - ultimo) * velocidad, club.d.time + 1.0)   # si no alcanza, no acumula
            fin = ahora + 1 / 20
            while club.d.time < objetivo and time.perf_counter() < fin:
                if task is not None:
                    try:
                        next(task)
                    except StopIteration:
                        task = None
                for g in list(extras):
                    try:
                        next(g)
                    except StopIteration:
                        extras.remove(g)
                club.tick()
        ultimo = ahora
        if ahora > t_visor:                                      # la ventana de MuJoCo ~30 fps
            t_visor = ahora + 1 / 30
            visor.pintar(club)
        if ahora > t_camaras:                                    # camaras del robot: 2 renders, caros en GPU integrada
            t_camaras = ahora + 1.0
            estado.poner(camaras=jpg(club.seguidor.ventana()))
        if ahora > t_vistas:                                     # panel y SLAM ~4 fps (baratos)
            t_vistas = ahora + 0.25
            estado.poner(panel=jpg(panel.imagen(club.panel | {'decisiones': club.decisiones})),
                         slam=jpg(P.imagen(club.slam, club.ruta_actual, np.array([*club.robot.pos, club.robot.yaw]))))
            quien, dicho, hasta = club.subtitulo
            alertas = [{'id': e['id'], 'tipo': e['tipo'], 'motivo': e['motivo'], 'quien': e['nombre'] or e['persona_id'] or ''}
                       for e in club.eventos_api if e['requiere_atencion'] and club.estado_alerta(e['id']) == 'NUEVO']
            j = {'caso': club.caso, 'subtitulo': f'{quien}: {dicho}' if dicho and club.d.time < hasta else '',
                 'bateria': round(club.bateria()), 't': round(club.d.time), 'piso': club.piso,
                 'llm': f'LLM {club.llm_modelo.split(".")[-1].split(":")[0]}' if club.llm_modelo else 'respuestas fijas (sin LLM)', 'ocupado': ocupado(),
                 'cola': len(pendientes), 'velocidad': velocidad, 'pausa': pausa, 'apps_auto': apps_auto,
                 'api': 'API real del club' if not simulada else 'API simulada', 'vista': vista['modo'], 'piso2': vista['piso2'],
                 'personas': {k: v[0] for k, v in PERSONAS.items()}, 'imprevistos': IMPREVISTOS,
                 'escenarios': {k: [v[0], v[1]] for k, v in ESCENARIOS.items()}, 'salidas': SALIDAS,
                 'adentro': {c: sum(i['cat'] == c for i in club.adentro.values()) for c in SALIDAS},
                 'alertas': alertas[-6:],
                 'confirmaciones': [{'id': cid, 'anfitrion': c['anfitrion_id']} for cid, c in club.confirmaciones.items()],
                 'log': [{'t': ln[:7].strip(), 'tipo': tipo_log(ln[8:])[0], 'texto': ln[8:]} for ln in club.log[-60:]]}
            with estado.lock:
                estado.json = json.dumps(j, ensure_ascii=False).encode()
        time.sleep(0.002)


PAGINA = r"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Juan · control del club</title>
<style>
:root{--fondo:#14161b;--tarjeta:#1e2128;--boton:#272b34;--linea:#2e323b;--texto:#e8e9ee;--tenue:#8d93a0;--azul:#5aa0f0;
--verde:#46be6e;--ambar:#ebaa3c;--rojo:#e15555;--morado:#b482fa}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--texto);font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;gap:8px 12px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--linea);flex-wrap:wrap}
header h1{font-size:15px;margin:0;white-space:nowrap}
header .caso{font-weight:600;flex:1;min-width:160px;color:var(--azul)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:var(--tarjeta);border:1px solid var(--linea);border-radius:999px;padding:2px 9px;color:var(--tenue);white-space:nowrap}
.dice{margin:8px 12px 0;background:var(--tarjeta);border:1px solid var(--linea);border-radius:10px;padding:8px 12px;
min-height:40px;display:flex;align-items:center;justify-content:center;text-align:center}
.sub{font-size:17px;font-weight:600}.sub:empty{display:none}.sub:not(:empty)+.vacio{display:none}
main{display:grid;gap:10px;padding:10px 12px 14px;grid-template-columns:minmax(0,1fr);
grid-template-areas:"control" "panel" "vistas" "log"}
@media (min-width:720px){main{grid-template-columns:minmax(0,1fr) minmax(0,1fr);
grid-template-areas:"control panel" "vistas vistas" "log log"}}
@media (min-width:1280px){main{grid-template-columns:380px minmax(0,1fr) minmax(0,1.15fr);
grid-template-areas:"control panel vistas" "control panel log"}}
section{background:var(--tarjeta);border:1px solid var(--linea);border-radius:10px;padding:10px;min-width:0}
#control{grid-area:control}#panelbox{grid-area:panel}#vistas{grid-area:vistas}#logbox{grid-area:log}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--azul);margin:0 0 8px;display:flex;gap:6px;align-items:baseline}
h2 .vacio{text-transform:none;letter-spacing:0}
button{background:var(--boton);color:var(--texto);border:1px solid var(--linea);border-radius:7px;padding:6px 9px;cursor:pointer;
font:inherit;text-align:left}
button:hover{border-color:var(--azul)}button:disabled{opacity:.4;cursor:default;border-color:var(--linea)}
button.activo{border-color:var(--azul);background:#24344c}
.barra{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}
.barra button{padding:5px 9px}.sep{width:1px;background:var(--linea);margin:0 2px}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--linea);margin-bottom:8px;flex-wrap:wrap}
.tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--tenue);padding:6px 8px}
.tabs button.activo{color:var(--texto);border-bottom-color:var(--azul);background:none}
.grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:5px}
.grid button b{display:block;font-weight:600}
.grid button span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--tenue);font-size:11px;margin-top:2px}
.pestana{display:none}.pestana.ver{display:grid}
.apps{margin-top:12px;border-top:1px solid var(--linea);padding-top:10px}
.alerta{border:1px solid var(--rojo);border-radius:7px;padding:6px 8px;margin-bottom:6px;font-size:12px}
.alerta .barra{margin:6px 0 0}
.vacio{color:var(--tenue);font-size:12px}
img.v{width:100%;border-radius:6px;display:block;background:#000}
#panelbox img{max-height:calc(100vh - 150px);object-fit:contain;object-position:top}
.dos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
@media (max-width:719px){.dos{grid-template-columns:1fr}}
@media (min-width:1280px){.dos{grid-template-columns:1fr}}
#log{height:260px;overflow:auto;font:12px/1.45 ui-monospace,Consolas,monospace}
#log div{white-space:pre-wrap}#log .t{color:var(--tenue)}
</style></head><body>
<header><h1>N Club · Juan</h1><div class="caso" id="caso">—</div>
<div class="chips"><span class="chip" id="robot">—</span><span class="chip" id="bat">—</span><span class="chip" id="api">—</span><span class="chip" id="llm">—</span></div></header>
<div class="dice"><div class="sub" id="sub"></div><div class="vacio">El club se ve en la ventana de MuJoCo; aquí aparece lo que dice Juan.</div></div>
<main>
<section id="control">
 <div class="barra">
  <button onclick="enviar('demo')" title="Guion completo con los 5 casos">▶ Demo</button>
  <button onclick="enviar('home')" title="Interrumpe y vuelve a su puesto">⌂ HOME</button>
  <button id="pausa" onclick="enviar('pausa')">Pausa</button>
  <span class="sep"></span><span id="vel" style="display:contents"></span>
  <span class="sep"></span>
  <button id="v-sigue" onclick="enviar('vista','sigue')" title="La cámara de MuJoCo sigue al robot">Seguir</button>
  <button id="v-general" onclick="enviar('vista','general')" title="La cámara de MuJoCo muestra todo el club">Club</button>
  <button id="piso2" onclick="enviar('piso2')" title="Muestra u oculta el segundo piso en MuJoCo">2.º piso</button>
 </div>
 <div class="tabs" id="tabs">
  <button data-p="escenarios">Escenarios</button><button data-p="personas">Personas</button>
  <button data-p="salidas">Salidas <span class="vacio" id="adentro"></span></button><button data-p="imprevistos">Imprevistos</button>
 </div>
 <div class="pestana grid" id="escenarios"></div><div class="pestana grid" id="personas"></div>
 <div class="pestana grid" id="salidas"></div><div class="pestana grid" id="imprevistos"></div>
 <div class="apps">
  <h2>Apps <label class="vacio"><input type="checkbox" id="auto" onchange="enviar('apps_auto', this.checked)"> responden solas</label></h2>
  <div id="alertas"></div><div id="confs"></div>
 </div>
</section>
<section id="panelbox"><h2>Panel de decisión</h2><img class="v" id="panel" alt="panel de decision"></section>
<section id="vistas"><div class="dos">
 <div><h2>Cámaras del robot</h2><img class="v" id="camaras" alt="camaras"></div>
 <div><h2>Lidar + SLAM</h2><img class="v" id="slam" alt="mapa SLAM"></div></div></section>
<section id="logbox"><h2>Bitácora</h2><div id="log"></div></section>
</main>
<script>
const COLOR={APP:'var(--morado)',DECIDE:'var(--ambar)',MUNDO:'var(--rojo)',DICE:'var(--azul)',OYE:'var(--verde)',
 ESCALA:'var(--rojo)',VE:'#f0c828',CONFIRMA:'#f0c828',HACE:'var(--texto)',ROBOT:'var(--tenue)'};
function enviar(accion,arg){fetch('/accion',{method:'POST',body:JSON.stringify({accion,arg})})}
const previo={};function poner(el,html){if(previo[el.id]!==html){previo[el.id]=html;el.innerHTML=html}}  // solo si cambio: no pierde clics
function pestana(p){document.querySelectorAll('.pestana').forEach(e=>e.classList.toggle('ver',e.id==p));
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('activo',b.dataset.p==p));
 try{localStorage.setItem('pestana',p)}catch(e){}}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>pestana(b.dataset.p));
let p0='escenarios';try{p0=localStorage.getItem('pestana')||p0}catch(e){}pestana(p0);
let armado=false;
function armar(j){
 escenarios.innerHTML=Object.entries(j.escenarios).map(([k,v])=>`<button title="${v[1]}" onclick="enviar('escenario','${k}')"><b>${v[0]}</b><span>${v[1]}</span></button>`).join('');
 personas.innerHTML=Object.entries(j.personas).map(([k,v])=>`<button onclick="enviar('persona','${k}')">${v}</button>`).join('');
 salidas.innerHTML=Object.entries(j.salidas).map(([k,v])=>`<button id="sal-${k}" onclick="enviar('salida','${k}')">${v}</button>`).join('');
 imprevistos.innerHTML=Object.entries(j.imprevistos).map(([k,v])=>`<button onclick="enviar('imprevisto','${k}')">${v}</button>`).join('');
 vel.innerHTML=[1,2,4].map(v=>`<button id="vel${v}" onclick="enviar('velocidad',${v})">${v}x</button>`).join('');
 armado=true}
async function estado(){
 try{const j=await (await fetch('/estado')).json(); if(!j.personas){return}
  if(!armado)armar(j);
  caso.textContent=j.caso||'—'; sub.textContent=j.subtitulo;
  robot.textContent=(j.ocupado?'ocupado':'libre')+(j.piso?' · 2.º piso':'')+(j.cola?` · ${j.cola} en fila`:'')+` · ${j.t} s`;
  bat.textContent=`batería ${j.bateria}%`; bat.style.color=j.bateria<=20?'var(--ambar)':'';
  const n=Object.values(j.adentro).reduce((a,b)=>a+b,0); adentro.textContent=n?`(${n})`:'';
  Object.entries(j.adentro).forEach(([k,v])=>{const b=document.getElementById('sal-'+k); if(b)b.disabled=!v});
  api.textContent=j.api; auto.checked=j.apps_auto; llm.textContent=j.llm; llm.style.color=j.llm.startsWith('LLM')?'var(--verde)':'var(--ambar)';
  pausa.textContent=j.pausa?'▶ Seguir':'❚❚ Pausa';
  [1,2,4].forEach(v=>document.getElementById('vel'+v).classList.toggle('activo',j.velocidad==v));
  ['sigue','general'].forEach(v=>document.getElementById('v-'+v).classList.toggle('activo',j.vista==v));
  piso2.classList.toggle('activo',j.piso2);
  poner(alertas,j.alertas.map(a=>`<div class="alerta"><b>Concierge · ${a.tipo}</b> ${a.quien}<br>${a.motivo||''}
   <div class="barra"><button onclick="enviar('atender','${a.id}')">Atender</button></div></div>`).join(''));
  poner(confs,j.confirmaciones.map(c=>`<div class="alerta" style="border-color:var(--ambar)">
   <b>Anfitrión ${c.anfitrion}</b>: ¿espera a este visitante?<div class="barra"><button onclick="enviar('responder',{id:'${c.id}',si:true})">Sí lo espero</button>
   <button onclick="enviar('responder',{id:'${c.id}',si:false})">No lo conozco</button></div></div>`).join('')
   +(j.alertas.length||j.confirmaciones.length?'':'<div class="vacio">Sin alertas ni confirmaciones pendientes</div>'));
  const abajo=log.scrollTop+log.clientHeight>=log.scrollHeight-20;
  poner(log,j.log.map(l=>`<div><span class="t">${l.t}</span> <b style="color:${COLOR[l.tipo]||'inherit'}">${l.tipo}</b> ${l.texto.replace(/</g,'&lt;')}</div>`).join(''));
  if(abajo)log.scrollTop=log.scrollHeight;
 }catch(e){}}
function refrescar(id,ms){const img=document.getElementById(id);const n=()=>{const t=new Image();t.onload=()=>{img.src=t.src;setTimeout(n,ms)};
 t.onerror=()=>setTimeout(n,1000);t.src=`/img/${id}.jpg?t=${Date.now()}`};n()}
refrescar('panel',300);refrescar('camaras',1000);refrescar('slam',300);
setInterval(estado,400);estado();
</script></body></html>"""
