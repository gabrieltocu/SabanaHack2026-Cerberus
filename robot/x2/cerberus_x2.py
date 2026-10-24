"""Cerberus en el AgiBot X2 real (ROS 2 Humble + aimdk_msgs). Corre en el PC host cableado al robot (10.0.1.2).

Camara de la cabeza (RGB-D, JPEG) -> YOLO-face + SFace (yolo_face.py) y pase QR en cualquier momento
(qr_lector.SesionCaraQR sobre la escalera de robotA: rostro -> reintento -> QR -> tercero -> recepcion) ->
categoria (padron + registros del dia, SIMULADOS) -> flujo de la categoria en el robot: voz, cara y LED.
No mueve al robot: el X2 camina y gesticula con su propio sistema (control remoto / su interaccion de fabrica).

Despliegue paso a paso: deploy/deploy.md (este archivo se copia al robot con deploy/desplegar.sh).

Uso:
  python3 x2/cerberus_x2.py --api http://127.0.0.1:8000 --escuchar   # RECOMENDADO: el X2 como cliente de la API
                                                 # (frames -> /api/identificar; lo que oye tras "Juan" -> /api/voz)
  python3 x2/cerberus_x2.py --api http://127.0.0.1:8000 --diagnostico   # checklist del turno, antes de la demo
  python3 x2/cerberus_x2.py                      # vision local en el host, sin API (teclas en la terminal + Enter: n s x r)
  python3 x2/cerberus_x2.py --probar VIP         # solo ejecuta un flujo (--probar todos: los 6)
  python3 x2/cerberus_x2.py --guardar-frames x2_ana/   # guarda 2 frames/s de la camara del X2 para enrolar
  python x2/cerberus_x2.py --camara 0 --api http://127.0.0.1:8000   # lo mismo que el robot, en un laptop (plan B)
  python x2/cerberus_x2.py --camara 0            # vision local en el laptop, sin API
  python3 x2/cerberus_x2.py --autotest           # pruebas de la logica sin ROS ni robot
Interfaces: https://x2-aimdk.agibot.com/en/latest/Interface/index.html
"""
import argparse
import json
import os
import re
import select
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VISION = Path(os.environ.get('CERBERUS_VISION', (ROOT.parent if (ROOT.parent / 'vision').is_dir() else ROOT.parent / 'robotA') / 'vision'))  # repo del equipo: robotB dentro de el, o al lado (../robotA)
sys.path.insert(0, str(VISION))
REGISTROS_HOY = ROOT / 'x2' / 'registros_hoy.json'
# Camaras de la cabeza: (topic, grados para enderezar la imagen). La de arriba (rgb_head_front_center, gran angular
# 2688x1944 a 30 fps) mira la sala a la altura de la cara; la RGB-D apunta hacia abajo y entrega la imagen al reves.
CAMARAS = {'arriba': ('/aima/hal/sensor/rgb_head_front_center/rgb_image/compressed', 0),
           'rgbd': ('/aima/hal/sensor/rgbd_head_front/rgb_image/compressed', 180)}
TOPIC = CAMARAS['arriba'][0]
COOLDOWN = 8.0          # s tras un flujo antes de atender a la siguiente persona
Y = {'es': 'y', 'en': 'and', 'pt': 'e', 'zh': '和'}
HOLA = {'es': '¡Hola, {n}! ¿En qué le puedo ayudar?', 'en': 'Hello, {n}! How can I help you?',
        'zh': '{n}，你好！有什么可以帮您？', 'pt': 'Olá, {n}! Como posso ajudar?'}
NO_REPETIR = 60.0       # s: ni la misma frase ni el saludo a alguien sin nombre se repiten antes de esto
RECUERDA_S = 900.0      # s: a quien conoce no lo vuelve a saludar mientras siga enfrente o hablando, ni 15 min despues
CHARLANDO_S = 30.0      # s tras la ultima frase de la persona: una cara mal vista no dispara pistas ni pide documento
CHARLA_S = 10.0         # s tras hablar el robot en que se le puede contestar sin decir "Juan"

# Caras (PlayEmoji id) y LED (SetPmuLed) de la doc oficial de AimDK. El unico movimiento nuestro es el saludo con la mano
# (SetMcPresetMotion, solo brazo; caminar sigue siendo del robot). Se apaga con --sin-gestos.
SALUDO = (1002, 2)      # (motion, area) de la tabla oficial de movimientos predefinidos: saludar con la mano derecha
# Gestos (SetMcPresetMotion: pares motion/area de la tabla oficial de AimDK v1.1.0, todos probados en este X2; el saludo
# militar 1013 lo rechaza). La mano no tiene dedos: nada de gestos de la mano diestra. Area 11 = cuerpo entero.
GESTOS = {'ola': (1002, 2), 'mano': (1003, 2), 'izquierda': (1001, 1), 'derecha': (1001, 2), 'pecho': (1011, 2),
          'reverencia': (3001, 11), 'adios': (3031, 11), 'celebrar': (3011, 11), 'aplaudir': (3017, 11),
          'corazon': (1007, 3), 'rascar': (3024, 11), 'cinco': (1008, 2), 'suave': (3007, 11)}
GESTO_S = 5.5           # s entre gestos de una secuencia: el MC rechaza uno nuevo mientras otro esta en curso
LADO = {'VIP': 'izquierda', 'INVITADO': 'izquierda', 'REGULAR': 'derecha', 'PERSONAL': 'derecha', 'EXTERNO': 'derecha'}
ENTRADA = {'VIP': ['reverencia', 'mano'], 'REGULAR': ['ola', 'mano'], 'INVITADO': ['pecho', 'mano'],   # + senalar el lado
           'PERSONAL': ['cinco', 'mano'], 'EXTERNO': ['ola', 'mano'], 'ESCALAMIENTO': ['suave', 'mano']}  # de su destino
GESTO_VOZ = {'quien': ['pecho'], 'repetir': ['rascar'], 'saludo': ['ola', 'mano'], 'llamado': ['pecho'], 'gracias': ['reverencia'], 'invitado': ['mano'],
             'trabajo': ['mano'], 'tenis_si': ['celebrar'], 'chiste': ['pecho', 'aplaudir'], 'curioso': ['pecho']}
# El resto segun las palabras (sin tildes, 4 idiomas): primero la direccion que da la respuesta, luego el tono de lo que
# dijo la persona y, si no, el de la respuesta. Sin coincidencia, ningun gesto (nada al azar).
DIRECCION = [('izquierda', re.compile(r'izquierda|(?:your|the|turn) left|left side|esquerda|左')),
             ('derecha', re.compile(r'derecha|(?:your|the|turn) right|right side|direita|右'))]
TONO = [('cinco', re.compile(r'choca|dame cinco|high five|bate aqui|bien hecho|well done|mandou bem|击掌')),
        ('mano', re.compile(r'mucho gusto|encantad|nice to meet|pleased to meet|muito prazer|prazer em|很高兴认识|幸会')),
        ('corazon', re.compile(r'me encanta|te quiero|\bamor\b|hermos|precios|\blove\b|lovely|beautiful|\bamo\b|adoro|lind[oa]|爱|喜欢|漂亮')),
        ('celebrar', re.compile(r'felicidades|felicitaciones|cumpleanos|ganamos|gane\b|campeon|congrat|birthday|\bwon\b|\bwin\b|'
                                r'champion|parabens|aniversario|ganhamos|恭喜|生日|赢')),
        ('aplaudir', re.compile(r'bravo|aplau|applause|genial|excelente|increible|maravill|fantastic|amazing|awesome|wonderful|'
                                r'great|incrivel|otimo|鼓掌|太棒|厉害|精彩')),
        ('rascar', re.compile(r'\bno se\b|no lo se|ni idea|buena pregunta|i don.?t know|no idea|good question|nao sei|'
                              r'boa pergunta|不知道|好问题')),
        ('suave', re.compile(r'tranquil|calma|no se preocupe|relax|don.?t worry|no worries|nao se preocupe|calm|别担心|放心')),
        ('reverencia', re.compile(r'gracias|a sus ordenes|thank|at your service|obrigad|as ordens|谢谢|感谢')),
        ('pecho', re.compile(r'\bsoy juan\b|\bi am juan\b|\bi.?m juan\b|sou o juan|我是胡安')),
        ('ola', re.compile(r'\bhola\b|buenos dias|buenas|\bhello\b|\bhi\b|good (?:morning|afternoon|evening)|\bola\b|bom dia|'
                           r'boa tarde|你好|您好|早上好'))]


def _llano(frase):
    return ''.join(c for c in unicodedata.normalize('NFKD', (frase or '').lower()) if not unicodedata.combining(c))


def gestos_de(intent, texto, respuesta):
    """Gestos para lo que se dijo: fijos por intencion; si no, por las palabras (ver DIRECCION y TONO)."""
    if intent in GESTO_VOZ:
        return GESTO_VOZ[intent]
    texto, respuesta = _llano(texto), _llano(respuesta)
    for frase, senas in ((respuesta, DIRECCION), (texto, TONO), (respuesta, TONO)):
        for nombre, patron in senas:
            if patron.search(frase):
                return [nombre]
    return []
CARA_VOZ = {'repetir': 130, 'chiste': 100, 'curioso': 90, 'gracias': 200, 'saludo': 90, 'tenis_si': 101}
# LED del pecho segun lo que hace (pedido del equipo): azul oye, verde habla, amarillo se mueve; quieto, blanco que respira
LUZ = {'mueve': ((255, 190, 0), 0), 'habla': ((0, 255, 0), 0), 'oye': ((0, 90, 255), 0), 'quieto': ((255, 255, 255), 1)}
IDIOMA_S = 60.0         # s sin que nadie le hable para volver al idioma de base
PRESENTE_S = 4.0        # s: si hay una cara frente a la camara, conversa sin que le digan "Juan"
FLOWS = {
    'VIP': dict(led=(255, 200, 30), mode=1, emoji=200,
                say='Bienvenido de nuevo, {nombre}. Ya avise al concierge; lo acompano a su reserva.'),
    'REGULAR': dict(led=(50, 110, 255), mode=0, emoji=90,
                    say='Hola {nombre}, bienvenido. Siga al salon principal, primera puerta a la derecha.'),
    'INVITADO': dict(led=(50, 230, 80), mode=1, emoji=100,
                     say='Hola {nombre}, bienvenido a N Club. {anfitrion} lo espera en la sala de anfitriones; '
                         'ya le avise que llego. Como invitado puede usar el lounge y el restaurante.'),
    'PERSONAL': dict(led=(255, 255, 255), mode=0, emoji=10,
                     say='Buenos dias {nombre}. Turno marcado. Acceso de empleados a su izquierda.'),
    'EXTERNO': dict(led=(255, 115, 0), mode=2, emoji=160,
                    say='Hola {nombre}. Orden {ot} confirmada. Use casco y chaleco; ya avise a su supervisor. '
                        'La entrada de servicio esta a la derecha.'),
    'ESCALAMIENTO': dict(led=(255, 40, 40), mode=1, emoji=170,
                         say='Un momento por favor, ya viene alguien de recepcion a atenderlo.'),
}


