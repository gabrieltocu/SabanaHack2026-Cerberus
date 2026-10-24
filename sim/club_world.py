"""Club N en MuJoCo: lobby con recepcion, pasillo, 5 salas (una por categoria) y puertas con control de acceso;
afuera la piscina y la cancha de tenis; arriba un segundo piso (gimnasio, terraza bar y spa).

Toda la geometria del club es visual (sin colision) para no alterar la fisica del X2; las puertas, los
visitantes y el arnes del robot son cuerpos mocap que mueve el escenario.
"""
import os
from pathlib import Path

import mujoco
import numpy as np

ROOT = Path(__file__).resolve().parents[1]   # raiz del repo
# Modelo del X2: en vivo la version liviana (misma fisica, ~4x mas rapida de dibujar); el video usa la completa.
# CERBERUS_MODELO=completo | lite fuerza uno.


def escena(completo=False):
    completo = {'completo': True, 'lite': False}.get(os.environ.get('CERBERUS_MODELO'), completo)
    return ROOT / 'assets' / 'x2_urdf' / ('X2_URDF-v1.3.0' if completo else 'X2_URDF-v1.3.0-lite') / 'scene.xml'

VISTO = 4                           # grupo de geoms que ve el lidar del robot (percepcion.GRUPO)
WALL_H, WALL_T = 1.2, 0.1           # paredes bajas (sobre la altura del lidar, 0.9 m) para ver desde arriba
WALL_RGBA = [0.93, 0.9, 0.83, 1]    # crema
MADERA = [0.42, 0.27, 0.16, 1]
PIEL = [0.93, 0.78, 0.66, 1]

# Categoria -> sala. door: centro de la puerta; axis: hacia donde desliza al abrir (lejos del puesto del robot,
# que se para pasando la puerta); inside: punto dentro.
ROOMS = {
    'VIP':      dict(label='Lounge VIP',            rgba=[0.95, 0.75, 0.2, 1], box=(4, 8, 1.25, 5.25),
                     door=(6.0, 1.25), axis=(-1, 0), inside=(6.0, 3.6)),
    'REGULAR':  dict(label='Salon principal',       rgba=[0.25, 0.5, 0.95, 1], box=(4, 8, -5.25, -1.25),
                     door=(6.0, -1.25), axis=(-1, 0), inside=(6.0, -3.6)),
    'INVITADO': dict(label='Sala de anfitriones',   rgba=[0.3, 0.8, 0.4, 1], box=(9, 13, 1.25, 5.25),
                     door=(11.0, 1.25), axis=(-1, 0), inside=(11.0, 3.6)),
    'PERSONAL': dict(label='Area de personal',      rgba=[0.95, 0.95, 0.95, 1], box=(9, 13, -5.25, -1.25),
                     door=(11.0, -1.25), axis=(-1, 0), inside=(11.0, -3.6)),
    'EXTERNO':  dict(label='Zona tecnica (servicio)', rgba=[1.0, 0.5, 0.1, 1], box=(15, 19, -2.5, 2.5),
                     door=(15.0, 0.0), axis=(0, -1), inside=(17.0, 0.0)),
}
LOBBY = (-4, 3, -3, 3)
CORRIDOR = (3, 15, -1.25, 1.25)
ENTRY = (-6.0, 0.0)          # por donde llegan los visitantes
APPROACH = (-2.2, 0.0)       # donde se paran frente al robot
HOME = dict(xy=(-1.0, 0.0), yaw=np.pi)   # posicion de inicio del robot: recepcion, mirando a la entrada
RECEPTION = HOME['xy']
DOOR_W = 1.2
OBSTACULOS = [(12.8, 0.45, 0.25)]   # matera en el pasillo (x, y, radio)
MANT_ROBOT = dict(xy=(1.6, 2.2), yaw=-np.pi / 2)   # area de mantenimiento del robot (cambio de bateria)
LEJOS = (50.0, 50.0)                # donde esperan los objetos de los incidentes (fuera del alcance del lidar)
# objetos de incidentes (el robot no los conoce): medio tamano x, y, z y color
OBJETOS = {'Carrito': (0.35, 0.25, 0.5, [0.2, 0.4, 0.8, 1]), 'Valla': (0.05, 1.2, 0.5, [1.0, 0.75, 0.0, 1])}


def _mat(spec, name, rgb1, rgb2, rep, mark=None, refl=0.0):
    """Material con textura de cuadros (baldosa, tablas, alfombra). rep: repeticiones por metro."""
    t = spec.add_texture(name=name, type=mujoco.mjtTexture.mjTEXTURE_2D, builtin=mujoco.mjtBuiltin.mjBUILTIN_CHECKER,
                         rgb1=rgb1, rgb2=rgb2, width=256, height=256)
    if mark:
        t.mark, t.markrgb = mujoco.mjtMark.mjMARK_EDGE, mark
    m = spec.add_material(name=name)
    tex = [''] * int(mujoco.mjtTextureRole.mjNTEXROLE)
    tex[int(mujoco.mjtTextureRole.mjTEXROLE_RGB)] = name
    m.textures, m.texrepeat, m.texuniform, m.reflectance = tex, rep, True, refl
    return name


def _floor(spec, name, x0, x1, y0, y1, rgba, z=0.0005, material=None):
    g = spec.worldbody.add_geom(name=name, type=mujoco.mjtGeom.mjGEOM_BOX, contype=0, conaffinity=0,
                                pos=[(x0 + x1) / 2, (y0 + y1) / 2, z],
                                size=[(x1 - x0) / 2, (y1 - y0) / 2, 0.0005], rgba=rgba)
    if material:
        g.material = material


def _geom(parent, tipo, rgba, visto=False, **kw):
    """Geom visual (sin colision). visto=True: lo ve el lidar (muebles); False: decoracion."""
    g = parent.add_geom(type=tipo, contype=0, conaffinity=0, group=VISTO if visto else 0, rgba=rgba, **kw)
    return g


def _caja(spec, pos, size, rgba, visto=False, yaw=0.0):
    return _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_BOX, rgba, visto, pos=pos, size=size,
                 quat=[np.cos(yaw / 2), 0, 0, np.sin(yaw / 2)])


