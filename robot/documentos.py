"""Que documento muestra la persona: pase QR de N Club, cedula amarilla (PDF417) o cedula digital (numero por OCR).

detect(img, ocr=True) -> dict(tipo, ...) con tipo:
  'pase'            QR firmado de N Club (robotA/vision/qr_pass.py): texto para qr_pass.validate
  'cedula_amarilla' PDF417 del reverso de la cedula tradicional: numeros candidatos y nombre si se pudo leer
  'cedula_digital'  frente de la cedula (texto "COLOMBIA"/"CEDULA"/"NUIP"): numeros leidos por OCR
  'qr_cifrado'      un QR que no es de N Club (p. ej. el QR cifrado de la cedula digital: no se puede leer)
  None              nada legible todavia (con 'pista' si se ve algo a medias)

Cedula amarilla: posiciones del PDF417 tomadas de la comunidad (github.com/Eitol/colombian-cedula-reader), no de la
Registraduria. Por eso, ademas del campo 48-58, se devuelven todas las secuencias de 6-10 digitos del contenido y quien
llama las cruza con los numeros registrados. Cedula digital: su QR esta cifrado por la Registraduria, asi que se lee
el NUIP impreso con OCR: Tesseract en Linux (apt install tesseract-ocr) y el de Apple (Vision) en macOS.
CERBERUS_OCR=tesseract|vision fuerza uno.
"""
import os
import re
import shutil
import subprocess
import sys

import cv2
import numpy as np

import qr_lector  # noqa: F401  (agrega robotA/vision al path)
from qr_lector import qr_pass

try:
    import zxingcpp
except ImportError:                                     # sin zxing-cpp no hay cedula amarilla, el resto sigue
    zxingcpp = None

DIGITS = re.compile(r'(?<!\d)\d{1,3}(?:[.\s]\d{3}){1,3}(?!\d)|(?<!\d)\d{6,10}(?!\d)')
CEDULA_WORDS = ('COLOMBIA', 'CEDULA', 'CÉDULA', 'NUIP', 'IDENTIFICACION', 'IDENTIFICACIÓN', 'REGISTRADURIA')


def normalize(number):
    """'1.012.345.678' / '0001012345' -> '1012345678' (sin puntos ni ceros a la izquierda)."""
    return re.sub(r'\D', '', str(number)).lstrip('0')


def mask(number):
    n = normalize(number)
    return '*' * max(len(n) - 4, 0) + n[-4:]


def numbers_in(text):
    return list(dict.fromkeys(n for n in (normalize(m) for m in DIGITS.findall(text)) if 6 <= len(n) <= 10))


def parse_pdf417(data):
    """Bytes del PDF417 de la cedula amarilla -> dict(numeros, numero, nombre)."""
    txt = data.decode('latin-1')
    field = lambda a, b: re.sub(r'[^A-ZÑ ]', '', txt[a:b].upper()).strip()
    numero = normalize(txt[48:58])
    nombre = ' '.join(x for x in (field(104, 127), field(127, 150), field(58, 80), field(81, 104)) if x)
    nums = ([numero] if 6 <= len(numero) <= 10 else []) + [n for n in numbers_in(re.sub(r'[^\d]', ' ', txt)) if n != numero]
    return dict(numeros=nums, numero=numero or None, nombre=nombre.title() or None)


def ocr_engine():
    """'vision' (macOS), 'tesseract' (Linux, o macOS con brew) o None."""
    forced = os.environ.get('CERBERUS_OCR')
    if forced in ('vision', 'tesseract'):
        return forced
    if sys.platform == 'darwin':
        try:
            import Vision  # noqa: F401
            return 'vision'
        except ImportError:
            pass
    return 'tesseract' if shutil.which('tesseract') else None


def ocr_lines(img):
    """Lineas de texto del frame. [] si no hay motor de OCR o falla."""
    engine = ocr_engine()
    if engine == 'tesseract':
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)   # el texto de una cedula es chico
        ok, png = cv2.imencode('.png', gray)
        try:
            out = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '11'], input=png.tobytes(),
                                 capture_output=True, timeout=10).stdout.decode('utf-8', 'ignore')
        except (OSError, subprocess.TimeoutExpired):
            return []
        return [x.strip() for x in out.splitlines() if x.strip()]
    if engine != 'vision':
        return []
    import Vision
    from Foundation import NSData
    ok, jpg = cv2.imencode('.jpg', img)
    handler = Vision.VNImageRequestHandler.alloc().initWithData_options_(NSData.dataWithBytes_length_(jpg.tobytes(), len(jpg)), None)
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setUsesLanguageCorrection_(False)
    req.setRecognitionLanguages_(['es-ES'])
    ok, _ = handler.performRequests_error_([req], None)
    return [o.topCandidates_(1)[0].string() for o in (req.results() or [])] if ok else []


