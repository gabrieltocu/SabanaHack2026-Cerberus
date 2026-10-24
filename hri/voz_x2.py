"""Voz y oido del X2 real: el dialogo decide que decir; el robot lo dice con SU voz y escucha con SUS microfonos.

Corre donde este el SDK del X2 (aimdk_msgs): contenedor de desarrollo en PC2 o un PC con el SDK en la red del robot.
- Hablar:   PlayTts (voz propia del robot). Plan B: WAV en espanol generado aqui y enviado por stream al parlante
            (/aima/hal/audio/playback). Salta solo al plan B si PlayTts falla; con modo='wav' se usa siempre.
- Escuchar: 'vad'   -> /agent/process_audio_output (reduccion de ruido + deteccion de voz del robot; pide la
                       palabra de activacion: en modo only_voice basta decirla una vez, ver robots/x2/solo_voz.sh)
            'crudo' -> /aima/hal/audio/capture (microfono 0) + nuestro corte por energia. Sin palabra de activacion.
            En los dos casos transcribe nuestro Whisper (voz.Oido).
Campos y patrones copiados del manual AimDK_X2 (reintentos 8 x 0.25 s, stamp en header.header, 'reponse' sic).
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

from voz import SR, Oido, Voz, grabar, leer_wav

PKG = 'cerberus'
PRIORIDAD_TTS = 6        # INTERACTION_L6 como el manual; 7 evita que interaction_slave lo interrumpa (calibrar)
CPS = 14.0               # ponytail: caracteres por segundo para esperar a que termine de hablar; PlayTts no da duracion
PIPER_MODELO = os.environ.get('CERBERUS_PIPER', str(Path.home() / 'piper' / 'es_MX-claude-high.onnx'))

_nodo = None


def nodo():
    global _nodo
    if _nodo is None:
        import rclpy
        rclpy.init()
        _nodo = rclpy.create_node('cerberus_voz')
    return _nodo


def llamar(cliente, req, sellar=None, intentos=8, t=0.25):
    """Servicio entre hosts con reintentos (el manual: ROS los pierde). -> respuesta o None."""
    import rclpy
    n = nodo()
    for _ in range(intentos):
        if sellar:
            sellar(req, n.get_clock().now().to_msg())
        fut = cliente.call_async(req)
        rclpy.spin_until_future_complete(n, fut, timeout_sec=t)
        if fut.done():
            return fut.result()
    return None


def sintetizar_wav(texto, path):
    """WAV en espanol para el plan B: voz de Windows si hay, si no Piper (Linux/PC2, sin internet)."""
    if sys.platform == 'win32':
        return Voz().a_wav(texto, path)
    subprocess.run([sys.executable, '-m', 'piper', '-m', PIPER_MODELO, '-f', str(path)],
                   input=texto.encode('utf-8'), check=True, capture_output=True)
    return Path(path)


def pcm16(audio):
    return (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()


class VozX2:
    """Misma interfaz que voz.Voz (decir). modo 'tts' = voz del robot con plan B automatico; 'wav' = siempre WAV."""

    def __init__(self, modo='tts'):
        from aimdk_msgs.msg import AudioPlayback, FocusResponse
        from aimdk_msgs.srv import AbandonAudioFocus, PlayTts, RequestAudioFocus
        from rclpy.qos import QoSDurabilityPolicy, QoSHistoryPolicy, QoSProfile, QoSReliabilityPolicy
        n = nodo()
        self.modo = modo
        self.tts = n.create_client(PlayTts, '/aimdk_5Fmsgs/srv/PlayTts')
        self.pedir_foco = n.create_client(RequestAudioFocus, '/aimdk_5Fmsgs/srv/RequestAudioFocus')
        self.soltar_foco = n.create_client(AbandonAudioFocus, '/aimdk_5Fmsgs/srv/AbandonAudioFocus')
        self.pub = n.create_publisher(AudioPlayback, '/aima/hal/audio/playback', 10)
        self.foco = True
        n.create_subscription(FocusResponse, '/aima/hal/audio/focus_response', self._foco,
                              QoSProfile(reliability=QoSReliabilityPolicy.RELIABLE, history=QoSHistoryPolicy.KEEP_LAST,
                                         depth=10, durability=QoSDurabilityPolicy.VOLATILE))

    def _foco(self, msg):
        if msg.pkg_name == PKG:
            self.foco = msg.focus_gain              # otro audio de mayor prioridad nos quito el parlante

    def decir(self, texto):
        if self.modo == 'tts' and self.decir_tts(texto):
            time.sleep(len(texto) / CPS + 0.3)      # que termine antes de escuchar (si no, se oye a si mismo)
            return
        print('    [voz] plan B: WAV')
        self.decir_wav(texto)

    def decir_tts(self, texto):
        from aimdk_msgs.msg import TtsPriorityLevel
        from aimdk_msgs.srv import PlayTts
        req = PlayTts.Request()
        req.tts_req.text = texto
        req.tts_req.domain = PKG
        req.tts_req.trace_id = str(int(time.time() * 1000))
        req.tts_req.is_interrupted = True
        req.tts_req.priority_weight = 0
        req.tts_req.priority_level = TtsPriorityLevel()
        req.tts_req.priority_level.value = PRIORIDAD_TTS
        resp = llamar(self.tts, req, lambda r, st: setattr(r.header.header, 'stamp', st))
        if resp is None or not resp.tts_resp.is_success:
            print(f'    [voz] PlayTts fallo: {None if resp is None else resp.tts_resp.error_code}')
            return False
        return True

    def decir_wav(self, texto):
        with tempfile.TemporaryDirectory() as d:
            audio = leer_wav(sintetizar_wav(texto, Path(d) / 'frase.wav'))     # -> 16 kHz mono
        self.reproducir(pcm16(audio))

    def _solicitud_foco(self, srv):
        from aimdk_msgs.msg import FocusRequester
        req = srv.Request()
        req.focus_requester = FocusRequester()
        req.focus_requester.pkg_name = PKG
        req.focus_requester.priority = 8            # el mismo al pedir y al soltar (manual)
        return req

    def reproducir(self, pcm, trozo_s=0.1):
        """Stream PCM 16 kHz mono al parlante con foco de audio, a ritmo real."""
        import rclpy
        from aimdk_msgs.msg import AudioData, AudioInfo, AudioPlayback, CommonState
        from aimdk_msgs.srv import AbandonAudioFocus, RequestAudioFocus
        resp = llamar(self.pedir_foco, self._solicitud_foco(RequestAudioFocus))
        if resp is None or resp.reponse.status.value != CommonState.SUCCESS or not resp.focus_response.focus_gain:
            print('    [voz] sin foco de audio: no se pudo hablar')
            return False
        self.foco = True
        paso = int(trozo_s * SR) * 2
        t0 = time.monotonic()
        token = f'{PKG}{int(time.time() * 1000)}'   # token nuevo = buffer limpio en el parlante
        for k, i in enumerate(range(0, len(pcm), paso)):
            if not self.foco:
                break
            msg = AudioPlayback(pkg_name=PKG, token_id=token,
                                info=AudioInfo(channels=1, sample_rate=SR), data=AudioData(data=pcm[i:i + paso]))
            self.pub.publish(msg)
            rclpy.spin_once(nodo(), timeout_sec=0)
            time.sleep(max(0.0, t0 + (k + 1) * trozo_s * 0.95 - time.monotonic()))   # un poco adelantado
        time.sleep(0.3)
        llamar(self.soltar_foco, self._solicitud_foco(AbandonAudioFocus))
        return True


class OidoX2(Oido):
    """Misma interfaz que voz.Oido (escuchar). Microfonos del robot, transcribe Whisper."""

    def __init__(self, fuente='vad', modelo=None):
        super().__init__(*([modelo] if modelo else []))
        from rclpy.qos import QoSHistoryPolicy, QoSProfile, QoSReliabilityPolicy
        qos = QoSProfile(history=QoSHistoryPolicy.KEEP_LAST, depth=500, reliability=QoSReliabilityPolicy.BEST_EFFORT)
        self.fuente, self.oyendo, self.cola, self.recibidos = fuente, False, [], 0
        if fuente == 'vad':
            from aimdk_msgs.msg import ProcessedAudioOutput
            nodo().create_subscription(ProcessedAudioOutput, '/agent/process_audio_output', self._vad, qos)
        else:
            from aimdk_msgs.msg import AudioCapture
            nodo().create_subscription(AudioCapture, '/aima/hal/audio/capture', self._crudo, qos)

    def _vad(self, msg):
        self.recibidos += 1
        if self.oyendo:
            self.cola.append((msg.audio_vad_state.value, bytes(msg.audio_data)))

    def _crudo(self, msg):
        self.recibidos += 1
        if self.oyendo:                              # intercalado S16LE, microfonos primero; usamos el 0
            ch = msg.mic_channels + msg.ref_channels
            self.cola.append(np.frombuffer(bytes(msg.data.data), '<i2')[::ch].astype(np.float32) / 32768)

    def _vaciar(self):
        """Descarta lo que llego mientras el robot hablaba."""
        import rclpy
        self.oyendo = False
        for _ in range(1000):
            antes = self.recibidos
            rclpy.spin_once(nodo(), timeout_sec=0)
            if self.recibidos == antes:
                break
        self.cola.clear()
        self.oyendo = True

    def escuchar(self, max_s=6.0, silencio=0.8, contexto=''):
        audio = self._escuchar_vad(max_s) if self.fuente == 'vad' else self._escuchar_crudo(max_s, silencio)
        if audio is None:
            if self.recibidos == 0:
                print(f'    [oido] no llega audio del robot ({self.fuente}). '
                      f'VAD: diga la palabra de activacion o use --mic crudo.')
            return ''
        return self.transcribir(audio, contexto)

    def _escuchar_vad(self, max_s, max_frase=15.0):
        """Junta un segmento BEGIN..END del VAD del robot. None si nadie empezo a hablar en max_s."""
        import rclpy
        BEGIN, END = 1, 3                            # AudioVadStateType: BEGIN 1, PROCESSING 2, END 3
        self._vaciar()
        pcm, empezo, t0 = [], False, time.monotonic()
        while time.monotonic() - t0 < (max_frase if empezo else max_s):
            rclpy.spin_once(nodo(), timeout_sec=0.05)
            while self.cola:
                estado, datos = self.cola.pop(0)
                empezo = empezo or estado == BEGIN
                if empezo:
                    pcm.append(datos)
                if empezo and estado == END:
                    return np.frombuffer(b''.join(pcm), '<i2').astype(np.float32) / 32768
        return np.frombuffer(b''.join(pcm), '<i2').astype(np.float32) / 32768 if pcm else None

    def _escuchar_crudo(self, max_s, silencio):
        import rclpy
        self._vaciar()

        def bloques():                               # re-empaqueta a trozos de 0.1 s para grabar()
            buf, n, t = np.zeros(0, np.float32), int(0.1 * SR), time.monotonic()
            while True:
                while len(buf) < n and time.monotonic() - t < 0.3:
                    rclpy.spin_once(nodo(), timeout_sec=0.02)
                    if self.cola:
                        buf = np.concatenate([buf, *self.cola])
                        self.cola.clear()
                if len(buf) < n:                     # no llega audio: silencio, para que grabar() termine a max_s
                    buf = np.concatenate([buf, np.zeros(n - len(buf), np.float32)])
                yield buf[:n]
                buf, t = buf[n:], time.monotonic()
        return grabar(bloques(), max_s, silencio)