def _planta(spec, x, y, alto=0.75):
    _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.62, 0.36, 0.24, 1], True, pos=[x, y, 0.2], size=[0.2, 0.2])
    _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_ELLIPSOID, [0.2, 0.5, 0.22, 1], pos=[x, y, alto], size=[0.32, 0.32, 0.42])


def _sofa(spec, x, y, ancho, yaw, rgba):
    """Sofa mirando hacia yaw (respaldo detras)."""
    c, s_ = np.cos(yaw), np.sin(yaw)
    _caja(spec, [x, y, 0.22], [0.32, ancho / 2, 0.22], rgba, True, yaw)
    _caja(spec, [x - 0.27 * c, y - 0.27 * s_, 0.5], [0.07, ancho / 2, 0.3], rgba, True, yaw)
    for lado in (-1, 1):                                  # brazos
        _caja(spec, [x - lado * (ancho / 2) * s_, y + lado * (ancho / 2) * c, 0.32], [0.32, 0.07, 0.32], rgba, True, yaw)


def _mesa(spec, x, y, r=0.38, sillas=2):
    _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.88, 0.86, 0.8, 1], True, pos=[x, y, 0.72], size=[r, 0.02])
    _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.25, 0.25, 0.27, 1], True, pos=[x, y, 0.36], size=[0.04, 0.36])
    for k in range(sillas):
        a = 2 * np.pi * k / sillas
        cx, cy = x + (r + 0.3) * np.cos(a), y + (r + 0.3) * np.sin(a)
        _caja(spec, [cx, cy, 0.24], [0.2, 0.2, 0.24], MADERA, True, a)
        _caja(spec, [cx + 0.18 * np.cos(a), cy + 0.18 * np.sin(a), 0.62], [0.03, 0.2, 0.2], MADERA, True, a)


def _amueblar(spec):
    """Muebles y detalles. Los muebles los ve el lidar (estan en el club); tapetes, follaje y letreros no."""
    piso = lambda n, *b, mat: _floor(spec, n, *b, [1, 1, 1, 1], z=0.0012, material=mat)   # noqa: E731
    # lobby: tapete de entrada, plantas, sofa de espera, mostrador con cubierta y pantalla, base de carga del robot
    _floor(spec, 'tapete_entrada', -3.95, -3.0, -0.8, 0.8, [0.12, 0.16, 0.3, 1], z=0.0012)
    for x, y in ((-3.6, 2.6), (-3.6, -2.6), (2.6, -2.6)):
        _planta(spec, x, y)
    _sofa(spec, 0.0, -2.6, 1.6, np.pi / 2, [0.2, 0.25, 0.4, 1])
    _caja(spec, [-2.0, 1.2, 0.5], [0.35, 0.8, 0.5], MADERA, True)                    # mostrador (lo ve el lidar)
    _caja(spec, [-2.0, 1.2, 1.02], [0.4, 0.86, 0.025], [0.9, 0.9, 0.88, 1])           # cubierta de marmol
    _caja(spec, [-1.85, 1.0, 1.2], [0.02, 0.22, 0.14], [0.1, 0.1, 0.12, 1], yaw=0.3)  # pantalla
    mx, my = MANT_ROBOT['xy']
    _caja(spec, [mx, my + 0.68, 0.5], [0.35, 0.08, 0.5], [0.3, 0.32, 0.36, 1], True)  # base de carga
    _caja(spec, [mx, my + 0.6, 0.85], [0.08, 0.01, 0.05], [0.2, 0.95, 0.4, 1])         # luz de carga
    # pasillo: cuadros en las paredes
    for x in (5.0, 10.0, 13.9):
        for lado, col in ((1, [0.75, 0.45, 0.3, 1]), (-1, [0.3, 0.45, 0.65, 1])):
            _caja(spec, [x + 0.5 * (lado < 0), lado * 1.19, 0.85], [0.35, 0.01, 0.22], col)
    # salas: alfombra neutra + tapete del color de la categoria + muebles lejos de la puerta y de donde se para la gente
    alfombra = _mat(spec, 'alfombra', [0.45, 0.41, 0.36], [0.43, 0.39, 0.34], [6, 6])
    concreto = _mat(spec, 'concreto', [0.62, 0.62, 0.6], [0.58, 0.58, 0.56], [0.5, 0.5], mark=[0.45, 0.45, 0.45])
    for cat, r in ROOMS.items():
        bx0, bx1, by0, by1 = r['box']
        piso(f'f_{cat}', bx0, bx1, by0, by1, mat=concreto if cat == 'EXTERNO' else alfombra)
        ix, iy = r['inside']
        c = r['rgba']
        _floor(spec, f'tapete_{cat}', ix - 0.9, ix + 0.9, iy - 0.6, iy + 0.7, [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85, 1], z=0.002)
        # dintel de color sobre la puerta: se ve de lejos a que categoria corresponde
        dx, dy = r['door']
        horizontal = abs(r['axis'][0]) > 0
        _caja(spec, [dx, dy, WALL_H + 0.12], [DOOR_W / 2 + 0.1, 0.06, 0.12] if horizontal else [0.06, DOOR_W / 2 + 0.1, 0.12], c)
    # Lounge VIP: sillones, mesa de centro, barra y plantas
    _sofa(spec, 4.7, 4.5, 0.8, -np.pi / 4, [0.45, 0.12, 0.15, 1])
    _sofa(spec, 7.3, 4.5, 0.8, -3 * np.pi / 4, [0.45, 0.12, 0.15, 1])
    _caja(spec, [7.75, 2.6, 0.55], [0.18, 0.9, 0.55], MADERA, True)
    _caja(spec, [7.75, 2.6, 1.12], [0.22, 0.95, 0.025], [0.85, 0.7, 0.3, 1])
    _planta(spec, 4.4, 1.7)
    # Salon principal: mesas redondas con sillas
    for x, y in ((4.9, -4.5), (7.1, -4.5), (7.2, -2.4)):
        _mesa(spec, x, y)
    _planta(spec, 4.4, -1.7)
    # Sala de anfitriones: sofa, mesa auxiliar y plantas
    _sofa(spec, 10.0, 4.9, 1.4, -np.pi / 2, [0.25, 0.35, 0.3, 1])
    _caja(spec, [12.6, 2.0, 0.3], [0.25, 0.25, 0.3], MADERA, True)
    _planta(spec, 12.6, 4.9)
    _planta(spec, 9.4, 1.7)
    # Area de personal: casilleros y banca
    for k in range(6):
        _caja(spec, [9.45 + 0.52 * k, -5.0, 0.9], [0.25, 0.2, 0.9], [0.55, 0.6, 0.65, 1], True)
    _caja(spec, [11.0, -4.35, 0.22], [1.0, 0.18, 0.04], MADERA, True)
    # Zona tecnica: estanterias, equipo de aire y franja de seguridad
    for y in (-2.2, 2.2):
        _caja(spec, [17.2, y, 0.9], [1.2, 0.22, 0.9], [0.35, 0.35, 0.38, 1], True)
    _caja(spec, [18.5, 0.0, 0.6], [0.35, 0.6, 0.6], [0.75, 0.77, 0.8, 1], True)
    _floor(spec, 'franja_seg', 15.1, 15.4, -1.0, 1.0, [0.95, 0.8, 0.1, 1], z=0.0025)
    # exterior: plaza de llegada y materas a los lados de la entrada
    plaza = _mat(spec, 'plaza', [0.62, 0.6, 0.56], [0.55, 0.53, 0.5], [0.7, 0.7], mark=[0.5, 0.48, 0.45])
    _floor(spec, 'f_plaza', -15.0, -4.0, -3.5, 3.5, [1, 1, 1, 1], material=plaza)
    for y in (-1.5, 1.5):
        _planta(spec, -4.6, y, 0.85)