def load_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8')) if Path(path).exists() else {}


def with_personas(socios, hoy, personas):
    """Suma los roles de la pagina de captura (datos/personas.json: {id: {nombre, rol}}) al padron y a los
    registros del dia, con la misma forma que esperan categorize. Los archivos simulados de robotA siguen valiendo."""
    socios, hoy = dict(socios), {k: dict(hoy.get(k, {})) for k in ('invitados', 'personal', 'externos')}
    key = {'INVITADO': 'invitados', 'PERSONAL': 'personal', 'EXTERNO': 'externos'}
    for pid, p in personas.items():
        if p.get('rol') in ('VIP', 'REGULAR'):
            socios[pid] = {'nombre': p['nombre'], 'nivel': p['rol']}
        elif p.get('rol') in key:
            hoy[key[p['rol']]].setdefault(pid, {'anfitrion': p['anfitrion']} if p.get('anfitrion') else {})
    return socios, hoy


def categorize(result, socios, hoy):
    """Resultado de Session -> (categoria, datos para el guion). SIMULADO: padron + registros del dia.
    Regla: verificado pero sin registro que lo respalde, o pase que contradice el registro -> ESCALAMIENTO."""
    if result['resultado'] != 'verificado':
        return 'ESCALAMIENTO', {}
    pid, nombre = result['persona_id'], (result['nombre'] or '').split(' ')[0]
    pase = result.get('pase')
    if pid in socios and pase in (None, 'socio'):
        return socios[pid]['nivel'], dict(nombre=nombre)
    for cat, key, tipo in (('INVITADO', 'invitados', 'invitado'), ('PERSONAL', 'personal', 'personal'),
                           ('EXTERNO', 'externos', 'externo')):
        if pid in hoy.get(key, {}) and pase in (None, tipo):
            return cat, dict(nombre=nombre, **hoy[key][pid])
    return 'ESCALAMIENTO', {}


ESPEAK = {'es': 'es-419', 'en': 'en-us', 'zh': 'cmn', 'pt': 'pt-br'}
MAC_VOICE = {'es': 'Paulina', 'en': 'Samantha', 'zh': 'Tingting', 'pt': 'Luciana'}


def voice_pcm_mac(text, lang='es'):
    """macOS sin espeak-ng: la voz del sistema (`say`, que esta en todos los Mac) a PCM S16LE 16 kHz mono, el formato
    que pide el X2. Las voces de macOS suenan bastante mejor que espeak-ng (work.md §8). Si el formato no sale
    exacto, devuelve None: mejor que el X2 use su TTS nativo que mandarle ruido. SIN PROBAR en un Mac todavia."""
    import tempfile
    import wave
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav') as f:
            if subprocess.run(['say', '-v', MAC_VOICE.get(lang, 'Paulina'), '--data-format=LEI16@16000',
                               '--file-format=WAVE', '-o', f.name, text]).returncode != 0:
                return None
            with wave.open(f.name, 'rb') as w:
                if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (1, 2, 16000):
                    return None
                return w.readframes(w.getnframes())
    except (OSError, wave.Error):
        return None


def voice_pcm(text, lang='es'):
    """Texto -> PCM S16LE 16 kHz mono (lo que pide /aima/hal/audio/playback), en el idioma del visitante. El TTS nativo
    del X2 solo habla chino e ingles. Requiere espeak-ng y ffmpeg en el host (apt install espeak-ng ffmpeg; en macOS
    `brew install espeak-ng ffmpeg`, o sin brew se usa la voz del sistema con `say`)."""
    if not (shutil.which('espeak-ng') and shutil.which('ffmpeg')):
        if sys.platform == 'darwin' and shutil.which('say'):
            return voice_pcm_mac(text, lang)
        return None
    wav = subprocess.run(['espeak-ng', '-v', ESPEAK.get(lang, 'es-419'), '-s', '150', '--stdout', text],
                         capture_output=True, check=True).stdout
    return subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '16000',
                           'pipe:1'], input=wav, capture_output=True, check=True).stdout


def pcm_desde_api(post):
    """PCM generado por el cerebro (GET /api/tts): el host del robot no necesita espeak-ng ni ffmpeg."""
    def pcm(text, lang='es'):
        return post(f'/api/tts?lang={lang}', text.encode('utf-8'), 'text/plain; charset=utf-8', raw=True)
    return pcm


GESTO_FUENTE = ('node.cerberus', 40, 1000)   # input source del MC (nombre, prioridad, timeout ms), como el ejemplo oficial
PKG = 'cerberus'        # pkg_name del audio: siempre el mismo (con otro, hal_audio bota la cola y corta la frase)
FOCUS_PRIO = 8          # 1-10; por encima de la interaccion de fabrica, por debajo de las alertas de seguridad


