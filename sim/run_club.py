"""Escenario Cerberus en el club simulado: el X2 recibe a 5 visitantes y orienta a cada uno segun su categoria.

Uso:  python run_club.py              -> visor con el escenario de los 5 visitantes
      python run_club.py --speed 3    -> 3x tiempo real
      python run_club.py --manual     -> robot en HOME; comandos por terminal: vip, regular, ..., home, demo
      python run_club.py --check      -> sin ventana: corre todo el escenario y verifica el resultado

La categoria NO viene del guion: se confirma con los registros del club (hri/registros.py) y el robot dice y
hace lo que produce el dialogo de recepcion (hri/dialogo.py). La categoria la entrega el modelo de vision
(SIMULADO aqui: campo 'vision' de cada visitante) y los registros la cruzan.
      python run_club.py --voz        -> ademas habla en espanol (voz de Windows)
      python run_club.py --sin-mapa   -> sin la ventana de percepcion (mapa del SLAM)
      python run_club.py --robotb http://127.0.0.1:8000  -> recibe a quien decida robotB (vision de Gabo: cara +
                                         cedula / QR) con el dialogo, el panel y la bitacora; --check-robotb lo prueba
      python run_club.py --api http://127.0.0.1:8080/api   -> con la API real del club (llave en ~/.config/nclub/bot-key);
                                         --check-api URL lo prueba (las apps las simula por la API)
      python run_club.py --control  -> el club en la ventana de MuJoCo + tablero de control en el navegador
                                         (http://127.0.0.1:8090): escenarios, personas, imprevistos, panel, camaras,
                                         SLAM, bitacora y apps
      python run_club.py --video demo.mp4 [--speed 2]  -> graba el escenario completo en MP4 (sin ventana)
      ... --camara-libre   sin la camara que sigue la accion   ... --sombras   con sombras (mas lento; el video las trae)
      python run_club.py --sin-panel  -> sin el panel de decision ni la bitacora (todo lo que ve, oye, dice, decide y le
                                         avisa a la app, con su hora)
Percepcion (sim/percepcion.py): al empezar hace un recorrido de reconocimiento y arma SU mapa con el lidar; todas
sus rutas las planea sobre ese mapa (esquiva lo que encuentra) y replanea en cada giro. La conversacion libre del
edecan la escribe un LLM (hri/llm.py, Bedrock) si hay credenciales AWS; si no, respuestas fijas.
Imprevistos (el robot NO los conoce): carrito en su ruta, mesero que se para en el pasillo, puerta atascada, valla
de mantenimiento que cierra el pasillo (alarmas y evacuacion: fuera de alcance). Que hacer lo decide hri/decision.py y el panel
muestra cada decision con su motivo.
"""
import bisect
import os
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

if sys.platform.startswith('linux'):
    os.environ.setdefault('MUJOCO_GL', 'egl')    # camaras fuera de pantalla con la GPU (tambien sin pantalla)
import mujoco
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'hri'))
import club_world as cw  # noqa: E402
from camaras import Camaras, Seguidor  # noqa: E402
import edecan  # noqa: E402
import llm  # noqa: E402
import panel  # noqa: E402
import percepcion as P  # noqa: E402
from decision import FRENO_M, Situacion, decidir  # noqa: E402
from api_sim import ApiSimulada  # noqa: E402
from vision_robotb import RobotB  # noqa: E402
from dialogo import a as a_lugar, ejecutar, entrada, salida  # noqa: E402
from eventos import evento, resumen  # noqa: E402
from intenciones import entender  # noqa: E402
from registros import Registros  # noqa: E402
from walker import GESTURES, Walker  # noqa: E402

LED = {'VIP': [1.0, 0.8, 0.1, 1], 'REGULAR': [0.2, 0.45, 1.0, 1], 'INVITADO': [0.2, 0.9, 0.3, 1],
       'PERSONAL': [1, 1, 1, 1], 'EXTERNO': [1.0, 0.45, 0.0, 1], 'IDLE': [0.6, 0.6, 0.6, 1]}

LED_NOMBRE = {'dorado': LED['VIP'], 'azul': LED['REGULAR'], 'verde': LED['INVITADO'], 'blanco': LED['PERSONAL'],
              'naranja': LED['EXTERNO'], 'rojo_suave': [1.0, 0.3, 0.3, 1]}
GESTO = {'reverencia': GESTURES['VIP'], 'saludo_mano': GESTURES['REGULAR'], 'bienvenida': GESTURES['INVITADO'],
         'asentir': GESTURES['PERSONAL']}
HOY = '2026-10-24'                 # dia de la demo (la orden de trabajo de Luis es de ese dia)
INICIO = datetime(2026, 10, 24, 9, 0)   # hora del club al empezar la simulacion (turnos y saludos)
ESPERA_SPOT = (-3.4, -1.6)         # donde espera quien llega mientras el robot acompana a otro
RECEPCION_SPOT = (-2.9, 1.3)       # frente al mostrador: ahi lo atiende el concierge
PARADA = (-4.3, 0.0)               # donde se detiene quien entra: lejos (3.3 m) para que la vision lo vea bien
CERCA_VISION = 1.6                 # m: a esta distancia (o menos) la camara lo ve bien para reconocerlo
FILA = [(-5.2 - 0.9 * i, 0.0) for i in range(6)]
SALIDA_TITULO = {'VIP': 'socio VIP: despedida e invitacion a volver', 'REGULAR': 'socio regular: despedida',
                 'INVITADO': 'invitado: avisa al anfitrion y borra su rostro', 'PERSONAL': 'personal: marca la salida',
                 'EXTERNO': 'contratista: registra la salida y avisa al supervisor'}   # la fila afuera de la entrada: una persona a la vez
BATERIA_INICIAL, DRENA = 36.0, 0.033   # % al empezar y %/s: queda baja a mitad del escenario (SIMULADO)

# persona: id en los registros y en la galeria facial. esperado: SOLO para que --check verifique la confirmacion.
# preguntas: (x del robot, lo que pregunta el visitante caminando). se_detiene: (x, segundos) se queda mirando.
# llega_mientras: llega cuando el robot esta acompanando al anterior y espera. sale: al final se despide en la entrada.
VISITORS = [
    dict(body='VIP_Sofia', caso='Socia VIP: la reconoce, avisa al concierge y la acompaña', persona='sofia', vision='VIP', conf=0.96, respuestas=['sí, como siempre'], esperado='VIP',
         preguntas=[(1.0, '¿Dónde están los baños?')]),
    dict(body='Regular_Carlos', caso='Socio regular: le indica el camino', persona='carlos', vision='REGULAR', conf=0.93, respuestas=['al restaurante'], esperado='REGULAR'),
    dict(body='Invitada_Laura', caso='Invitada: avisa a su anfitrión y la acompaña', persona='laura', vision='VISITANTE', conf=0.97, respuestas=[], esperado='INVITADO',
         preguntas=[(8.0, '¿Cuánto falta?')], se_detiene=(4.5, 6.0), sale=True),
    dict(body='Visitante_Pedro', caso='Desconocido: el anfitrión confirma en su app', persona=None, vision='DESCONOCIDO', conf=0.90, esperado='INVITADO', llega_mientras=True,
         respuestas=['vengo invitado', 'me invitó Andrés']),     # nadie lo conoce: el anfitrion confirma en su app
    dict(body='Personal_Marta', caso='Personal: marca su entrada', persona='marta', vision='EMPLEADO', conf=0.95, respuestas=[], esperado='PERSONAL'),
    dict(body='Personal_Pablo', caso='Empleado fuera de turno: pasa a recepción', persona='pablo', vision='EMPLEADO', conf=0.94, respuestas=[], esperado='CONTRADICCION'),
    dict(body='Externo_Luis', caso='Contratista: orden de trabajo y aviso al supervisor', persona='luis', vision='VISITANTE', conf=0.94, respuestas=[], esperado='EXTERNO',
         preguntas=[(2.0, '¿Cuál es la clave del wifi?'), (12.5, '¿Hasta qué hora abre el club?')]),
]
HOST = 'Anfitrion_Andres'
POOL = [f'Visitante_{k}' for k in range(1, 7)]   # cuerpos para quien mande la interfaz o robotB (se reciclan)   # cuerpos para quien mande robotB (se reciclan)
MESERO = 'Mesero'
WALK_SPEED = 1.0          # m/s visitantes
TIMESTEP = 0.002          # 2x mas rapido que el 0.001 del modelo y igual de estable (probado)
FOLLOW_GAP = 1.3          # m detras del robot al ser escoltado
ESCANEO = 0.2             # s entre escaneos del lidar (5 Hz)
RECONOCIMIENTO = [(3.0, 0.0), (11.5, -0.5)]   # recorrido de mapeo al empezar (luego vuelve a HOME planeando)
VEL_ASCENSOR = 0.8        # m/s
# como sale en los subtitulos quien habla con Juan (segun su rol confirmado; (masculino, femenino))
ROL = {'VIP': ('Miembro VIP', 'Miembro VIP'), 'REGULAR': ('Socio', 'Socia'), 'INVITADO': ('Invitado', 'Invitada'),
       'PERSONAL': ('Empleado', 'Empleada'), 'EXTERNO': ('Contratista', 'Contratista')}


def rol_de(cat, f):
    return ROL[cat][(f or {}).get('trato') == 'señora'] if cat in ROL else 'Visitante'

LEJOS, CERCA = 2.8, 1.9   # m: si el visitante queda a mas de LEJOS el robot espera; sigue cuando vuelve a CERCA


def parallel(*gens):
    """Avanza varios generadores un tick a la vez hasta que todos terminen (p. ej. senalar mientras alguien camina)."""
    gens = list(gens)
    while gens:
        for g in list(gens):
            try:
                next(g)
            except StopIteration:
                gens.remove(g)
        yield


class Trail:
    """Recorrido del robot con longitud acumulada (O(log n) por consulta) para que el visitante lo siga."""

    def __init__(self, start):
        self.pts = [np.array(start, float)]
        self.s = [0.0]

    @property
    def length(self):
        return self.s[-1]

    def __len__(self):
        return len(self.pts)

    def append(self, p):
        self.s.append(self.s[-1] + float(np.linalg.norm(p - self.pts[-1])))
        self.pts.append(np.array(p, float))

    def point_at(self, s):
        i = max(1, min(bisect.bisect_left(self.s, s), len(self.s) - 1))
        s0, s1 = self.s[i - 1], self.s[i]
        a = 0.0 if s1 == s0 else min(max((s - s0) / (s1 - s0), 0.0), 1.0)
        return self.pts[i - 1] + a * (self.pts[i] - self.pts[i - 1])