PISO2_Z, PISO2 = 3.6, 2            # segundo piso: altura y grupo de geoms (se oculta con el boton '2.o piso')
PISCINA = (22.0, 30.0, -3.0, 3.0)  # agua, al aire libre detras de la zona tecnica
TENIS = (10.0, 13.5)               # centro de la cancha (al lado izquierdo del club, entrando)
# ascensor: cabina (x0, x1, y0, y1) afuera del lobby; la puerta da al lobby (piso 0) y al descanso del 2.o piso (piso 1)
ASCENSOR = dict(cabina=(0.7, 2.1, -4.2, -3.05), xy=(1.65, -3.65), visitante=(1.0, -3.65), frente=(1.4, -2.2),
                puerta_x=1.4, ancho=1.2)
# lugares a los que acompana (fuera de las 5 salas): piso 0 = primer piso y afuera, piso 1 = segundo piso.
# parada: donde se detiene el robot; mira: lo que senala; sitio: a donde sigue el visitante
LUGARES = {
    'gimnasio': dict(label='el gimnasio', piso=1, camino='en el segundo piso: suben juntos en el ascensor del lobby', parada=(7.0, 0.5), mira=(8.0, 3.0), sitio=(5.4, 2.3),
                     llegada='Este es el gimnasio. Que disfrute su entrenamiento.'),
    'spa': dict(label='el spa y la terraza bar', piso=1, camino='en el segundo piso: suben juntos en el ascensor del lobby', parada=(13.8, 0.5), mira=(17.4, 0.0), sitio=(15.9, -0.7),
                llegada='Aquí están el spa y, a su derecha, la terraza bar. Que lo disfrute.'),
    'piscina': dict(label='la piscina', piso=0, camino='al aire libre detras del club: salen por la entrada y caminan por el costado del edificio', parada=(20.6, -4.4), mira=(26.0, 0.0), sitio=(23.4, -4.1),
                    llegada='Esta es la piscina. Las toallas están junto a las asoleadoras. Que la disfrute.'),
    'tenis': dict(label='la cancha de tenis', piso=0, camino='afuera: salen por la entrada y toman el sendero hasta la puerta de la malla', parada=(-3.4, 7.8), mira=(10.0, 13.5), sitio=(7.0, 19.8),
                  llegada='Esta es la cancha de tenis. Que tenga un buen partido.'),
}
# recorridos del mapa precargado (afuera y segundo piso); el lobby y el pasillo los mapea el robot al empezar
MAPA_PRECARGADO = {
    0: [[(-3.5, 0.0), (-5.0, 0.0), (-5.0, 3.0), (-4.75, 6.6), (-3.4, 7.8), (8.0, 8.5), (20.0, 8.5), (24.0, 12.0),
         (24.0, 19.0), (10.0, 19.5), (-4.0, 19.0), (-4.0, 8.0)],
        [(-5.0, 0.0), (-5.2, -3.5), (-5.0, -6.4), (20.0, -6.4), (20.5, -4.4), (20.5, 4.5), (32.0, 5.0), (32.0, -5.0),
         (20.5, -5.5)],
        [(-5.0, 0.0), (-12.0, 0.0), (-12.0, 3.0), (-8.0, -3.0)]],
    1: [[(1.4, -2.2), (3.5, -0.2), (17.0, 0.0), (17.0, -2.0), (13.5, -3.5), (5.0, -3.5), (5.0, 3.5), (12.5, 3.5),
         (16.0, 3.0)]],
}
# por donde sigue solo el socio al que el robot le indico el camino (despues va a LUGARES[...]['sitio'])
A_PIE = {'piscina': [(-2.2, -0.6), (-4.6, -0.6), (-5.3, -3.5), (-5.0, -6.4), (20.0, -6.4), (20.6, -5.0)],
         'tenis': [(-2.2, 0.6), (-4.6, 0.6), (-5.0, 3.0), (-4.75, 6.6), (-3.4, 7.8)],
         'gimnasio': [(5.4, 0.5)], 'spa': [(14.5, 0.0)]}          # en el 2.o piso, despues del ascensor