class X2:
    """Acciones en el robot. Todas las llamadas son asincronas: el LED tarda ~5 s en responder (doc oficial)."""

    def __init__(self, node, voz, pcm=voice_pcm, volumen=None, gestos=True):
        from aimdk_msgs.msg import AudioPlayback, FocusResponse
        from aimdk_msgs.srv import PlayEmoji, PlayTts, RequestAudioFocus, SetPmuLed, SetVolume
        from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
        self.node, self.voz, self.pcm, self.focus_ok = node, voz, pcm, False
        self.callado_hasta = 0.0          # hasta cuando habla el robot: mientras tanto el microfono no escucha
        c = node.create_client
        self.tts = c(PlayTts, '/aimdk_5Fmsgs/srv/PlayTts')
        self.emoji = c(PlayEmoji, '/aimdk_5Fmsgs/srv/PlayEmoji')
        from aimdk_msgs.srv import PlayEmojiGroup
        self.emoji_grupo = c(PlayEmojiGroup, '/aimdk_5Fmsgs/srv/PlayEmojiGroup')
        self.cara_t, self.led_quiero, self.led_fut = 0.0, None, None
        self.led = c(SetPmuLed, '/aimdk_5Fmsgs/srv/SetPmuLed')
        self.focus = c(RequestAudioFocus, '/aimdk_5Fmsgs/srv/RequestAudioFocus')
        self.vol = c(SetVolume, '/aimdk_5Fmsgs/srv/SetVolume')
        self.audio = node.create_publisher(AudioPlayback, '/aima/hal/audio/playback', 10)
        self.preset = None
        if gestos:
            from aimdk_msgs.srv import SetMcPresetMotion
            self.preset = c(SetMcPresetMotion, '/aimdk_5Fmsgs/srv/SetMcPresetMotion')
            from aimdk_msgs.srv import GetMcPresetMotionState
            self.preset_estado = c(GetMcPresetMotionState, '/aimdk_5Fmsgs/srv/GetMcPresetMotionState')
            self.gestos_ok = self.register_input_source()
        # el foco se concede (o se pierde) por este topic, no por la respuesta del servicio
        node.create_subscription(FocusResponse, '/aima/hal/audio/focus_response', self._on_focus,
                                 QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE,
                                            durability=DurabilityPolicy.TRANSIENT_LOCAL))
        for cli in (self.tts, self.emoji, self.led):
            if not cli.wait_for_service(timeout_sec=5.0):
                node.get_logger().warn(f'servicio no disponible: {cli.srv_name}')
        if voz == 'tts':
            threading.Thread(target=self.vigila_dns, daemon=True).start()
        if volumen is not None:
            self.set_volume(volumen)
        self.take_focus(espera=2.0)         # el topic de playback no pide foco por su cuenta (doc oficial)

    def register_input_source(self):
        """Desde v0.7 el MC solo acepta ordenes de una fuente registrada: ADD, y si ya existia, ENABLE (ejemplo oficial
        preset_motion_client). Se hace una vez al arrancar, antes de spin; con reintentos cortos como la doc."""
        import rclpy
        from aimdk_msgs.msg import McInputAction
        from aimdk_msgs.srv import SetMcInputSource
        cli = self.node.create_client(SetMcInputSource, '/aimdk_5Fmsgs/srv/SetMcInputSource')
        if not cli.wait_for_service(timeout_sec=5.0):
            self.node.get_logger().warn('sin SetMcInputSource: el robot no saludara con la mano')
            return False
        for accion in (McInputAction.INPUTACTION_ADD, McInputAction.INPUTACTION_ENABLE):
            req = SetMcInputSource.Request()
            req.action.value = accion
            req.input_source.name, req.input_source.priority, req.input_source.timeout = GESTO_FUENTE
            for _ in range(8):
                req.request.header.stamp = self.node.get_clock().now().to_msg()
                fut = cli.call_async(req)
                rclpy.spin_until_future_complete(self.node, fut, timeout_sec=0.25)
                if fut.done():
                    break
            if fut.done() and fut.result() and fut.result().response.header.code == 0:
                self.node.get_logger().info('fuente de movimiento registrada: el robot puede saludar con la mano')
                return True
        self.node.get_logger().warn('no se pudo registrar la fuente de movimiento: sin saludo con la mano')
        return False

    def gesto_libre(self, espera=12.0):
        """Espera (en un hilo que no es el de ROS) a que termine el gesto en curso: GetMcPresetMotionState dice RUNNING
        (400) mientras se ejecuta. Asi el siguiente de la secuencia no llega antes y el MC no lo rechaza (codigo 1)."""
        from aimdk_msgs.srv import GetMcPresetMotionState
        fin = time.time() + espera
        while time.time() < fin:
            fut = self.preset_estado.call_async(GetMcPresetMotionState.Request())
            while not fut.done() and time.time() < fin:
                time.sleep(0.05)
            r = fut.result() if fut.done() else None
            if not r or r.response.state.value != 400:
                return
            time.sleep(0.3)

    def gesture(self, motion, area, interrupt=False):
        """Movimiento predefinido (SetMcPresetMotion). Exige el robot en Stable Stand (modo SD); si no lo esta, el MC lo
        rechaza y solo queda en el log. interrupt=False: si ya hay un gesto en curso, este se descarta."""
        if not (self.preset and self.gestos_ok):
            return
        from aimdk_msgs.msg import RequestHeader
        from aimdk_msgs.srv import SetMcPresetMotion
        req = SetMcPresetMotion.Request()
        req.header = RequestHeader()
        req.header.stamp = self.node.get_clock().now().to_msg()
        req.input_source.name, req.input_source.priority, req.input_source.timeout = GESTO_FUENTE
        req.motion.value, req.area.value, req.interrupt = motion, area, interrupt
        self.preset.call_async(req).add_done_callback(
            lambda fut: self.node.get_logger().info(f'gesto {motion}: codigo {fut.result().response.header.code if fut.result() else "sin respuesta"}'))

    def _log(self, what):
        return lambda fut: self.node.get_logger().info(f'{what}: {fut.result()}')

    def _on_focus(self, msg):
        if msg.pkg_name == PKG:
            self.focus_ok = msg.focus_gain

    def set_volume(self, nivel):
        """Volumen del robot (0-100). Un X2 en silencio es la forma mas tonta de perder la demo."""
        from aimdk_msgs.srv import SetVolume
        req = SetVolume.Request()
        req.audio_volume = max(0, min(100, int(nivel)))
        if self.vol.wait_for_service(timeout_sec=2.0):
            self.vol.call_async(req).add_done_callback(self._log('volumen'))
        else:
            self.node.get_logger().warn('servicio no disponible: SetVolume')

    def take_focus(self, espera=0.0):
        """Foco de audio para publicar PCM: se pide una vez y se conserva. Con espera>0 (solo en el arranque, antes
        de spin) confirma si lo concedieron; sin espera es fire-and-forget (el foco llega por focus_response)."""
        from aimdk_msgs.srv import RequestAudioFocus
        if not self.focus.wait_for_service(timeout_sec=espera or 0.1):
            return self.node.get_logger().warn('sin RequestAudioFocus: el audio PCM puede no sonar')
        req = RequestAudioFocus.Request()
        req.focus_requester.pkg_name, req.focus_requester.priority = PKG, FOCUS_PRIO
        fut = self.focus.call_async(req)
        if not espera:
            return
        import rclpy
        rclpy.spin_until_future_complete(self.node, fut, timeout_sec=espera)
        r = fut.result()
        self.focus_ok = bool(r and r.focus_response.focus_gain)
        self.node.get_logger().info(f'foco de audio: {"concedido" if self.focus_ok else "NO concedido"}')

    def release(self):
        """Devuelve el foco al salir, para que el robot recupere su voz de fabrica."""
        from aimdk_msgs.srv import AbandonAudioFocus
        cli = self.node.create_client(AbandonAudioFocus, '/aimdk_5Fmsgs/srv/AbandonAudioFocus')
        if not cli.wait_for_service(timeout_sec=1.0):
            return
        req = AbandonAudioFocus.Request()
        req.focus_requester.pkg_name, req.focus_requester.priority = PKG, FOCUS_PRIO   # debe coincidir con la peticion
        cli.call_async(req)

    def say(self, text, lang='es', reintento=False):
        """voz='tts': la voz de fabrica del X2 (PlayTts, en la nube de AgiBot: habla espanol si el robot resuelve DNS;
        'offline_cache_miss' = sin internet/DNS en el robot). SYSTEM_L7: el interaction_slave del robot habla en L6
        y no la corta (doc 5.2.1). voz='pcm': la voz del cerebro por el parlante del robot."""
        if not text:
            return
        self.callado_hasta = time.time() + 0.075 * len(text) + 1.0  # estimado (la doc: estimated_duration siempre 0)
        if self.voz != 'tts':
            return self.say_pcm(text, lang)
        from aimdk_msgs.msg import TtsPriorityLevel
        from aimdk_msgs.srv import PlayTts
        req = PlayTts.Request()
        req.tts_req.text, req.tts_req.domain, req.tts_req.is_interrupted = text, PKG, True
        req.tts_req.priority_weight = 0
        req.tts_req.priority_level.value = TtsPriorityLevel.SYSTEM_L7

        def hecho(fut):
            r = fut.result()
            if r and r.tts_resp.is_success:
                return self.node.get_logger().info(f'voz del robot: {text}')
            self.callado_hasta = 0.0
            motivo = r.tts_resp.error_message if r else 'sin respuesta'
            if motivo == 'offline_cache_miss' and not reintento:
                self.arregla_dns()                          # y se dice la misma frase otra vez, ya con DNS
                return threading.Timer(3.0, self.say, args=(text, lang, True)).start()
            self.node.get_logger().error(f'la voz del robot no dijo "{text[:60]}" ({motivo}). offline_cache_miss = el '
                                         'robot no resuelve DNS: sudo systemctl restart agibot_gateway_dnsmasq')
        self.tts.call_async(req).add_done_callback(hecho)

    def arregla_dns(self):
        """Otra PC del robot (10.0.1.40) inunda el dnsmasq del gateway con la misma consulta repetida y lo traba;
        sin DNS la voz de fabrica dice 'offline_cache_miss'. Reiniciarlo lo destraba (el usuario run tiene sudo sin clave)."""
        r = subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'agibot_gateway_dnsmasq'], capture_output=True, text=True)
        self.node.get_logger().warn(f'DNS del robot trabado: dnsmasq reiniciado ({"ok" if r.returncode == 0 else r.stderr.strip()[:80]})')

    def vigila_dns(self):
        while True:
            time.sleep(5)                                   # la inundacion lo vuelve a trabar en segundos
            try:
                ok = subprocess.run(['getent', 'hosts', 'agibot.com'], capture_output=True, timeout=4).returncode == 0
            except subprocess.TimeoutExpired:
                ok = False
            self.dns_ok = ok
            if not ok:
                self.arregla_dns()

    def stop_voice(self):
        """Corta lo que esta diciendo (StopAudioPlay vacia la cola de reproduccion)."""
        from aimdk_msgs.srv import StopAudioPlay
        cli = self.node.create_client(StopAudioPlay, '/aimdk_5Fmsgs/srv/StopAudioPlay')
        if cli.wait_for_service(timeout_sec=1.0):
            cli.call_async(StopAudioPlay.Request())
        self.callado_hasta = 0.0

    def say_pcm(self, text, lang='es'):
        pcm = self.pcm(text, lang)
        if not pcm:
            return self.node.get_logger().warn(f'sin voz para: {text[:60]}')
        self.callado_hasta = time.time() + len(pcm) / 32000 + 0.5     # 16 kHz, 2 bytes por muestra
        from aimdk_msgs.msg import AudioPlayback
        if not self.focus_ok:
            self.take_focus()                           # sin bloquear: el resultado llega por focus_response
        msg = AudioPlayback()
        msg.pkg_name, msg.token_id = PKG, str(time.time())   # token nuevo = corta lo que estaba sonando
        msg.info.channels, msg.info.sample_rate = 1, 16000
        msg.data.data = pcm
        self.audio.publish(msg)

    def face(self, emotion_id):
        from aimdk_msgs.srv import PlayEmoji
        req = PlayEmoji.Request()
        req.emotion_id, req.mode, req.priority = emotion_id, 1, 20     # > 10 para que el sistema no la pise
        self.emoji.call_async(req)
        self.cara_t = time.time()

    def ojos(self):
        """Ojos tiernos que se mueven (emoji 30-33 'Calm - cute', en bucle) hasta la proxima expresion."""
        from aimdk_msgs.srv import PlayEmojiGroup
        req = PlayEmojiGroup.Request()
        req.emotion_ids, req.mode, req.priority = [30, 31, 32, 33], 2, 20
        self.emoji_grupo.call_async(req)
        self.cara_t = float('inf')

    def light(self, rgb, mode):
        """El LED tarda ~5 s por llamada (doc): sin cola, solo se manda el ultimo color pedido al terminar la anterior."""
        self.led_quiero = (tuple(rgb), mode)
        if self.led_fut is None or self.led_fut.done():
            self._led_envia()

    def _led_envia(self):
        from aimdk_msgs.srv import SetPmuLed
        rgb, mode = self.led_quiero
        req = SetPmuLed.Request()
        req.led_strip_mode, (req.r, req.g, req.b), req.priority = mode, rgb, 10
        req.trace_id = 'cerberus'
        self.led_fut = self.led.call_async(req)
        self.led_fut.add_done_callback(lambda _: self.led_quiero != (rgb, mode) and self._led_envia())

    def run_flow(self, cat, data):
        f = FLOWS[cat]
        text = f['say'].format_map({'nombre': '', 'anfitrion': 'su anfitrion', 'ot': '', **data})
        self.node.get_logger().info(f'FLUJO {cat}: {text}')
        self.light(f['led'], f['mode'])
        self.face(f['emoji'])
        self.say(text)
        if cat != 'ESCALAMIENTO':
            self.gesture(*SALUDO)


def elige_tts(a, post):
    """De donde sale el PCM del espanol: espeak-ng en el host, o el cerebro (/api/tts) si el host no lo tiene.
    'auto' = local si estan espeak-ng y ffmpeg; si no, la API. Asi el host del robot no necesita instalar nada."""
    local = bool(shutil.which('espeak-ng') and shutil.which('ffmpeg'))
    modo = a.tts if a.tts != 'auto' else ('local' if local else 'api')
    if modo == 'api' and not post:
        print('! --tts api necesita --api; se usa el TTS nativo del X2 (solo ingles y chino)', flush=True)
        return lambda text, lang='es': None
    if modo == 'local' and not local:
        print('! faltan espeak-ng y/o ffmpeg en el host: sudo apt install espeak-ng ffmpeg', flush=True)
    return pcm_desde_api(post) if modo == 'api' else voice_pcm


