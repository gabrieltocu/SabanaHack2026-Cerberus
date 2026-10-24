"""Prueba sin robot de voz_x2: ROS y aimdk_msgs falsos; voz de Windows y Whisper reales.
Cubre: TTS ok, TTS falla -> plan B WAV por stream, escuchar por VAD y por microfono crudo. python hri/test_voz_x2.py
"""
import sys
import tempfile
import types
from pathlib import Path
from types import SimpleNamespace as NS

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))


class Msg(NS):
    class Request(NS):
        def __init__(self):
            super().__init__(header=NS(header=NS()), tts_req=NS(), focus_requester=None)


class Fut:
    def __init__(self, r):
        self.r = r

    def done(self):
        return True

    def result(self):
        return self.r


class Nodo:
    def __init__(self):
        self.subs, self.pend, self.publicados, self.respuestas = {}, [], [], {}

    def get_clock(self):
        return NS(now=lambda: NS(to_msg=lambda: 'stamp'))

    def create_client(self, tipo, nombre):
        return NS(call_async=lambda req: Fut(self.respuestas[nombre](req)))

    def create_publisher(self, tipo, nombre, qos):
        return NS(publish=self.publicados.append)

    def create_subscription(self, tipo, nombre, cb, qos):
        self.subs[nombre] = cb


nodo = Nodo()
rclpy = types.ModuleType('rclpy')
rclpy.init = lambda: None
rclpy.create_node = lambda n: nodo
rclpy.spin_until_future_complete = lambda n, f, timeout_sec: None


def spin_once(n, timeout_sec=0):
    if nodo.pend:
        nombre, m = nodo.pend.pop(0)
        nodo.subs[nombre](m)


rclpy.spin_once = spin_once
qos = types.ModuleType('rclpy.qos')
qos.QoSProfile = lambda **k: k
qos.QoSHistoryPolicy = qos.QoSReliabilityPolicy = qos.QoSDurabilityPolicy = NS(
    KEEP_LAST=1, BEST_EFFORT=2, RELIABLE=1, VOLATILE=2)
aim = types.ModuleType('aimdk_msgs')
aim.msg = types.ModuleType('aimdk_msgs.msg')
aim.srv = types.ModuleType('aimdk_msgs.srv')
for n in ['AudioPlayback', 'AudioInfo', 'AudioData', 'FocusResponse', 'FocusRequester', 'TtsPriorityLevel',
          'ProcessedAudioOutput', 'AudioCapture']:
    setattr(aim.msg, n, Msg)
aim.msg.CommonState = NS(SUCCESS=1)
for n in ['PlayTts', 'RequestAudioFocus', 'AbandonAudioFocus']:
    setattr(aim.srv, n, Msg)
sys.modules.update({'rclpy': rclpy, 'rclpy.qos': qos, 'aimdk_msgs': aim,
                    'aimdk_msgs.msg': aim.msg, 'aimdk_msgs.srv': aim.srv})

import voz_x2  # noqa: E402
from voz import Voz, leer_wav  # noqa: E402

voz_x2.CPS = 1e6                                       # sin esperar en la prueba
tts_ok = {'v': True}
pedidos = []
nodo.respuestas = {
    '/aimdk_5Fmsgs/srv/PlayTts': lambda r: pedidos.append(r.tts_req.text) or NS(
        tts_resp=NS(is_success=tts_ok['v'], error_code=1)),
    '/aimdk_5Fmsgs/srv/RequestAudioFocus': lambda r: NS(reponse=NS(status=NS(value=1)),
                                                        focus_response=NS(focus_gain=True)),
    '/aimdk_5Fmsgs/srv/AbandonAudioFocus': lambda r: NS(reponse=NS(status=NS(value=1))),
}

v = voz_x2.VozX2()
v.decir('Hola Carlos, bienvenido.')
assert pedidos == ['Hola Carlos, bienvenido.'] and not nodo.publicados, 'TTS ok: habla el robot, sin WAV'

tts_ok['v'] = False
v.decir('Buenos días, señora Restrepo.')
pcm = b''.join(m.data.data for m in nodo.publicados)
assert len(pcm) > 16000 * 2 * 0.5 and all(m.info.sample_rate == 16000 for m in nodo.publicados), 'plan B: WAV'
assert len({m.token_id for m in nodo.publicados}) == 1
print(f'plan B: {len(nodo.publicados)} trozos, {len(pcm) / 32000:.1f} s de audio')

frase = Path(tempfile.mkdtemp()) / 'r.wav'
audio = leer_wav(Voz().a_wav('Voy al restaurante.', frase))
pcm = voz_x2.pcm16(audio)
o = voz_x2.OidoX2('vad')
nodo.pend = [('/agent/process_audio_output', NS(audio_vad_state=NS(value=2), audio_data=b'\0' * 640))]  # viejo
o.recibidos = 0


def vad_tras_vaciar():                                 # llega cuando ya escucha (despues de _vaciar)
    trozos = [pcm[i:i + 3200] for i in range(0, len(pcm), 3200)]
    nodo.pend += [('/agent/process_audio_output', NS(audio_vad_state=NS(value=1 if i == 0 else 2), audio_data=t))
                  for i, t in enumerate(trozos)]
    nodo.pend.append(('/agent/process_audio_output', NS(audio_vad_state=NS(value=3), audio_data=b'')))


vaciar = o._vaciar
o._vaciar = lambda: (vaciar(), vad_tras_vaciar())
texto = o.escuchar(contexto='¿A dónde se dirige hoy?')
print(f'VAD -> "{texto}"')
assert 'restaurante' in texto.lower()

o = voz_x2.OidoX2('crudo')
o._vaciar = lambda: (vaciar.__func__(o), _crudo())
ruido = (np.random.default_rng(0).normal(0, 0.002, 16000)).astype(np.float32)
senal = np.concatenate([ruido[:4800], audio, ruido])


def _crudo():                                          # 6 canales intercalados (4 mic + 2 ref), mic 0 = la voz
    for i in range(0, len(senal), 480):
        x = np.zeros((len(senal[i:i + 480]), 6), '<i2')
        x[:, 0] = (senal[i:i + 480] * 32767).astype('<i2')
        nodo.pend.append(('/aima/hal/audio/capture', NS(mic_channels=4, ref_channels=2, data=NS(data=x.tobytes()))))


texto = o.escuchar(contexto='¿A dónde se dirige hoy?')
print(f'crudo -> "{texto}"')
assert 'restaurante' in texto.lower()
print('OK voz_x2')
