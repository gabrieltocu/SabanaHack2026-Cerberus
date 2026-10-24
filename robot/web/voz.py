"""Voz de Cerberus: entiende lo que dice el visitante (Whisper local) en espanol, ingles, mandarin o portugues.

transcribe(audio_bytes, current_lang) -> dict(texto, idioma, confianza, cambio_idioma)
    Whisper large-v3-turbo en la GPU del Mac (mlx-whisper, ~0.8 s por frase en un M5; mucho mas preciso que 'small' con
    el audio lejano del robot). Sin mlx (o CERBERUS_STT=faster): faster-whisper en CPU (CERBERUS_WHISPER, 'small').
    Detecta el idioma entre los 4 de Cerberus; solo cambia si la frase es clara: una palabra suelta no lo cambia.
understand(text, lang, switched) -> dict(intencion, respuesta, nombre?)
    Intenciones por palabras clave en los 4 idiomas (comandos y preguntas tipicas de la recepcion). Las paginas deciden
    que hacer con cada intencion (empezar la camara, "no tengo cedula", etc.).
El modelo se descarga solo la primera vez (~1.6 GB a ~/.cache/huggingface).
"""
import concurrent.futures
import io
import math
import os
import random
import re
import sys
import threading
import types
import unicodedata

import rag
import textos

MODEL_SIZE = os.environ.get('CERBERUS_WHISPER', 'small')
MLX_REPO = os.environ.get('CERBERUS_WHISPER_MLX', 'mlx-community/whisper-large-v3-turbo')
# shortcut: con voz sintetica la clara daba -0.1 a -0.4, pero los microfonos lejanos del robot bajan frases claras a
# ~ -0.7: solo lo muy dudoso pide repetir. Recalibrar con la confianza (exp) que imprime el log OYO del robot
DUDOSA_LP = -1.0         # log-probabilidad media de Whisper por debajo de esto: oyo mal, pide que se lo repitan
PROMPT = 'Juan, N Club.'   # contexto para Whisper: el nombre del robot y del club se escriben bien
HOTWORDS = 'Juan'          # el nombre del robot: Whisper lo reconoce mejor si se lo anuncian
SWITCH_PROB = 0.9       # espanol por defecto: solo una frase clara en otro idioma lo cambia
_model, _model_lock, _run_lock = None, threading.Lock(), threading.Lock()   # una transcripcion a la vez
_mlx_hilo = concurrent.futures.ThreadPoolExecutor(1)   # MLX ata la GPU al hilo que cargo el modelo: siempre el mismo

# Whisper inventa estas frases con ruido o silencio (subtitulos de su entrenamiento): se descartan
HALLUCINATIONS = ('gracias por ver', 'subtitulos', 'subtitulado', 'amara.org', 'thanks for watching', 'thank you for watching',
                  'obrigado por assistir', 'legendas', '字幕', '请不吝点赞', 'suscribete', 'subscribe')