class Club:
    def __init__(self, api=None, sombras=False):
        people = [(v['body'], cw.ROOMS.get(v['esperado'], {'rgba': [0.8, 0.3, 0.3, 1]})['rgba'], (cw.ENTRY[0] - 1.0 - 0.9 * i, 1.8)) for i, v in enumerate(VISITORS)]
        host_pos = np.array(cw.ROOMS['INVITADO']['inside']) + [0.8, 0.6]
        people.append((HOST, [0.15, 0.5, 0.2, 1], tuple(host_pos)))
        people.append((MESERO, [0.1, 0.1, 0.1, 1], cw.LEJOS))
        people += [(b, [0.55, 0.55, 0.6, 1], cw.LEJOS) for b in POOL]
        self.m, self.d = cw.build(people, sombras)
        gris = np.array([0.55, 0.55, 0.6, 1])                 # ropa de los cuerpos que manda la interfaz o robotB
        self.ropa = {b: [g for g in range(self.m.ngeom) if self.m.geom_bodyid[g] == mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_BODY, b)
                         and np.allclose(self.m.geom_rgba[g], gris)] for b in POOL}
        self.m.opt.timestep = TIMESTEP
        self.dt = self.m.opt.timestep
        self.robot = Walker(self.m, self.d)
        self.robot.place(cw.HOME['xy'], cw.HOME['yaw'])
        self.home_checks = []   # (momento, error_pos_m, error_yaw_deg) cada vez que vuelve a HOME
        self.led = mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_GEOM, 'led')
        self.door = {c: dict(id=cw.mocap_id(self.m, f'door_{c}'), base=self.d.mocap_pos[cw.mocap_id(self.m, f'door_{c}')].copy(),
                             axis=np.array([*cw.ROOMS[c]['axis'], 0.0]), open=0.0, target=0.0) for c in cw.ROOMS}
        self.hud = {'titulo': 'N Club - Juan, robot de recepcion (simulacion)', 'facial': '', 'evidencia': '', 'categoria': '',
                    'robot': '', 'accion': '', 'decision': ''}
        self.log = []
        self.panel = {}          # lo que muestra el panel de decision (sim/panel.py)
        self.decisiones = []     # (momento, accion, motivo): imprevistos y decisiones, para el panel
        # API del club: la real (hri/api_cliente.py, --api URL) o la SIMULADA con sus apps (responden solas)
        self.inicio = datetime.now() if api else INICIO        # con la API real, la hora real (turnos, agenda)
        self.api_bot = api or ApiSimulada(reloj=self.ahora, respuestas={'andres': True, 'sofia': False})
        self.reg = Registros(hoy=HOY, datos=self.api_bot.registros())
        self.esperando = {}      # body -> momento en que llego mientras el robot no estaba
        self.atendidos_robotb = 0
        self.adentro = {}        # body -> {cat, pid, vision, conf}: quien esta dentro del club (para las salidas)
        self.fila, self.atendiendo_cuerpo = [], None   # una persona a la vez; los demas esperan afuera
        self.confirmaciones = {}  # cid -> confirmacion pendiente en la app del anfitrion (interfaz)
        self.alertas = {}        # id del evento -> (estado, cuando se consulto) para la interfaz
        self.t_latido = 0.0      # la API espera un latido cada 15 s (sin el: 'robot sin conexion')
        self.caso, self.n_caso = '', 0          # titulo del caso en curso (pantalla y video)
        self.subtitulo = ('', '', -1.0)         # (quien, texto, hasta): lo ultimo que se dijo
        self.bat = (BATERIA_INICIAL, 0.0)   # (% , momento) del ultimo cambio
        self.baja_agachado = 0.0  # cuanto bajo la pelvis al agacharse (para --check)
        self.cat_of = {}         # body -> categoria confirmada por el dialogo (para las puertas)
        self.voz = None          # Hablante (opcional, --voz)
        self.pausa = {v['body']: [v['se_detiene'][0], v['se_detiene'][1]] for v in VISITORS if 'se_detiene' in v}
        # un mapa (SLAM) por piso; el del 2.o piso ve sus barandas y muebles (y la gente)
        self.slams = {0: P.SLAM(self.m, self.d, cw.HOME['xy'], cw.HOME['yaw'], zonas=cw.ZONAS_PISO[0]),
                      1: P.SLAM(self.m, self.d, cw.ASCENSOR['xy'], np.pi / 2, semilla=1, zonas=cw.ZONAS_PISO[1],
                                grupos=(cw.VISTO, cw.PISO2), z=cw.PISO2_Z)}
        for k, s in self.slams.items():
            s.precargar(cw.MAPA_PRECARGADO[k])
        self.piso, self.slam = 0, self.slams[0]
        ids = [cw.mocap_id(self.m, f'asc_puerta_{k}') for k in (0, 1)]
        self.asc = dict(cabina=cw.mocap_id(self.m, 'asc_cabina'), puertas=ids, base=[self.d.mocap_pos[i].copy() for i in ids],
                        abre=[0.0, 0.0], meta=[0.0, 0.0], z=0.0, meta_z=0.0, a_bordo=[])
        self.en_ascensor = False  # mientras entra, viaja y sale: el visitante no lo sigue por el rastro
        self.fondo = []           # lo que pasa en paralelo al robot (p. ej. un socio que sigue solo a la piscina)
        self.rol = 'Visitante'    # con quien habla (subtitulos)
        self.n_escolta = 0        # acompanamientos empezados (los imprevistos armados esperan el proximo)
        # 2.o piso: translucido mientras el robot esta abajo (se ve el primer piso), solido cuando esta arriba
        ids = np.nonzero(self.m.geom_group == cw.PISO2)[0]
        translucido = self.m.geom_rgba[ids].copy()
        solido = translucido.copy()
        vidrio = np.all(np.abs(solido[:, :3] - [0.8, 0.9, 0.95]) < 0.01, axis=1)   # barandas: siguen de vidrio
        solido[:, 3] = np.where(vidrio, 0.35, 1.0)
        self.piso2_rgba = (ids, translucido, solido)
        self.max_z = 0.0          # lo mas alto que llego (para --check-lugares)
        self.seguidor = Seguidor(Camaras(self.m, self.d), self.slam)   # al visitante lo sigue con camara + lidar
        self.escoltando = None   # categoria que esta acompanando (para los incidentes)
        self.reconocido = False
        self.en_incidente = False   # mientras resuelve un imprevisto no hace charla
        self.avisos = []         # (momento, a quien, motivo)
        self.atendiendo = (None, None)   # (persona_id, ficha) de quien acompana: los avisos dicen de quien es
        self.eventos_api = []    # lo que le mandaria a la API del club (hri/eventos.py; aqui no se envia)
        self.atasco = {}         # INCIDENTE del escenario: puerta que no abre hasta que mantenimiento la libere
        self.dist_incidentes = np.inf      # lo mas cerca que paso de carrito, valla o mesero (para --check)
        self.t_escaneo = 0.0
        self.ruta_actual = []    # ruta planeada que esta siguiendo (para dibujarla)
        self.dist_obstaculo = np.inf   # la menor distancia a la que paso de un obstaculo (para --check)
        self.llm_modelo = llm._cliente()[1]
        self.hud['titulo'] += '  |  conversacion: ' + (f'LLM {self.llm_modelo}' if self.llm_modelo else 'respuestas fijas')

    # --- mundo ---
    def tick(self):
        for g in list(self.fondo):
            try:
                next(g)
            except StopIteration:
                self.fondo.remove(g)
        a = self.asc                                      # ascensor: puertas (1 s) y cabina
        for k, i in enumerate(a['puertas']):
            a['abre'][k] += np.clip(a['meta'][k] - a['abre'][k], -self.dt, self.dt)
            self.d.mocap_pos[i] = a['base'][k] + [a['abre'][k] * cw.ASCENSOR['ancho'], 0, 0]
        a['z'] += np.clip(a['meta_z'] - a['z'], -VEL_ASCENSOR * self.dt, VEL_ASCENSOR * self.dt)
        self.d.mocap_pos[a['cabina']][2] = a['z']
        for quien in a['a_bordo']:
            if quien == 'robot':
                self.robot.z = a['z']
                self.max_z = max(self.max_z, a['z'])
            else:
                self.d.mocap_pos[cw.mocap_id(self.m, quien)][2] = a['z']
        for cat, door in self.door.items():
            if self.atasco.get(cat):
                continue                                  # atascada: no se mueve aunque se lo ordenen
            door['open'] += np.clip(door['target'] - door['open'], -self.dt, self.dt)  # 1 s en abrir/cerrar
            self.d.mocap_pos[door['id']] = door['base'] + door['axis'] * door['open'] * cw.DOOR_W
        self.robot.step(self.dt)
        if self.d.time >= self.t_escaneo:                 # lidar + SLAM a 5 Hz
            self.t_escaneo += ESCANEO
            self.slam.paso(self.robot.pos, self.robot.yaw)
            if self.d.time >= self.t_latido:
                self.t_latido = self.d.time + 15.0
                ultimo = self.api_bot.latidos[-1][1:] if self.api_bot.latidos else ('ok', 'en la entrada')
                self.api_bot.heartbeat(*ultimo)
            if self.seguidor.objetivo:
                antes = self.seguidor.estado['fuente']
                real = float(np.linalg.norm(self.person_pos(self.seguidor.objetivo) - self.robot.pos))
                self.seguidor.actualizar(self.robot.yaw, self.d.time, real)
                ahora = self.seguidor.estado['fuente']
                if (ahora == 'perdido') != (antes == 'perdido') and antes:
                    self.note('camaras: perdio de vista al visitante' if ahora == 'perdido' else f'camaras: lo vuelve a ver ({ahora})')
            for x, y, r in cw.OBSTACULOS:
                self.dist_obstaculo = min(self.dist_obstaculo, float(np.hypot(*(self.robot.pos - (x, y)))) - r)
            self.dist_incidentes = min(self.dist_incidentes, self._dist_incidentes())

    def _dist_incidentes(self):
        out = [np.linalg.norm(self.robot.pos - self.person_pos(MESERO)) - 0.2]
        for name, (sx, sy, _, _) in cw.OBJETOS.items():
            c = self.person_pos(name)
            out.append(float(np.linalg.norm(np.maximum(np.abs(self.robot.pos - c) - (sx, sy), 0))))
        return min(out)

    def person_pos(self, body):
        return self.d.mocap_pos[cw.mocap_id(self.m, body)][:2].copy()

    def set_person(self, body, xy):
        self.d.mocap_pos[cw.mocap_id(self.m, body)][:2] = xy

    def ahora(self):
        return self.inicio + timedelta(seconds=float(self.d.time))

    def bateria(self):
        return max(0.0, self.bat[0] - DRENA * (self.d.time - self.bat[1]))

    def revisar_bateria(self):
        """Libre y con bateria baja: avisa, va al area de mantenimiento, se agacha y espera el cambio."""
        dec = decidir(Situacion(bateria=self.bateria()))
        if dec.accion != 'cambiar_bateria':
            return
        self.titulo('Batería baja: avisa, va a mantenimiento y se agacha para el cambio')
        self.m.geom_rgba[self.led] = LED_NOMBRE['rojo_suave']
        yield from self._aplicar(dec)
        e = self.eventos_api[-1]
        self.latido('sin_servicio', 'cambio de bateria: entrada sin robot')
        yield from self.navegar(cw.MANT_ROBOT['xy'])
        yield from self.robot.turn_to(cw.MANT_ROBOT['yaw'], self.dt)
        pel = mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_BODY, 'pelvis')
        z = self.d.xpos[pel][2]
        yield from self.robot.agacharse(True, self.dt)
        self.baja_agachado = float(z - self.d.xpos[pel][2])
        self.note('robot agachado en el area de mantenimiento: espera el cambio de bateria')
        t0 = self.d.time
        while (r := self.api_bot.estado_evento(e['id']))['estado'] == 'NUEVO':
            yield from self.wait(2.0)
        self.note(f'API GET /bot/eventos/{e["id"][:8]} -> {r["estado"]} por {r["atendido_por"]} ({self.d.time - t0:.0f} s)')
        yield from self.wait(8.0)
        self.bat = (100.0, self.d.time)
        self.note('INCIDENTE resuelto: mantenimiento cambio la bateria (100%)')
        yield from self.robot.agacharse(False, self.dt)
        yield from self.go_home()
        self.m.geom_rgba[self.led] = LED['IDLE']

    def api(self, e):
        self.eventos_api.append(e)
        self.api_bot.enviar_evento(e)
        self.note(resumen(e))

    def latido(self, estado, detalle=''):
        self.api_bot.heartbeat(estado, detalle)
        self.note(f'API POST /bot/heartbeat {estado}' + (f': {detalle}' if detalle else ''))

    def estado_alerta(self, eid):
        """Estado de una alerta en la API (para la interfaz; se consulta cada 2 s como mucho)."""
        estado, t = self.alertas.get(eid, ('NUEVO', -9.0))
        if time.perf_counter() - t > 2.0:
            estado = self.api_bot.estado_evento(eid)['estado']
            self.alertas[eid] = (estado, time.perf_counter())
        return estado

    def _armado(self, x_min):
        """Imprevisto armado: aparece en el proximo acompanamiento, cuando Juan pasa x_min por el pasillo."""
        n0 = self.n_escolta if self.escoltando else -1
        self.note('control: imprevisto armado: aparece en el proximo acompanamiento por el pasillo')
        while not (self.escoltando and self.n_escolta != n0 and self.piso == 0 and self.robot.pos[0] > x_min
                   and abs(self.robot.pos[1]) < 1.3):
            yield

    def imprevisto(self, cual):
        """Imprevistos a pedido (botones de la interfaz y escenarios). El robot no los conoce: los percibe y decide.
        Carrito, mesero y valla quedan armados hasta que Juan acompane a alguien por el pasillo."""
        if cual == 'carrito':
            yield from self._armado(1.8)
            self._poner('Carrito', (4.4, 0.2), 'dejaron un carrito de limpieza en el pasillo')
            yield from self.wait(60.0)
            self._poner('Carrito', cw.LEJOS, 'se llevaron el carrito')
        elif cual == 'mesero':
            yield from self._armado(7.4)
            self._poner(MESERO, (9.4, 0.1), 'un mesero se detiene en medio del pasillo')
            yield from self.wait(6.0)
            yield from self.person_walk(MESERO, [(9.4, -0.95)])
            yield from self.wait(20.0)
            self.set_person(MESERO, cw.LEJOS)
        elif cual == 'valla':
            yield from self._armado(5.5)
            self._poner('Valla', (8.5, 0.0), 'una valla de mantenimiento cierra el pasillo')
            yield from self.wait(30.0)
            self._poner('Valla', cw.LEJOS, 'mantenimiento retira la valla')
        elif cual == 'puerta':
            t0 = self.d.time
            for c in cw.ROOMS:
                self.atasco[c] = True
            self.note('INCIDENTE (el robot no lo sabe): la proxima puerta no va a abrir')
            while not any(t > t0 and 'puerta' in m for t, q, m in self.avisos) and self.d.time - t0 < 180:
                yield
            yield from self.wait(5.5)
            self.atasco.clear()
            self.note('INCIDENTE resuelto: mantenimiento libero la puerta')
        elif cual == 'bateria':
            self.bat = (19.5, self.d.time)
            self.note('INCIDENTE: la bateria quedo al 19 %')
            yield

    def esperar_concierge(self, e, body):
        """Escalado: se queda con la persona hasta que el concierge pulsa Atender en su app (consulta cada 2 s)."""
        t0, recordar = self.d.time, 20.0
        while True:
            yield from self.wait(2.0)
            r = self.api_bot.estado_evento(e['id'])
            if r['estado'] != 'NUEVO':
                break
            if self.d.time - t0 > recordar:
                recordar += 20.0
                yield from self.decir('Ya casi lo atienden. Gracias por su paciencia.')
        self.note(f'API GET /bot/eventos/{e["id"][:8]} -> {r["estado"]} por {r["atendido_por"]} ({self.d.time - t0:.0f} s)')
        yield from self.decir('Ya lo atienden en recepción. Gracias por esperar.')
        yield from self.person_walk(body, [RECEPCION_SPOT])

    def confirmar_en_app(self, anfitrion):
        """Le pregunta al anfitrion en su app (Si lo espero / No lo conozco) y espera la respuesta (cada 2 s)."""
        c = {'id': str(uuid.uuid4()), 'anfitrion_id': anfitrion, 'visitante_desc': 'Visitante sin registro', 'vence_en_s': 45}
        self.api_bot.crear_confirmacion(c)
        self.confirmaciones[c['id']] = c
        self.note(f'API POST /bot/confirmaciones -> {anfitrion}: ¿lo espera?')
        t0 = self.d.time
        while (estado := self.api_bot.estado_confirmacion(c['id'])['estado']) == 'PENDIENTE':
            yield from self.wait(2.0)
        self.confirmaciones.pop(c['id'], None)
        self.note(f'API GET /bot/confirmaciones/{c["id"][:8]} -> {estado} ({self.d.time - t0:.0f} s)')
        return estado == 'APROBADA'

    def titulo(self, texto):
        self.n_caso += 1
        self.caso = f'Caso {self.n_caso} · {texto}'

    def note(self, text):
        self.log.append(f'{self.d.time:6.1f}s  {text}')
        for quien in ('ROBOT', 'VISITANTE'):                 # subtitulos: lo que se dice, unos segundos
            if text.startswith(quien + ': '):
                dicho = text[len(quien) + 2:]
                self.subtitulo = ('Juan' if quien == 'ROBOT' else self.rol, dicho, self.d.time + 2.5 + 0.065 * len(dicho))
        if text.startswith('DECISION '):
            accion, _, motivo = text[9:].partition(': ')
            self.decisiones.append((self.d.time, accion, motivo.split(' | ')[0]))
        elif text.startswith('INCIDENTE'):
            nota = text.replace('INCIDENTE (el robot no lo sabe): ', '').replace('INCIDENTE: ', '').replace('INCIDENTE ', '')
            self.decisiones.append((self.d.time, 'INCIDENTE', nota))

    # --- acciones (generadores: un tick por yield) ---
    def wait(self, seconds):
        for _ in range(int(seconds / self.dt)):
            yield

    def person_walk(self, body, points):
        for p in points:
            p = np.array(p, float)
            while True:
                pos = self.person_pos(body)
                delta = p - pos
                dist = np.linalg.norm(delta)
                if dist < 0.02:
                    break
                self.set_person(body, pos + delta / dist * min(WALK_SPEED * self.dt, dist))
                self._doors_for(body, pos)
                yield

    def _doors_for(self, body, pos):
        """Control de acceso: la puerta de la sala solo se abre a la categoria autorizada al acercarse."""
        cat = self.cat_of.get(body)
        if cat in cw.ROOMS and np.linalg.norm(pos - cw.ROOMS[cat]['door']) < 1.6:
            self.door[cat]['target'] = 1.0

    def escort(self, v, cat, ficha):
        """Edecan: guia hasta la puerta conversando (charla por categoria, lo que queda a cada lado, preguntas del
        visitante) y esperandolo si se queda; se para A UN LADO de la puerta, se gira hacia el visitante y la
        senala mientras entra. Se queda en la puerta (la vuelta a HOME la hace receive al terminar el dialogo)."""
        body = v['body']
        room = cw.ROOMS[cat]
        door = np.array(room['door'])
        stop = self._beside_door(cat)
        trail, camino = Trail(self.robot.pos), {'activo': True}
        self.escoltando, self.n_escolta = cat, self.n_escolta + 1
        self.seguidor.seguir(body)
        self.latido('acompanando', f'entrada sin robot: acompaña a {(ficha or {}).get("nombre") or "un visitante"}')
        yield from parallel(self._caminar_con(body, stop, trail, camino),
                            self._conversar(v, cat, ficha, stop, camino))
        yield from self.robot.turn_to(self._face_between(self.person_pos(body), door), self.dt)
        self.door[cat]['target'] = 1.0
        yield from self._esperar_puerta(cat)
        self.escoltando = None
        self.seguidor.seguir(None)
        self.note(f'Robot al lado de la puerta {room["label"]}, la senala; puerta abierta para {cat}')
        pointing = self.robot.gesture(self.robot.point_pose(door), 5.0, self.dt)
        entering = self._then(self.wait(1.2), self.person_walk(body, [tuple(door), room['inside']]))
        yield from parallel(pointing, entering, self.decir(edecan.llegada(cat, ficha)))
        self.door[cat]['target'] = 0.0

    def escort_lugar(self, v, lugar, ficha):
        """Acompana a un lugar fuera de las salas: piscina y cancha de tenis (por fuera del edificio) o gimnasio y
        spa (segundo piso, en ascensor). Al llegar se para, lo senala y el visitante sigue a su sitio."""
        body, L = v['body'], cw.LUGARES[lugar]
        stop = np.array(L['parada'])
        trail, camino = Trail(self.robot.pos), {'activo': True}
        self.escoltando, self.n_escolta = lugar, self.n_escolta + 1
        self.seguidor.seguir(body)
        self.latido('acompanando', f'entrada sin robot: acompaña a {(ficha or {}).get("nombre") or "un visitante"} {a_lugar(L["label"])}')
        yield from parallel(self._caminar_con(body, stop, trail, camino, L['piso']),
                            self._conversar(v, self.cat_of.get(body) or 'REGULAR', ficha, stop, camino,
                                            destino=f'{L["label"]} ({L["camino"]})', n_frases=4))
        yield from self.robot.turn_to(self._face_between(self.person_pos(body), L['mira']), self.dt)
        self.escoltando = None
        self.seguidor.seguir(None)
        self.note(f'Robot en {L["label"]}: lo senala y el visitante sigue')
        yield from parallel(self.robot.gesture(self.robot.point_pose(L['mira']), 4.0, self.dt),
                            self._then(self.wait(1.2), self.person_walk(body, [L['sitio']])), self.decir(L['llegada']))

    def _va_solo(self, body, lugar):
        """El socio sigue solo al lugar que le indico el robot: por fuera, o subiendo en el ascensor."""
        L, A, a = cw.LUGARES[lugar], cw.ASCENSOR, self.asc
        if L['piso'] == 0:
            yield from self.person_walk(body, cw.A_PIE[lugar] + [L['sitio']])
            return
        yield from self.person_walk(body, [(-1.6, -1.6), A['frente']])
        while self.en_ascensor:                                  # el robot lo esta usando
            yield
        a['meta_z'] = 0.0
        while a['z'] > 1e-4:
            yield
        a['meta'][0] = 1.0
        while a['abre'][0] < 1.0:
            yield
        yield from self.person_walk(body, [A['visitante']])
        a['meta'][0] = 0.0
        while a['abre'][0] > 0.0:
            yield
        a['a_bordo'], a['meta_z'] = [body], cw.PISO2_Z
        while abs(a['z'] - a['meta_z']) > 1e-4:
            yield
        a['a_bordo'] = []
        a['meta'][1] = 1.0
        while a['abre'][1] < 1.0:
            yield
        yield from self.person_walk(body, [A['frente']])
        a['meta'][1] = 0.0
        yield from self.person_walk(body, [(3.5, -0.2)] + cw.A_PIE[lugar] + [L['sitio']])

    def navegar(self, meta, trail=None, body=None, piso=0):
        """Va a `meta` (en el piso `piso`) por rutas que planea en SU mapa (SLAM) y replanea en cada giro. Mientras
        camina mira la ruta con el lidar: si algo la invade frena y el motor de decision dice que hacer. Si la meta es
        en otro piso, primero va al ascensor. -> True si llego."""
        if piso != self.piso:
            yield from self.navegar(cw.ASCENSOR['frente'], trail, body, self.piso)
            yield from self.ascensor(piso, body, trail)
        meta = np.array(meta, float)
        for _ in range(80):
            if np.linalg.norm(self.robot.pos - meta) < 0.05:
                break
            ruta = self.slam.ruta(meta)
            if not ruta:
                if not (yield from self._sin_ruta(meta, body)):
                    self.ruta_actual = []
                    return False
                continue
            self.ruta_actual, visto = ruta, self.slam.n
            # el primer giro que no este ya bajo los pies (la ruta sale de la pose del SLAM, que difiere un poco)
            paso = [q for q in ruta if np.linalg.norm(np.array(q) - self.robot.pos) > 0.1][:1] or ruta[-1:]
            for _ in self.robot.walk_path(paso, self.dt, trail):
                if self.slam.n != visto and self.robot.hold is None:      # un escaneo nuevo
                    visto = self.slam.n
                    visitante = self.seguidor.memoria[0] if body and self.seguidor.memoria else None
                    b = self.slam.bloqueo_adelante(self.slam.pose[:2], ruta, ignorar=visitante)   # todo en el marco del SLAM
                    if b is not None and b < FRENO_M:
                        self.robot.abort = True
                yield
            if self.robot.abort:
                self.robot.abort = False
                yield from self._obstruido(ruta, body)
        self.ruta_actual = []
        return True

    def ascensor(self, piso, body=None, trail=None):
        """Llama el ascensor, entra (y el visitante con el), viaja y sale al otro piso. Al salir se ubica en el mapa
        de ese piso: el ascensor esta en un lugar conocido."""
        A, a = cw.ASCENSOR, self.asc
        self.en_ascensor = True
        self.note(f'ascensor: lo llama para ir al {"segundo" if piso else "primer"} piso')
        yield from self.robot.turn_to(-np.pi / 2, self.dt)
        a['meta_z'] = cw.PISO2_Z if self.piso else 0.0                # la cabina pudo quedar en el otro piso
        while abs(a['z'] - a['meta_z']) > 1e-4:
            yield
        a['meta'][self.piso] = 1.0
        while a['abre'][self.piso] < 1.0:
            yield
        yield from self.robot.walk_path([A['xy']], self.dt, trail)
        if body:
            yield from self.person_walk(body, [A['frente'], A['visitante']])
        yield from self.robot.turn_to(np.pi / 2, self.dt)
        a['meta'][self.piso] = 0.0
        while a['abre'][self.piso] > 0.0:
            yield
        a['a_bordo'], a['meta_z'] = ['robot'] + ([body] if body else []), cw.PISO2_Z if piso else 0.0
        if body:
            yield from self.decir('Subimos al segundo piso.' if piso else 'Bajamos al primer piso.')
        while abs(a['z'] - a['meta_z']) > 1e-4:
            yield
        a['a_bordo'] = []
        self.piso, self.slam = piso, self.slams[piso]
        self.seguidor.slam = self.slam
        ids, translucido, solido = self.piso2_rgba
        self.m.geom_rgba[ids] = solido if piso else translucido
        self.slam.reubicar(self.robot.pos, self.robot.yaw)
        self.note(f'ascensor: llego al {"segundo" if piso else "primer"} piso; se ubica en el mapa de ese piso')
        a['meta'][piso] = 1.0
        while a['abre'][piso] < 1.0:
            yield
        yield from self.robot.walk_path([A['frente']], self.dt, trail)
        if body:
            yield from self.person_walk(body, [(A['frente'][0] - 0.6, A['frente'][1] - 0.2)])
        a['meta'][piso] = 0.0
        self.en_ascensor = False

    def _gap(self, body):
        """Distancia al visitante segun las camaras y el lidar (no su posicion real); None = va solo."""
        if body is None:
            return None
        d = self.seguidor.estado['distancia']
        return FOLLOW_GAP if d is None else d                 # recien empieza: aun no lo midio

    def _aplicar(self, dec):
        """Ejecuta una decision: la muestra con su motivo, avisa y dice la frase."""
        self.hud['decision'] = f'Decision: {dec.accion} ({dec.motivo})'
        self.note(f'DECISION {dec.accion}: {dec.motivo}' + (f' | aviso a {", ".join(dec.avisar)}' if dec.avisar else ''))
        for quien in dec.avisar:
            self.avisos.append((self.d.time, quien, dec.motivo))
        if dec.avisar:
            self.hud['accion'] = 'Aviso a ' + ', '.join(dec.avisar) + f': {dec.motivo}'
            tipo = 'ESCALADO_RECEPCION' if dec.accion == 'escalar' else 'IMPREVISTO'
            pid, ficha = self.atendiendo
            self.api(evento(tipo, persona_id=pid, ficha=ficha, motivo=dec.motivo, avisar=dec.avisar))
        if dec.frase:
            yield from self.decir(dec.frase)
        yield

    def _obstruido(self, ruta, body):
        """Algo invadio la ruta: se detiene y decide (esperar a que pase / rodear) hasta que pueda seguir."""
        self.en_incidente, t0, prev = True, self.d.time, None
        while True:
            visitante = self.seguidor.memoria[0] if body and self.seguidor.memoria else None
            b = self.slam.bloqueo_adelante(self.slam.pose[:2], ruta, ignorar=visitante)
            dec = decidir(Situacion(bloqueo_m=b, bloqueo_s=self.d.time - t0, detenido=True, visitante_m=self._gap(body)))
            if dec.accion != prev:
                yield from self._aplicar(dec)
                if prev == 'detenerse' and dec.accion == 'seguir':
                    yield from self.decir('Gracias.')
                prev = dec.accion
            if dec.accion in ('seguir', 'rodear'):            # libre, o replanear con el mapa ya actualizado
                break
            yield from self.wait(ESCANEO)
        self.en_incidente = False

    def _sin_ruta(self, meta, body):
        """No hay camino en su mapa: avisa y espera a que despejen (replaneando cada segundo); si no, recepcion."""
        self.en_incidente, t0, prev = True, self.d.time, None
        while True:
            if self.slam.ruta(meta):
                if prev:
                    self.hud['decision'] = 'Decision: seguir (el paso quedo libre)'
                    self.note('DECISION seguir: el paso quedo libre')
                    yield from self.decir('Ya despejaron el paso. Sigamos.')
                self.en_incidente = False
                return True
            dec = decidir(Situacion(sin_ruta_s=0.0 if prev is None else max(self.d.time - t0, 0.01),
                                    visitante_m=self._gap(body)))
            if dec.accion != prev:
                yield from self._aplicar(dec)
                prev = dec.accion
            if dec.accion == 'escalar':
                self.en_incidente = False
                return False
            yield from self.wait(1.0)

    def _caminar_con(self, body, meta, trail, camino, piso=0):
        """Camina la ruta con el visitante detras; si se queda atras, se detiene mirandolo hasta que se acerque."""
        for _ in self.navegar(meta, trail, body, piso):
            self._follow(body, trail)
            gap = self._gap(body)
            if self.robot.hold is None and gap > LEJOS and not self.en_ascensor:   # en el ascensor va a su lado
                busca = self.seguidor.direccion()             # donde lo vio por ultima vez (o detras de el)
                self.robot.hold = busca if busca is not None else float(self.robot.yaw + np.pi)
                dec = decidir(Situacion(visitante_m=gap))
                self.hud['decision'] = f'Decision: {dec.accion} ({dec.motivo})'
                donde = f'a {gap:.1f} m' if np.isfinite(gap) else 'fuera de vista'
                self.note(f'DECISION {dec.accion}: visitante {donde}, el robot lo espera')
            elif self.robot.hold is not None and gap < CERCA:
                self.robot.hold = None
            yield
        self.robot.hold = None
        camino['activo'] = False

    def _conversar(self, v, cat, ficha, stop, camino, destino=None, n_frases=2):
        """Lo que dice caminando, por prioridad: llamar al visitante si quedo atras > responder su pregunta >
        contar lo que queda a cada lado > charla de su categoria (con pausas, sin hablar sin parar).
        destino: lugar fuera de las salas (piscina, gimnasio...): no narra las puertas del pasillo."""
        ed = llm.Edecan(cat, ficha, self.reg, destino=destino)   # LLM si hay; si no (o falla) respuestas fijas
        frases = list((yield from self._en_hilo(ed.charla, n_frases)))
        preguntas = list(v.get('preguntas', []))
        por_metros, m0 = list(v.get('preguntas_m', [])), self.robot.recorrido   # (metros caminados, pregunta)
        lados = {}                                         # x de la puerta -> {izquierda/derecha: categoria}
        for c, r in cw.ROOMS.items():
            if destino is None and c != cat and r['door'][0] < stop[0] - 0.5 and abs(r['door'][1]) > 0.5:
                lados.setdefault(r['door'][0], {})['izquierda' if r['door'][1] > 0 else 'derecha'] = c
        lados = sorted(lados.items())
        callado, llamado = 0.0, False
        while camino['activo']:
            if self.en_incidente:                          # el imprevisto tiene la palabra
                yield
                continue
            x, texto = self.robot.pos[0], None
            if self.robot.hold is None:
                llamado = False
            if self.robot.hold is not None and not llamado:
                texto, llamado = edecan.POR_AQUI, True
            elif (preguntas and x >= preguntas[0][0]) or (por_metros and self.robot.recorrido - m0 >= por_metros[0][0]):
                q = (preguntas if preguntas and x >= preguntas[0][0] else por_metros).pop(0)[1]
                self.hud['robot'] = f'Visitante: "{q}"'
                self.note(f'VISITANTE: {q}')
                yield from self.wait(1.5)
                donde = ('Ya van por el segundo piso.' if self.piso else
                         'Van en el ascensor.' if self.en_ascensor else 'Van por el primer piso.') if destino else ''
                texto = yield from self._en_hilo(ed.responder, q, abs(stop[0] - self.robot.pos[0]) + abs(stop[1] - self.robot.pos[1]), donde)
            elif self.robot.hold is None and lados and x >= lados[0][0] - 1.5:
                texto = edecan.narrar(**lados.pop(0)[1])
            elif self.robot.hold is None and frases and callado > 2.0:
                texto = frases.pop(0)
            if texto:
                yield from self.decir(texto)
                callado = 0.0
            else:
                callado += self.dt
                yield
        if ed.fallo:
            self.note(f'LLM no disponible, respuestas fijas: {ed.fallo}')

    @staticmethod
    def _en_hilo(fn, *args):
        """Corre fn (p. ej. la llamada al LLM) en otro hilo; mientras tanto el robot sigue caminando."""
        out = {}
        t = threading.Thread(target=lambda: out.setdefault('r', fn(*args)), daemon=True)
        t.start()
        while t.is_alive():
            yield
        return out.get('r')

    def _esperar_puerta(self, cat):
        """Ordeno abrir: si la puerta no se mueve, el motor de decision avisa y el robot espera con el visitante."""
        t0, prev = self.d.time, None
        while self.door[cat]['open'] < 0.5:
            dec = decidir(Situacion(puerta_s=self.d.time - t0, categoria=cat))
            if dec.accion != prev:
                if dec.accion != 'seguir' or prev:
                    yield from self._aplicar(dec)
                prev = dec.accion
            yield
        if prev == 'puerta_falla':
            yield from self.decir('Listo, ya abrieron. Adelante, por favor.')

    def _beside_door(self, cat):
        """Punto a un lado de la puerta (pasandola, del lado del pasillo) para no bloquear la entrada."""
        dx, dy = cw.ROOMS[cat]['door']
        if cat == 'EXTERNO':                       # puerta al fondo del pasillo
            return np.array([dx - 0.7, 0.85])
        side = 1.0 if dy > 0 else -1.0
        return np.array([dx + 0.9, side * 0.45])

    def _face_between(self, visitor, target, side_angle=np.radians(70)):
        """Orientacion para senalar: el destino queda a ~70 grados a un lado (el brazo se extiende hacia el costado
        y se lee desde lejos) y, de las dos opciones, la que deja al visitante mas de frente."""
        def direction(p):
            v = np.array(p) - self.robot.pos
            return np.arctan2(v[1], v[0])
        t, v = direction(target), direction(visitor)
        wrap = lambda a: (a + np.pi) % (2 * np.pi) - np.pi
        return float(min((t + side_angle, t - side_angle), key=lambda yaw: abs(wrap(v - yaw))))

    @staticmethod
    def _then(*gens):
        for g in gens:
            yield from g

    def reconocer(self):
        """Recorrido de reconocimiento: camina el lobby y el pasillo mientras el lidar arma el mapa."""
        self.hud.update(categoria='Reconocimiento: el robot recorre el club y arma su mapa (SLAM)', robot='', accion='')
        self.caso = 'Antes de abrir: el robot recorre el club y arma su mapa (SLAM)'
        self.note('reconocimiento: inicio')
        yield from self.robot.walk_path(RECONOCIMIENTO, self.dt)
        yield from self.go_home()
        e = np.array(self.slam.errores)
        self.note(f'reconocimiento: mapa listo ({int(self.slam.libre().sum() * P.RES ** 2)} m2 libres); error SLAM '
                  f'max {100 * e[:, 0].max():.0f} cm vs solo odometria {100 * e[:, 1].max():.0f} cm')
        self.hud['categoria'] = ''

    def go_home(self):
        """Vuelve a HOME desde cualquier punto del club planeando sobre su mapa y queda mirando a la entrada. En HOME se
        ubica con la marca del piso (como en una base de carga): corrige lo que derivo afuera."""
        yield from self.navegar(cw.HOME['xy'])
        yield from self.robot.turn_to(cw.HOME['yaw'], self.dt)
        yield from self.robot.stand(1.0, self.dt)
        e = float(np.linalg.norm(self.slam.pose[:2] - self.robot.pos))
        if np.linalg.norm(self.robot.pos - cw.HOME['xy']) < 0.3:       # solo si de verdad esta sobre la marca
            if e > 0.1:
                self.note(f'SLAM: se ubica con la marca de HOME (corrige {100 * e:.0f} cm)')
            self.slam.reubicar(self.robot.pos, self.robot.yaw)
        self.home_checks.append(self.home_error())
        self.note('robot en HOME (error %.2f m, %.1f deg)' % self.home_checks[-1][1:])
        if self.api_bot.latidos and self.api_bot.latidos[-1][1] != 'ok':
            self.latido('ok', 'de vuelta en la entrada')

    def home_error(self):
        """Error real de la pelvis del X2 (no del arnes) respecto a HOME."""
        q = self.d.qpos
        yaw = np.arctan2(2 * (q[3] * q[6] + q[4] * q[5]), 1 - 2 * (q[5] ** 2 + q[6] ** 2))
        dyaw = (yaw - cw.HOME['yaw'] + np.pi) % (2 * np.pi) - np.pi
        return (self.d.time, float(np.linalg.norm(q[:2] - cw.HOME['xy'])), float(abs(np.degrees(dyaw))))

    def go_to(self, cat):
        """Modo manual: ir a la puerta de la sala de una categoria, abrirla, y volver a HOME."""
        room = cw.ROOMS[cat]
        door = np.array(room['door'])
        stop = self._beside_door(cat)
        self.hud.update(categoria=f'Manual: robot hacia {room["label"]}', robot='', accion='')
        self.m.geom_rgba[self.led] = LED[cat]
        yield from self.navegar(stop)
        yield from self.robot.turn_to(self._face_between((stop[0] - 2.0, 0.0), door), self.dt)
        self.door[cat]['target'] = 1.0
        yield from self.robot.gesture(self.robot.point_pose(door), 3.0, self.dt)
        self.door[cat]['target'] = 0.0
        yield from self.wait(1.0)
        self.hud['categoria'] = 'Manual: volviendo a HOME'
        yield from self.go_home()
        self.m.geom_rgba[self.led] = LED['IDLE']
        self.hud['categoria'] = 'Manual: en HOME. Comandos: vip regular invitado personal externo home demo'

    def _follow(self, body, trail):
        if len(trail) < 2 or self.en_ascensor:          # en el ascensor entra y sale por su cuenta
            return
        goal = trail.point_at(trail.length - FOLLOW_GAP) if trail.length > FOLLOW_GAP else trail.pts[0] + np.array([-0.6, 0.0])
        pos = self.person_pos(body)
        delta = goal - pos
        dist = np.linalg.norm(delta)
        p = self.pausa.get(body)
        if p and p[1] > 0 and pos[0] >= p[0]:           # se queda mirando algo
            if not self.hud['accion'].startswith('Visitante se detiene'):
                self.hud['accion'] = 'Visitante se detiene a mirar'
                self.note(f'{body} se detiene a mirar')
            p[1] -= self.dt
            return
        if dist > 1e-3:
            self.set_person(body, pos + delta / dist * min(1.3 * self.dt, dist))

    def decir(self, texto):
        """Muestra (y si hay voz, dice) una frase; espera lo que dura decirla."""
        self.hud['robot'] = f'Robot: "{texto}"'
        self.note(f'ROBOT: {texto}')
        if self.voz:
            self.voz.decir(texto)
        yield from self.wait(max(1.5, 0.065 * len(texto)))

    def receive(self, v):
        """Un visitante: llega -> facial del club (SIMULADO) -> dialogo de recepcion (confirmacion con registros,
        frases, gesto, LED, acciones) -> guiar -> vuelve a HOME."""
        body, pid = v['body'], v['persona']
        self.rol = 'Visitante'
        self.titulo(v.get('caso') or f'{v["vision"]}' + (f' ({v["metodo"]})' if v.get('metodo') else ''))
        self.hud.update(facial='', evidencia='', categoria='', robot='', accion='')
        self.reg = Registros(hoy=HOY, datos=self.api_bot.registros())   # lo vigente ahora (fecha y turnos)
        espero = self.esperando.pop(body, None)
        yield from self.person_walk(body, [PARADA] if espero is not None or v.get('en_fila') else [cw.ENTRY, PARADA])
        if espero is not None:
            self.note(f'{body} esperaba hace {self.d.time - espero:.0f} s')
            yield from self.decir('Disculpe la espera. Ya estoy con usted.')
        yield from self.acercar(body, v)
        vision = {'categoria': v['vision'], 'persona_id': pid, 'confianza': v['conf'],   # lo que entrega el modelo
                  **{k: v[k] for k in ('metodo', 'motivo') if v.get(k)}}
        self.hud['facial'] = (f'Vision robotB ({v["metodo"]})' if v.get('metodo') else 'Modelo de vision (SIMULADO)') + \
            f': {v["vision"]}  ({pid}, conf {v["conf"]:.2f})'
        self.note(f'{pid or "sin identidad"}: vision {v["vision"]} ({v["conf"]:.2f})')
        self.panel = {'vision': vision, 'rastro': self.reg.rastro(pid), 'decisiones': self.decisiones}
        yield from self.wait(1.5)
        def entiende(paso, texto):
            if texto is None:
                return None
            return texto if paso.dato['opciones'] == 'nombre_socio' else entender(texto, paso.dato['opciones'])

        cola = list(v['respuestas'])                           # vista previa del flujo para el panel: lo que
        previa = ejecutar(entrada(self.reg, vision=vision, ahora=self.ahora()),   # pasaria si el anfitrion aprueba
                          lambda p: True if p.tipo == 'accion' else entiende(p, cola.pop(0) if cola else None))
        self.panel['flujo'] = [e for e in map(panel.etiqueta, previa) if e]
        conv = entrada(self.reg, vision=vision, ahora=self.ahora())   # el dialogo real, un paso a la vez
        corridor, cat, dichas, pasos, luego, resp = (3.0, -0.5), None, list(v['respuestas']), [], [], None
        while True:
            if luego:
                paso = luego.pop(0)
            else:
                try:
                    paso = conv.send(resp)
                except StopIteration:
                    break
                resp = None
            self.panel['actual'] = sum(bool(panel.etiqueta(q)) for q in pasos)
            pasos.append(paso)
            if paso.tipo == 'accion' and paso.texto == 'confirmacion':
                cat = paso.dato['categoria']
                self.panel.update(categoria=cat, motivo=paso.dato['motivo'])
                ficha = paso.dato.get('ficha') or self.reg.desde_vision(vision)[1] if cat in cw.ROOMS else None
                self.cat_of[body] = cat
                self.rol = rol_de(cat, ficha)
                for gid in self.ropa.get(body, []):
                    self.m.geom_rgba[gid] = cw.ROOMS[cat]['rgba'] if cat in cw.ROOMS else [0.85, 0.3, 0.3, 1]
                self.hud['evidencia'] = f'Evidencia: {paso.dato["motivo"]}'
                self.hud['categoria'] = f'Categoria confirmada: {cat}' + (f'  ->  {cw.ROOMS[cat]["label"]}' if cat in cw.ROOMS else '')
                self.note(f'{pid or "sin identidad"}: {cat or "sin registro"} ({paso.dato["motivo"]})')
                if cat in cw.ROOMS:
                    self.atendiendo = (pid, ficha)
                    self.api(evento('LLEGADA', cat, pid, ficha, cw.ROOMS[cat]['label'],
                                    paso.dato['motivo'], {'metodo': 'vision', 'confianza': v['conf']}))
                yield from self.wait(1.5)
            elif paso.tipo == 'accion' and paso.texto == 'confirmar_anfitrion':
                self.hud['accion'] = f'Accion: confirmacion en la app de {paso.dato["anfitrion"]}'
                resp = yield from self.confirmar_en_app(paso.dato['anfitrion'])
            elif paso.tipo == 'accion':
                self.hud['accion'] = f'Accion: {paso.texto} {paso.dato}'
                self.note(f'accion {paso.texto} {paso.dato}')
            elif paso.tipo == 'led':
                self.m.geom_rgba[self.led] = LED_NOMBRE.get(paso.texto, LED['IDLE'])
            elif paso.tipo == 'gesto':
                if paso.texto in GESTO:
                    yield from self.robot.gesture(GESTO[paso.texto], 2.5, self.dt)
                elif paso.texto == 'senalar_ruta':             # se gira y senala la entrada al pasillo
                    yield from self.robot.turn_to(self._face_between(self.person_pos(body), corridor), self.dt)
                    yield from self.robot.gesture(self.robot.point_pose(corridor), 2.5, self.dt)
            elif paso.tipo in ('decir', 'preguntar'):
                yield from self.decir(paso.texto)
                if paso.tipo == 'preguntar' and dichas:            # lo que contesta el visitante
                    r = dichas.pop(0)
                    self.hud['robot'] += f'  |  Visitante: "{r}"'
                    self.note(f'VISITANTE: {r}')
                    yield from self.wait(1.5)
                    resp = entiende(paso, r)
            elif paso.tipo == 'escalar':
                self.hud['accion'] = f'Accion: alerta a recepcion ({paso.texto})'
                self.note(f'ESCALADO: {paso.texto}')
                e = evento('ESCALADO_RECEPCION', categoria=v['vision'], persona_id=pid, motivo=paso.texto,
                           evidencia={'metodo': 'vision', 'confianza': v['conf']})
                self.api(e)
                yield from self.esperar_concierge(e, body)
            elif paso.tipo == 'guiar' and paso.dato['destino'] in cw.LUGARES:   # piscina, tenis, gimnasio, spa
                dest = paso.dato['destino']
                if paso.dato['escolta']:                       # VIP: lo acompana
                    yield from self.escort_lugar(v, dest, ficha)
                else:                                          # socio: le indica y sigue solo
                    L = cw.LUGARES[dest]
                    hacia = cw.ASCENSOR['frente'] if L['piso'] else (-4.0, 0.0)
                    self.note(f'indica el camino a {L["label"]}: sigue solo')
                    self.fondo.append(self._va_solo(body, dest))
                    yield from self.robot.turn_to(self._face_between(self.person_pos(body), hacia), self.dt)
                    yield from self.robot.gesture(self.robot.point_pose(hacia), 3.0, self.dt)
            elif paso.tipo == 'guiar':
                dest, room = paso.dato['destino'], cw.ROOMS[paso.dato['destino']]
                if paso.dato['escolta']:
                    yield from self.escort(v, dest, ficha)
                else:                                          # va solo; el robot senala el pasillo (regular)
                    while True:                                # lo que sigue (sin preguntas) lo dice mientras sale
                        try:
                            luego.append(conv.send(None))
                        except StopIteration:
                            break
                    for later in luego:
                        if later.tipo == 'decir':
                            self.hud['robot'] = f'Robot: "{later.texto}"'
                            later.tipo = 'dicho'
                    walk = self.person_walk(body, [(cw.APPROACH[0] + 0.6, -0.9), corridor, (room['door'][0], 0.0),
                                                   room['door'], room['inside']])
                    if cat == 'REGULAR':
                        yield from self.robot.turn_to(self._face_between(self.person_pos(body), corridor), self.dt)
                        walk = parallel(self.robot.gesture(self.robot.point_pose(corridor), 4.0, self.dt), walk)
                    yield from walk
                    self.door[dest]['target'] = 0.0
                k_room = v['k'] if 'k' in v else VISITORS.index(v)   # a un lado dentro de su sala para no tapar al siguiente
                self.set_person(body, np.array(room['inside']) + [0.6 * (k_room % 2) - 0.3, 0.4])
                self.adentro[body] = {'cat': dest, 'pid': pid, 'vision': v['vision'], 'conf': v['conf']}
        self.panel['flujo'] = [e for e in map(panel.etiqueta, pasos) if e]   # lo que paso de verdad
        self.panel['actual'] = len(self.panel['flujo'])
        self.atendiendo = (None, None)
        yield from self.go_home()
        self.m.geom_rgba[self.led] = LED['IDLE']

    def guion_escenario(self, pasos, personas):
        """Corre un escenario del tablero (sim/control.py ESCENARIOS) sin interfaz: llega la gente a su tiempo, hace
        fila, el robot atiende de a una y los imprevistos pasan en paralelo. Un tick por yield."""
        pasos, pendientes, extras, task, t0 = sorted(pasos, key=lambda p: p[0]), [], [], None, self.d.time
        while pasos or pendientes or task is not None or self.fondo:
            while pasos and self.d.time - t0 >= pasos[0][0]:
                _, que, cual = pasos[0]
                if que == 'salida':
                    quien = next((b for b, i in self.adentro.items() if i['cat'] == cual), None)
                    if quien is None:                              # todavia no hay nadie de esa categoria adentro
                        break
                    pendientes.append({'sentido': 'sale', 'body': quien, 'categoria': cual, 'confianza': 1.0})
                elif que == 'persona':
                    c = dict(personas[cual][1], caso=personas[cual][0])
                    c['body'] = self.encolar(c)
                    pendientes.append(c)
                elif que == 'imprevisto':
                    extras.append(self.imprevisto(cual))
                elif que == 'apps' and isinstance(self.api_bot, ApiSimulada):
                    self.api_bot.automaticas(bool(cual))
                pasos.pop(0)
            if task is None and self.bateria() <= 20:
                task = self.revisar_bateria()
            if task is None and pendientes:
                task = self.atender(pendientes.pop(0))
            for g in [task] + extras:
                if g is None:
                    continue
                try:
                    next(g)
                except StopIteration:
                    if g is task:
                        task = None
                    else:
                        extras.remove(g)
            yield

    def _poner(self, nombre, xy, nota):
        self.d.mocap_pos[cw.mocap_id(self.m, nombre)][:2] = xy
        self.note(f'INCIDENTE (el robot no lo sabe): {nota}')

    def incidentes(self):
        """Lo que pasa en el club sin que el robot lo sepa: no esta en su mapa ni en su guion. Solo lo percibe."""
        while not (self.escoltando == 'VIP' and self.robot.pos[0] > 1.8):
            yield
        self._poner('Carrito', (4.4, 0.2), 'dejaron un carrito de limpieza en su ruta')
        while not (self.escoltando == 'INVITADO' and self.robot.pos[0] > 7.4):
            yield
        self._poner(MESERO, (9.4, 0.1), 'un mesero se detiene en medio del pasillo')
        yield from self.wait(1.5)
        yield from self.person_walk(MESERO, [(9.4, -0.95)])          # se hace a un lado
        while not any(q == 'mantenimiento' and t > 0 for t, q, m in self.avisos if 'puerta' in m):
            yield
        yield from self.wait(1.5)
        yield from self.person_walk(HOST, [(11.0, 2.2)])              # el anfitrion avisado sale a la puerta
        yield from self.wait(4.0)
        self.atasco['INVITADO'] = False
        self.note('INCIDENTE resuelto: mantenimiento libero la puerta')
        self.set_person(MESERO, cw.LEJOS)
        while not (self.escoltando == 'EXTERNO' and self.robot.pos[0] > 9.5):
            yield
        self._poner('Valla', (13.9, 0.0), 'una valla de mantenimiento cierra el pasillo')
        while not any(q == 'mantenimiento' and 'bloqueado' in m for t, q, m in self.avisos):
            yield
        yield from self.wait(15.0)
        self._poner('Valla', cw.LEJOS, 'mantenimiento retira la valla')

    def scenario(self):
        self.atasco['INVITADO'] = True                     # la puerta de la sala de anfitriones se atasca (imprevisto)
        inc = self.incidentes()                            # avanza junto al guion y termina con el
        for _ in self._scenario():
            next(inc, None)
            yield

    def _scenario(self):
        yield from self.wait(1.0)
        yield from self.reconocer()
        self.reconocido = True
        for i, v in enumerate(VISITORS):
            yield from self.revisar_bateria()
            sig = VISITORS[i + 1] if i + 1 < len(VISITORS) else {}
            if sig.get('llega_mientras'):                  # el siguiente llega cuando el robot ya no esta
                yield from parallel(self.receive(v), self._llega_y_espera(sig, 45.0))
            else:
                yield from self.receive(v)
        for v in VISITORS:
            if v.get('sale'):
                yield from self.despedir(v)
        yield from self.revisar_bateria()
        self.hud.update(facial='', evidencia='', categoria='Escenario completo: 5 categorias, desconocido, fuera de turno, '
                                                          'salida + imprevistos',
                        robot='', accion='')
        self.note('fin del escenario')

    def acercar(self, body, v):
        """Una persona a la vez: la mide con la camara delantera + lidar y le pide que se acerque hasta tenerla a
        CERCA_VISION, para que la vision la vea bien (como en el robot real). v['timido']: se queda a medio camino."""
        self.seguidor.seguir(body)
        pedidos, d = 0, None
        while True:
            yield from self.wait(0.6)                           # un par de lecturas de camara + lidar
            d = self.seguidor.estado['distancia']
            if d is not None and np.isfinite(d) and d <= CERCA_VISION:
                break
            if pedidos == 3:                                    # no se acerca: la vision tendra que intentarlo asi
                break
            self.note(f'camaras: persona a {d:.1f} m (camara delantera + lidar): lejos para reconocerla' if d and np.isfinite(d)
                      else 'camaras: hay alguien en la entrada pero no lo ve bien')
            yield from self.decir('Hola. Acérquese un poco, por favor, para poder verle bien.' if pedidos == 0
                                  else 'Un poco más cerca, por favor.')
            pedidos += 1
            corto = v.get('timido') and pedidos == 1
            yield from self.person_walk(body, [(cw.APPROACH[0] - 1.1, 0.0) if corto else cw.APPROACH])
        self.seguidor.seguir(None)
        if d is not None and np.isfinite(d) and d <= CERCA_VISION:
            self.note(f'camaras: persona a {d:.1f} m: la ve bien, la reconoce')

    def encolar(self, c):
        """Pone a la persona en la fila de la entrada (se atiende una a la vez). -> el cuerpo que la representa."""
        libres = [b for b in POOL if b not in self.fila and b != self.atendiendo_cuerpo]
        body = libres[self.atendidos_robotb % len(libres)]
        self.atendidos_robotb += 1
        self.fila.append(body)
        self.set_person(body, FILA[min(len(self.fila) - 1, len(FILA) - 1)])
        self.d.mocap_pos[cw.mocap_id(self.m, body)][2] = 0.0      # pudo haber quedado en el 2.o piso
        for gid in self.ropa.get(body, []):
            self.m.geom_rgba[gid] = [0.55, 0.55, 0.6, 1]
        return body

    def _avanzar_fila(self):
        yield from parallel(*(self.person_walk(b, [FILA[min(i, len(FILA) - 1)]]) for i, b in enumerate(self.fila)))

    def atender(self, c):
        """Una persona que decidio robotB (contrato de vision): entra por la puerta y la recepcion hace el resto
        (registros, dialogo, motor de decision, panel, bitacora y eventos), igual que en el escenario."""
        if c.get('sentido') == 'sale':                           # sale alguien que esta adentro
            if c.get('body') in self.adentro:
                yield from self.salir(c['body'], self.adentro[c['body']])
            return
        body = c.get('body') or self.encolar(c)
        if body in self.fila:
            self.fila.remove(body)
        k = POOL.index(body)
        self.atendiendo_cuerpo = body
        quien = c.get('nombre') or c.get('persona_id') or 'sin identidad'
        self.note(f'{c.get("origen", "vision")}: {quien} -> {c["categoria"]} ({c.get("metodo")}, {c["confianza"]:.2f})')
        if nota := self.api_bot.agregar(c):
            self.note(nota)
        v = dict(body=body, persona=c.get('persona_id'), vision=c['categoria'], conf=c['confianza'], caso=c.get('caso'),
                 respuestas=list(c.get('respuestas', [])), k=len(VISITORS) + k, metodo=c.get('metodo'),
                 motivo=c.get('motivo'), timido=c.get('timido'), en_fila=True, preguntas_m=c.get('preguntas_m', []))
        yield from parallel(self.receive(v), self._avanzar_fila())     # los de la fila dan un paso adelante
        self.atendiendo_cuerpo = None

    def _llega_y_espera(self, v, despues_s):
        yield from self.wait(despues_s)
        yield from self.person_walk(v['body'], [cw.ENTRY, ESPERA_SPOT])
        self.esperando[v['body']] = self.d.time
        self.note(f'{v["body"]} llega y espera: el robot no esta en la entrada (el concierge lo ve en el latido)')

    def despedir(self, v):
        """Escenario guionado: el visitante v sale (queda en la entrada para el --check)."""
        yield from self.salir(v['body'], {'cat': v['esperado'], 'pid': v['persona'], 'vision': v['vision'],
                                          'conf': v['conf']}, fuera=False)

    def salir(self, body, info, fuera=True):
        """Sale de su sala, pasa frente al robot, el robot la mide para verla bien, la reconoce y se despide segun su
        categoria (docs/flujos-salida.md); evento SALIDA. fuera: al final se va del club (el cuerpo queda libre)."""
        cat, pid = info['cat'], info['pid']
        self.titulo(f'Salida · {SALIDA_TITULO.get(cat, cat)}')
        self.rol = ROL.get(cat, ('Visitante',))[0]
        self.adentro.pop(body, None)
        room = cw.ROOMS[cat]
        yield from self.person_walk(body, [room['inside'], room['door'], (room['door'][0], 0.0), (3.0, -0.5),
                                           (0.0, -1.3), (cw.APPROACH[0], -0.6)])
        self.door[cat]['target'] = 0.0
        yield from self.acercar(body, {})
        self.reg = Registros(hoy=HOY, datos=self.api_bot.registros())
        self.note(f'{pid}: vision {info["vision"]} ({info["conf"]:.2f}) saliendo')
        self.panel = {'vision': {'categoria': info['vision'], 'persona_id': pid, 'confianza': info['conf'], 'metodo': 'sale'},
                      'rastro': self.reg.rastro(pid), 'decisiones': self.decisiones, 'categoria': cat,
                      'motivo': 'sale del club'}
        pasos = list(salida(self.reg, pid, self.ahora()))
        self.panel['flujo'] = [panel.etiqueta(q) for q in pasos if panel.etiqueta(q)]
        for paso in pasos:
            if paso.tipo == 'led':
                self.m.geom_rgba[self.led] = LED_NOMBRE.get(paso.texto, LED['IDLE'])
            elif paso.tipo == 'gesto' and paso.texto in GESTO:
                yield from self.robot.gesture(GESTO[paso.texto], 2.5, self.dt)
            elif paso.tipo == 'decir':
                yield from self.decir(paso.texto)
            elif paso.tipo == 'accion':
                self.note(f'accion {paso.texto} {paso.dato}')
        ficha = self.reg.agenda.get(pid) or self.reg.socios.get(pid) or self.reg.turnos.get(pid) or \
            self.reg.orden_de(pid)[1] or {}
        self.api(evento('SALIDA', cat, pid, ficha))
        if cat == 'INVITADO' and pid not in Registros(hoy=HOY, datos=self.api_bot.registros()).agenda:
            self.note(f'{pid} ya no esta en la agenda: se borra su rostro de la galeria')
        self.panel['actual'] = len(self.panel['flujo'])
        yield from self.person_walk(body, [cw.ENTRY])
        if fuera:
            self.set_person(body, cw.LEJOS)
            self.cat_of[body] = None
        self.m.geom_rgba[self.led] = LED['IDLE']

    def hud_texts(self):
        h = self.hud
        body = '\n'.join(x for x in (h['facial'], h['evidencia'], h['categoria'], h['robot'], h['accion'], h['decision']) if x)
        titulo = f'{h["titulo"]}  |  bateria {self.bateria():.0f}%'
        textos = [(mujoco.mjtFontScale.mjFONTSCALE_150, mujoco.mjtGridPos.mjGRID_TOPLEFT, titulo, body or ' ')]
        if self.caso:
            textos.append((mujoco.mjtFontScale.mjFONTSCALE_200, mujoco.mjtGridPos.mjGRID_TOPRIGHT, self.caso, ' '))
        quien, dicho, hasta = self.subtitulo
        if dicho and self.d.time < hasta:
            textos.append((mujoco.mjtFontScale.mjFONTSCALE_200, mujoco.mjtGridPos.mjGRID_BOTTOM, f'{quien}:', dicho))
        return textos


