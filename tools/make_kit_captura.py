"""Genera kit_captura_cerberus.zip: lo minimo para que otra persona capture el dataset facial del equipo.

Uso: python tools/make_kit_captura.py [salida.zip]
No incluye fotos, galeria ni pases (datos biometricos).
"""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ['vision/face.py', 'vision/camera.py', 'vision/enroll.py', 'vision/calibration.json',
         'vision/models/face_detection_yunet_2023mar.onnx', 'vision/models/face_recognition_sface_2021dec.onnx',
         'vision/models/README.md']

LEEME = r"""KIT DE CAPTURA - DATASET FACIAL CERBERUS (Sabana Hack 2026)
=========================================================

Para que sirve: tomar las fotos del equipo para el reconocimiento facial del robot.
Por cada persona se toman 15 fotos de ENROLAMIENTO y 8 fotos de PRUEBA (validacion).

ANTES DE EMPEZAR
1. Python 3.10 o mas nuevo (python.org). En la instalacion marcar "Add Python to PATH".
2. En una terminal, dentro de esta carpeta:
       pip install -r requisitos.txt
   OJO: si ya tienes "opencv-python-headless" instalado, las ventanas no abren. Arreglo:
       pip uninstall -y opencv-python-headless opencv-python
       pip install opencv-python
3. Cerrar toda app que use la camara (app Camara, Teams, Zoom, navegador): solo un programa
   puede usarla a la vez; si otra la tiene, aqui sale negro.
4. Destapar la camara (tapa deslizable o tecla de camara del laptop).

POR CADA PERSONA
1. Que lea y firme CONSENTIMIENTO.md (o el formato impreso). Sin firma NO se captura.
2. Windows: doble clic en capturar.bat y seguir las preguntas.
   Mac/Linux:
       python vision/enroll.py --id ana --nombre "Ana Perez" --consentimiento --camara 0
       python vision/enroll.py --id ana --nombre "Ana Perez" --consentimiento --camara 0 --validacion -n 8
3. Id: sin espacios ni tildes (ana, carlos, maria_p). El mismo id en ambos pasos.
4. Durante la captura: una sola cara en cuadro (recuadro VERDE), mirar a la camara y mover un poco
   la cabeza. En las fotos de prueba cambiar algo: gafas puestas/quitadas, otra luz, otro angulo.
   q = salir.

AL TERMINAR
Comprimir y entregar SOLO a Andres (son datos biometricos, no publicarlos ni subirlos a chats):
   vision/dataset/      (fotos de enrolamiento)
   vision/validacion/   (fotos de prueba)
   vision/gallery.npz   (vectores; se puede regenerar desde las fotos)
   los consentimientos firmados
Todo se borra al terminar el evento.

Si la camara sale negra: revisar paso 3 y 4 de "Antes de empezar". Diagnostico:
       python vision/camera.py
"""

CONSENTIMIENTO = """# Consentimiento - dataset facial (Sabana Hack 2026)

Yo, ____________________________________, identificado(a) con ______________________,
acepto que el equipo Cerberus tome fotos de mi rostro para:

- entrenar y probar el reconocimiento facial del robot de recepcion del reto "El reto de Cerberus";
- mostrarlo en la demostracion ante los jurados de Sabana Hack 2026.

Entiendo que:

- se guardan fotos de mi rostro y un vector numerico calculado a partir de ellas;
- no se publican ni se comparten fuera del equipo;
- se borran al terminar el evento (25 de octubre de 2026), o antes si lo pido;
- puedo retirar este consentimiento en cualquier momento, sin explicar por que.

Id asignado en el dataset: ______________

Fecha: ____ / ____ / 2026        Firma: ____________________________
"""

BAT = r"""@echo off
cd /d "%~dp0"
echo ==== Captura de dataset facial - Cerberus ====
set /p ID=Id de la persona (sin espacios ni tildes, ej. ana):
set /p NOMBRE=Nombre completo:
set /p OK=La persona firmo el consentimiento? (s/n):
if /i not "%OK%"=="s" (
  echo Sin consentimiento no se captura.
  pause
  exit /b 1
)
echo.
echo Paso 1 de 2: 15 fotos de enrolamiento. Mire a la camara y mueva un poco la cabeza.
python vision\enroll.py --id %ID% --nombre "%NOMBRE%" --consentimiento --camara 0
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Paso 2 de 2: 8 fotos de prueba. Cambie algo: gafas, otra luz u otro angulo.
pause
python vision\enroll.py --id %ID% --nombre "%NOMBRE%" --consentimiento --camara 0 --validacion -n 8
echo.
echo Listo: %NOMBRE%. Siguiente persona: vuelva a abrir capturar.bat
pause
"""

REQ = 'opencv-python>=4.8\nnumpy\n'


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'kit_captura_cerberus.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        base = 'kit_captura_cerberus/'
        for f in FILES:
            z.write(ROOT / f, base + f)
        z.writestr(base + 'LEEME.txt', LEEME)
        z.writestr(base + 'CONSENTIMIENTO.md', CONSENTIMIENTO)
        z.writestr(base + 'capturar.bat', BAT.replace('\n', '\r\n'))
        z.writestr(base + 'requisitos.txt', REQ)
    print(f'{out} ({out.stat().st_size / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
