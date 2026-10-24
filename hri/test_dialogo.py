"""Pruebas del dialogo de recepcion: 5 categorias, sin registro, contradicciones, no entendido y salida.
Uso: python test_dialogo.py"""
from datetime import datetime

from dialogo import entrada, ejecutar, salida
from intenciones import CATEGORIA, DESTINO, SI_NO, entender
from registros import Registros

HOY = '2026-10-24'
AHORA = datetime(2026, 10, 24, 8, 57)
reg = Registros(hoy=HOY)


def guion(*respuestas):
    """Respondedor de prueba: frases como las diria una persona; se pasan por entender() como la voz real."""
    cola = list(respuestas)

    def responder(paso):
        r = cola.pop(0) if cola else None              # sin respuesta: la persona no dijo nada
        if paso.tipo == 'accion' or paso.dato.get('opciones') == 'nombre_socio':
            return r
        return entender(r, paso.dato['opciones']) if r else None
    return responder


def correr(gen, *resp):
    pasos = ejecutar(gen, guion(*resp))
    dichos = [p.texto for p in pasos if p.tipo == 'decir']
    return pasos, dichos, pasos[-1].dato


def tipos(pasos, t):
    return [p for p in pasos if p.tipo == t]


# --- intenciones (lo que entiende de la voz, con errores tipicos de transcripcion)
assert entender('vengo a prestar un servicio', CATEGORIA) == 'externo'
assert entender('me invitó Andrés', CATEGORIA) == 'invitado'
assert entender('trabajo aquí en la cocina', CATEGORIA) == 'personal'
assert entender('al restaurante', DESTINO) == 'salon'
assert entender('voy al gimnacio', DESTINO) == 'gimnasio'          # error de ortografia del reconocimiento
assert entender('vengo a jugar tenis', DESTINO) == 'tenis' and entender('voy al spa', DESTINO) == 'spa'
assert entender('sí, por favor', SI_NO) == 'si' and entender('no, gracias', SI_NO) == 'no'
assert entender('', SI_NO) is None and entender('mmm', CATEGORIA) is None
print('OK intenciones')

# --- 4 categorias con registro completo: 0 preguntas
casos = {'VIP': ('sofia', True), 'INVITADO': ('laura', False), 'PERSONAL': ('marta', False), 'EXTERNO': ('luis', False)}
for cat, (pid, miembro) in casos.items():
    pasos, dichos, fin = correr(entrada(reg, pid, miembro, ahora=AHORA))
    assert fin == {'categoria': cat, 'preguntas': 1 if cat == 'VIP' else 0, 'escalado': False}, (cat, fin)   # VIP: "como siempre?"
    print(f'OK {cat:9s} {fin["preguntas"]} preguntas | {" / ".join(dichos)}')
v = correr(entrada(reg, 'sofia', True, ahora=AHORA))[1]
assert 'señora Restrepo' in v[0] and 'Bienvenida' in v[0]
assert v[1] == 'Con gusto. La acompaño al Lounge VIP.' and not any(' a el ' in x for x in v)   # trato y genero
e = correr(entrada(reg, 'luis', False, ahora=AHORA))
assert 'señor Peña' in e[1][0] and 'Climatec' in e[1][0] and 'chaleco' in e[1][1]
assert any(p.texto == 'aviso_supervisor' for p in tipos(e[0], 'accion'))
p = correr(entrada(reg, 'marta', False, ahora=AHORA))
assert '08:57' in p[1][0] and not tipos(p[0], 'preguntar')
lau = correr(entrada(reg, 'laura', False, ahora=AHORA))
assert tipos(lau[0], 'guiar')[0].dato == {'destino': 'INVITADO', 'escolta': True} and 'la espera' in lau[1][1]

# --- regular: 1 pregunta sin destino, 0 con destino habitual
pasos, dichos, fin = correr(entrada(reg, 'carlos', True, ahora=AHORA), 'voy al restaurante')
assert fin['categoria'] == 'REGULAR' and fin['preguntas'] == 1 and tipos(pasos, 'guiar')[0].dato['escolta'] is False
pasos, dichos, fin = correr(entrada(reg, 'carlos', True, ahora=AHORA), 'al gimnasio')
assert any('segundo piso' in x for x in dichos) and tipos(pasos, 'guiar')[0].dato == {'destino': 'gimnasio', 'escolta': False}   # al socio le indica
pasos, dichos, fin = correr(entrada(reg, 'andres', True, ahora=AHORA))      # destino de siempre: se lo confirma
assert fin == {'categoria': 'REGULAR', 'preguntas': 1, 'escalado': False} and 'como siempre' in tipos(pasos, 'preguntar')[0].texto
pasos, dichos, fin = correr(entrada(reg, 'andres', True, ahora=AHORA), 'no, hoy no', 'a la piscina')
assert tipos(pasos, 'guiar')[0].dato == {'destino': 'piscina', 'escolta': False} and fin['preguntas'] == 2
pasos, dichos, fin = correr(entrada(reg, 'sofia', True, ahora=AHORA), 'no', 'voy al gimnasio')   # VIP que hoy va al gimnasio
assert tipos(pasos, 'guiar')[0].dato == {'destino': 'gimnasio', 'escolta': True} and 'La acompaño' in ' '.join(dichos)
pasos, dichos, fin = correr(entrada(reg, 'sofia', True, ahora=AHORA), 'sí, como siempre')
assert tipos(pasos, 'guiar')[0].dato == {'destino': 'VIP', 'escolta': True}
print('OK REGULAR   1 pregunta sin destino / "como siempre" con destino habitual / VIP que hoy va a otra parte')