def check():
    sys.stdout.reconfigure(encoding='utf-8')
    if '--llm' not in sys.argv:                  # el check verifica las respuestas fijas (deterministas)
        os.environ['CERBERUS_LLM'] = 'no'
    club = Club()
    pel = mujoco.mj_name2id(club.m, mujoco.mjtObj.mjOBJ_BODY, 'pelvis')
    max_tilt, t0 = 0.0, time.perf_counter()
    for _ in club.scenario():
        club.tick()
        up = club.d.xmat[pel].reshape(3, 3)[:, 2]
        max_tilt = max(max_tilt, np.degrees(np.arccos(np.clip(up[2], -1, 1))))
    print('\n'.join(club.log))
    wall = time.perf_counter() - t0
    llegadas = {e['categoria'] for e in club.eventos_api if e['tipo'] == 'LLEGADA'}
    tipos = [e['tipo'] for e in club.eventos_api]
    assert llegadas == {'VIP', 'REGULAR', 'INVITADO', 'PERSONAL', 'EXTERNO'}, llegadas
    assert tipos.count('IMPREVISTO') >= 2, tipos
    assert all(e['anfitrion_id'] for e in club.eventos_api if 'anfitrion' in e['avisar']), 'aviso al anfitrion sin anfitrion_id'
    esc = [e for e in club.eventos_api if e['tipo'] == 'ESCALADO_RECEPCION']
    assert len(esc) == 1 and 'fuera de su turno' in esc[0]['motivo'], esc
    assert club.api_bot.eventos[esc[0]['id']]['estado'] == 'ATENDIDO', 'el concierge no lo atendio'
    sal = [e for e in club.eventos_api if e['tipo'] == 'SALIDA']
    assert len(sal) == 1 and sal[0]['anfitrion_id'] == 'andres' and club.api_bot.estado_invitacion['laura'] == 'SALIO', sal
    assert [lat[1] for lat in club.api_bot.latidos].count('acompanando') >= 3, 'no aviso que la entrada quedaba sola'
    bat = [e for e in club.eventos_api if 'bateria' in e['motivo']]
    assert len(bat) == 1 and 'mantenimiento' in bat[0]['avisar'] and club.api_bot.eventos[bat[0]['id']]['estado'] == 'ATENDIDO', bat
    assert club.baja_agachado > 0.12 and club.bateria() > 80, (club.baja_agachado, club.bateria())
    print(f'bateria: cambio en el area de mantenimiento (agachado, pelvis {100 * club.baja_agachado:.0f} cm abajo)')
    if '--bitacora' in sys.argv:                 # guarda como se ve la ventana al final
        import cv2
        cv2.imwrite(sys.argv[sys.argv.index('--bitacora') + 1], panel.bitacora(club.log))
    print(f'sim {club.d.time:.0f}s en {wall:.0f}s reales (x{club.d.time / wall:.1f}) | inclinacion max pelvis {max_tilt:.1f} deg')
    assert np.isfinite(club.d.qpos).all()
    for v in VISITORS:
        assert club.cat_of.get(v['body']) == v['esperado'], f'{v["persona"]}: confirmo {club.cat_of.get(v["body"])}, esperado {v["esperado"]}'
        if v.get('sale'):
            assert np.linalg.norm(club.person_pos(v['body']) - cw.ENTRY) < 0.1, f'{v["persona"]} no salio'
            continue
        if v['esperado'] not in cw.ROOMS:                  # escalado: lo atiende el concierge en el mostrador
            assert np.linalg.norm(club.person_pos(v['body']) - RECEPCION_SPOT) < 0.1, f'{v["persona"]} no paso a recepcion'
            continue
        room = cw.ROOMS[v['esperado']]
        bx0, bx1, by0, by1 = room['box']
        x, y = club.person_pos(v['body'])
        assert bx0 < x < bx1 and by0 < y < by1, f'{v["persona"]} no quedo en {room["label"]}: {x:.2f},{y:.2f}'
    assert all(dr['open'] < 0.05 for dr in club.door.values()), 'quedo una puerta abierta'
    assert len(club.home_checks) == len(VISITORS) + 2, f'volvio a HOME {len(club.home_checks)} veces'   # +reconocimiento, +bateria
    worst = max(club.home_checks, key=lambda h: h[1])
    assert all(e_pos < 0.3 and e_yaw < 10 for _, e_pos, e_yaw in club.home_checks), f'HOME impreciso: {worst}'
    assert max_tilt < 20, 'el robot se inclino demasiado'
    e = np.array(club.slam.errores)
    print(f'SLAM: {len(e)} escaneos, error medio {100 * e[:, 0].mean():.0f} cm, max {100 * e[:, 0].max():.0f} cm, '
          f'{e[:, 2].max():.1f} deg | solo odometria: max {100 * e[:, 1].max():.0f} cm | '
          f'paso a {club.dist_obstaculo:.2f} m de la matera')
    assert e[:, 0].max() < 0.35 and e[:, 0].mean() < 0.15, 'el SLAM se perdio'
    assert club.dist_obstaculo > P.RADIO - 0.1, 'el robot paso encima de la matera'
    reg = [(r, e) for r, e, f in club.seguidor.registro if e is not None and np.isfinite(e)]
    err = np.abs(np.array([r - e for r, e in reg]))
    fuentes = [f for _, _, f in club.seguidor.registro]
    vista = np.mean([f.startswith('camara') for f in fuentes])
    print(f'seguidor: {len(fuentes)} mediciones, {100 * vista:.0f} % con camara, error medio {100 * err.mean():.0f} cm, '
          f'max {100 * err.max():.0f} cm, {fuentes.count("perdido")} perdido')
    assert err.mean() < 0.35 and vista > 0.6, 'el seguidor no ve bien al visitante'
    log = '\n'.join(club.log)
    assert 'el visitante no vuelve' not in log, 'escalo por un visitante que si lo seguia'
    for texto in ('Disculpe la espera', '-> APROBADA', 'confirmó en la app', 'Entrada marcada a las 09:',
                  'Ya lo atienden en recepción', 'Hasta pronto, Laura', 'se borra su rostro'):
        assert texto in log, f'falto: {texto}'
    for accion in ('detenerse', 'rodear', 'seguir', 'avisar_bloqueo', 'esperar', 'puerta_falla', 'cambiar_bateria'):
        assert f'DECISION {accion}' in log, f'falto la decision {accion}'
    assert 'Ya despejaron el paso' in log and 'Listo, ya abrieron' in log
    assert any(line.endswith('ROBOT: Gracias.') for line in club.log), 'no agradecio al que le abrio paso'
    assert 'DECISION seguir: camino libre' in log, 'nadie le abrio paso (mesero)'
    assert club.dist_incidentes > 0.1, f'paso a {club.dist_incidentes:.2f} m de un imprevisto'
    print(f'imprevistos: decisiones OK; paso a {club.dist_incidentes:.2f} m (minimo) de carrito/valla/mesero')
    if '--llm' in sys.argv:
        print('check OK (con LLM: solo flujo, recorridos y SLAM)')
        return
    for q in ('bano', 'wifi', 'horario'):
        assert edecan.RESPUESTAS[q] in log, f'el edecan no respondio {q}'
    assert 'faltan unos' in log and f'ROBOT: {edecan.POR_AQUI}' in log and 'el robot lo espera' in log
    assert 'A su izquierda, el Lounge VIP; a su derecha, el salón principal.' in log
    assert 'chaleco puesto' in log and 'Llegamos, señor Peña' in log
    print(f'check OK: 5 categorias confirmadas por el dialogo, cada visitante en su sala, puertas cerradas, HOME tras cada flujo '
          f'(peor error {worst[1]:.2f} m / {max(h[2] for h in club.home_checks):.1f} deg); edecan: charla, lados, '
          'preguntas y espera al visitante')