def diagnostico(node, robot, post):
    """Checklist del turno de robot, sin tocar la demo: camara, servicios, voz, cara, LED y escucha.
    Imprime una linea por prueba (deploy/deploy.md seccion 6)."""
    import rclpy
    from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
    from sensor_msgs.msg import CompressedImage
    ok = lambda b: '\033[32mOK\033[0m' if b else '\033[31mFALLA\033[0m'
    linea = lambda n, b, extra='': print(f'  [{ok(b)}] {n}{" — " + extra if extra else ""}', flush=True)
    girar = lambda s: [rclpy.spin_once(node, timeout_sec=0.05) for _ in range(int(s / 0.05))]

    print('\nDiagnostico del X2 (Cerberus)\n')
    if post is not None:                                # el cerebro: /api/tts prueba la red y la voz en espanol de una
        audio = post('/api/tts?lang=es', 'Cerberus listo'.encode('utf-8'), 'text/plain; charset=utf-8', raw=True)
        linea('cerebro (API) alcanzable', bool(audio), f'/api/tts devuelve {len(audio or b"") / 1024:.0f} KB de PCM')

    frames = []
    qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT, history=HistoryPolicy.KEEP_LAST, depth=1)
    node.create_subscription(CompressedImage, TOPIC, lambda m: frames.append(len(m.data)), qos)
    girar(3.0)
    linea('camara de la cabeza', len(frames) > 10, f'{len(frames) / 3:.0f} fps, {(frames or [0])[-1] / 1024:.0f} KB/frame')

    for nombre, cli in (('PlayTts', robot.tts), ('PlayEmoji', robot.emoji), ('SetPmuLed', robot.led),
                        ('RequestAudioFocus', robot.focus), ('SetVolume', robot.vol)):
        linea(f'servicio {nombre}', cli.service_is_ready())
    if robot.preset:
        linea('servicio SetMcPresetMotion (saludo con la mano)', robot.preset.service_is_ready() and robot.gestos_ok,
              'el robot debe estar en Stable Stand (set_mc_action SD) para saludar')
    linea('foco de audio concedido', robot.focus_ok, 'sin foco el PCM no suena')

    from aimdk_msgs.msg import ProcessedAudioOutput
    oidos = []
    node.create_subscription(ProcessedAudioOutput, '/agent/process_audio_output', lambda m: oidos.append(m),
                             QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT, depth=200,
                                        durability=DurabilityPolicy.TRANSIENT_LOCAL, history=HistoryPolicy.KEEP_LAST))
    print('\n  Diga "Juan" y luego una frase (10 s)...', flush=True)
    girar(10.0)
    linea('escucha (modo only_voice)', bool(oidos),
          f'{len(oidos)} mensajes' if oidos else 'ponga el modo: python3 deploy/modo_agente.py only_voice')

    print('\n  Flujo VIP de prueba (voz, cara, LED y saludo con la mano)...', flush=True)
    robot.run_flow('VIP', dict(nombre='Ana'))
    girar(8.0)
    print('\n  Si se oyo la frase, la cara cambio, el LED se puso dorado y saludo con la mano, el turno esta listo.\n', flush=True)


def ros_main(a):
    import rclpy                                        # con --api el robot solo necesita rclpy y aimdk_msgs:
    from rclpy.qos import HistoryPolicy, QoSProfile, ReliabilityPolicy   # cv2, torch y Whisper corren en el cerebro
    from sensor_msgs.msg import CompressedImage

    rclpy.init()
    node = rclpy.create_node('cerberus_x2')
    post = http_post(a.api) if a.api else None
    robot = X2(node, a.voz, pcm=elige_tts(a, post), volumen=a.volumen, gestos=not a.sin_gestos)
    if a.diagnostico:
        try:
            return diagnostico(node, robot, post)
        finally:
            robot.release()
            rclpy.shutdown()
    if a.probar:
        cats = list(FLOWS) if a.probar == 'todos' else [a.probar]
        for cat in cats:
            robot.run_flow(cat, dict(nombre='Ana', anfitrion='Andres', ot='OT-1042'))
            end = time.time() + (8 if len(cats) > 1 else 12)   # el LED tarda ~5 s: hay que dejarlo verse
            while time.time() < end:
                rclpy.spin_once(node, timeout_sec=0.1)
        robot.release()
        return rclpy.shutdown()

    latest = {}
    qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT, history=HistoryPolicy.KEEP_LAST, depth=1)
    topic, grados = CAMARAS[a.camara_x2]
    node.create_subscription(CompressedImage, topic, lambda m: latest.update(msg=m), qos)

    if a.guardar_frames:
        out = Path(a.guardar_frames)
        out.mkdir(parents=True, exist_ok=True)

        def save():
            if 'msg' in latest:
                (out / f'{time.time():.2f}.jpg').write_bytes(bytes(latest.pop('msg').data))
        node.create_timer(0.5, save)
        node.get_logger().info(f'guardando 2 frames/s en {out}; luego: captura/capturar.py importar ... {out}')
        rclpy.spin(node)
        return

    if a.api:
        brain = ApiBrain(robot, post, 'x2', a.idioma, grados, a.min_cara, lidar(node, a.lidar_max))

        def frames():
            # en su propio hilo: el POST a la API ya no frena al executor de ROS (voz, LED, audio) y siempre se manda
            # el frame mas nuevo; mientras la API procesa uno, los que llegan se descartan en vez de hacer cola
            while rclpy.ok():
                m = latest.pop('msg', None)
                if m:
                    brain.step(bytes(m.data))
                else:
                    time.sleep(0.01)
        threading.Thread(target=frames, daemon=True).start()
        telemetria(node, brain, post)                   # bateria y estado del robot -> panel /robot
        threading.Thread(target=brain.vida, daemon=True).start()   # LED azul/verde/amarillo y ojos tiernos
        if a.escuchar:
            listen(node, brain, a.mic)
        node.get_logger().info(f'X2 conectado a la API {a.api} (camara {a.camara_x2}: {topic}, idioma inicial {a.idioma}); '
                               'hablele con "Juan"')
    else:
        import cv2                                      # vision local en el host: solo esta rama necesita OpenCV
        import numpy as np
        sess, step = make_reception(a, robot)

        def tick():
            msg = latest.pop('msg', None)
            frame = cv2.imdecode(np.frombuffer(bytes(msg.data), np.uint8), cv2.IMREAD_COLOR) if msg else None
            step(frame)

        node.create_timer(1 / 15, tick)                     # 15 Hz: la vision corre sobre el ultimo frame, sin cola
        threading.Thread(target=keys, args=(sess,), daemon=True).start()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        robot.release()                                 # devuelve el foco: el X2 recupera su voz de fabrica
        rclpy.shutdown()


LIDAR = '/aima/hal/sensor/lidar_chest_front/lidar_pointcloud_down_sampling'


def cerca_del_lidar(xyz, maximo):
    """Distancia (m) a lo mas cercano delante del pecho: x adelante, |y| < 0.6 m, z entre -0.9 y 0.6 m (torso de una
    persona; deja fuera el piso y el techo), y mas alla de 0.6 m (el propio robot). None si no hay nada."""
    import numpy as np
    x, y, z = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    sel = (x > 0.6) & (x < maximo + 3) & (np.abs(y) < 0.6) & (z > -0.9) & (z < 0.6)
    return float(np.hypot(x[sel], y[sel]).min()) if sel.any() else None


def lidar(node, maximo):
    """Lidar del pecho del X2 -> funcion cerca(): True si hay alguien delante a menos de `maximo` m. Sin lidar
    (o maximo 0) siempre True: la camara sigue sola. Asi el robot no atiende a la gente que pasa lejos."""
    if not maximo:
        return lambda: True
    import numpy as np
    from rclpy.qos import qos_profile_sensor_data
    from sensor_msgs.msg import PointCloud2
    estado = {'d': None, 't': 0.0, 'log': 0.0}

    def on_cloud(m):
        f = {c.name: c.offset for c in m.fields}
        dt = np.dtype({'names': ['x', 'y', 'z'], 'formats': ['<f4'] * 3,
                       'offsets': [f['x'], f['y'], f['z']], 'itemsize': m.point_step})
        p = np.frombuffer(bytes(m.data), dt)
        xyz = np.stack([p['x'], p['y'], p['z']], axis=1)
        estado['d'], estado['t'] = cerca_del_lidar(xyz[np.isfinite(xyz).all(1)], maximo), time.time()
        if time.time() - estado['log'] > 10:
            estado['log'] = time.time()
            node.get_logger().info(f'lidar: lo mas cercano delante a {estado["d"] or "-"} m (atiende a < {maximo} m)')
    node.create_subscription(PointCloud2, LIDAR, on_cloud, qos_profile_sensor_data)

    def cerca():
        if time.time() - estado['t'] > 2:               # el lidar no publica: no se bloquea a la camara
            return True
        return estado['d'] is not None and estado['d'] < maximo
    return cerca


def resumen_pmu(m):
    """PmuState (/aima/hal/pmu/state, 1 Hz: PMU + BMS de la bateria) -> lo que muestra el panel."""
    bits = int(m.bms_status_bits)
    return {'bateria_pct': int(m.battery_remaining_capacity_percentage),
            'bateria_v': round(float(m.battery_pack_voltage or m.battery_voltage), 1),
            'bateria_a': round(float(m.battery_current), 1),                  # + carga, - descarga
            'bateria_w': round(float(m.battery_output_power)), 'bateria_c': round(float(m.battery_temperature), 1),
            'cargando': bool(bits & 1) or float(m.battery_current) > 0.2, 'ciclos': int(m.battery_cycle_count),
            'bms_bits': bits & ~1, 'pmu_c': round(float(m.pmu_temperature), 1), 'ventilador_pct': int(m.fan_pecentage)}


def orin_estado():
    """El Orin por /proc y /sys (sin tegrastats ni sudo): temperatura mas alta, RAM, disco, carga, tiempo encendido."""
    d = {}
    try:
        zonas = [int(Path(z, 'temp').read_text()) / 1000 for z in Path('/sys/class/thermal').glob('thermal_zone*')]
        d['orin_c'] = round(max(t for t in zonas if 0 < t < 150), 1)
    except (OSError, ValueError):
        pass
    try:
        mem = dict(l.split(':') for l in Path('/proc/meminfo').read_text().splitlines() if ':' in l)
        total, libre = (int(mem[k].split()[0]) for k in ('MemTotal', 'MemAvailable'))
        d.update(ram_pct=round(100 * (1 - libre / total)), ram_gb=round(total / 1048576, 1))
        d['carga'] = float(Path('/proc/loadavg').read_text().split()[0])
        d['encendido_h'] = round(float(Path('/proc/uptime').read_text().split()[0]) / 3600, 1)
    except (OSError, KeyError, ValueError):
        pass
    st = os.statvfs(str(Path.home()))
    d['disco_libre_gb'] = round(st.f_bavail * st.f_frsize / 1e9, 1)
    return d