def detect(img, ocr=True):
    found = qr_lector.read_all(img)
    for q in found:
        if q['text'].startswith(qr_pass.PREFIX + '|'):
            return dict(tipo='pase', texto=q['text'], puntos=q['points'].tolist())
    if zxingcpp is not None:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        for b in zxingcpp.read_barcodes(gray):
            if b.format == zxingcpp.BarcodeFormat.PDF417:
                return dict(tipo='cedula_amarilla', **parse_pdf417(bytes(b.bytes)))
            if b.format == zxingcpp.BarcodeFormat.QRCode and b.text.startswith(qr_pass.PREFIX + '|'):
                return dict(tipo='pase', texto=b.text, puntos=None)
    if found:
        return dict(tipo='qr_cifrado')
    if not ocr:
        return dict(tipo=None)
    lines = ocr_lines(img)
    text = ' '.join(lines)
    upper = text.upper()
    if any(w in upper for w in CEDULA_WORDS):
        nums = numbers_in(text)
        if nums:
            return dict(tipo='cedula_digital', numeros=nums, numero=nums[0])
        return dict(tipo=None, pista='cedula_cerca')      # codigo: el texto lo pone web/textos.py
    return dict(tipo=None)


def warm_up():
    """La primera llamada al OCR de Apple tarda ~20 s (carga el modelo): mejor al arrancar que con alguien esperando."""
    if ocr_engine() == 'vision':
        ocr_lines(np.full((64, 64, 3), 255, np.uint8))


def tarjeta_prueba(numero, apellido='TORRES', nombre='GABRIEL'):
    """Frente de una cedula digital FALSA para pruebas (dice PRUEBA): solo lo que lee el OCR. BGR 270x430."""
    from PIL import Image, ImageDraw, ImageFont
    card = Image.new('RGB', (860, 540), '#e9eef2')
    dr = ImageDraw.Draw(card)
    path = next((f for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Helvetica.ttc')
                 if os.path.exists(f)), None)
    font = (lambda s: ImageFont.truetype(path, s)) if path else (lambda s: ImageFont.load_default(s))
    dr.text((30, 25), 'REPÚBLICA DE COLOMBIA', fill='black', font=font(34))
    dr.text((30, 70), 'Cédula de Ciudadanía · PRUEBA', fill='black', font=font(28))
    dr.text((310, 165), apellido, fill='black', font=font(32))
    dr.text((310, 245), nombre, fill='black', font=font(32))
    dr.text((310, 320), 'NUIP', fill='#444', font=font(20))
    dr.text((310, 345), f'{int(numero):,}'.replace(',', '.'), fill='black', font=font(38))
    return cv2.GaussianBlur(cv2.resize(cv2.cvtColor(np.array(card), cv2.COLOR_RGB2BGR), (430, 270), interpolation=cv2.INTER_AREA), (0, 0), 0.7)


def pdf417_prueba(numero, apellido=b'TORRES', nombre=b'GABRIEL'):
    """PDF417 como el del reverso de la cedula amarilla, con el numero en los bytes 48-58. BGR de 600 px de ancho."""
    pay = bytearray(b'\x00' * 170)
    pay[48:58] = str(numero).zfill(10).encode()
    pay[58:58 + len(apellido)], pay[104:104 + len(nombre)] = apellido, nombre
    img = np.array(zxingcpp.create_barcode(bytes(pay), zxingcpp.BarcodeFormat.PDF417).to_image(scale=3))
    img = cv2.resize(img, (600, int(600 * img.shape[0] / img.shape[1])), interpolation=cv2.INTER_AREA)
    return cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), (0, 0), 0.8)


def autotest():
    bg = np.full((720, 1280, 3), 120, np.uint8)

    def paste(small, x=400, y=200):
        f = bg.copy()
        f[y:y + small.shape[0], x:x + small.shape[1]] = small
        return f

    # pase N Club
    text = qr_pass.make_pass('socio', 'gabriel', 'Gabriel')
    code = cv2.cvtColor(cv2.resize(qr_pass.to_image(text, 10), (300, 300), interpolation=cv2.INTER_AREA), cv2.COLOR_GRAY2BGR)
    d = detect(paste(code))
    assert d['tipo'] == 'pase' and qr_pass.validate(d['texto'])['ok'], d
    # QR ajeno (como el cifrado de la cedula digital)
    other = cv2.cvtColor(cv2.resize(qr_pass.to_image('https://ejemplo.com/xyz', 10), (300, 300), interpolation=cv2.INTER_AREA), cv2.COLOR_GRAY2BGR)
    assert detect(paste(other))['tipo'] == 'qr_cifrado'
    # cedula amarilla: PDF417 binario con el numero en 48-58
    if zxingcpp is not None:
        d = detect(paste(pdf417_prueba(1012345), 300))
        assert d['tipo'] == 'cedula_amarilla' and d['numero'] == '1012345' and d['nombre'] == 'Gabriel Torres', d
    # cedula digital: frente con el NUIP
    if ocr_engine():
        d = detect(paste(tarjeta_prueba(1012345678)))
        assert d['tipo'] == 'cedula_digital' and '1012345678' in d['numeros'], d
    assert detect(bg)['tipo'] is None
    assert normalize('1.012.345.678') == '1012345678' and mask('1012345678') == '******5678'
    assert numbers_in('NUIP 1.012.345.678 tel 3001234567 año 2024') == ['1012345678', '3001234567']
    print(f'documentos autotest OK (OCR: {ocr_engine() or "sin motor: cedula digital no probada"})')


if __name__ == '__main__':
    autotest()
