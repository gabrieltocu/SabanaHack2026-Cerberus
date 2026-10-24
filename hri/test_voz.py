"""Prueba de la cadena de voz en circuito cerrado (sin microfono): TTS -> WAV -> Whisper -> intencion.
Uso: python test_voz.py   (la primera vez descarga el modelo de Whisper 'base', ~145 MB)"""
import tempfile
import time
from pathlib import Path

from intenciones import CATEGORIA, DESTINO, SI_NO, entender
from voz import Oido, Voz, leer_wav

CASOS = [('Vengo a prestar un servicio, soy de Climatec', CATEGORIA, 'externo'),
         ('Vengo invitada', CATEGORIA, 'invitado'),
         ('Trabajo aquí, en la cocina', CATEGORIA, 'personal'),
         ('Voy al restaurante', DESTINO, 'salon'),
         ('Al gimnasio, por favor', DESTINO, 'gimnasio'),
         ('Sí, por favor', SI_NO, 'si'),
         ('No, gracias, conozco el camino', SI_NO, 'no')]

voz, t0 = Voz(), time.time()
oido = Oido()
print(f'modelo de voz cargado en {time.time() - t0:.1f} s')
ok = 0
with tempfile.TemporaryDirectory() as td:
    for k, (frase, opciones, esperado) in enumerate(CASOS):
        wav = voz.a_wav(frase, Path(td) / f'{k}.wav')
        t = time.time()
        texto = oido.transcribir(leer_wav(wav))
        got = entender(texto, opciones)
        ok += got == esperado
        print(f'{"OK " if got == esperado else "MAL"} "{frase}" -> oido: "{texto}" -> {got}  ({time.time() - t:.1f} s)')
print(f'{ok}/{len(CASOS)} intenciones correctas')
assert ok == len(CASOS)
print('test_voz OK')