def telemetria(node, brain, post, cada=5.0):
    """Cada `cada` s al cerebro (POST /api/robot/telemetria): bateria, modo de movimiento, estado del sistema, alertas
    (topicos oficiales de AimDK v1.1.0) + Orin, DNS de la voz de fabrica y microfonos. Codigos crudos: el panel los
    traduce. QoS best-effort/volatile: compatible con cualquier publicador."""
    from rclpy.qos import QoSProfile, ReliabilityPolicy
    datos, vistos = {}, {}
    qos = QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT)

    def sub(tipo, topico, resumen):
        try:
            clase = getattr(__import__('aimdk_msgs.msg', fromlist=[tipo]), tipo)
        except (ImportError, AttributeError) as e:
            return node.get_logger().warn(f'telemetria: sin {tipo} ({e})')

        def on_msg(m):
            datos.update(resumen(m))
            vistos[topico] = time.time()
        node.create_subscription(clase, topico, on_msg, qos)
    sub('PmuState', '/aima/hal/pmu/state', resumen_pmu)
    sub('McCommonState', '/aima/mc/common/state',
        lambda m: {'accion': int(m.action_info.current_action.value), 'fsm': int(m.fsm_state.current_state)})
    sub('SmSystemState', '/aima/sm/system_state', lambda m: {'sistema': int(m.cur_status.value), 'sistema_txt': m.cur_state})
    sub('AlertCodeArray', '/aima/hds/alert_code_list', lambda m: {'alertas': [a.code for a in m.list][:12]})

    def mueve(m):                                       # camina (control remoto o navegacion): LED amarillo
        if abs(m.forward_velocity) + abs(m.lateral_velocity) + abs(m.angular_velocity) > 0.05:
            brain.mueve_t = time.time()
        return {}
    sub('McLocomotionVelocity', '/aima/mc/locomotion/velocity', mueve)

    def bucle():
        while True:
            time.sleep(cada)
            ahora = time.time()
            d = {**datos, **orin_estado(), 'dns': getattr(brain.robot, 'dns_ok', None),
                 'microfono_s': round(ahora - brain.mic_t, 1) if getattr(brain, 'mic_t', 0) else None,
                 'topicos_s': {k: round(ahora - t, 1) for k, t in vistos.items()}}
            idioma = post('/api/robot/telemetria', json.dumps(d).encode(), 'application/json', timeout=3).get('idioma')
            if idioma in ('es', 'en', 'zh', 'pt') and idioma != brain.idioma_base:     # la app cambio el idioma de Juan
                brain.idioma_base = brain.lang = idioma
                node.get_logger().info(f'idioma fijado por la app: {idioma}')
    threading.Thread(target=bucle, daemon=True).start()


def http_post(base):
    """post(path, body) -> dict de la API (JPEG/WAV crudo o None); con raw=True devuelve los bytes (audio PCM).
    Errores de red -> {} o b'' (el robot sigue: una API caida no deja al X2 mudo ni colgado)."""
    import urllib.request

    def post(path, body=None, ctype='image/jpeg', raw=False, timeout=10):
        req = urllib.request.Request(base.rstrip('/') + path, data=body or b'', method='POST',
                                     headers={'Content-Type': ctype} if body else {})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read() if raw else json.load(r)
        except OSError as e:
            print(f'  API: {e}', flush=True)
            return b'' if raw else {}
    return post


class ApiBrain:
    """El robot como cliente de la API (el mismo cerebro que la web): manda frames y hace lo que decide el servidor.
    identificar -> (reintento: dice la pista) -> (confirmacion: pide cedula/QR y manda frames a /api/confirmar)
    -> decision final: voz en el idioma del visitante + cara + LED del rol. La voz (lo que oye tras "Juan")
    va a /api/voz con on_voice()."""
    CONFIRM_S = 30.0

    PREGUNTA_S = 20.0       # s esperando el si/no de la pregunta del tenis: mientras tanto no atiende a nadie mas

    def __init__(self, robot, post, camara='x2', lang='es', girar=0, min_cara=0.0, cerca=lambda: True):
        self.robot, self.post, self.camara, self.lang = robot, post, camara, lang
        self.idioma_base, self.voz_t = lang, 0.0             # habla en el idioma de quien le habla; luego vuelve a este
        self.girar = f'&girar={girar}' if girar else ''
        self.ver = f'/api/camaras/{camara}?girar={girar}'   # frame solo para el panel, sin identificar
        self.visto = 0.0
        self.girar += f'&min_cara={min_cara}' if min_cara else ''    # caras chicas = gente lejos: no cuentan
        self.cerca = cerca                                  # lidar: hay alguien delante a menos de --lidar-max
        self.ocupado_hasta = 0.0                            # una persona a la vez: hasta aqui no mira a nadie mas
        self.nombre, self.nombre_hasta = None, 0.0          # a quien atendio: "hola" -> "¡Hola, Andres!"
        self.persona_id, self.charla_hasta = None, 0.0      # "adios" despide a esta persona; charla: no hace falta "Juan"
        self.oyendo, self.pendiente = threading.Lock(), None   # una frase a la vez; la que llega mientras, espera
        self.cid, self.deadline, self.done_at = None, 0.0, None
        self.pregunta, self.pregunta_hasta = None, 0.0     # p. ej. 'tenis': la proxima frase responde a esa pregunta
        self.dicho, self.saludados = {}, {}                 # frase -> cuando; persona -> cuando se la saludo
        self.gesto_gen, self.gesto_s = 0, GESTO_S           # una secuencia de gestos nueva cancela la anterior
        self.alguien_t = self.oye_t = self.mueve_t = 0.0    # ultima cara vista, ultima voz oida, ultimo movimiento

    def gestos(self, nombres):
        """Secuencia de gestos: el primero ya, el resto cada gesto_s s (en un hilo, sin frenar la voz ni la camara)."""
        nombres = [n for n in nombres if n in GESTOS]
        if not nombres:
            return
        self.gesto_gen += 1
        gen = self.gesto_gen
        self.robot.gesture(*GESTOS[nombres[0]], interrupt=True)     # lo nuevo manda: corta la secuencia anterior
        libre = getattr(self.robot, 'gesto_libre', None)

        def resto():
            for n in nombres[1:]:
                time.sleep(1.5 if libre else self.gesto_s)   # que el MC alcance a marcarlo como en curso
                if libre:
                    libre()
                if gen != self.gesto_gen:
                    return
                self.robot.gesture(*GESTOS[n])
        if len(nombres) > 1:
            threading.Thread(target=resto, daemon=True).start()

    def vida(self):
        """LED del pecho segun lo que hace (LUZ) y, quieto, los ojos tiernos en la pantalla. Solo en el X2 real."""
        ultimo = None
        while True:
            time.sleep(0.3)
            now = time.time()
            habla = now < max(getattr(self.robot, 'callado_hasta', 0), getattr(self.robot, 'suena_hasta', 0))
            estado = ('mueve' if now - self.mueve_t < 2.0 else 'habla' if habla
                      else 'oye' if now - self.oye_t < 1.0 or self.oyendo.locked() else 'quieto')
            if estado != ultimo:
                self.robot.light(*LUZ[estado])
                ultimo = estado
            if estado == 'quieto' and now - getattr(self.robot, 'cara_t', now) > 6.0:
                self.robot.ojos()

    def _say(self, text):
        """Decir algo solo si no se dijo en los ultimos NO_REPETIR s: el robot no repite pistas ni avisos."""
        now = time.time()
        if not text or now - self.dicho.get(text, 0) < NO_REPETIR:
            return False
        self.dicho[text] = now
        self.robot.say(text, self.lang)
        return True

    def finish(self, d):
        if not d:
            return
        sale = d.get('sentido') == 'sale'
        quien, now = (d.get('persona_id') or d.get('rol') or 'desconocido') + ('/sale' if sale else ''), time.time()
        if now - self.saludados.get(quien, 0) < (RECUERDA_S if d.get('persona_id') and not sale else NO_REPETIR):
            self.cid, self.done_at = None, now
            return
        self.saludados[quien] = now
        juntos = [] if sale else d.get('acompanantes') or []   # otras caras conocidas que llegaron con ella
        for a in juntos:
            self.saludados[a.get('persona_id') or 'desconocido'] = now
        if sale:                                            # se fue: "hola" ya no lo nombra
            self.nombre, self.nombre_hasta, self.persona_id = None, 0.0, None
        elif d.get('nombre') and d.get('persona_id'):
            if d['persona_id'] != self.persona_id and now - self.voz_t > 20:
                self.lang = self.idioma_base                 # otra persona: la saluda en espanol hasta que hable
            nombres = [x['nombre'].split()[0] for x in [d] + juntos if x.get('nombre')]
            self.nombre, self.nombre_hasta = f' {Y.get(self.lang, "y")} '.join(nombres), now + 120   # "Ana y Luis"
            self.persona_id = d['persona_id']
        f = FLOWS.get(d.get('rol'), FLOWS['ESCALAMIENTO'])
        self.robot.light(f['led'], f['mode'])
        self.robot.face(f['emoji'])
        print(f'>>> {"DESPIDIENDO A" if sale else "ATENDIENDO A"} {d.get("nombre") or quien} ({d.get("rol")})'
              + ''.join(f' + {a.get("nombre")} ({a.get("rol")})' for a in juntos) + ': '
              'el resto espera', flush=True)
        # una sola frase: cada say() nuevo corta el anterior (token nuevo en el playback)
        self._say(' '.join(x for x in [d.get('accion')] + [a.get('accion') for a in juntos] + [d.get('pregunta')] if x))
        if sale:
            self.gestos(['adios'])
        else:                                               # saluda, da la mano, senala su destino y a veces un extra
            rol = d.get('rol') if d.get('rol') in ENTRADA else 'ESCALAMIENTO'
            cumple = any(x.get('cumple') for x in [d] + juntos)      # feliz cumpleanos: corazon con los brazos
            self.gestos(ENTRADA[rol] + ['mano'] * bool(juntos) + ['corazon'] * cumple + ([LADO[rol]] if rol in LADO else []))
            if cumple:
                self.robot.face(200)
        espera = self.PREGUNTA_S if d.get('pregunta') else 2.0
        self.ocupado_hasta = getattr(self.robot, 'callado_hasta', now) + espera   # termina de hablar y espera el si/no
        self.pregunta, self.pregunta_hasta = ('tenis', self.ocupado_hasta) if d.get('pregunta') else (None, 0.0)
        self.charla_hasta = getattr(self.robot, 'callado_hasta', now) + CHARLA_S   # le puede contestar sin decir "Juan"
        print(json.dumps({k: d.get(k) for k in ('estado', 'persona_id', 'nombre', 'rol', 'confianza', 'motivo')},
                         ensure_ascii=False), flush=True)
        self.cid, self.done_at = None, time.time()

    def step(self, jpeg):
        now = time.time()
        if self.lang != self.idioma_base and now - self.voz_t > IDIOMA_S and now - self.alguien_t > 10:
            self.lang = self.idioma_base                     # nadie le habla ni esta enfrente: vuelve al espanol
        # un flujo a la vez y sin hablar encima: mientras el robot habla o espera una respuesta, los frames se botan
        if (now < max(self.ocupado_hasta, getattr(self.robot, 'callado_hasta', 0))
                or (self.done_at and now - self.done_at < COOLDOWN) or (not self.cid and not self.cerca())):
            if now - self.visto > 0.25:                     # el panel sigue viendo la camara (4 fps), sin identificar
                self.visto = now
                r = self.post(self.ver, jpeg)
                if r.get('caras'):
                    self.alguien_t = now
                self.recordar(r.get('ids') or [], now)
            return
        self.done_at = None
        if self.cid:                                        # esperando la cedula o el pase
            if now > self.deadline:
                return self.finish(self.post(f'/api/confirmar/{self.cid}/sin-pase?lang={self.lang}'))
            r = self.post(f'/api/confirmar/{self.cid}?lang={self.lang}{self.girar}', jpeg)
            if r.get('estado') == 'ESPERANDO':
                return self._say(r.get('pista'))
            return self.finish(r)
        resp = self.post(f'/api/identificar?camara={self.camara}&lang={self.lang}{self.girar}', jpeg)
        if resp.get('caras'):
            self.alguien_t = now
        self.recordar([c['persona_id'] for c in resp.get('caras') or [] if c.get('persona_id')], now)
        d = resp.get('decision')
        if not d:
            return
        if (d.get('confirmacion') or d.get('reintento')) and self.persona_id and now - self.voz_t < CHARLANDO_S:
            return                                          # conversando: la cara de lado o tapada no es alguien nuevo
        if d.get('confirmacion'):
            self.cid, self.deadline = d['confirmacion'], now + self.CONFIRM_S
            f = FLOWS['ESCALAMIENTO']
            self.robot.face(170)                            # "pensando"
            self.robot.light(f['led'], 1)
            self._say(d.get('accion'))
        elif d.get('reintento'):
            self._say((d.get('pistas') or [''])[0])
        elif d.get('registrado'):
            self.finish(d)

    def recordar(self, ids, now):
        """Las personas ya saludadas que siguen enfrente: su recuerdo se renueva (no las vuelve a saludar)."""
        for pid in ids:
            if pid in self.saludados:
                self.saludados[pid] = now

    def on_voice(self, wav):
        """Siempre oye: si llega una frase mientras la API procesa otra, queda en espera (la ultima) y va despues."""
        self.pendiente, r = wav, {}
        while self.pendiente is not None:
            if not self.oyendo.acquire(blocking=False):     # otro hilo la procesa al terminar la suya
                return r
            try:
                while self.pendiente is not None:
                    wav, self.pendiente = self.pendiente, None
                    r = self._on_voice(wav)
            finally:
                self.oyendo.release()
        return r

    def _on_voice(self, wav):
        # 60 s: la primera frase puede cargar (o bajar) el modelo de Whisper; los frames siguen con su timeout corto
        contexto = f'&contexto={self.pregunta}' if self.pregunta and time.time() < self.pregunta_hasta else ''
        quien = f'&pid={self.persona_id}' if self.persona_id and time.time() < self.nombre_hasta else ''
        quien += f'&cid={self.cid}' if self.cid else ''    # pidiendo documento: puede decir su numero de cedula
        r = self.post(f'/api/voz?lang={self.lang}{contexto}{quien}', wav, 'audio/wav', timeout=60)
        if not r.get('texto'):
            return r
        texto, now = r['texto'].strip(), time.time()
        self.voz_t = now
        self.recordar([self.persona_id] if self.persona_id else [], now)   # le esta hablando: lo recuerda
        # solo atiende si lo llaman por su nombre, o si esta conversando (acaba de hablarle, pregunta abierta, documento)
        presente = now - self.alguien_t < PRESENTE_S       # alguien frente a la camara: no hace falta su nombre
        atento = r.get('llamado') or presente or now < max(self.charla_hasta, self.pregunta_hasta) or self.cid
        print(f'<<< OYO: "{texto}" ({r.get("intencion")}, seguridad {r.get("confianza")})'
              f'{"" if atento else "  -> sin decir Juan: no contesta"}', flush=True)
        if not atento:
            return r
        if r.get('cambio_idioma') and len(texto.split()) < 2 and len(texto) < 4:
            return r                                        # ruido o una palabra suelta: no cambia de idioma ni contesta
        if r.get('cambio_idioma'):
            self.lang = r['idioma']                         # desde ahora le habla en su idioma
        if r.get('intencion') in ('tenis_si', 'tenis_no'):
            self.pregunta = None                            # pregunta contestada: al terminar la respuesta, el siguiente
            self.ocupado_hasta = time.time() + 0.085 * len(r.get('respuesta') or '') + 3.0
        if r.get('confirmacion'):                          # dijo su numero de cedula: la decision ya viene del cerebro
            self.finish(r['confirmacion'])
        elif r.get('intencion') == 'despedida':            # "adios, Juan": despedida de su categoria y cierra la visita
            pid = self.persona_id if self.persona_id and now < self.nombre_hasta else 'desconocido'
            self.ocupado_hasta = 0.0
            self.finish(self.post(f'/api/salida/{pid}?camara={self.camara}&lang={self.lang}'))
        elif r.get('intencion') == 'sin_documento' and self.cid:
            self.finish(self.post(f'/api/confirmar/{self.cid}/sin-pase?lang={self.lang}'))
        elif r.get('intencion') == 'saludo' and self.nombre and time.time() < self.nombre_hasta:
            self.robot.say(HOLA.get(self.lang, HOLA['es']).format(n=self.nombre), self.lang)   # lo conoce: por su nombre
        elif r.get('intencion') in ('tenis_si', 'tenis_no', 'saludo', 'llamado', 'repetir') or r.get('cambio_idioma'):
            self.robot.say(r['respuesta'], self.lang)      # respuesta directa a lo que le dijeron: siempre
        elif r.get('respuesta') and r.get('intencion') not in ('no_entendi', None):
            self._say(r['respuesta'])                       # el resto, sin repetirse; ruido o frases sueltas: callado
        intent = r.get('intencion')
        if not r.get('confirmacion') and intent != 'despedida' and (intent != 'no_entendi' or len(texto.split()) >= 2):
            if intent in CARA_VOZ:
                self.robot.face(CARA_VOZ[intent])
            self.gestos(gestos_de(intent, texto, r.get('respuesta')))   # segun lo que se dijo
        self.charla_hasta = getattr(self.robot, 'callado_hasta', time.time()) + CHARLA_S
        return r


