"""Voz del robot en espanol: hablar (voz de Windows, Microsoft Sabina es-MX) y escuchar (Whisper local).

El TTS nativo del X2 solo habla chino e ingles: para el robot real se genera el WAV aqui (a_wav) y se envia.
Escuchar: graba hasta que la persona deja de hablar (energia) y transcribe con faster-whisper, sin internet.
"""
import time
import wave
from pathlib import Path

import numpy as np

SR = 16000
MODELO_ASR = 'base'          # ponytail: 'base' es rapido en CPU; 'small' entiende mejor con ruido (mas lento)
VOCAB = 'Vengo invitado, trabajo aquí, vengo a prestar un servicio, salón, restaurante, gimnasio, piscina, sí, no.'


class Voz:
    """Voz de Windows (SAPI) en espanol. Se usa SAPI directo (comtypes): pyttsx3 se cuelga al generar WAV."""

    def __init__(self, rate=1):
        import comtypes
        import comtypes.client as cc
        comtypes.CoInitialize()                  # necesario en cada hilo que use SAPI
        self.cc = cc
        self.v = cc.CreateObject('SAPI.SpVoice')
        voces = self.v.GetVoices()
        for i in range(voces.Count):
            if 'sabina' in voces.Item(i).GetDescription().lower() or 'spanish' in voces.Item(i).GetDescription().lower():
                self.v.Voice = voces.Item(i)
                break
        self.v.Rate = rate                       # -10 .. 10

    def decir(self, texto):
        self.v.AudioOutputStream = None
        self.v.Speak(texto)

    def a_wav(self, texto, path):
        """WAV 16 kHz mono 16 bits (el formato que reproduce el X2) con la frase."""
        stream = self.cc.CreateObject('SAPI.SpFileStream')
        fmt = self.cc.CreateObject('SAPI.SpAudioFormat')
        fmt.Type = 18                            # SAFT16kHz16BitMono
        stream.Format = fmt
        stream.Open(str(Path(path).resolve()), 3)  # SSFMCreateForWrite (SAPI pide ruta absoluta de Windows)
        self.v.AudioOutputStream = stream
        self.v.Speak(texto)
        stream.Close()
        self.v.AudioOutputStream = None
        return Path(path)


def leer_wav(path):
    """-> audio float32 mono a 16 kHz."""
    with wave.open(str(path)) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != SR:
        x = np.interp(np.arange(0, len(x) * SR / sr) * sr / SR, np.arange(len(x)), x).astype(np.float32)
    return x


def grabar(bloques, max_s=6.0, silencio=0.8):
    """bloques: iterador de trozos de 0.1 s (float32 mono 16 kHz). Corta tras `silencio` s sin voz o a max_s.
    -> audio, o None si nadie hablo. Los 3 primeros trozos miden el ruido del ambiente."""
    ruido = np.sqrt(np.mean(np.concatenate([next(bloques) for _ in range(3)]) ** 2)) + 1e-4
    audio, hablo, quieto = [], False, 0.0
    for _ in range(int(max_s / 0.1)):
        x = next(bloques)
        audio.append(x)
        voz = np.sqrt(np.mean(x ** 2)) > max(3 * ruido, 0.01)
        hablo = hablo or voz
        quieto = 0.0 if voz else quieto + 0.1
        if hablo and quieto >= silencio:
            break
    return np.concatenate(audio) if hablo else None


class Oido:
    def __init__(self, modelo=MODELO_ASR):
        from faster_whisper import WhisperModel
        self.m = WhisperModel(modelo, device='cpu', compute_type='int8')

    def transcribir(self, audio, contexto=''):
        segs, _ = self.m.transcribe(audio, language='es', beam_size=1, vad_filter=False,
                                    initial_prompt=f'{VOCAB} {contexto}'.strip())
        return ' '.join(s.text for s in segs).strip()

    def escuchar(self, max_s=6.0, silencio=0.8, contexto=''):
        """Graba del microfono del PC hasta que la persona deja de hablar. -> texto ('' si nadie hablo)."""
        import sounddevice as sd
        bloque = int(0.1 * SR)
        with sd.InputStream(samplerate=SR, channels=1, dtype='float32', blocksize=bloque) as st:
            audio = grabar(iter(lambda: st.read(bloque)[0][:, 0], None), max_s, silencio)
        return '' if audio is None else self.transcribir(audio, contexto)


class Hablante:
    """Dice frases en un hilo aparte (para la simulacion: la fisica no se congela mientras habla)."""

    def __init__(self):
        import queue
        import threading
        self.q = queue.Queue()
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        voz = Voz()                       # pyttsx3/SAPI debe crearse en el hilo que habla
        while True:
            voz.decir(self.q.get())

    def decir(self, texto):
        self.q.put(texto)
