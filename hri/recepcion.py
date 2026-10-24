"""Recepcion por voz: vision (quien es) -> dialogo (que decir y hacer) -> voz (hablar y escuchar).

Uso:  python recepcion.py --camara                  persona frente a la camara (rostro/QR/escalera) y conversa por voz
      python recepcion.py --persona sofia           ensayo sin camara con una persona de los registros
      python recepcion.py --persona sofia --salida  despedida al salir
      ... --mudo        sin hablar (solo texto)       ... --teclado   responder escribiendo en vez del microfono
      ... --hoy 2026-10-24   ensayar con la fecha de la demo (la orden de trabajo de Luis es de ese dia)
      python recepcion.py --persona marta --vision EMPLEADO   simula lo que entrega el modelo de vision
                                                              (VIP, REGULAR, EMPLEADO, VISITANTE, DESCONOCIDO)
      ... --x2          voz y microfonos del X2 (en PC2/SDK): --voz-x2 wav fuerza el plan B, --mic crudo sin VAD
La confirmacion del anfitrion (tercero) es SIMULADA: la responde el operador con s/n.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vision'))

from dialogo import _escalar, ejecutar, entrada, salida  # noqa: E402
from intenciones import entender  # noqa: E402
from registros import Registros  # noqa: E402


def mostrar(paso, voz):
    if paso.tipo == 'decir' or paso.tipo == 'preguntar':
        print(f'  ROBOT: {paso.texto}')
        if voz:
            voz.decir(paso.texto)
    elif paso.tipo in ('gesto', 'led', 'escalar', 'guiar'):
        print(f'    [{paso.tipo}] {paso.texto or paso.dato}')
    elif paso.tipo == 'cara':
        print(f'    [cara] emoji {paso.dato["emoji"]}')
    elif paso.tipo == 'accion':
        print(f'    [accion] {paso.texto} {paso.dato}')
    elif paso.tipo == 'fin':
        print(f'  == {paso.dato}')


def respondedor(oido, teclado):
    def responder(paso):
        if paso.tipo == 'accion':                                  # tercero SIMULADO: lo responde el operador
            return input('    [SIMULADO] el anfitrion confirma? (s/n): ').strip().lower() == 's'
        texto = input('  VISITANTE (escriba): ') if teclado else oido.escuchar(contexto=paso.texto)
        if not teclado:
            print(f'  VISITANTE (oido): "{texto}"')
        if paso.dato['opciones'] == 'nombre_socio':
            return texto
        return entender(texto, paso.dato['opciones'])
    return responder


def verificar_con_camara(cam):
    """Usa la sesion de vision hasta que termina la verificacion. -> resultado de Session."""
    import cv2
    from camera import open_camera
    from club_facial import load_socios
    from face import FaceEngine, Gallery, load_calibration
    from session import Session
    sess = Session(FaceEngine(), Gallery(), load_socios(), load_calibration())
    cap, _ = open_camera(cam)
    print('Mirando a la camara... (n: sin pase, s/x: tercero, q: salir)')
    while sess.result is None:
        ok, frame = cap.read()
        if not ok:
            break
        msg = sess.feed(frame, time.time())
        cv2.putText(frame, msg[:70], (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.imshow('Cerberus', frame)
        k = cv2.waitKey(1) & 0xFF
        if k == ord('q'):
            break
        if k == ord('n'):
            sess.no_qr()
        if k in (ord('s'), ord('x')):
            sess.third_party(k == ord('s'))
    cap.release()
    cv2.destroyAllWindows()
    return sess.result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--persona')
    ap.add_argument('--camara', nargs='?', const=0, type=int)
    ap.add_argument('--salida', action='store_true')
    ap.add_argument('--mudo', action='store_true')
    ap.add_argument('--teclado', action='store_true')
    ap.add_argument('--hoy', help='fecha AAAA-MM-DD para ensayar (las ordenes de trabajo son por dia)')
    ap.add_argument('--vision', help='categoria que entrega el modelo de vision (docs/contrato-vision.md)')
    ap.add_argument('--x2', action='store_true', help='hablar y escuchar con el robot X2 (requiere su SDK)')
    ap.add_argument('--voz-x2', choices=['tts', 'wav'], default='tts', help='tts: voz del robot (plan B WAV si falla)')
    ap.add_argument('--mic', choices=['vad', 'crudo'], default='vad', help='vad: deteccion de voz del robot')
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    reg = Registros(hoy=a.hoy)
    if a.x2:                                                       # voz y microfonos del robot real
        from voz_x2 import OidoX2, VozX2
        voz = None if a.mudo else VozX2(modo=a.voz_x2)
        oido = None if a.teclado else OidoX2(fuente=a.mic)
    else:
        voz = None if a.mudo else __import__('voz').Voz()
        oido = None if a.teclado else __import__('voz').Oido()

    if a.camara is not None:
        res = verificar_con_camara(a.camara)
        if not res:
            return
        print(f'Vision: {res}')
        if res['resultado'] == 'escalado_recepcion':               # la escalera de vision ya escalo
            ejecutar(iter(_escalar(res.get('motivo_pase') or res['veredicto_rostro'])), None, lambda p: mostrar(p, voz))
            return
        persona, miembro = res['persona_id'], res['club']['miembro']
        pase = {'ok': True, 'tipo': res['pase'], 'persona_id': persona} if res['metodo'] == 'qr' else None
    else:
        persona = a.persona
        miembro = persona in reg.socios
        pase = None

    vision = {'categoria': a.vision, 'persona_id': persona} if a.vision else None
    conv = salida(reg, persona) if a.salida else entrada(reg, persona, miembro, pase, vision=vision)
    ejecutar(conv, respondedor(oido, a.teclado), lambda p: mostrar(p, voz))


if __name__ == '__main__':
    main()