# (intencion, palabras clave sin tildes en minusculas; el mandarin tal cual). El orden importa: la primera que coincide gana.
INTENTS = [
    ('no_entiendo', ('no entiendo', 'no comprendo', 'no te entiendo', "don't understand", 'do not understand', 'dont understand',
                     "can't understand", 'nao entendo', 'nao compreendo', '听不懂', '不明白', '不懂')),
    ('chiste', ('chiste', 'broma', 'gracioso', 'graciosa', 'chistoso', 'divertido', 'hazme reir', 'joke', 'make me laugh',
                'funny', 'piada', 'engracad', 'me faz rir', '笑话', '逗我', '好笑')),
    ('curioso', ('dato curioso', 'curiosidad', 'algo interesante', 'sabias que', 'fun fact', 'curious fact',
                 'something interesting', 'curiosidade', 'algo interessante', '有趣的事', '冷知识')),
    ('quien', ('como te llamas', 'te llamas', 'tu nombre', 'como se llama usted', 'su nombre', 'quien eres', 'quien es usted',
               'your name', 'who are you', 'what are you called', 'como voce se chama', 'seu nome', 'teu nome',
               'quem e voce', 'quem voce e', 'quem es', '你叫什么', '你的名字', '你是谁', '您是谁', '您叫什么')),
    ('sin_documento', ('no tengo', 'sin cedula', 'sin documento', "don't have", 'do not have', 'dont have', 'no id',
                       'nao tenho', 'sem documento', '没有')),
    ('iniciar', ('empezar', 'empieza', 'iniciar', 'inicia', 'comenzar', 'comienza', 'arrancar', 'enciende', 'start', 'begin',
                 'turn on', 'comecar', 'comeca', 'ligar', '开始', '启动')),
    ('detener', ('detener', 'detente', 'parar', 'apagar', 'apaga', 'stop', 'turn off', 'pause', 'desligar', '停止', '暂停')),
    ('volver', ('volver', 'regresar', 'go back', 'voltar', '返回')),
    ('validacion', ('validacion', 'validar', 'validation', 'validate', 'validacao', '验证')),
    ('enrolamiento', ('enrolamiento', 'enrolar', 'tomar fotos', 'tomame', 'capturar', 'registrarme', 'enroll', 'take photos',
                      'take my photo', 'capture', 'cadastrar', 'cadastro', 'tirar fotos', '注册', '拍照')),
    ('evaluar', ('evaluar', 'evaluacion', 'evaluate', 'evaluation', 'avaliar', 'avaliacao', '评估')),
    ('bano', ('bano', 'sanitario', 'restroom', 'bathroom', 'toilet', 'washroom', 'banheiro', '洗手间', '厕所', '卫生间')),
    ('restaurante', ('restaurante', 'comer', 'comida', 'hambre', 'restaurant', 'eat', 'food', 'hungry', 'fome', '餐厅',
                     '吃饭', '饿')),
    ('tenis', ('tenis', 'tennis', '网球')),                 # sin tildes: tenis, ténis y tênis son lo mismo
    ('despedida', ('adios', 'chao', 'chau', 'hasta luego', 'hasta pronto', 'hasta manana', 'nos vemos', 'ya me voy',
                   'me voy ya', 'bye', 'see you', 'i am leaving', "i'm leaving", 'tchau', 'ate logo', 'ate mais',
                   'ate amanha', 'vou embora', '再见', '拜拜')),
    ('recepcion', ('recepcion', 'recepcionista', 'humano', 'reception', 'receptionist', 'human', 'recepcao', 'atendente',
                   '前台', '人工')),
    ('ayuda', ('ayuda', 'ayudame', 'que puedes', 'help', 'what can you', 'ajuda', 'ajude', '帮助', '帮忙')),
    ('vip', ('vip',)),
    ('invitado', ('invitad', 'me invito', 'guest', 'invited', 'convidad', '客人', '邀请')),
    ('trabajo', ('trabajo aqui', 'empleado', 'soy del personal', 'personal del club', 'i work here', 'staff', 'employee',
                 'trabalho aqui', 'funcionari', '员工', '我在这里工作')),
    ('servicio', ('mantenimiento', 'servicio', 'tecnico', 'reparar', 'contratista', 'maintenance', 'repair', 'contractor',
                  'technician', 'manutencao', 'servico', '维修', '技术员')),
    ('socio', ('socio', 'miembro', 'member', 'membro', '会员')),
    ('gracias', ('gracias', 'thank', 'obrigad', '谢谢')),
    ('saludo', ('hola', 'buenos dias', 'buenas', 'hello', ' hi ', 'hey', 'good morning', ' ola ', ' oi ', 'bom dia', '你好', '您好')),
]
# "no tengo documento" dicho de cualquier forma (Whisper a veces mete palabras: "nao ou tenho documento")
NEGATION = {'no', 'nao', 'not', "don't", 'dont', 'sin', 'sem', 'without', 'nunca'}
DOC_WORDS = ('cedula', 'documento', ' pase', ' passe', 'identidad', 'identidade', 'identificacion', ' id ', ' pass ', 'carne')   # ' id ' no es 'ido'
# "no te entiendo" dicho de muchas formas (sobre el texto sin tildes): es la senal de que esta en el idioma equivocado
NO_ENTIENDO = re.compile(r"\bno( \w+){0,2} (entiend|entend|comprend)"            # no (te) (estoy) entendiendo
                         r"|\b(do not|don't|dont|not|can't|cannot|cant)( \w+){0,2} (understand|follow)"
                         r"|\bnao( \w+){0,2} (entend|compreend)"                  # Whisper mete palabras: "nao o estou entendendo"
                         r"|听不懂|不明白|不懂|没听懂")