def pcm_to_wav(pcm, rate=16000):
    import io
    import wave
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


class MicVad:
    """VAD por energia sobre el microfono crudo del X2 (/aima/hal/audio/capture), como plan B si no llega
    /agent/process_audio_output. Mismo criterio que la web: arranca sobre el ruido de fondo y cierra tras 0.8 s
    de silencio. AudioCapture trae los canales intercalados (int16): primero los microfonos (4 en el X2), luego las
    referencias del eco (2). Se promedian los microfonos: mas voz y menos ruido que uno solo."""
    INICIO, FIN, MIN_S, MAX_S, PISO_MIN = 3.0, 1.0, 0.4, 15.0, 0.004   # FIN 1 s: no corta a quien piensa a media frase

    def __init__(self, on_frase, rate=16000):
        import numpy as np
        self.np, self.on_frase, self.rate = np, on_frase, rate
        self.piso, self.buf, self.habla, self.silencio = None, [], False, 0.0

    def feed(self, msg):
        np = self.np
        canales = max(1, int(msg.info.channels or msg.mic_channels or 1))
        pcm = np.frombuffer(bytes(msg.data.data), dtype='<i2')
        mics = max(1, min(canales, int(getattr(msg, 'mic_channels', 0) or canales)))
        n = pcm.size // canales * canales
        mono = (pcm[:n].reshape(-1, canales)[:, :mics].mean(axis=1).astype('<i2') if canales > 1 else pcm)
        if mono.size == 0:
            return
        rms = float(np.sqrt(np.mean((mono / 32768.0) ** 2)))
        self.piso = rms if self.piso is None else (min(self.piso * 1.005 + 1e-6, rms) if rms > self.piso else rms)
        self.buf.append(mono)
        if rms > max(self.piso * self.INICIO, self.PISO_MIN):
            self.habla, self.silencio = True, 0.0
        elif self.habla:
            self.silencio += mono.size / self.rate
        else:
            del self.buf[:-max(2, int(0.5 * self.rate / mono.size))]   # 0.5 s antes: no se corta el "Juan" inicial
        if self.habla and (self.silencio >= self.FIN or self._dur() > self.MAX_S):
            self.flush()

    def _dur(self):
        return sum(b.size for b in self.buf) / self.rate

    def flush(self):
        dur, buf = self._dur(), self.buf
        self.buf, self.habla, self.silencio = [], False, 0.0
        if buf and dur >= self.MIN_S:                   # volumen normalizado: el microfono lejano llega bajo
            pcm = self.np.concatenate(buf).astype(self.np.float32)
            pcm *= min(12.0, 0.9 * 32767 / max(1.0, float(self.np.abs(pcm).max())))
            self.on_frase(pcm_to_wav(pcm.astype('<i2').tobytes(), self.rate))


def listen(node, brain, mic='auto', espera=20.0):
    """Lo que oye el X2 despues de "Juan" -> /api/voz. En modo only_voice (robot.md seccion 4) el robot publica
    el audio de cada frase en /agent/process_audio_output (PCM 16 kHz mono; audio_vad_state.value: 1 empieza,
    2 procesando, 3 termina). mic='auto': si en `espera` segundos no llega ni un mensaje (falta el modo only_voice o
    el agente no arranco), pasa solo al microfono crudo con MicVad; 'solo' = solo microfono; 'no' = solo el agente."""
    from aimdk_msgs.msg import ProcessedAudioOutput
    from rclpy.qos import DurabilityPolicy, HistoryPolicy, QoSProfile, ReliabilityPolicy
    qos = QoSProfile(reliability=ReliabilityPolicy.BEST_EFFORT, durability=DurabilityPolicy.TRANSIENT_LOCAL,
                     history=HistoryPolicy.KEEP_LAST, depth=200)   # la doc pide una cola grande para el VAD
    estado = {'chunks': [], 'visto': False}
    def envia(wav):
        # frase que empezo mientras el robot hablaba (o el eco justo despues): es su propia voz, no se contesta
        dur = (len(wav) - 44) / 32000
        if time.time() - dur - 0.8 < getattr(brain.robot, 'callado_hasta', 0):
            return
        threading.Thread(target=brain.on_voice, args=(wav,), daemon=True).start()

    def on_audio(m):
        estado['visto'] = True
        vad = getattr(m.audio_vad_state, 'value', m.audio_vad_state)   # AudioVadStateType.value (doc oficial)
        if vad == 1:
            estado['chunks'].clear()
        estado['chunks'].append(bytes(m.audio_data))
        if vad == 3 and estado['chunks']:
            pcm = b''.join(estado['chunks'])
            estado['chunks'].clear()
            envia(pcm_to_wav(pcm))

    def mic_crudo():
        from aimdk_msgs.msg import AudioCapture
        try:
            vad = MicVad(envia)
        except ImportError:                             # host del robot sin numpy: queda la escucha del agente
            return node.get_logger().error('el microfono crudo necesita numpy (python3 -m pip install numpy)')
        robot = brain.robot
        from aimdk_msgs.msg import PlayStateChange
        from rclpy.qos import DurabilityPolicy

        def on_parlante(m):                             # el parlante suena (Juan o el asistente de fabrica): no oir
            robot.suena_hasta = float('inf') if m.state.value == 1 else time.time() + 0.6
        node.create_subscription(PlayStateChange, '/aima/hal/audio/play_state', on_parlante,
                                 QoSProfile(depth=10, reliability=ReliabilityPolicy.BEST_EFFORT,
                                            durability=DurabilityPolicy.TRANSIENT_LOCAL))

        def on_mic(m):
            brain.mic_t = time.time()                   # el panel muestra si los microfonos siguen llegando
            if time.time() > max(getattr(robot, 'callado_hasta', 0), getattr(robot, 'suena_hasta', 0)):   # no se oye a si mismo
                vad.feed(m)
                if vad.habla:
                    brain.oye_t = time.time()           # LED azul
        node.create_subscription(AudioCapture, '/aima/hal/audio/capture', on_mic,
                                 QoSProfile(reliability=ReliabilityPolicy.RELIABLE, depth=50,
                                            history=HistoryPolicy.KEEP_LAST))
        node.get_logger().warn('escuchando el microfono crudo (/aima/hal/audio/capture) con VAD propio')

    if mic == 'solo':
        return mic_crudo()
    node.create_subscription(ProcessedAudioOutput, '/agent/process_audio_output', on_audio, qos)
    if mic == 'no':
        return
    caja = {}

    def revisa():
        caja['t'].cancel()
        if not estado['visto']:
            node.get_logger().warn(f'nada en /agent/process_audio_output en {espera:.0f} s: falta el modo only_voice'
                                   ' (python3 deploy/modo_agente.py only_voice) o el agente no arranco')
            mic_crudo()
    caja['t'] = node.create_timer(espera, revisa)