def director(club, cam, dt):
    """Camara que sigue la accion: al robot, o al robot y su visitante si lo acompana. Suave (constante 1 s)."""
    p, lejos = club.robot.pos.copy(), 10.0
    if club.seguidor.objetivo:
        p, lejos = (p + club.person_pos(club.seguidor.objetivo)) / 2, 9.0
    a = 1 - np.exp(-dt / 1.0)
    cam.lookat[:2] += a * (p - cam.lookat[:2])
    cam.lookat[2] = 0.6 + club.robot.z
    cam.distance += a * (lejos - cam.distance)
    cam.elevation, cam.azimuth = -60.0, 90.0                  # desde arriba: las paredes no tapan el pasillo


def grabar(ruta, vel=2.0, fps=30, ancho=1280, alto=720, persona=None, escenario=None):
    """Graba el escenario completo en MP4 (sin ventana): camara que sigue la accion, titulo del caso, subtitulos y
    la camara del robot cuando acompana. vel: segundos simulados por segundo de video. persona: en vez del
    escenario, personas del tablero seguidas (sim/control.py PERSONAS, p. ej. 'piscina,gimnasio')."""
    import cv2
    sys.stdout.reconfigure(encoding='utf-8')
    club = Club(sombras=True)
    if escenario:                                          # un escenario del tablero (p. ej. 'rol_vip')
        import control
        club.caso = control.ESCENARIOS[escenario][0]
        guion = club.guion_escenario(control.ESCENARIOS[escenario][2], control.PERSONAS)
    elif persona:                                          # 'piscina,tenis,gimnasio': una tras otra
        import control

        def personas():
            for k in persona.split(','):
                c = dict(control.PERSONAS[k][1], caso=control.PERSONAS[k][0])
                c['body'] = club.encolar(c)
                yield from club.atender(c)
        guion = personas()
    else:
        guion = club.scenario()
    r = mujoco.Renderer(club.m, alto, ancho)
    cam, opt = mujoco.MjvCamera(), mujoco.MjvOption()
    opt.geomgroup[cw.VISTO] = 1
    cam.lookat[:] = [*club.robot.pos, 0.6]
    cam.distance = 9.0
    out = cv2.VideoWriter(ruta, cv2.VideoWriter_fourcc(*'mp4v'), fps, (ancho, alto))
    paso, t_sig, n, t0 = vel / fps, 0.0, 0, time.perf_counter()
    for _ in guion:
        club.tick()
        if club.d.time < t_sig:
            continue
        t_sig += paso
        director(club, cam, paso)
        r.update_scene(club.d, cam, opt)
        quien, dicho, hasta = club.subtitulo
        inserto = club.seguidor.ventana() if club.seguidor.objetivo else None
        out.write(panel.cuadro_video(r.render(), club.caso, f'{quien}: {dicho}' if dicho and club.d.time < hasta else '',
                                     f'batería {club.bateria():.0f}%', inserto))
        n += 1
    out.release()
    club.seguidor.cam.cerrar()
    print(f'video: {ruta}, {n} cuadros ({n / fps:.0f} s de video, {club.d.time:.0f} s simulados) en {time.perf_counter() - t0:.0f} s')