_EDIFICIO = [(-4.0, 3.0, -3.0, 3.0), (3.0, 19.0, -5.25, 5.25)]     # lobby + pasillo y salas
ZONAS_PISO = {   # rectangulos por donde el robot puede planear rutas, por piso
    0: _EDIFICIO + [ASCENSOR['cabina'], (0.7, 2.1, -3.2, -2.9),       # cabina y puerta del ascensor
                    (-15.0, -4.0, -3.5, 3.5), (-5.6, -3.9, 3.4, 6.6),   # plaza de llegada y sendero a la cancha
                    (-5.5, 25.5, 6.0, 21.0),                           # cancha de tenis
                    (-6.6, -4.0, -7.3, -3.4), (-6.6, 33.0, -7.3, -5.6), (19.0, 33.0, -7.3, 6.5)],   # costado sur y piscina
    1: [ASCENSOR['cabina'], (0.7, 2.1, -3.2, -2.9), (0.4, 3.0, -3.05, -1.25), (3.0, 19.0, -5.25, 5.25)],
}


class _En:
    """Para reusar _caja/_mesa/_sofa/_planta dentro de un cuerpo (usan spec.worldbody)."""
    def __init__(self, body):
        self.worldbody = body


def _exterior(spec):
    """Piscina y cancha de tenis: decoracion del club (el robot no va alla; el lidar no las ve)."""
    blanco = [0.95, 0.95, 0.93, 1]
    # piscina: deck de piedra, agua, borde, carriles, asoleadoras y parasoles
    deck = _mat(spec, 'deck', [0.82, 0.78, 0.7], [0.78, 0.74, 0.66], [0.8, 0.8], mark=[0.7, 0.66, 0.6])
    _floor(spec, 'f_deck', 19.0, 33.0, -6.5, 6.5, [1, 1, 1, 1], material=deck)
    agua = _mat(spec, 'agua', [0.25, 0.62, 0.85], [0.22, 0.58, 0.82], [0.5, 0.5])
    x0, x1, y0, y1 = PISCINA
    _floor(spec, 'f_agua', x0, x1, y0, y1, [1, 1, 1, 1], z=0.004, material=agua)
    for a, b in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)), ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
        (ax, ay), (bx, by) = a, b                                              # borde blanco
        if ay == by:
            _caja(spec, [(ax + bx) / 2, ay, 0.03], [(bx - ax) / 2 + 0.2, 0.2, 0.03], blanco)
        else:
            _caja(spec, [ax, (ay + by) / 2, 0.03], [0.2, (by - ay) / 2, 0.03], blanco)
    vidrio = [0.75, 0.9, 0.95, 0.25]                                            # valla de vidrio (la ve el lidar)
    _caja(spec, [(x0 + x1) / 2, y0 - 0.4, 0.5], [(x1 - x0) / 2 + 0.4, 0.02, 0.5], vidrio, True)
    _caja(spec, [(x0 + x1) / 2, y1 + 0.4, 0.5], [(x1 - x0) / 2 + 0.4, 0.02, 0.5], vidrio, True)
    _caja(spec, [x0 - 0.4, 0.0, 0.5], [0.02, (y1 - y0) / 2 + 0.4, 0.5], vidrio, True)
    _caja(spec, [x1 + 0.4, 0.0, 0.5], [0.02, (y1 - y0) / 2 + 0.4, 0.5], vidrio, True)
    for y in np.linspace(y0, y1, 5)[1:-1]:                                    # carriles
        _caja(spec, [(x0 + x1) / 2, y, 0.008], [(x1 - x0) / 2 - 0.4, 0.04, 0.003], [0.1, 0.25, 0.55, 1])
    for lado in (-1, 1):
        for k, x in enumerate(np.arange(x0 + 0.6, x1, 1.6)):
            y = lado * (y1 + 1.6)
            _caja(spec, [x, y, 0.22], [0.32, 0.9, 0.05], blanco)                 # asoleadora
            _caja(spec, [x, y + lado * 0.75, 0.42], [0.3, 0.06, 0.22], blanco, yaw=0)
            if k % 2:                                                           # parasol
                _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.5, 0.5, 0.5, 1], True, pos=[x + 0.8, y, 1.1], size=[0.03, 1.1])
                _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_ELLIPSOID, [0.95, 0.55, 0.2, 1], pos=[x + 0.8, y, 2.2],
                      size=[1.1, 1.1, 0.18])
    _planta(spec, 19.6, 5.8, 0.85)
    _planta(spec, 19.6, -5.8, 0.85)
    _label(spec, 'Piscina', ((x0 + x1) / 2, 0.0), 1.2)
    # cancha de tenis (medidas reales: 23.77 x 10.97 m, sencillos 8.23 m) con red, lineas y malla
    cx, cy = TENIS
    L, D, S, SV = 11.885, 5.485, 4.115, 6.4
    _floor(spec, 'f_tenis_borde', cx - 15.5, cx + 15.5, cy - 7.5, cy + 7.5, [0.25, 0.5, 0.38, 1])
    _floor(spec, 'f_tenis', cx - L, cx + L, cy - D, cy + D, [0.2, 0.36, 0.62, 1], z=0.0012)
    linea = lambda xa, xb, ya, yb: _floor(spec, '', xa - 0.025, xb + 0.025, ya - 0.025, yb + 0.025, blanco, z=0.002)  # noqa: E731
    for x in (cx - L, cx + L):
        linea(x, x, cy - D, cy + D)                                            # fondos
    for y in (cy - D, cy + D, cy - S, cy + S):
        linea(cx - L, cx + L, y, y)                                            # laterales (dobles y sencillos)
    for x in (cx - SV, cx + SV):
        linea(x, x, cy - S, cy + S)                                            # lineas de saque
    linea(cx - SV, cx + SV, cy, cy)                                            # linea central de saque
    _caja(spec, [cx, cy, 0.46], [0.02, D + 0.9, 0.45], [0.08, 0.08, 0.1, 0.75])          # red
    _caja(spec, [cx, cy, 0.93], [0.03, D + 0.9, 0.03], blanco)                            # cinta
    for y in (cy - D - 0.9, cy + D + 0.9):
        _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.2, 0.2, 0.22, 1], pos=[cx, y, 0.53], size=[0.04, 0.53])
    malla = [0.15, 0.3, 0.2, 0.12]                                             # malla perimetral (la ve el lidar)
    puerta = (-4.75, 1.3)                                                      # puerta de la malla, sobre el sendero
    xa, xb, ya, yb = cx - 15.5, cx + 15.5, cy - 7.5, cy + 7.5
    for a, b in (((xa, ya), (puerta[0] - puerta[1] / 2, ya)), ((puerta[0] + puerta[1] / 2, ya), (xb, ya)),
                 ((xa, yb), (xb, yb)), ((xa, ya), (xa, yb)), ((xb, ya), (xb, yb))):
        _caja(spec, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1.1], [max(abs(b[0] - a[0]) / 2, 0.02), max(abs(b[1] - a[1]) / 2, 0.02), 1.1],
              malla, True)
    for k in range(9):                                                         # postes de la malla
        for y in (ya, yb):
            _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.2, 0.25, 0.22, 1], True, pos=[xa + k * 31 / 8, y, 1.1],
                  size=[0.035, 1.1])
    for x in (cx - 3, cx + 3):                                                 # bancas junto a la red
        _caja(spec, [x, cy + 6.8, 0.22], [0.9, 0.2, 0.04], MADERA)
    _floor(spec, 'f_sendero', -5.5, -4.0, 3.5, cy - 7.5, [1, 1, 1, 1], material='plaza')   # sendero desde la plaza
    _label(spec, 'Cancha de tenis', (cx, cy + 6.0), 1.6)
    # faroles (los ve el lidar: referencias para no perderse afuera, donde casi solo hay paredes rectas)
    # a distancias irregulares: una fila periodica se confunde consigo misma al alinear escaneos
    faroles = [(x, -7.7) for x in (-6.0, -2.5, 1.5, 4.0, 7.5, 9.5, 12.0, 13.5, 16.5, 18.0, 21.0, 24.5, 26.0, 29.5, 32.0)]
    faroles += [(33.4, y) for y in (-3.0, 1.0, 5.0)] + [(x, y) for x in (-8.0, -12.0) for y in (-3.8, 3.8)] + [(-6.1, 4.8)]
    for x, y in faroles:
        _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.18, 0.18, 0.2, 1], True, pos=[x, y, 1.3], size=[0.07, 1.3])
        _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_SPHERE, [1.0, 0.95, 0.75, 1], pos=[x, y, 2.7], size=[0.16])
    for x, largo in ((10.8, 0.9), (14.8, 0.5), (19.6, 1.3)):                   # jardineras altas del costado sur
        _caja(spec, [x, -8.25, 0.55], [largo / 2, 0.3, 0.55], [0.55, 0.5, 0.45, 1], True)
        _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_ELLIPSOID, [0.2, 0.5, 0.22, 1], pos=[x, -8.25, 1.25], size=[largo / 2, 0.3, 0.25])