def make_reception(a, robot):
    """Sesion cara + QR y la funcion step(frame) que la avanza y dispara el flujo. La usan el X2 y el Mac."""
    sys.path.insert(0, str(ROOT))
    from club_facial import load_socios
    from face import Gallery, load_calibration
    from qr_lector import SesionCaraQR
    from yolo_face import YoloFaceEngine
    cal = {**load_calibration(), **load_json(a.calibracion)}   # la calibrada con el dataset propio manda
    datos = Path(os.environ.get('CERBERUS_DATOS', ROOT / 'datos'))
    socios, hoy = with_personas(load_socios(), load_json(REGISTROS_HOY), load_json(datos / 'personas.json'))
    sess = SesionCaraQR(YoloFaceEngine(), Gallery(a.galeria), socios, cal)
    state = dict(done_at=None)

    def step(frame):
        if state['done_at']:
            if time.time() - state['done_at'] > COOLDOWN:
                state['done_at'] = None
                sess.reset()
            return
        if frame is None:
            return
        before = sess.message
        sess.feed(frame, time.time())
        if sess.message != before and not sess.result:
            robot.say(sess.message)                         # reintento guiado / pedir QR, en voz
        if sess.result:
            cat, data = categorize(sess.result, socios, hoy)
            print(json.dumps(dict(sess.result, categoria=cat), ensure_ascii=False), flush=True)
            robot.run_flow(cat, data)
            state['done_at'] = time.time()
    return sess, step


class LocalRobot:
    """El mismo flujo sin robot, en un laptop: voz con espeak-ng (Linux) o `say` (macOS) y el resto impreso.
    Para probar y como plan B."""
    run_flow = X2.run_flow

    def __init__(self):
        self.node = self
        self.proc = None

    def get_logger(self):
        return self

    def info(self, msg):
        print(msg, flush=True)

    def say(self, text, lang='es'):
        print(f'  dice [{lang}]: {text}', flush=True)
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()                           # como is_interrupted=True en el X2
        if shutil.which('espeak-ng') and not shutil.which('say'):
            self.proc = subprocess.Popen(['espeak-ng', '-v', ESPEAK.get(lang, 'es-419'), '-s', '150', text])
        elif shutil.which('say'):
            self.proc = subprocess.Popen(['say', '-v', MAC_VOICE.get(lang, 'Paulina'), text])
        else:
            self.proc = None

    def light(self, rgb, mode):
        print(f'  LED rgb{tuple(rgb)} modo {mode}')

    def face(self, emotion_id):
        print(f'  cara {emotion_id}')

    def gesture(self, motion, area, interrupt=False):
        print(f'  gesto {motion} (area {area})')