def check_api(url):
    """Contra la API real del club (p. ej. la de AWS): registros, eventos, confirmacion del anfitrion y concierge.
    Las apps las simula Apps (concierge atiende a los 6 s, Andres aprueba a los 4 s), por la misma API."""
    from api_cliente import ApiHttp, Apps
    sys.stdout.reconfigure(encoding='utf-8')
    os.environ['CERBERUS_LLM'] = 'no'
    api, apps = ApiHttp(url), Apps(url)
    enviar, crear = api.enviar_evento, api.crear_confirmacion

    def enviar_y_atender(e):
        r = enviar(e)
        if e['requiere_atencion']:
            threading.Timer(6.0, apps.atender, (e['id'],)).start()
        return r

    def crear_y_aprobar(c):
        r = crear(c)
        threading.Timer(4.0, apps.responder, (c['id'], c['anfitrion_id'], True)).start()
        return r
    api.enviar_evento, api.crear_confirmacion = enviar_y_atender, crear_y_aprobar
    club = Club(api)
    marta = api.registros()['turnos'].get('marta', {})
    casos = [{'categoria': 'VIP', 'persona_id': 'sofia', 'confianza': 0.95, 'metodo': 'prueba'},
             {'categoria': 'VISITANTE', 'persona_id': 'inv-00000001', 'confianza': 0.9, 'metodo': 'prueba'},
             {'categoria': 'DESCONOCIDO', 'persona_id': None, 'confianza': 0.9, 'metodo': 'prueba',
              'respuestas': ['vengo invitado', 'me invitó Andrés']},
             {'categoria': 'EMPLEADO', 'persona_id': 'marta', 'confianza': 0.93, 'metodo': 'prueba'}]

    def guion():
        yield from club.reconocer()
        for c in casos:
            yield from club.atender(c)
    for _ in guion():
        club.tick()
    print('\n'.join(club.log))
    tipos = [(e['tipo'], e['categoria'], e['persona_id']) for e in club.eventos_api]
    assert ('LLEGADA', 'VIP', 'sofia') in tipos and ('LLEGADA', 'INVITADO', 'inv-00000001') in tipos, tipos
    assert ('LLEGADA', 'INVITADO', None) in tipos, 'el desconocido no entro tras la confirmacion'
    esperado = ('LLEGADA', 'PERSONAL', 'marta') if marta.get('en_turno') else ('ESCALADO_RECEPCION', 'PERSONAL', 'marta')
    assert esperado in tipos, (esperado, tipos)
    assert not api.cola and not api.rechazados, (api.cola, api.rechazados)
    for e in club.eventos_api:                                # todos quedaron en la API del club
        assert api.estado_evento(e['id'])['estado'] in ('NUEVO', 'ATENDIDO', 'RESUELTO')
    log = '\n'.join(club.log)
    assert '-> APROBADA' in log, 'no llego la respuesta del anfitrion'
    club.seguidor.cam.cerrar()
    print(f'check API OK contra {url}: {len(club.eventos_api)} eventos en la API, confirmacion del anfitrion por su app, '
          f'marta {"en turno" if marta.get("en_turno") else "fuera de turno -> recepcion la atendio"}')