def _segundo_piso(spec):
    """Segundo piso sobre las salas: gimnasio, terraza bar y spa; escalera y ascensor junto al lobby. Semitransparente
    (se ve el primer piso) y en su propio grupo: el boton '2.o piso' del tablero lo oculta."""
    p = spec.worldbody.add_body(name='piso2', pos=[0, 0, 0])
    e, Z = _En(p), PISO2_Z
    vidrio = [0.8, 0.9, 0.95, 0.18]
    _caja(e, [11.0, 0.0, Z - 0.05], [8.0, 5.25, 0.05], [0.85, 0.83, 0.78, 0.12])                  # losa
    _caja(e, [1.7, -2.15, Z - 0.05], [1.3, 0.9, 0.05], [0.85, 0.83, 0.78, 0.12])                  # descanso del ascensor
    for zona, (x0, x1, y0, y1), rgba in (('gim', (4, 13, 1.25, 5.25), [0.3, 0.3, 0.33, 0.2]),
                                         ('terraza', (4, 13, -5.25, -1.25), [0.55, 0.4, 0.26, 0.2]),
                                         ('spa', (15, 19, -2.5, 2.5), [0.6, 0.8, 0.85, 0.2])):
        _caja(e, [(x0 + x1) / 2, (y0 + y1) / 2, Z + 0.003], [(x1 - x0) / 2, (y1 - y0) / 2, 0.003], rgba)
    baranda = spec.worldbody.add_body(name='piso2_baranda', pos=[0, 0, 0])   # la ve el lidar del 2.o piso
    for (ax, ay), (bx, by) in (((3, -5.25), (19, -5.25)), ((3, 5.25), (19, 5.25)), ((19, -5.25), (19, 5.25)),
                               ((3, -1.25), (3, 5.25)), ((3, -4.3), (3, -3.05)), ((0.4, -3.05), (0.4, -1.25)),
                               ((0.4, -1.25), (3, -1.25)), ((0.4, -3.05), (0.7, -3.05)), ((2.1, -3.05), (3, -3.05))):
        _caja(_En(baranda), [(ax + bx) / 2, (ay + by) / 2, Z + 0.5], [max(abs(bx - ax) / 2, 0.02), max(abs(by - ay) / 2, 0.02), 0.5],
              vidrio)
    # gimnasio: caminadoras, bicicletas, rack de pesas y tapetes
    for k in range(5):
        x = 4.7 + 1.0 * k
        _caja(e, [x, 4.5, Z + 0.15], [0.35, 0.8, 0.15], [0.15, 0.15, 0.17, 1])
        _caja(e, [x, 3.8, Z + 0.75], [0.35, 0.05, 0.45], [0.4, 0.4, 0.42, 1])
    for k in range(4):
        x = 9.6 + 0.9 * k
        _caja(e, [x, 4.6, Z + 0.35], [0.12, 0.45, 0.35], [0.75, 0.15, 0.15, 1])
        _caja(e, [x, 4.25, Z + 0.85], [0.2, 0.08, 0.08], [0.2, 0.2, 0.2, 1])
    _caja(e, [12.6, 2.3, Z + 0.7], [0.25, 0.9, 0.7], [0.25, 0.25, 0.28, 1])
    for k in range(3):
        _caja(e, [5.2 + 1.2 * k, 2.2, Z + 0.01], [0.45, 0.9, 0.01], [0.2, 0.55, 0.6, 1])
    # terraza bar: barra y mesas
    _caja(e, [12.4, -3.2, Z + 0.55], [0.3, 1.6, 0.55], MADERA)
    _caja(e, [12.4, -3.2, Z + 1.12], [0.35, 1.65, 0.025], [0.85, 0.7, 0.3, 1])
    t = spec.worldbody.add_body(name='piso2_mesas', pos=[0, 0, Z])
    for x, y in ((5.0, -4.3), (7.2, -4.3), (5.0, -2.2), (7.2, -2.2), (9.6, -3.2)):
        _mesa(_En(t), x, y, sillas=3)
    for x, y in ((4.4, -1.7), (12.6, -1.7)):
        _planta(_En(t), x, y)
    # spa: jacuzzi y camillas
    _geom(p, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.9, 0.9, 0.88, 1], pos=[17.6, 0.0, Z + 0.35], size=[1.1, 0.35])
    _geom(p, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.3, 0.7, 0.9, 1], pos=[17.6, 0.0, Z + 0.7], size=[0.95, 0.01])
    for y in (-1.8, 1.8):
        _caja(e, [15.9, y, Z + 0.35], [0.9, 0.35, 0.35], [0.95, 0.95, 0.95, 1])
    # escalera (afuera del lobby, lado sur) y ascensor (puerta en la pared del lobby)
    pasos = 18
    for k in range(pasos):
        _caja(e, [-2.5 + 0.3 * k + 0.15, -4.75, Z * (k + 0.5) / pasos], [0.15, 0.45, Z / pasos / 2], [0.7, 0.68, 0.64, 1])
    for b in (p, t, baranda):                           # todo el piso en su grupo, semitransparente
        for g in b.geoms:
            g.group = PISO2
            g.rgba = [*g.rgba[:3], min(g.rgba[3], 0.45)]
    # pisos con colision (invisibles): el X2 camina sobre ellos
    for pos, size in (([11.0, 0.0, Z - 0.05], [8.0, 5.25, 0.05]), ([1.7, -2.15, Z - 0.05], [1.3, 0.9, 0.05])):
        spec.worldbody.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, pos=pos, size=size, group=3, rgba=[0, 0, 0, 0])
    for nombre, xy in (('Gimnasio (2.o piso)', (8.5, 3.2)), ('Terraza bar (2.o piso)', (8.5, -3.2)),
                       ('Spa (2.o piso)', (17.0, 0.0))):
        _label(spec, nombre, xy, Z + 2.0)