# Numero de cedula dicho en voz alta. Whisper lo escribe en digitos ("1077723584", "10 77 72 35 84", "1.077.723.584")
# o en palabras ("diez setenta y siete setenta y dos..."): la racha mas larga de numeros seguidos, si tiene 6 a 10 digitos.
NUMEROS = {'cero': '0', 'uno': '1', 'un': '1', 'una': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
           'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'diez': '10', 'once': '11', 'doce': '12', 'trece': '13',
           'catorce': '14', 'quince': '15', 'dieciseis': '16', 'diecisiete': '17', 'dieciocho': '18', 'diecinueve': '19',
           'veinte': '20', 'veintiuno': '21', 'veintiun': '21', 'veintidos': '22', 'veintitres': '23', 'veinticuatro': '24',
           'veinticinco': '25', 'veintiseis': '26', 'veintisiete': '27', 'veintiocho': '28', 'veintinueve': '29',
           'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7',
           'eight': '8', 'nine': '9', 'um': '1', 'dois': '2', 'quatro': '4', 'sete': '7', 'oito': '8', 'nove': '9'}
NUMEROS.update({'零': '0', '〇': '0', '一': '1', '幺': '1', '二': '2', '两': '2', '三': '3', '四': '4', '五': '5',
                '六': '6', '七': '7', '八': '8', '九': '9'})
DECENAS = {'treinta': '3', 'cuarenta': '4', 'cincuenta': '5', 'sesenta': '6', 'setenta': '7', 'ochenta': '8', 'noventa': '9'}


def cedula_en(text):
    """-> el numero de cedula que se dijo (6 a 10 digitos, sin ceros a la izquierda) o None."""
    p = re.sub(r'(?<=\d)[ .,-](?=\d)', '', plain(text or ''))   # 1.077.723.584 / 10 77 72 -> una sola cifra
    rachas, actual, tokens, i = [], '', re.findall(r'\d+|[a-z]+|[零〇一幺二两三四五六七八九]|[\u4e00-\u9fff]', p), 0
    while i < len(tokens):
        t = tokens[i]
        if t.isdigit() or t in NUMEROS:
            actual += t if t.isdigit() else NUMEROS[t]
        elif t in DECENAS:                              # "setenta y siete" -> 77 (consume "y siete"); "setenta" -> 70
            unidad = tokens[i + 2] if i + 2 < len(tokens) and tokens[i + 1] == 'y' else ''
            if unidad in NUMEROS and len(NUMEROS[unidad]) == 1:
                actual, i = actual + DECENAS[t] + NUMEROS[unidad], i + 2
            else:
                actual += DECENAS[t] + '0'
        else:
            rachas.append(actual)
            actual = ''
        i += 1
    n = max(rachas + [actual], key=len).lstrip('0')
    return n if 6 <= len(n) <= 10 else None


NAME = re.compile(r'(?:me llamo|mi nombre es|my name is|meu nome e|me chamo)\s+([a-zñ ]{2,40})|(?:我叫|我的名字是)(\S{1,8})')
REPLY = {'bano': 'voz.bano', 'restaurante': 'voz.restaurante', 'ayuda': 'voz.ayuda', 'recepcion': 'voz.recepcion',
         'gracias': 'voz.gracias', 'invitado': 'voz.invitado', 'trabajo': 'voz.trabajo', 'servicio': 'voz.servicio',
         'sin_documento': 'voz.sin_documento', 'saludo': 'voz.saludo', 'tenis': 'voz.tenis_si',
         'despedida': 'voz.despedida', 'llamado': 'voz.llamado', 'quien': 'voz.quien'}