def check_robotb():
    """Sin robotB corriendo: decisiones con la forma de su API pasan por la recepcion completa."""
    from vision_robotb import a_vision
    sys.stdout.reconfigure(encoding='utf-8')
    os.environ['CERBERUS_LLM'] = 'no'
    club = Club()
    casos = [a_vision({'id': '1', 'rol': 'PERSONAL', 'persona_id': 'thomas', 'nombre': 'Thomas', 'confianza': 0.88,
                       'estado': 'CONFIRMADO_CEDULA'}),
             a_vision({'id': '2', 'rol': 'INVITADO', 'persona_id': 'ana', 'nombre': 'Ana Ruiz', 'confianza': 0.81,
                       'estado': 'RECONOCIDO'}, {'anfitrion': 'andres'}),
             a_vision({'id': '3', 'rol': 'ESCALAMIENTO', 'persona_id': None, 'nombre': 'desconocido', 'confianza': 0.21,
                       'estado': 'ESCALAMIENTO', 'motivo': 'la cedula es de otra persona'})]

    def guion():
        yield from club.reconocer()
        for c in casos:
            yield from club.atender(c)
    for _ in guion():
        club.tick()
    print('\n'.join(club.log))
    cats = [club.cat_of.get(b) for b in POOL[:3]]
    assert cats == ['PERSONAL', 'INVITADO', 'CONTRADICCION'], cats
    tipos = [(e['tipo'], e['categoria']) for e in club.eventos_api]
    assert ('LLEGADA', 'PERSONAL') in tipos and ('LLEGADA', 'INVITADO') in tipos and ('ESCALADO_RECEPCION', None) in tipos, tipos
    assert next(e for e in club.eventos_api if e['categoria'] == 'INVITADO')['anfitrion_id'] == 'andres'
    log = '\n'.join(club.log)
    assert 'registro SIMULADO: thomas' in log and 'la cedula es de otra persona' in log and 'Ya lo atienden en recepción' in log
    print('check robotB OK: personal, invitado (con anfitrion) y escalamiento pasan por registros, dialogo, decision y eventos')