def _ascensor(spec):
    """Cubo con paredes que ve el lidar, cabina mocap con piso de colision (sube al robot) y una puerta por piso."""
    x0, x1, y0, y1 = ASCENSOR['cabina']
    alto = PISO2_Z + 2.4
    metal = [0.62, 0.65, 0.7, 1]
    for pos, size in (([(x0 + x1) / 2, y0 - 0.05, alto / 2], [(x1 - x0) / 2 + 0.1, 0.05, alto / 2]),
                      ([x0 - 0.05, (y0 + y1) / 2, alto / 2], [0.05, (y1 - y0) / 2, alto / 2]),
                      ([x1 + 0.05, (y0 + y1) / 2, alto / 2], [0.05, (y1 - y0) / 2, alto / 2])):
        _caja(spec, pos, size, [0.6, 0.65, 0.7, 0.35], True)
    c = spec.worldbody.add_body(name='asc_cabina', mocap=True, pos=[(x0 + x1) / 2, (y0 + y1) / 2, 0])
    c.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, pos=[0, 0, -0.05], size=[(x1 - x0) / 2, (y1 - y0) / 2, 0.05], rgba=metal)
    _geom(c, mujoco.mjtGeom.mjGEOM_BOX, [1, 1, 0.9, 0.2], pos=[0, 0, 2.3], size=[(x1 - x0) / 2, (y1 - y0) / 2, 0.02])   # techo (se ve adentro)
    for piso, z in enumerate((0.0, PISO2_Z)):
        d = spec.worldbody.add_body(name=f'asc_puerta_{piso}', mocap=True, pos=[ASCENSOR['puerta_x'], y1 + 0.05, z])
        d.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, contype=0, conaffinity=0, group=VISTO, pos=[0, 0, 1.05],
                   size=[ASCENSOR['ancho'] / 2, 0.03, 1.05], rgba=metal)
        _geom(d, mujoco.mjtGeom.mjGEOM_BOX, [0.3, 0.3, 0.32, 1], pos=[0, 0.035, 1.05], size=[0.006, 0.006, 1.05])
    _label(spec, 'Ascensor', (ASCENSOR['puerta_x'], -2.7), 2.4)


def _wall(spec, a, b, gap=None):
    """Pared de a a b (en planta). gap=(centro, ancho) deja el hueco de una puerta."""
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    length = np.linalg.norm(d)
    u = d / length
    pieces = [(0.0, length)]
    if gap:
        c = np.dot(np.array(gap[0]) - a, u)
        pieces = [(0.0, c - gap[1] / 2), (c + gap[1] / 2, length)]
    for s0, s1 in pieces:
        if s1 - s0 < 1e-3:
            continue
        mid = a + u * (s0 + s1) / 2
        yaw = np.arctan2(u[1], u[0])
        spec.worldbody.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, contype=0, conaffinity=0, group=VISTO,
                                pos=[mid[0], mid[1], WALL_H / 2], size=[(s1 - s0) / 2, WALL_T / 2, WALL_H / 2],
                                quat=[np.cos(yaw / 2), 0, 0, np.sin(yaw / 2)], rgba=WALL_RGBA)


def _label(spec, name, pos, z=2.0):
    spec.worldbody.add_site(name=name, pos=[pos[0], pos[1], z], size=[0.01], rgba=[0, 0, 0, 0])