# El robot se llama Juan en los 4 idiomas: solo atiende lo que empieza o lleva su nombre (Whisper lo escribe de varias
# formas segun el idioma que detecta). Asi no contesta a las conversaciones de alrededor.
NOMBRE_ROBOT = re.compile(r'\b(juan|juancho|juanito|huan|joan|john|jwan|wan)\b|胡安|璜|胡萬|胡万')
# Respuesta a una pregunta de si o no del robot (contexto='tenis': "¿quieres ir a la cancha de tenis?"). Por palabras
# enteras: 'no' como subcadena esta en "nombre" o "buenos". El mandarin no separa palabras: se busca el caracter.
SI = {'si', 'claro', 'dale', 'bueno', 'vamos', 'listo', 'quiero', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'please',
      'sim', 'quero', 'pode', 'beleza'}
NO = {'no', 'nop', 'nope', 'nah', 'nao', 'not', 'nunca', 'luego', 'despues', 'later'}


def plain(text):
    """minusculas y sin tildes (el mandarin no cambia)."""
    s = unicodedata.normalize('NFD', text.lower())
    return ' '.join(''.join(c for c in s if unicodedata.category(c) != 'Mn').replace('¿', ' ').replace('¡', ' ').split())


def mlx():
    """mlx_whisper, o None si no esta (o CERBERUS_STT=faster). Solo usa scipy.signal para marcas de tiempo por palabra,
    que aqui no se piden; en este macOS el scipy del entorno no carga (PROPACK), asi que se reemplaza por un modulo vacio."""
    if os.environ.get('CERBERUS_STT') == 'faster':
        return None
    try:
        import scipy.signal  # noqa: F401
    except ImportError:
        sys.modules['scipy.signal'] = types.ModuleType('scipy.signal')
    try:
        import mlx_whisper
        return mlx_whisper
    except ImportError:
        return None


def model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel
            # hilos explicitos: en el mismo proceso que torch/YOLO, sin esto Whisper pasa de ~2 s a ~6 s por frase
            threads = int(os.environ.get('CERBERUS_WHISPER_HILOS', min(8, os.cpu_count() or 4)))
            _model = WhisperModel(MODEL_SIZE, device='cpu', compute_type='int8', cpu_threads=threads)
        return _model


def warm_up():
    m = mlx()
    if m:
        import numpy as np
        _mlx_hilo.submit(m.transcribe, np.zeros(16000, np.float32), path_or_hf_repo=MLX_REPO, language='es').result()
    else:
        model()


def _text(segs):
    text = ' '.join(s.text.strip() for s in segs if s.no_speech_prob < 0.6 and s.avg_logprob > -1.2).strip()
    palabras = re.findall(r'\w+', plain(text))
    if any(h in plain(text) for h in HALLUCINATIONS) or palabras == re.findall(r'\w+', plain(PROMPT)):
        return ''                                       # inventado sobre ruido o el contexto repetido tal cual
    if len(palabras) >= 6 and len(set(palabras)) < len(palabras) / 2:
        return ''                                       # "en el dia de hoy, en el dia de hoy...": Whisper en bucle
    return text


def transcribe(audio, current_lang='es', detectar=True):
    """-> dict(texto, idioma, confianza, cambio_idioma, detectado, texto_detectado). 'detectado' es el idioma mas probable
    de los 4 aunque no llegue a SWITCH_PROB, y 'texto_detectado' lo dicho transcrito en ese idioma (para listen())."""
    from faster_whisper import decode_audio
    current_lang = textos.lang_of(current_lang)
    pcm = decode_audio(io.BytesIO(audio), sampling_rate=16000)
    if len(pcm) < 16000 * 0.3:                             # menos de 0.3 s: nada que entender
        return dict(texto='', idioma=current_lang, confianza=0.0, cambio_idioma=False, detectado=current_lang, texto_detectado='')
    m = mlx()
    if m:
        return _mlx_hilo.submit(_transcribe_mlx, m, pcm, current_lang, detectar).result()
    m = model()
    with _run_lock:
        segs, info = m.transcribe(pcm, language=None, beam_size=1, vad_filter=True, hotwords=HOTWORDS)
        ours = {k: v for k, v in (info.all_language_probs or []) if k in textos.IDIOMAS}
        best = max(ours, key=ours.get) if ours else current_lang
        prob = ours.get(best, 0.0)
        if info.language != best:                          # Whisper eligio un idioma fuera de los 4: se transcribe en el mejor
            segs, info = m.transcribe(pcm, language=best, beam_size=1, vad_filter=True, hotwords=HOTWORDS)
        auto = _text(segs)
        clara = len(auto.split()) >= 3 or (best == 'zh' and len(auto) >= 4)   # ruido o una palabra suelta: no cambia
        lang = best if prob >= SWITCH_PROB and clara else current_lang
        text = auto if lang == best else _text(m.transcribe(pcm, language=lang, beam_size=1, vad_filter=True,
                                                            hotwords=HOTWORDS)[0])
    return dict(texto=text, idioma=lang, confianza=round(prob, 3), cambio_idioma=bool(text) and lang != current_lang,
                detectado=best, texto_detectado=auto)