def check_lugares():
    """Socios que van a la piscina y a la cancha (por fuera) y al gimnasio y al spa (ascensor al 2.o piso)."""
    sys.stdout.reconfigure(encoding='utf-8')
    os.environ['CERBERUS_LLM'] = 'no'
    club = Club()
    casos = [('piscina', 'REGULAR', 'valentina', ['voy a nadar a la piscina']),     # socios: les indica, van solos
             ('tenis', 'REGULAR', 'mateo', ['vengo a jugar tenis']),
             ('gimnasio', 'VIP', 'sofia', ['no, hoy no', 'al gimnasio']),            # VIP: los acompana en ascensor
             ('spa', 'VIP', 'ricardo', ['no', 'voy al spa'])]
    cuerpos, robot = [], []
    t0 = time.perf_counter()

    def guion():
        yield from club.reconocer()
        for lugar, cat, pid, dice in casos:
            c = {'categoria': cat, 'persona_id': pid, 'confianza': 0.95, 'respuestas': dice}
            cuerpos.append(club.encolar(c))
            c['body'] = cuerpos[-1]
            yield from club.atender(c)
            robot.append((club.piso, club.home_checks[-1][1]))
        while club.fondo:                                      # los socios que van solos terminan de llegar
            yield
    for _ in guion():
        club.tick()
    llegadas = []
    for (lugar, *_), body, (piso, home) in zip(casos, cuerpos, robot):
        z = club.d.mocap_pos[cw.mocap_id(club.m, body)][2]
        llegadas.append((lugar, float(np.linalg.norm(club.person_pos(body) - cw.LUGARES[lugar]['sitio'])), z, piso, home))
    print('\n'.join(club.log))
    for lugar, d, z, piso, home in llegadas:
        print(f'{lugar:9s} visitante a {d:.2f} m de su sitio (z {z:.1f} m) | robot de vuelta en HOME, piso {piso + 1}, error {home:.2f} m')
        assert d < 0.3 and abs(z - (cw.PISO2_Z if cw.LUGARES[lugar]['piso'] else 0.0)) < 0.05, (lugar, d, z)
        assert piso == 0 and home < 0.3, (lugar, piso, home)
    for k, s in club.slams.items():
        e = np.array(s.errores)
        print(f'SLAM piso {k + 1}: {len(e)} escaneos, error medio {100 * e[:, 0].mean():.0f} cm, max {100 * e[:, 0].max():.0f} cm')
        assert e[:, 0].max() < 0.5, f'el SLAM del piso {k + 1} se perdio'
    assert club.max_z > cw.PISO2_Z - 0.01, 'no subio en el ascensor'
    log = '\n'.join(club.log)
    assert log.count('ascensor: llego al segundo piso') == 2 and log.count('ascensor: llego al primer piso') == 2
    print(f'sim {club.d.time:.0f}s en {time.perf_counter() - t0:.0f}s reales')
    assert log.count('sigue solo') == 2, 'a los socios les indica y siguen solos'
    print('check lugares OK: a los socios les indica (piscina y tenis, van solos); a los VIP los acompana en ascensor '
          '(gimnasio y spa); vuelve a HOME cada vez')