# --- sin registro: 1 pregunta de categoria
pasos, dichos, fin = correr(entrada(reg, None, False, ahora=AHORA), 'vengo invitado', 'me invitó Andrés Azcona', True)
assert fin['categoria'] == 'INVITADO' and fin['preguntas'] == 2 and any(p.texto == 'confirmar_anfitrion' for p in pasos)
pasos, dichos, fin = correr(entrada(reg, None, False, ahora=AHORA), 'vengo invitado', 'me invitó Andrés', False)
assert fin['escalado'] and 'no confirmo' in fin['motivo']
pasos, dichos, fin = correr(entrada(reg, None, False, ahora=AHORA), 'vengo a hacer un mantenimiento')
assert fin['escalado'] and dichos[-1].startswith('Un momento')          # externo sin OT -> recepcion
pasos, dichos, fin = correr(entrada(reg, None, False, ahora=AHORA), 'mmm', '')
assert fin['escalado'] and len(tipos(pasos, 'preguntar')) == 2         # repite una vez y escala
print('OK sin registro: invitado confirmado / anfitrion niega / externo sin OT / no se entiende')

# --- contradicciones -> recepcion, sin preguntar nada
for pid, miembro, why in (('laura', True, 'MIEMBRO'), ('sofia', False, 'NO MIEMBRO')):
    pasos, dichos, fin = correr(entrada(reg, pid, miembro, ahora=AHORA))
    assert fin['escalado'] and why in fin['motivo'] and not tipos(pasos, 'preguntar'), fin
fin = correr(entrada(Registros(hoy='2026-11-02'), 'luis', False, ahora=AHORA))[2]
assert fin['escalado'] and 'OT-1042' in fin['motivo']                    # orden de otro dia
fin = correr(entrada(reg, 'tony', False, pase={'ok': True, 'tipo': 'personal', 'persona_id': 'laura'}, ahora=AHORA))[2]
assert fin['escalado'] and 'pase' in fin['motivo']                       # pase de personal, registro de invitada
fin = correr(entrada(reg, None, False, pase={'ok': True, 'tipo': 'invitado', 'persona_id': 'laura'}, ahora=AHORA))[2]
assert fin['categoria'] == 'INVITADO'                                    # pase coherente -> pasa
print('OK contradicciones y pases: miembro no registrado / socio no miembro / OT de otro dia / pase incoherente')

# --- confirmacion desde el modelo de vision (camino principal): la vision dice la categoria
V = lambda cat, pid=None: {'categoria': cat, 'persona_id': pid, 'confianza': 0.93}
casos = [(V('VIP', 'sofia'), 'VIP'), (V('REGULAR', 'carlos'), 'REGULAR'), (V('EMPLEADO', 'marta'), 'PERSONAL'),
         (V('VISITANTE', 'laura'), 'INVITADO'), (V('VISITANTE', 'luis'), 'EXTERNO')]
for v, esperado in casos:
    pasos, dichos, fin = correr(entrada(reg, vision=v, ahora=AHORA), *(['al restaurante'] if esperado == 'REGULAR' else []))
    assert fin['categoria'] == esperado and 'vision' in pasos[0].dato['motivo'], (v, fin)
pasos, dichos, fin = correr(entrada(reg, vision=V('VISITANTE', 'nadie'), ahora=AHORA), 'Andrés', True)
assert fin['categoria'] == 'INVITADO' and dichos[0] == 'Bienvenido a N Club.' and len(tipos(pasos, 'preguntar')) == 1
pasos, dichos, fin = correr(entrada(reg, vision=V('DESCONOCIDO'), ahora=AHORA), 'vengo invitado', 'Andrés', True)
assert fin['categoria'] == 'INVITADO' and len(tipos(pasos, 'preguntar')) == 2           # pregunta que es y quien
for v, why in [(V('VIP', 'carlos'), 'REGULAR'), (V('EMPLEADO', 'sofia'), 'padron'), (V('VIP', 'nadie'), 'padron'),
               (V('EMPLEADO'), 'sin identidad'), (V('MARCIANO', 'sofia'), 'no se conoce')]:
    fin = correr(entrada(reg, vision=v, ahora=AHORA))[2]
    assert fin['escalado'] and why in fin['motivo'], (v, fin)
fin = correr(entrada(Registros(hoy='2026-11-02'), vision=V('VISITANTE', 'luis'), ahora=AHORA))[2]
assert fin['escalado'] and 'OT-1042' in fin['motivo']                    # contratista con orden de otro dia
print('OK vision: 5 categorias, visitante sin agenda, desconocido, contradicciones vision vs registro')

# --- salida
salidas = {pid: correr(salida(reg, pid, ahora=datetime(2026, 10, 24, 17, 2)))[1] for pid in ('sofia', 'laura', 'marta', 'luis')}
assert 'señora Restrepo' in salidas['sofia'][0] and 'socio' in salidas['laura'][1]
assert '17:02' in salidas['marta'][0] and 'Gracias por su trabajo' in salidas['luis'][0]
print('OK salida:', ' | '.join(d[0] for d in salidas.values()))
print('test_dialogo OK')