_recientes = {}


def elige(lang, clave):
    """Un chiste o dato curioso (textos voz.chiste / voz.curioso) que no se haya dicho entre los ultimos de su lista."""
    opciones = textos.t(lang, f'voz.{clave}').split(' | ')
    vistos = _recientes.setdefault((lang, clave), [])
    frase = random.choice([o for o in opciones if o not in vistos] or opciones)
    vistos.append(frase)
    del vistos[:-max(1, len(opciones) // 2)]
    return frase


def _transcribe_mlx(m, pcm, current_lang, detectar=True):
    seguridad = {}

    def run(lang):
        r = m.transcribe(pcm, path_or_hf_repo=MLX_REPO, language=lang, condition_on_previous_text=False,
                         initial_prompt=PROMPT, temperature=(0.0, 0.2, 0.4))
        segs = [types.SimpleNamespace(text=x['text'], no_speech_prob=x.get('no_speech_prob', 0.0),
                                      avg_logprob=x.get('avg_logprob', 0.0)) for x in r.get('segments', [])]
        lps = [s.avg_logprob for s in segs if s.no_speech_prob < 0.6]
        seguridad['lp'] = sum(lps) / len(lps) if lps else -9.0   # log-probabilidad media: que tan seguro esta Whisper
        return _text(segs), r.get('language') or lang
    with _run_lock:
        if not detectar:                                   # idioma fijado (la app): una pasada, mas precisa y rapida
            text = run(current_lang)[0]
            return dict(texto=text, idioma=current_lang, confianza=round(math.exp(seguridad['lp']), 3), cambio_idioma=False,
                        detectado=current_lang, texto_detectado=text, dudosa=bool(text) and seguridad['lp'] < DUDOSA_LP)
        auto, best = run(None)
        if best not in textos.IDIOMAS:                     # un idioma fuera de los 4: se transcribe en el actual
            auto, best = run(current_lang)
        clara = len(auto.split()) >= 2 or (best == 'zh' and len(auto) >= 2)   # una palabra suelta (o ruido): no cambia
        lang = best if clara else current_lang
        text = auto if lang == best else run(lang)[0]
    return dict(texto=text, idioma=lang, confianza=1.0 if clara else 0.5, cambio_idioma=bool(text) and lang != current_lang,
                detectado=best, texto_detectado=auto)


def listen(audio, current_lang='es', contexto=None, quien=None, detectar=True):
    """transcribe + understand. Si la persona dice que no entiende ("no te estoy entendiendo", "I don't understand"),
    se pasa al idioma en que lo dijo aunque la deteccion no sea segura: esa frase es justo la senal del idioma equivocado."""
    r = transcribe(audio, current_lang, detectar)
    if r['detectado'] != r['idioma'] and NO_ENTIENDO.search(plain(r['texto_detectado'])):
        r.update(texto=r['texto_detectado'], idioma=r['detectado'], cambio_idioma=True)
    u = understand(r['texto'], r['idioma'], r['cambio_idioma'], contexto)
    if r.get('dudosa') and u['intencion'] not in ('saludo', 'llamado', 'gracias', 'cedula', 'tenis_si', 'tenis_no'):
        return {**r, **u, 'intencion': 'repetir', 'respuesta': textos.t(r['idioma'], 'voz.repetir')}   # mal oido: no adivina
    if u['intencion'] in ('chiste', 'curioso'):           # del banco curado (el 7B no es gracioso): sin repetir
        u['respuesta'] = elige(r['idioma'], u['intencion'])
    elif rag.ACTIVO and u['intencion'] == 'no_entendi' and len(r['texto'].split()) >= 2:   # pregunta real: el RAG
        respuesta = rag.preguntar(r['texto'], r['idioma'], quien)   # quien: rag.visitante() o None
        if respuesta:
            u.update(intencion='rag', respuesta=respuesta)
    if u['intencion'] == 'no_entendi' and len(r['texto'].split()) >= 2:   # una frase que no entendio: que la repita
        u.update(intencion='repetir', respuesta=textos.t(r['idioma'], 'voz.repetir'))
    return {**r, **u}


def understand(text, lang, switched=False, contexto=None):
    """+ llamado: si la frase nombra al robot ("Juan, ¿dónde está el baño?"). Solo "Juan": intencion 'llamado'."""
    lang = textos.lang_of(lang)
    llamado = bool(NOMBRE_ROBOT.search(plain(text or '')))
    if llamado and not re.sub(r'[\W_]+', '', NOMBRE_ROBOT.sub('', plain(text))):
        return dict(intencion='llamado', respuesta=textos.t(lang, 'voz.llamado'), llamado=True)
    return {**_understand(text, lang, switched, contexto), 'llamado': llamado}


def _understand(text, lang, switched=False, contexto=None):
    if not text:
        return dict(intencion=None, respuesta='')
    numero = cedula_en(text)
    if numero:                                          # dijo su cedula: la confirma el cerebro (app.py), no se repite
        return dict(intencion='cedula', numero=numero, respuesta='')
    p = ' ' + re.sub(r'[,.;:!?]', ' ', plain(text)) + ' '   # palabras enteras: ' ola ' no esta en 'chocolate'
    m = NAME.search(p) or NAME.search(text)
    if m:
        name = (m.group(1) or m.group(2)).strip().title()
        return dict(intencion='nombre', nombre=name, respuesta=textos.t(lang, 'voz.nombre', nombre=name))
    words = set(p.replace('?', ' ').replace(',', ' ').replace('.', ' ').split())
    if NO_ENTIENDO.search(p) or any(w in p for w in INTENTS[0][1]):   # "no entiendo" gana a la regla de la negacion
        intent = 'no_entiendo'
    elif (words & NEGATION and any(w in ' ' + p for w in DOC_WORDS)) or ('没' in p and any(w in p for w in ('证', '通行'))):
        intent = 'sin_documento'
    else:
        intent = next((i for i, kw in INTENTS if any(w in p for w in kw)), 'no_entendi')
    if contexto == 'tenis' and intent in ('tenis', 'no_entendi', 'gracias', 'saludo'):   # "no, gracias" responde a la pregunta
        if words & NO or '不' in p:
            return dict(intencion='tenis_no', respuesta=textos.t(lang, 'voz.tenis_no'))
        if intent == 'tenis' or words & SI or any(c in p for c in '好是要'):
            return dict(intencion='tenis_si', respuesta=textos.t(lang, 'voz.tenis_si'))
    reply = textos.t(lang, REPLY[intent]) if intent in REPLY else ''
    if intent == 'no_entendi':
        reply = textos.t(lang, 'voz.no_entendi')
    if intent == 'no_entiendo':                            # no entiende el idioma o lo que se le dijo: explicar
        reply = textos.t(lang, 'voz.ayuda')
    if switched and intent in ('saludo', 'no_entendi', 'no_entiendo'):
        reply = f"{textos.t(lang, 'voz.idioma')} {textos.t(lang, 'voz.saludo' if intent == 'saludo' else 'voz.ayuda')}"
    return dict(intencion=intent, respuesta=reply)


def autotest():
    """Comprende frases tipicas en los 4 idiomas; con --audio ademas sintetiza voz con `say` (macOS) y la transcribe."""
    cases = [('Hola, no tengo cédula', 'es', 'sin_documento'), ("I don't have an ID", 'en', 'sin_documento'),
             ('Não tenho documento', 'pt', 'sin_documento'), ('我没有身份证', 'zh', 'sin_documento'),
             ('Empezar', 'es', 'iniciar'), ('Start', 'en', 'iniciar'), ('开始', 'zh', 'iniciar'),
             ('¿Dónde está el baño?', 'es', 'bano'), ('Where is the restroom?', 'en', 'bano'),
             ('Onde fica o banheiro?', 'pt', 'bano'), ('洗手间在哪里？', 'zh', 'bano'),
             ('Vengo invitado por Andrés', 'es', 'invitado'), ('I work here', 'en', 'trabajo'),
             ('Vengo a hacer mantenimiento', 'es', 'servicio'), ('Hola', 'es', 'saludo'), ('Obrigado', 'pt', 'gracias'),
             ('Quiero la validación', 'es', 'validacion'), ('Para ir al restaurante', 'es', 'restaurante'),
             ('Detente', 'es', 'detener'), ('asdf qwer', 'es', 'no_entendi'),
             ('¿Cómo te llamas?', 'es', 'quien'), ('What is your name?', 'en', 'quien'), ('Qual é o seu nome?', 'pt', 'quien'),
             ('你叫什么名字？', 'zh', 'quien'), ('Juan, ¿quién eres?', 'es', 'quien'),
             ('Bom dia, não ou tenho documento.', 'pt', 'sin_documento'), ('Sorry, no ID with me', 'en', 'sin_documento'),
             ('Aquí está mi cédula', 'es', 'no_entendi'), ('No sé dónde está el baño', 'es', 'bano'),
             ('I do not understand', 'en', 'no_entiendo'), ('Não entendo nada', 'pt', 'no_entiendo'), ('我听不懂', 'zh', 'no_entiendo'),
             ('No entiendo', 'es', 'no_entiendo'), ('No te estoy entendiendo', 'es', 'no_entiendo'),
             ('No entendí nada', 'es', 'no_entiendo'), ("I'm not understanding you", 'en', 'no_entiendo'),
             ('Não estou entendendo', 'pt', 'no_entiendo'), ('No sé, no entiendo la pregunta', 'es', 'no_entiendo'),
             ('Não o estou entendendo.', 'pt', 'no_entiendo'), ("I'm not really understanding", 'en', 'no_entiendo')]
    for text, lang, want in cases:
        got = understand(text, lang)
        assert got['intencion'] == want, (text, want, got)
        assert bool(got['respuesta']) == (want in REPLY or want in ('no_entendi', 'no_entiendo')), (text, got)   # comandos: la pagina
    for text, lang, want in (('Juan', 'es', 'llamado'), ('胡安', 'zh', 'llamado'), ('John!', 'en', 'llamado'),
                             ('Juan, ¿dónde está el baño?', 'es', 'bano'), ('Adiós, Juan', 'es', 'despedida'),
                             ('Goodbye John', 'en', 'despedida'), ('Tchau, Juan', 'pt', 'despedida'), ('再见', 'zh', 'despedida')):
        got = understand(text, lang)
        assert got['intencion'] == want and got['respuesta'], (text, got)
    assert understand('Juan, hola', 'es')['llamado'] and not understand('Hola a todos', 'es')['llamado']
    assert not understand('I want water', 'en')['llamado']                   # "want" no es el nombre
    n = understand('Hola, me llamo Ana Pérez', 'es')
    assert n['intencion'] == 'nombre' and n['nombre'] == 'Ana Perez', n
    assert understand('我叫小明', 'zh')['nombre'] == '小明'
    assert understand('Hello', 'en', switched=True)['respuesta'].startswith('Great, I will continue in English.')
    assert understand('I do not understand', 'en', switched=True)['respuesta'].startswith('Great, I will continue in English. I can')
    assert understand('', 'es')['intencion'] is None
    for dicho, n in (('mi cédula es 1077723584', '1077723584'), ('1.031.640.666', '1031640666'), ('10 77 72 35 84', '1077723584'),
                     ('diez setenta y siete setenta y dos treinta y cinco ochenta y cuatro', '1077723584'),
                     ('uno cero siete siete siete dos tres cinco ocho cuatro', '1077723584'),
                     ('my id is one zero three one six four zero six six six', '1031640666')):
        u = understand(dicho, 'es')
        assert u['intencion'] == 'cedula' and u['numero'] == n, (dicho, u)
    for no in ('tengo 2 hijos y 3 perros', 'un momento por favor', 'son las 10 y 30'):
        assert understand(no, 'es')['intencion'] != 'cedula', no
    for text, lang, want in (('Sí, claro', 'es', 'tenis_si'), ('No, gracias', 'es', 'tenis_no'), ('Yes please', 'en', 'tenis_si'),
                             ('Não, obrigado', 'pt', 'tenis_no'), ('好的', 'zh', 'tenis_si'), ('不用了', 'zh', 'tenis_no'),
                             ('Vamos a la cancha de tenis', 'es', 'tenis_si'), ('¿Dónde está el baño?', 'es', 'bano')):
        got = understand(text, lang, contexto='tenis')
        assert got['intencion'] == want and got['respuesta'], (text, got)
    assert understand('Quiero ir a la cancha de tenis', 'es')['respuesta'].startswith('¡Con gusto! Le acompaño')   # sin pregunta
    assert understand('Buenos días, mi nombre no importa', 'es', contexto='tenis')['intencion'] != 'tenis_si'
    print(f'voz: {len(cases) + 3} frases entendidas en los 4 idiomas')

    import shutil
    import subprocess
    import sys
    import tempfile
    tts = 'espeak-ng' if os.environ.get('CERBERUS_TTS') == 'espeak-ng' or not shutil.which('say') else 'say'
    if '--audio' not in sys.argv or not shutil.which(tts) or not shutil.which('ffmpeg'):
        return print('voz autotest OK (sin audio: python web/voz.py --audio, con espeak-ng o say y ffmpeg)')
    spoken = [(('Paulina', 'es-419'), 'No te estoy entendiendo', 'es', 'no_entiendo'),
              (('Luciana', 'pt-br'), 'Não estou entendendo', 'pt', 'no_entiendo'),
              (('Tingting', 'cmn'), '我听不懂你说的话', 'zh', 'no_entiendo'),
              (('Samantha', 'en-us'), 'I do not understand', 'en', 'no_entiendo'),
              (('Samantha', 'en-us'), 'Hello, where is the restroom?', 'en', 'bano'),
              (('Paulina', 'es-419'), 'Hola, no tengo cédula', 'es', 'sin_documento'),
              (('Luciana', 'pt-br'), 'Olá, onde fica o restaurante?', 'pt', 'restaurante'),
              (('Tingting', 'cmn'), '你好，洗手间在哪里？', 'zh', 'bano')]
    if tts == 'espeak-ng':      # su voz es muy robotica: Whisper (entrenado con voces humanas) no reconoce bien su pt/zh
        spoken = [x for x in spoken if x[2] in ('en', 'es')]
    with tempfile.TemporaryDirectory() as tmp:
        for (mac_voice, espeak_voice), text, lang, want in spoken:
            aiff, webm = f'{tmp}/{lang}.wav', f'{tmp}/{lang}.webm'
            voice = mac_voice if tts == 'say' else espeak_voice
            subprocess.run(['say', '-v', voice, text, '-o', aiff, '--data-format=LEI16@22050'] if tts == 'say'
                           else ['espeak-ng', '-v', voice, '-s', '140', '-w', aiff, text], check=True)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', aiff, '-c:a', 'libopus', webm], check=True)
            start = 'en' if lang == 'es' else 'es'           # la pagina siempre en OTRO idioma: debe cambiar solo
            u = listen(open(webm, 'rb').read(), current_lang=start)
            r = u
            assert r['idioma'] == lang and r['cambio_idioma'] and u['intencion'] == want, (text, r)
            print(f'  {voice:8s} "{r["texto"]}" -> idioma {r["idioma"]} ({r["confianza"]}), {u["intencion"]}: {u["respuesta"][:50]}')
        silence = f'{tmp}/silencio.wav'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '2', silence], check=True)
        assert listen(open(silence, 'rb').read())['texto'] == '', 'Whisper invento texto con silencio'
    print(f'voz autotest OK (con audio de {tts})')


if __name__ == '__main__':
    sys_path = os.path.dirname(os.path.abspath(__file__))
    import sys
    sys.path.insert(0, sys_path)
    import warnings
    warnings.filterwarnings('ignore', message='.*encountered in matmul', category=RuntimeWarning)
    autotest()