class Visor:
    """La ventana de MuJoCo: textos, percepcion y camara que sigue la accion (si la mueves, te la deja 15 s)."""
    GENERAL = ([12.0, 5.0, 0], 40.0, -50.0, 90.0)       # todo el club: piscina, tenis y segundo piso

    def __init__(self, v, seguir=True, textos=True):
        self.v, self.seguir, self.textos = v, seguir, textos
        v.opt.label = mujoco.mjtLabel.mjLABEL_SITE
        v.opt.geomgroup[cw.VISTO] = 1            # paredes, puertas, personas y muebles (lo que ve el lidar)
        self.general()
        self.puesta, self.libre_hasta, self.t = None, 0.0, time.perf_counter()

    def piso2(self, ver):
        self.v.opt.geomgroup[cw.PISO2] = int(ver)

    def general(self):
        c = self.v.cam
        c.lookat[:], (c.distance, c.elevation, c.azimuth) = self.GENERAL[0], self.GENERAL[1:]

    def pintar(self, club):
        v = self.v
        textos = club.hud_texts()
        if not self.textos:                      # en --control: solo subtitulos; titulo y caso estan en el tablero web
            textos = [t for t in textos if t[1] == mujoco.mjtGridPos.mjGRID_BOTTOM]
        v.set_texts(textos)
        with v.lock():
            dibujar_percepcion(v.user_scn, club)
            pose = np.array((float(v.cam.distance), float(v.cam.azimuth), float(v.cam.elevation), *v.cam.lookat))
            if self.puesta is not None and np.abs(pose - self.puesta).max() > 1e-3:
                self.libre_hasta = time.perf_counter() + 15.0       # la movio el usuario: no se la quita
            if self.seguir and time.perf_counter() > self.libre_hasta:
                director(club, v.cam, time.perf_counter() - self.t)
            self.t = time.perf_counter()
            self.puesta = np.array((float(v.cam.distance), float(v.cam.azimuth), float(v.cam.elevation), *v.cam.lookat))
        v.sync()


def dibujar_percepcion(scn, club):
    """En la vista 3D: impactos del lidar (puntos rojos) y la ruta planeada (verde)."""
    scn.ngeom = 0
    for q in club.slam.puntos[::2]:
        if scn.ngeom >= scn.maxgeom:
            return
        mujoco.mjv_initGeom(scn.geoms[scn.ngeom], mujoco.mjtGeom.mjGEOM_SPHERE, np.array([0.035, 0, 0]),
                            np.array([q[0], q[1], club.slam.lidar.z + P.ALTURA]), np.eye(3).ravel(), np.array([1, 0.15, 0.1, 1], np.float32))
        scn.ngeom += 1
    pts = [club.robot.pos] + [np.array(q) for q in club.ruta_actual]
    for a, b in zip(pts[:-1], pts[1:]):
        if scn.ngeom >= scn.maxgeom:
            return
        g = scn.geoms[scn.ngeom]
        mujoco.mjv_initGeom(g, mujoco.mjtGeom.mjGEOM_CAPSULE, np.zeros(3), np.zeros(3), np.eye(3).ravel(),
                            np.array([0.1, 0.85, 0.2, 0.8], np.float32))
        z = club.robot.z + 0.05
        mujoco.mjv_connector(g, mujoco.mjtGeom.mjGEOM_CAPSULE, 0.03, np.array([*a, z]), np.array([*b, z]))
        scn.ngeom += 1


COMMANDS = {'vip': 'VIP', 'regular': 'REGULAR', 'invitado': 'INVITADO', 'personal': 'PERSONAL', 'externo': 'EXTERNO'}


def read_commands(queue):
    """Hilo de la terminal: lee comandos del modo manual (las teclas del visor ya tienen otros usos).
    'vision CATEGORIA [persona_id] [confianza]' recibe a alguien como si lo mandara el modelo de vision."""
    print('Comandos: vip | regular | invitado | personal | externo | home | demo | salir | vision CAT [id] [conf]')
    while True:
        try:
            cmd = input('> ').strip().lower()
        except EOFError:
            return
        if cmd.startswith('vision '):
            cat, pid, conf = (cmd.split()[1:] + [None, '0.9'])[:3]
            queue.put(('vision', {'categoria': cat.upper(), 'persona_id': pid, 'confianza': float(conf), 'metodo': 'terminal'}))
        elif cmd in (*COMMANDS, 'home', 'demo', 'salir'):
            queue.put(cmd)
        else:
            print('comando no reconocido')


def escuchar_robotb(url, queue):
    """Hilo: cada segundo trae las decisiones nuevas de robotB y las encola como contrato de vision."""
    rb = RobotB(url)
    while True:
        try:
            for c in rb.decisiones():
                queue.put(('vision', c))
        except OSError as e:
            print(f'robotB no responde en {url}: {e}')
            time.sleep(4.0)
        time.sleep(1.0)


def main():
    if '--control' in sys.argv:                      # MuJoCo dibuja el club; el navegador es el tablero de control
        import control
        import mujoco.viewer
        api = None
        if '--api' in sys.argv:
            from api_cliente import ApiHttp
            api = ApiHttp(sys.argv[sys.argv.index('--api') + 1])
        club = Club(api, sombras='--sombras' in sys.argv)
        try:
            with mujoco.viewer.launch_passive(club.m, club.d, show_left_ui=False, show_right_ui=False) as v:
                return control.correr(club, Visor(v, textos=False), panel._tipo, api_real=api is not None,
                                      abrir='--sin-navegador' not in sys.argv)
        except KeyboardInterrupt:
            return
    if '--video' in sys.argv:
        vel = float(sys.argv[sys.argv.index('--speed') + 1]) if '--speed' in sys.argv else 2.0
        persona = sys.argv[sys.argv.index('--persona') + 1] if '--persona' in sys.argv else None
        escenario = sys.argv[sys.argv.index('--escenario') + 1] if '--escenario' in sys.argv else None
        return grabar(sys.argv[sys.argv.index('--video') + 1], vel, persona=persona, escenario=escenario)
    if '--check-api' in sys.argv:
        return check_api(sys.argv[sys.argv.index('--check-api') + 1])
    if '--check-robotb' in sys.argv:
        return check_robotb()
    if '--check-lugares' in sys.argv:
        return check_lugares()
    if '--check' in sys.argv:
        return check()
    sys.stdout.reconfigure(encoding='utf-8')
    speed = float(sys.argv[sys.argv.index('--speed') + 1]) if '--speed' in sys.argv else 2.0
    robotb = sys.argv[sys.argv.index('--robotb') + 1] if '--robotb' in sys.argv else None
    manual = '--manual' in sys.argv or robotb is not None
    import queue
    import threading
    import mujoco.viewer
    api = None
    if '--api' in sys.argv:                          # la API real del club en vez de la simulada
        from api_cliente import ApiHttp
        api = ApiHttp(sys.argv[sys.argv.index('--api') + 1])
    club = Club(api, sombras='--sombras' in sys.argv)
    if '--voz' in sys.argv:
        from voz import Hablante
        club.voz = Hablante()
    cmds = queue.Queue()
    if manual:
        threading.Thread(target=read_commands, args=(cmds,), daemon=True).start()
        if robotb:
            threading.Thread(target=escuchar_robotb, args=(robotb, cmds), daemon=True).start()
        club.hud['categoria'] = 'Manual: en HOME. Comandos: vip regular invitado personal externo home demo'
        task = club.reconocer()
    else:
        task = club.scenario()
    mapa = '--sin-mapa' not in sys.argv
    con_panel, t_panel = '--sin-panel' not in sys.argv, 0.0
    with mujoco.viewer.launch_passive(club.m, club.d) as v:
        visor = Visor(v, seguir='--camara-libre' not in sys.argv)
        start = time.perf_counter()
        pendientes = []                          # personas que mando la vision, en orden de llegada
        while v.is_running():
            while not cmds.empty():
                cmd = cmds.get()
                if isinstance(cmd, tuple):           # ('vision', contrato): se atiende cuando el robot quede libre
                    pendientes.append(cmd[1])
                    continue
                if cmd == 'salir':
                    return
                if cmd == 'home':          # interrumpe lo que este haciendo y vuelve
                    task = club.go_home()
                elif cmd == 'demo':
                    task = club.scenario()
                elif task is None:
                    task = club.go_to(COMMANDS[cmd])
                else:
                    print('el robot esta ocupado; usa "home" para interrumpir')
            if task is None and pendientes:
                task = club.atender(pendientes.pop(0))
            frame_end = time.perf_counter() + 1 / 30   # dibujar al menos ~30 fps aunque la fisica no alcance
            while club.d.time < (time.perf_counter() - start) * speed and time.perf_counter() < frame_end:
                if task is not None:
                    try:
                        next(task)
                    except StopIteration:
                        task = None
                club.tick()
            visor.pintar(club)
            if (mapa or con_panel) and time.perf_counter() > t_panel:      # ventanas: 5 veces por segundo basta
                import cv2
                t_panel = time.perf_counter() + 0.2
                if mapa:
                    cv2.imshow('Percepcion del robot (SLAM)', P.imagen(club.slam, club.ruta_actual,
                                                                       np.array([*club.robot.pos, club.robot.yaw])))
                if con_panel:
                    cv2.imshow('Panel de decision', panel.imagen(club.panel | {'decisiones': club.decisiones}))
                    cv2.imshow('Bitacora del robot', panel.bitacora(club.log))
                    cv2.imshow('Camaras del robot', club.seguidor.ventana())
                cv2.waitKey(1)


if __name__ == '__main__':
    main()