def add_person(spec, name, rgba, pos):
    """Visitante: cuerpo mocap (capsula + cabeza) con etiqueta. Devuelve el nombre del cuerpo."""
    b = spec.worldbody.add_body(name=name, mocap=True, pos=[pos[0], pos[1], 0])
    cap = mujoco.mjtGeom.mjGEOM_CAPSULE
    pantalon = [0.15, 0.16, 0.2, 1]
    for y in (-0.09, 0.09):
        _geom(b, cap, pantalon, True, fromto=[0, y, 0.08, 0, y, 0.82], size=[0.075])
        _geom(b, mujoco.mjtGeom.mjGEOM_BOX, [0.08, 0.06, 0.05, 1], pos=[0.05, y, 0.04], size=[0.12, 0.06, 0.04])
    _geom(b, cap, rgba, True, fromto=[0, 0, 0.98, 0, 0, 1.34], size=[0.19])             # torso: lo ve el lidar
    for y in (-0.26, 0.26):
        _geom(b, cap, rgba, fromto=[0, y, 1.38, 0.02, y * 1.05, 0.92], size=[0.055])
        _geom(b, mujoco.mjtGeom.mjGEOM_SPHERE, PIEL, pos=[0.02, y * 1.05, 0.86], size=[0.05])
    _geom(b, mujoco.mjtGeom.mjGEOM_CAPSULE, PIEL, fromto=[0, 0, 1.45, 0, 0, 1.52], size=[0.05])
    _geom(b, mujoco.mjtGeom.mjGEOM_SPHERE, PIEL, pos=[0, 0, 1.63], size=[0.12])
    _geom(b, mujoco.mjtGeom.mjGEOM_ELLIPSOID, [0.18, 0.12, 0.08, 1], pos=[-0.025, 0, 1.68], size=[0.125, 0.125, 0.1])
    b.add_site(name=name.replace('_', ' '), pos=[0, 0, 1.95], size=[0.01], rgba=[0, 0, 0, 0])
    return name