def mac_main(a):
    import cv2
    sys.path.insert(0, str(VISION))
    if a.api:                                               # lo mismo que hace el X2, con la camara del Mac
        from camera import open_camera
        brain, cap = ApiBrain(LocalRobot(), http_post(a.api), 'laptop', a.idioma), open_camera(a.camara)[0]
        print('modo API: q en la ventana para salir')
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            brain.step(cv2.imencode('.jpg', frame)[1].tobytes())
            cv2.imshow('Cerberus (cliente de la API)', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        cap.release()
        cv2.destroyAllWindows()
        return
    from camera import open_camera
    from live import draw
    sess, step = make_reception(a, LocalRobot())
    cap, _ = open_camera(a.camara)
    print('teclas en la ventana: n = sin pase QR, s / x = tercero confirma / niega, r = reiniciar, q = salir')
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        step(frame)
        draw(frame, sess, [])
        cv2.imshow('Cerberus (local)', frame)
        k = cv2.waitKey(1) & 0xFF
        if k == ord('q'):
            break
        {ord('n'): sess.no_qr, ord('r'): sess.reset}.get(k, lambda: None)()
        if k in (ord('s'), ord('x')):
            sess.third_party(k == ord('s'))
    cap.release()
    cv2.destroyAllWindows()


def keys(sess):
    """Teclas de la demo en la terminal (Enter despues de cada una): n s x r."""
    while True:
        if select.select([sys.stdin], [], [], 0.5)[0]:
            k = sys.stdin.readline().strip()
            {'n': sess.no_qr, 'r': sess.reset}.get(k, lambda: None)()
            if k in ('s', 'x'):
                sess.third_party(k == 's')


def autotest():
    socios = {'sofia': {'nivel': 'VIP'}, 'carlos': {'nivel': 'REGULAR'}}
    hoy = {'invitados': {'laura': {'anfitrion': 'Andres'}}, 'personal': {'marta': {}}, 'externos': {'luis': {'ot': 'OT-1'}}}
    ok = lambda pid, pase=None: dict(resultado='verificado', persona_id=pid, nombre=pid.title() + ' X', pase=pase)
    assert categorize(ok('sofia'), socios, hoy)[0] == 'VIP'
    assert categorize(ok('carlos'), socios, hoy) == ('REGULAR', {'nombre': 'Carlos'})
    assert categorize(ok('laura'), socios, hoy) == ('INVITADO', {'nombre': 'Laura', 'anfitrion': 'Andres'})
    assert categorize(ok('marta', 'personal'), socios, hoy)[0] == 'PERSONAL'
    assert categorize(ok('luis'), socios, hoy)[1]['ot'] == 'OT-1'
    assert categorize(ok('desconocida'), socios, hoy)[0] == 'ESCALAMIENTO'          # verificado sin registro
    assert categorize(ok('marta', 'externo'), socios, hoy)[0] == 'ESCALAMIENTO'     # pase contradice registro
    assert categorize(dict(resultado='escalado_recepcion'), socios, hoy)[0] == 'ESCALAMIENTO'
    s2, h2 = with_personas(socios, hoy, {'ana': {'nombre': 'Ana P', 'rol': 'VIP'}, 'lu': {'nombre': 'Lu', 'rol': 'EXTERNO'}})
    assert categorize(ok('ana'), s2, h2)[0] == 'VIP' and categorize(ok('lu'), s2, h2)[0] == 'EXTERNO'
    assert categorize(ok('laura'), s2, h2)[0] == 'INVITADO' and 'ana' not in socios       # no pisa ni muta lo anterior
    for cat, f in FLOWS.items():
        f['say'].format_map({'nombre': 'A', 'anfitrion': 'B', 'ot': 'C'})
        assert 0 <= f['mode'] <= 3 and all(0 <= v <= 255 for v in f['led']), cat
    assert len({(f['led'], f['mode'], f['emoji']) for f in FLOWS.values()}) == len(FLOWS)   # cada flujo se ve distinto
    class Fake:                                             # robot que anota lo que hace
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
    script = {'/api/identificar': [{'decision': None}, {'decision': {'reintento': True, 'pistas': ['retira la mano']}},
                                   {'decision': {'reintento': True, 'pistas': ['retira la mano']}},
                                   {'decision': {'confirmacion': 'c1', 'accion': 'muestra tu cedula'}}],
              '/api/confirmar/c1': [{'estado': 'ESPERANDO', 'pista': 'acercala'},
                                    {'estado': 'CONFIRMADO_CEDULA', 'rol': 'VIP', 'accion': 'Listo, Ana',
                                     'pregunta': '¿Quieres ir a la cancha de tenis?'}],
              '/api/voz': [{'texto': 'si', 'idioma': 'es', 'intencion': 'tenis_si', 'respuesta': '¡Ven, te acompaño!'},
                           {'texto': 'hola', 'idioma': 'es', 'intencion': 'saludo', 'respuesta': '¡Hola! Soy Cerberus'},
                           {'texto': 'hello, good morning to you', 'idioma': 'en', 'cambio_idioma': True, 'intencion': 'saludo', 'respuesta': 'Hello!'},
                           {'texto': 'donde esta el bano', 'idioma': 'es', 'intencion': 'bano', 'respuesta': 'A la derecha'},
                           {'texto': 'adios juan', 'idioma': 'es', 'intencion': 'despedida', 'respuesta': 'Hasta pronto', 'llamado': True}],
              '/api/salida/ana': [{'estado': 'SALIDA', 'sentido': 'sale', 'persona_id': 'ana', 'nombre': 'Ana', 'rol': 'VIP',
                                   'accion': 'Hasta pronto, Ana. Gracias por su visita.'}]}
    calls = []

    vistos = []

    def post(path, body=None, ctype='image/jpeg', raw=False, timeout=10):
        if path.startswith('/api/camaras/'):                # frame solo para el panel: no cuenta como identificar
            vistos.append(path)
            return {}
        calls.append(path)
        return script[path.split('?')[0]].pop(0)
    robot = Fake()
    brain = ApiBrain(robot, post)
    brain.gesto_s = 3600                                   # el resto de cada secuencia no corre en la prueba
    for _ in range(6):
        brain.step(b'jpeg')
    said = [x[2] for x in robot.log if x[0] == 'say']
    assert said == ['retira la mano', 'muestra tu cedula', 'acercala', 'Listo, Ana ¿Quieres ir a la cancha de tenis?'], said
    assert ('led', FLOWS['VIP']['led']) in robot.log and ('gesto', GESTOS['reverencia'][0]) in robot.log and brain.cid is None
    assert brain.pregunta == 'tenis'
    antes = len(robot.log)
    brain.done_at = None
    brain.finish({'rol': 'VIP', 'persona_id': None, 'accion': 'Listo, Ana', 'pregunta': '¿Quieres ir a la cancha de tenis?'})
    assert len(robot.log) == antes, robot.log[antes:]                       # la misma persona: no se repite el saludo
    assert brain._say('retira la mano') is False                            # ni una pista ya dicha
    brain.step(b'jpeg')
    assert len(calls) == 6, calls                                           # enfriamiento tras una decision
    brain.on_voice(b'wav')                                                  # "si" -> responde a la pregunta del tenis
    dichos = lambda: [x for x in robot.log if x[0] == 'say']
    assert 'contexto=tenis' in calls[-1] and dichos()[-1] == ('say', 'es', '¡Ven, te acompaño!') and brain.pregunta is None
    assert robot.log[-1] == ('gesto', GESTOS['celebrar'][0])                 # y lo celebra
    brain.nombre, brain.nombre_hasta = 'Ana', time.time() + 60
    brain.on_voice(b'wav')                                                  # "hola" -> lo saluda por su nombre
    assert dichos()[-1] == ('say', 'es', '¡Hola, Ana! ¿En qué le puedo ayudar?'), robot.log[-1]
    brain.nombre = None
    brain.saludados, brain.done_at = {}, None                               # dos personas conocidas a la vez
    brain.finish({'estado': 'RECONOCIDO', 'rol': 'VIP', 'persona_id': 'ana', 'nombre': 'Ana P', 'accion': 'Hola, Ana.',
                  'acompanantes': [{'rol': 'REGULAR', 'persona_id': 'luis', 'nombre': 'Luis', 'accion': 'Hola, Luis.'}]})
    assert dichos()[-1] == ('say', 'es', 'Hola, Ana. Hola, Luis.') and brain.nombre == 'Ana y Luis' and 'luis' in brain.saludados
    assert [x for x in robot.log if x[0] == 'gesto'][-1] == ('gesto', GESTOS['reverencia'][0])   # luego mano, mano, lado
    brain.nombre = None
    brain.on_voice(b'wav')
    assert 'contexto' not in calls[-1] and brain.lang == 'en' and dichos()[-1] == ('say', 'en', 'Hello!')
    assert pcm_to_wav(b'\x00\x00' * 160)[:4] == b'RIFF'
    brain.charla_hasta = brain.pregunta_hasta = 0.0
    antes = len(robot.log)
    brain.on_voice(b'wav')                                                  # charla ajena, sin "Juan": no contesta
    assert len(robot.log) == antes, robot.log[antes:]
    brain.persona_id, brain.nombre_hasta, brain.lang = 'ana', time.time() + 60, 'es'
    brain.on_voice(b'wav')                                                  # "adios juan" -> despedida de Ana
    dicho = [x[2] for x in robot.log if x[0] == 'say'][-1]
    assert '/api/salida/ana' in calls[-1] and dicho.startswith('Hasta pronto, Ana') and brain.persona_id is None, dicho
    assert ('gesto', GESTOS['adios'][0]) == [x for x in robot.log if x[0] == 'gesto'][-1]   # se despide con la mano
    import numpy as np
    n = len(calls)
    brain.ocupado_hasta, brain.done_at = time.time() + 5, None                # atendiendo a alguien: nadie mas
    brain.step(b'jpeg')
    assert len(calls) == n and vistos, calls                                # pero el panel sigue viendo la camara
    brain.ocupado_hasta, brain.cerca = 0.0, lambda: False                   # el lidar no ve a nadie cerca
    brain.step(b'jpeg')
    assert len(calls) == n, calls
    pts = np.array([[0.3, 0, 0], [5.0, 0, 0], [1.8, 0.2, 0.1], [1.0, 0, -1.2], [1.0, 2.0, 0]], np.float32)
    assert abs(cerca_del_lidar(pts, 3.0) - np.hypot(1.8, 0.2)) < 1e-3       # ni el propio robot, ni el piso, ni el lado
    assert cerca_del_lidar(pts[[0, 3, 4]], 3.0) is None

    # MicVad: plan B de la escucha, silencio -> frase -> silencio
    cap = lambda mono: type('Cap', (), dict(info=type('I', (), {'channels': 1})(), mic_channels=1,
                                            data=type('D', (), {'data': mono.astype('<i2').tobytes()})()))()
    frases, vad = [], MicVad(lambda wav: frases.append(wav))
    sil, tono = np.zeros(1600, np.int16), (np.sin(np.arange(1600) * 0.3) * 8000).astype(np.int16)
    for trozo, veces in ((sil, 5), (tono, 8), (sil, 12)):     # 0.1 s por trozo: 0.8 s de voz y 1.2 s de silencio
        for _ in range(veces):
            vad.feed(cap(trozo))
    assert len(frases) == 1 and frases[0][:4] == b'RIFF', frases
    assert len(frases[0]) > 0.8 * 16000 * 2, len(frases[0])   # la frase entera, con su arranque
    # gestos segun lo que se dice: direccion de la respuesta, tono de la frase; nada al azar
    assert gestos_de('bano', '¿dónde está el baño?', 'Están en el lobby, a la derecha de recepción.') == ['derecha']
    assert gestos_de('rag', 'where is the gym', 'The elevator is on your left.') == ['izquierda']
    assert gestos_de('rag', 'Me encanta este club', 'Qué alegría oír eso.') == ['corazon']
    assert gestos_de('rag', '¿te gusta el chocolate?', 'Sí, es delicioso.') == []
    assert gestos_de('saludo', 'hola', '') == ['ola', 'mano'] and gestos_de('no_entendi', 'eh', '') == []
    assert gestos_de('rag', '¡Choca esos cinco, Juan!', 'Con mucho gusto.') == ['cinco']
    assert gestos_de('rag', 'Hoy es mi cumpleaños', '¡Feliz cumpleaños!') == ['celebrar']
    assert gestos_de('rag', 'Ganamos el partido', '¡Qué maravilla!') == ['celebrar']
    assert gestos_de('rag', 'Mucho gusto, Juan', 'El gusto es mío.') == ['mano']
    assert gestos_de('rag', '¿Cuánto cuesta la membresía?', 'No lo sé; en recepción le ayudan.') == ['rascar']
    assert gestos_de('rag', 'Estoy nervioso', 'Tranquilo, todo está en orden.') == ['suave']
    assert gestos_de('rag', "That's right", 'Of course.') == [] and gestos_de('rag', '¿Qué hora es?', 'Ya casi.') == []
    assert gestos_de('rag', '这里太漂亮了', '谢谢！') == ['corazon']
    b2 = ApiBrain(Fake(), lambda *a, **k: {})                              # recuerda a quien sigue enfrente o hablando
    b2.saludados = {'thomas': time.time() - 800}
    b2.recordar(['thomas', 'otro'], time.time())
    assert time.time() - b2.saludados['thomas'] < 1 and 'otro' not in b2.saludados
    b2.saludados = {}                                                       # su cumpleanos: saluda, mano y corazon
    b2.finish({'persona_id': 'thomas', 'nombre': 'Thomas', 'rol': 'REGULAR', 'accion': 'Hola. ¡Feliz cumpleaños!', 'cumple': True})
    assert ('cara', 200) in b2.robot.log and b2.gesto_gen == 1
    b2.saludados['thomas'] = time.time()
    b2.robot.log.clear()
    b2.finish({'persona_id': 'thomas', 'nombre': 'Thomas', 'rol': 'REGULAR', 'accion': 'Hola, Thomas.'})
    assert not b2.robot.log                                                 # no lo vuelve a saludar
    print('autotest OK')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--probar', choices=list(FLOWS) + ['todos'], help='ejecuta un flujo (o todos) sin camara')
    ap.add_argument('--diagnostico', action='store_true', help='checklist del turno: camara, servicios, escucha, flujo')
    ap.add_argument('--volumen', type=int, help='volumen del robot al arrancar (0-100)')
    ap.add_argument('--tts', choices=['auto', 'local', 'api'], default='auto',
                    help='de donde sale el PCM del espanol: espeak-ng local o el cerebro (/api/tts)')
    ap.add_argument('--mic', choices=['auto', 'solo', 'no'], default='solo',
                    help='con --escuchar: solo = el arreglo de 4 microfonos del robot (promediados) con VAD propio, '
                         'sin palabra de activacion: se le habla diciendo "Juan" '
                         '(por defecto); auto = el agente (only_voice) y si no llega nada, los microfonos; no = solo el agente')
    ap.add_argument('--guardar-frames')
    ap.add_argument('--galeria', default=str(ROOT / 'datos' / 'gallery.npz'))
    ap.add_argument('--calibracion', default=str(ROOT / 'datos' / 'calibration.json'))
    ap.add_argument('--voz', choices=['pcm', 'tts'], default='tts',
                    help='tts: la voz propia del X2 y, si no tiene la frase, la del cerebro (por defecto); pcm: siempre la del cerebro')
    ap.add_argument('--camara', type=int, help='correr en el Mac con esta camara, sin robot')
    ap.add_argument('--api', help='URL de la API de Cerberus (web/app.py): el robot solo manda frames y voz')
    ap.add_argument('--idioma', default='es', choices=['es', 'en', 'zh', 'pt'], help='idioma inicial (lo cambia la app: PUT /api/idioma)')
    ap.add_argument('--escuchar', action='store_true', help='con --api: lo que oye el X2 (modo only_voice) va a /api/voz')
    ap.add_argument('--min-cara', type=float, default=0.05,
                    help='ancho minimo de la cara (fraccion del frame): las mas chicas son gente lejos y no cuentan')
    ap.add_argument('--lidar-max', type=float, default=3.0,
                    help='m: solo atiende si el lidar del pecho ve a alguien mas cerca que esto (0 = sin lidar)')
    ap.add_argument('--sin-gestos', action='store_true', help='no saludar con la mano (SetMcPresetMotion)')
    ap.add_argument('--camara-x2', choices=list(CAMARAS), default='arriba',
                    help='camara de la cabeza: arriba (gran angular, a la altura de la cara) o rgbd (hacia abajo, al reves)')
    ap.add_argument('--autotest', action='store_true')
    a = ap.parse_args()
    if a.autotest:
        return autotest()
    mac_main(a) if a.camara is not None else ros_main(a)


if __name__ == '__main__':
    main()