def build(people, sombras=False):
    """sombras=True: sombras y el modelo completo del X2 (para el video; en vivo pesan)."""
    """people: lista de (nombre_cuerpo, rgba, pos_inicial). Devuelve (model, data)."""
    spec = mujoco.MjSpec.from_file(str(escena(sombras)))
    for s in spec.sites:            # ocultar sitios internos del X2 (si no, salen sus etiquetas)
        s.group = 5

    # arnes del X2 (como la grua real): mocap + weld suave a la pelvis
    spec.worldbody.add_body(name='harness', mocap=True, pos=[0, 0, 0.68])
    spec.add_equality(type=mujoco.mjtEq.mjEQ_WELD, name1='harness', name2='pelvis',
                      objtype=mujoco.mjtObj.mjOBJ_BODY, solref=[0.03, 1])
    # "LED" de estado sobre la cabeza del robot: su color cambia segun la categoria
    head = next(b for b in spec.bodies if b.name == 'head_pitch_link')
    head.add_geom(name='led', type=mujoco.mjtGeom.mjGEOM_SPHERE, contype=0, conaffinity=0,
                  pos=[0, 0, 0.22], size=[0.06], rgba=[0.6, 0.6, 0.6, 1])
    import camaras                  # camara RGBD delantera y RGB trasera de la cabeza (como el X2 real)
    camaras.montar(spec)

    # entorno: cielo claro y cesped alrededor del club (en vez de la cuadricula del modelo)
    for t in spec.textures:
        if t.type == mujoco.mjtTexture.mjTEXTURE_SKYBOX:
            t.rgb1, t.rgb2 = [0.78, 0.87, 0.96], [0.42, 0.58, 0.78]
        elif t.name == 'groundplane':
            t.rgb1, t.rgb2, t.markrgb = [0.38, 0.5, 0.32], [0.36, 0.48, 0.3], [0.36, 0.48, 0.3]
    for mat in spec.materials:
        if mat.name == 'groundplane':
            mat.reflectance, mat.texrepeat = 0.0, [2, 2]
    spec.visual.rgba.haze = [0.8, 0.87, 0.95, 1]
    # pisos: marmol en el lobby, madera en el pasillo (las salas en _amueblar)
    marmol = _mat(spec, 'marmol', [0.78, 0.76, 0.72], [0.7, 0.68, 0.64], [1, 1], mark=[0.6, 0.58, 0.55])   # sin reflejo: dibujaria la escena dos veces
    tablas = _mat(spec, 'tablas', [0.56, 0.4, 0.26], [0.5, 0.35, 0.22], [1, 4])
    _floor(spec, 'f_lobby', *LOBBY, [1, 1, 1, 1], material=marmol)
    _floor(spec, 'f_corr', *CORRIDOR, [1, 1, 1, 1], material=tablas)
    for cat, r in ROOMS.items():
        _label(spec, r['label'], r['inside'])
    _amueblar(spec)
    _exterior(spec)
    _segundo_piso(spec)
    _ascensor(spec)
    _label(spec, 'Recepcion', (-2.0, 1.2), 1.3)
    # marca de HOME en el piso: disco + flecha hacia donde debe mirar el robot
    hx, hy = HOME['xy']
    spec.worldbody.add_geom(name='home_mark', type=mujoco.mjtGeom.mjGEOM_CYLINDER, contype=0, conaffinity=0,
                            pos=[hx, hy, 0.002], size=[0.45, 0.002], rgba=[0.1, 0.85, 0.9, 0.6])
    spec.worldbody.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, contype=0, conaffinity=0,
                            pos=[hx + 0.55 * np.cos(HOME['yaw']), hy + 0.55 * np.sin(HOME['yaw']), 0.003],
                            size=[0.15, 0.05, 0.002], quat=[np.cos(HOME['yaw'] / 2), 0, 0, np.sin(HOME['yaw'] / 2)],
                            rgba=[0.1, 0.85, 0.9, 0.9])
    _label(spec, 'HOME', HOME['xy'], 0.15)
    _label(spec, 'Entrada', ENTRY, 1.0)
    mx, my = MANT_ROBOT['xy']
    _floor(spec, 'f_mant_robot', mx - 0.6, mx + 0.6, my - 0.6, my + 0.6, [0.85, 0.6, 0.1, 1], z=0.0015)
    _label(spec, 'Mantenimiento robot', MANT_ROBOT['xy'], 1.0)

    # paredes: lobby, pasillo y salas (con huecos de puerta)
    x0, x1, y0, y1 = LOBBY
    _wall(spec, (x0, y0), (x1, y0), gap=((ASCENSOR['puerta_x'], y0), ASCENSOR['ancho'])); _wall(spec, (x0, y1), (x1, y1))
    _wall(spec, (x0, y0), (x0, y1), gap=((x0, 0), 1.6))
    _wall(spec, (x1, y0), (x1, -1.25)); _wall(spec, (x1, 1.25), (x1, y1))
    for cat, r in ROOMS.items():
        bx0, bx1, by0, by1 = r['box']
        door = r['door']
        edges = [((bx0, by0), (bx1, by0)), ((bx1, by0), (bx1, by1)), ((bx1, by1), (bx0, by1)), ((bx0, by1), (bx0, by0))]
        for a, b in edges:
            on_edge = (abs(a[0] - b[0]) < 1e-6 and abs(a[0] - door[0]) < 1e-6) or \
                      (abs(a[1] - b[1]) < 1e-6 and abs(a[1] - door[1]) < 1e-6)
            _wall(spec, a, b, gap=(door, DOOR_W) if on_edge else None)
        # puerta: panel mocap que desliza a lo largo de la pared
        yaw = np.arctan2(r['axis'][1], r['axis'][0])
        d = spec.worldbody.add_body(name=f'door_{cat}', mocap=True, pos=[door[0], door[1], 0],
                                    quat=[np.cos(yaw / 2), 0, 0, np.sin(yaw / 2)])
        d.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, contype=0, conaffinity=0, group=VISTO, pos=[0, 0, WALL_H / 2],
                   size=[DOOR_W / 2, 0.05, WALL_H / 2], rgba=MADERA)
        _geom(d, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.85, 0.75, 0.4, 1], pos=[DOOR_W / 2 - 0.12, 0.07, 0.9],
              size=[0.03, 0.02], quat=[0.7071, 0.7071, 0, 0])      # manija
    # pared exterior del pasillo (lados sin salas)
    _wall(spec, (3, 1.25), (4, 1.25)); _wall(spec, (8, 1.25), (9, 1.25)); _wall(spec, (13, 1.25), (15, 1.25))
    _wall(spec, (3, -1.25), (4, -1.25)); _wall(spec, (8, -1.25), (9, -1.25)); _wall(spec, (13, -1.25), (15, -1.25))

    # obstaculos que el robot no conoce de antemano: los descubre con el lidar y los esquiva al planear
    for x, y, r in OBSTACULOS:
        spec.worldbody.add_geom(type=mujoco.mjtGeom.mjGEOM_CYLINDER, contype=0, conaffinity=0, group=VISTO,
                                pos=[x, y, 0.5], size=[r, 0.5], rgba=[0.62, 0.36, 0.24, 1])
        _geom(spec.worldbody, mujoco.mjtGeom.mjGEOM_ELLIPSOID, [0.2, 0.5, 0.22, 1], pos=[x, y, 1.25], size=[0.4, 0.4, 0.5])

    for name, (sx, sy, sz, rgba) in OBJETOS.items():
        b = spec.worldbody.add_body(name=name, mocap=True, pos=[*LEJOS, 0])
        b.add_geom(type=mujoco.mjtGeom.mjGEOM_BOX, contype=0, conaffinity=0, group=VISTO, pos=[0, 0, sz],
                   size=[sx, sy, sz], rgba=rgba)
        if name == 'Carrito':
            _geom(b, mujoco.mjtGeom.mjGEOM_CAPSULE, [0.7, 0.7, 0.72, 1], fromto=[-sx, -sy, 2 * sz + 0.2, -sx, sy, 2 * sz + 0.2],
                  size=[0.02])
            _geom(b, mujoco.mjtGeom.mjGEOM_CYLINDER, [0.95, 0.85, 0.1, 1], pos=[0.1, 0, 2 * sz + 0.15], size=[0.12, 0.15])
        else:
            for k in range(-2, 3):
                _geom(b, mujoco.mjtGeom.mjGEOM_BOX, [0.1, 0.1, 0.1, 1], pos=[0.0, k * 0.48, sz], size=[sx + 0.005, 0.09, sz * 0.7])
        b.add_site(name=name, pos=[0, 0, 2 * sz + 0.3], size=[0.01], rgba=[0, 0, 0, 0])

    for name, rgba, pos in people:
        add_person(spec, name, rgba, pos)

    # luz: sol con sombras + luz ambiente suave (antes solo la luz de la camara)
    sol = spec.worldbody.add_light(name='sol', pos=[6, -4, 12], dir=[-0.25, 0.3, -1], castshadow=sombras,
                                   diffuse=[0.75, 0.73, 0.68], specular=[0.2, 0.2, 0.2])
    sol.type = mujoco.mjtLightType.mjLIGHT_DIRECTIONAL
    spec.worldbody.add_light(name='techo', pos=[6, 0, 6], dir=[0, 0, -1], castshadow=False, diffuse=[0.25, 0.25, 0.25])
    spec.visual.headlight.ambient, spec.visual.headlight.diffuse = [0.35, 0.35, 0.36], [0.25, 0.25, 0.25]
    spec.visual.quality.shadowsize = 4096 if sombras else 1024   # sombras: solo para el video (pesan en vivo)
    spec.visual.quality.offsamples = 0   # sin antialiasing fuera de pantalla: la segmentacion de las camaras lo exige
    spec.visual.map.shadowclip = 1.2   # menos 'acne' de sombra en el cesped
    spec.stat.center, spec.stat.extent = [12.0, 5.0, 0.5], 24.0   # sombras para todo el club (con piscina y tenis)
    spec.visual.global_.offwidth, spec.visual.global_.offheight = 1920, 1080   # capturas en alta
    m = spec.compile()
    return m, mujoco.MjData(m)


def mocap_id(m, body):
    return m.body_mocapid[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, body)]
