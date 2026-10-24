"""Percepcion del X2 en el club simulado: lidar 2D -> SLAM -> rutas.

- Lidar: 180 rayos (2 grados), 8 m, a 0.9 m del piso, ruido 2 cm; mas un plano a 0.3 m (camara de profundidad)
  para lo bajo que el lidar no ve. Solo ve el mundo (paredes, puertas, personas,
  muebles: geoms del grupo GRUPO), no al propio robot.
- SLAM: mapa de ocupacion (log-odds, celdas de 10 cm) + pose estimada. La odometria (lo que el robot cree que
  camino) tiene ruido y deriva; cada escaneo se alinea contra el mapa (busqueda correlativa) y corrige la pose.
  La pose real solo se usa para medir el error (y como "odometria pura" para comparar).
- Rutas: camino de menor costo (Dijkstra) sobre SU mapa (obstaculos inflados con el radio del robot, prefiere ir lejos de las paredes),
  simplificada a pocos puntos de giro. Lo no explorado se puede cruzar pero cuesta mas (se replanea con lo
  que va viendo).
ponytail: el robot ejecuta la ruta con el arnes en coordenadas del mundo; el error del SLAM se mide y se muestra.
"""
import mujoco
import numpy as np
from scipy import ndimage
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

GRUPO = 4                                   # grupo de geoms que el lidar puede ver
RES = 0.1                                   # m por celda
X0, Y0, W, H = -16.0, -8.0, 500, 300        # el mapa cubre x -16..34, y -8..22 (club, cancha de tenis y piscina)
N_RAYOS, ALCANCE, ALTURA, RUIDO = 180, 8.0, 0.9, 0.02
ALTURA_BAJA = 0.3                           # camara de profundidad del X2: ve lo bajo (materas, sillas) que el lidar no
L_LIBRE, L_OCUP, L_MAX = -0.4, 0.9, 5.0
RADIO = 0.35                                # radio del X2 + margen, para planear
ODO_RUIDO, ODO_DERIVA = 0.04, 0.012         # 4 % de error por paso; deriva de giro (rad por metro)


class Lidar:
    def __init__(self, m, d, grupos=(GRUPO,), z=0.0):
        self.m, self.d, self.z = m, d, z                # z: altura del piso donde esta el robot
        self.ang = np.linspace(-np.pi, np.pi, N_RAYOS, endpoint=False)
        self.grupo = np.zeros(6, np.uint8)
        self.grupo[list(grupos)] = 1
        self.geomid = np.zeros(N_RAYOS, np.int32)
        self.dist = np.zeros(N_RAYOS)

    def medir(self, xy, yaw, rng):
        """-> distancias (inf = nada a menos de ALCANCE), en el marco del robot (self.ang)."""
        a = self.ang + yaw
        vec = np.stack([np.cos(a), np.sin(a), np.zeros(N_RAYOS)], 1).ravel()
        r = np.full(N_RAYOS, np.inf)
        for alto in (ALTURA, ALTURA_BAJA):                       # lidar + plano bajo de la camara de profundidad
            mujoco.mj_multiRay(self.m, self.d, np.array([xy[0], xy[1], self.z + alto]), vec, self.grupo, 1, -1,
                               self.geomid, self.dist, None, N_RAYOS, ALCANCE)
            ok = (self.geomid >= 0) & (self.dist >= 0)
            r[ok] = np.minimum(r[ok], self.dist[ok])
        ok = np.isfinite(r)
        r[ok] += rng.normal(0, RUIDO, ok.sum())
        return r


def celdas(xy):
    """(n,2) metros -> (iy, ix, dentro)."""
    ix = np.floor((xy[..., 0] - X0) / RES).astype(int)
    iy = np.floor((xy[..., 1] - Y0) / RES).astype(int)
    dentro = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
    return np.clip(iy, 0, H - 1), np.clip(ix, 0, W - 1), dentro


def centro(iy, ix):
    return np.array([X0 + (ix + 0.5) * RES, Y0 + (iy + 0.5) * RES])


def _rot(yaw):
    c, s = np.cos(yaw), np.sin(yaw)
    return np.array([[c, -s], [s, c]])


class SLAM:
    def __init__(self, m, d, xy, yaw, semilla=0, zonas=None, grupos=(GRUPO,), z=0.0):
        self.fuera = None                               # celdas fuera de las zonas [(x0, x1, y0, y1)]: no planea ahi
        if zonas:
            cx, cy = centro(*np.mgrid[0:H, 0:W])
            self.fuera = np.ones((H, W), bool)
            for x0, x1, y0, y1 in zonas:
                self.fuera &= ~((cx >= x0) & (cx <= x1) & (cy >= y0) & (cy <= y1))
        self.lidar = Lidar(m, d, grupos, z)
        self.ultimo = np.full(N_RAYOS, np.inf)
        self.rng = np.random.default_rng(semilla)
        self.l = np.zeros((H, W))                       # log-odds de ocupacion
        self.pose = np.array([*xy, yaw], float)         # estimada por el SLAM
        self.odo = self.pose.copy()                     # solo odometria (para comparar)
        self.real_ant = self.pose.copy()
        self.puntos = np.zeros((0, 2))                  # ultimo escaneo en el mundo (segun la pose estimada)
        self.n = 0
        self.errores = []                               # (error SLAM m, error solo odometria m, error yaw SLAM deg)
        self._verosimil = None

    def precargar(self, recorridos, paso=0.5):
        """Mapa hecho de antemano (al instalar el robot): escaneos desde poses conocidas a lo largo de recorridos
        [[(x, y), ...], ...]. Afuera, sin esto, el mapa se arma mientras la pose deriva y el robot se pierde."""
        rng = np.random.default_rng(99)
        for puntos in recorridos:
            for a, b in zip(puntos[:-1], puntos[1:]):
                a, b = np.array(a, float), np.array(b, float)
                for t in np.linspace(0, 1, max(2, int(np.linalg.norm(b - a) / paso) + 1)):
                    xy = a + (b - a) * t
                    self._actualizar_mapa(np.array([*xy, 0.0]), self.lidar.medir(xy, 0.0, rng))
        self.puntos = np.zeros((0, 2))

    def reubicar(self, xy, yaw):
        """Pose conocida (p. ej. al salir del ascensor, que esta en un lugar fijo del mapa)."""
        self.pose[:] = self.odo[:] = self.real_ant[:] = [*xy, yaw]

    # --- mapa ---
    def ocupado(self):
        return self.l > 0.6

    def libre(self):
        return self.l < -0.6

    def _actualizar_mapa(self, pose, r):
        ok = np.isfinite(r)
        dirs = np.stack([np.cos(self.lidar.ang + pose[2]), np.sin(self.lidar.ang + pose[2])], 1)
        hasta = np.where(ok, r, ALCANCE) - RES          # libre hasta justo antes del impacto
        t = np.arange(0, ALCANCE, RES / 2)
        pts = pose[:2] + dirs[:, None, :] * t[None, :, None]
        iy, ix, dentro = celdas(pts)
        sel = dentro & (t[None, :] < hasta[:, None])
        self.l.flat[np.unique(iy[sel] * W + ix[sel])] += L_LIBRE
        if ok.any():
            hits = pose[:2] + dirs[ok] * r[ok, None]
            iy, ix, dentro = celdas(hits)
            self.l.flat[np.unique(iy[dentro] * W + ix[dentro])] += L_OCUP
            self.puntos = hits
        np.clip(self.l, -L_MAX, L_MAX, out=self.l)
        self._verosimil = None

    def verosimilitud(self):
        """Mapa suavizado para alinear escaneos (un impacto cerca de una pared conocida suma)."""
        if self._verosimil is None:
            self._verosimil = ndimage.gaussian_filter(self.ocupado().astype(float), 1.0)
        return self._verosimil

    # --- localizacion ---
    def _alinear(self, pred, r):
        """Busqueda correlativa alrededor de la prediccion: la pose que mejor encaja el escaneo en el mapa."""
        ok = np.isfinite(r)
        if ok.sum() < 20:
            return pred
        local = np.stack([np.cos(self.lidar.ang[ok]), np.sin(self.lidar.ang[ok])], 1) * r[ok, None]
        v = self.verosimilitud()
        offs = np.stack(np.meshgrid(np.linspace(-0.1, 0.1, 9), np.linspace(-0.1, 0.1, 9)), -1).reshape(-1, 2)
        mejor, mejor_s = pred, -1.0
        for dyaw in np.radians(np.linspace(-2.0, 2.0, 11)):
            yaw = pred[2] + dyaw
            base = pred[:2] + local @ _rot(yaw).T                  # (P,2)
            iy, ix, dentro = celdas(base[None, :, :] + offs[:, None, :])
            s = (v[iy, ix] * dentro).sum(axis=1)                   # (81,)
            k = int(np.argmax(s))
            if s[k] > mejor_s:
                mejor_s, mejor = s[k], np.array([*(pred[:2] + offs[k]), yaw])
        return mejor

    def paso(self, xy_real, yaw_real):
        """Un escaneo: odometria con ruido -> alinear contra el mapa -> actualizar el mapa."""
        real = np.array([*xy_real, yaw_real], float)
        dl = _rot(-self.real_ant[2]) @ (real[:2] - self.real_ant[:2])          # avance en el marco del robot
        dyaw = (real[2] - self.real_ant[2] + np.pi) % (2 * np.pi) - np.pi
        self.real_ant = real
        dist = np.linalg.norm(dl)
        ruido = lambda: 1 + self.rng.normal(0, ODO_RUIDO)
        dl_o, dyaw_o = dl * ruido(), dyaw * ruido() + ODO_DERIVA * dist
        for p in (self.pose, self.odo):                                       # mover las dos estimaciones
            p[:2] += _rot(p[2]) @ dl_o
            p[2] += dyaw_o
        r = self.lidar.medir(xy_real, yaw_real, self.rng)
        self.ultimo = r                                                       # para el seguidor (camaras.py)
        if self.n >= 3:                                                       # con algo de mapa ya se alinea
            self.pose = self._alinear(self.pose, r)
        self._actualizar_mapa(self.pose, r)
        self.n += 1
        e_yaw = abs((self.pose[2] - real[2] + np.pi) % (2 * np.pi) - np.pi)
        self.errores.append((float(np.linalg.norm(self.pose[:2] - real[:2])),
                             float(np.linalg.norm(self.odo[:2] - real[:2])), float(np.degrees(e_yaw))))

    # --- rutas ---
    def bloqueado(self, libres=(), margen=0.0):
        """Celdas que el robot no puede pisar: ocupadas, infladas con RADIO (+ margen)."""
        disco = np.hypot(*np.mgrid[-5:6, -5:6]) * RES <= RADIO + margen
        b = ndimage.binary_dilation(self.ocupado(), structure=disco)
        if self.fuera is not None:
            b |= self.fuera
        for xy in libres:                                                     # inicio y meta siempre pisables
            iy, ix, _ = celdas(np.array(xy))
            b[max(iy - 3, 0):iy + 4, max(ix - 3, 0):ix + 4] = False
        return b

    def ruta(self, meta, inicio=None):
        """Camino de menor costo (Dijkstra de scipy, en C) en el mapa propio. -> lista de puntos de giro (sin el
        inicio) o None si no hay camino."""
        inicio = self.pose[:2] if inicio is None else np.array(inicio)
        b = self.bloqueado((inicio, meta))
        dist = ndimage.distance_transform_edt(~b) * RES
        costo = 1 + 2.0 / (0.2 + dist) + 3.0 * ~self.libre()                  # centro del pasillo; evita lo no visto
        s, g = tuple(int(v) for v in celdas(inicio)[:2]), tuple(int(v) for v in celdas(np.array(meta))[:2])
        libre = ~b
        if not (libre[s] and libre[g]):
            return None
        planos = np.flatnonzero(libre)                                       # nodo -> celda
        ids = np.full(H * W, -1)
        ids[planos] = np.arange(len(planos))
        ids = ids.reshape(H, W)
        src, dst, peso = [], [], []
        for dy, dx, k in ((-1, 0, 1), (1, 0, 1), (0, -1, 1), (0, 1, 1), (-1, -1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (1, 1, 1.414)):
            o = (slice(max(0, -dy), H - max(0, dy)), slice(max(0, -dx), W - max(0, dx)))   # celda de origen
            d = (slice(max(0, dy), H + min(0, dy)), slice(max(0, dx), W + min(0, dx)))     # su vecina
            ok = libre[o] & libre[d]
            src.append(ids[o][ok]), dst.append(ids[d][ok]), peso.append(k * costo[d][ok])
        n = len(planos)
        grafo = csr_matrix((np.concatenate(peso), (np.concatenate(src), np.concatenate(dst))), shape=(n, n))
        costos, previo = dijkstra(grafo, indices=ids[s], return_predecessors=True)
        if not np.isfinite(costos[ids[g]]):
            return None
        camino, c = [], ids[g]
        while c >= 0:
            camino.append(centro(*divmod(int(planos[c]), W)))
            c = previo[c]
        camino = camino[::-1]
        camino[0], camino[-1] = inicio, np.array(meta, float)
        return self._simplificar(camino, self.bloqueado((inicio, meta), margen=RES))   # atajos con holgura

    def bloqueo_adelante(self, xy, ruta, mira=2.0, ancho=0.22, ignorar=None):
        """Lo que ve AHORA el lidar sobre la ruta que va a pisar. -> metros (por la ruta) hasta lo primero que
        la invade, o None si esta libre. ancho: medio ancho del cuerpo (lo que roza a mas no frena).
        ignorar: donde esta el visitante que acompana (no es un obstaculo)."""
        puntos = self.puntos
        if ignorar is not None and len(puntos):
            puntos = puntos[np.linalg.norm(puntos - ignorar, axis=1) > 0.6]
        if not ruta or not len(puntos):
            return None
        pts = [np.array(xy, float)] + [np.array(q, float) for q in ruta]
        muestras, s_m, s = [], [], 0.0
        for a, c in zip(pts[:-1], pts[1:]):
            largo = np.linalg.norm(c - a)
            for k in range(1, max(1, int(largo / 0.1)) + 1):
                if s + largo * k / max(1, int(largo / 0.1)) > mira:
                    break
                f = k / max(1, int(largo / 0.1))
                muestras.append(a + (c - a) * f)
                s_m.append(s + largo * f)
            s += largo
            if s > mira:
                break
        if not muestras:
            return None
        dmin = np.linalg.norm(np.array(muestras)[:, None] - puntos[None], axis=2).min(axis=1)
        hit = np.where((dmin < ancho) & (np.array(s_m) > 0.3))[0]
        return float(s_m[hit[0]]) if len(hit) else None

    @staticmethod
    def _visible(a, c, b):
        n = max(2, int(np.linalg.norm(c - a) / (RES / 2)))
        iy, ix, _ = celdas(a + (c - a) * np.linspace(0, 1, n)[:, None])
        return not b[iy, ix].any()

    def _simplificar(self, camino, b):
        """Tira de la cuerda: del punto actual, salta al mas lejano que se ve en linea recta."""
        puntos, i = [], 0
        while i < len(camino) - 1:
            j = len(camino) - 1
            while j > i + 1 and not self._visible(camino[i], camino[j], b):
                j -= 1
            puntos.append(tuple(camino[j]))
            i = j
        return puntos


def imagen(slam, ruta=None, real=None, escala=2):
    """Vista de lo que percibe: desconocido gris, libre blanco, ocupado negro, escaneo rojo, ruta verde,
    pose estimada azul (y la real en gris claro para comparar). -> imagen BGR (OpenCV)."""
    import cv2
    p = 1 / (1 + np.exp(-slam.l))
    img = (255 * (1 - p)).astype(np.uint8)
    img = cv2.cvtColor(np.flipud(img), cv2.COLOR_GRAY2BGR)
    img = cv2.resize(img, (W * escala, H * escala), interpolation=cv2.INTER_NEAREST)

    def px(xy):
        return int((xy[0] - X0) / RES * escala), int((H - (xy[1] - Y0) / RES) * escala)

    if ruta:
        pts = [px(slam.pose[:2])] + [px(q) for q in ruta]
        cv2.polylines(img, [np.array(pts, np.int32)], False, (40, 170, 40), 2)
    for q in slam.puntos[::2]:
        cv2.circle(img, px(q), 2, (30, 30, 230), -1)
    if real is not None:
        cv2.circle(img, px(real[:2]), 7, (190, 190, 190), 1)
    x, y = px(slam.pose[:2])
    cv2.circle(img, (x, y), 7, (220, 120, 20), -1)
    cv2.line(img, (x, y), (x + int(14 * np.cos(slam.pose[2])), y - int(14 * np.sin(slam.pose[2]))), (220, 120, 20), 2)
    if slam.errores:
        e = slam.errores[-1]
        cv2.putText(img, f'SLAM: error {100 * e[0]:.0f} cm, {e[2]:.1f} deg | solo odometria: {100 * e[1]:.0f} cm',
                    (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 2)
    return img


if __name__ == '__main__':                  # prueba sin fisica: python sim/percepcion.py [--ver]
    import sys
    import time
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import club_world as cw
    m, d = cw.build([])
    mujoco.mj_forward(m, d)
    s = SLAM(m, d, cw.HOME['xy'], cw.HOME['yaw'])
    t0 = time.perf_counter()
    pose = np.array([*cw.HOME['xy'], cw.HOME['yaw']])
    for a, b in [((-1, 0), (3, 0)), ((3, 0), (8, 0)), ((8, 0), (3, 0)), ((3, 0), (-1, 0))]:   # recorrido de mapeo
        a, b = np.array(a, float), np.array(b, float)
        yaw = np.arctan2(*(b - a)[::-1])
        for k in range(1, 6):                                                              # giro en el sitio
            s.paso(pose[:2], pose[2] + ((yaw - pose[2] + np.pi) % (2 * np.pi) - np.pi) * k / 5)
        pose[2] = yaw
        for t in np.linspace(0, 1, int(np.linalg.norm(b - a) / 0.08) + 1)[1:]:          # 0.4 m/s, escaneo a 5 Hz
            pose[:2] = a + (b - a) * t
            s.paso(pose[:2], pose[2])
    dt = (time.perf_counter() - t0) / s.n
    e = np.array(s.errores)
    print(f'{s.n} escaneos, {1000 * dt:.1f} ms c/u | SLAM: error max {100 * e[:, 0].max():.0f} cm '
          f'(medio {100 * e[:, 0].mean():.0f}), '
          f'{e[:, 2].max():.1f} deg | solo odometria: {100 * e[:, 1].max():.0f} cm')
    ruta = s.ruta((14.3, 0.85), inicio=(-1.0, 0.0))
    print('ruta a la zona tecnica:', [(round(float(x), 1), round(float(y), 1)) for x, y in ruta])
    ox, oy, orad = cw.OBSTACULOS[0]
    puntos = np.concatenate([np.linspace(a, b, 50) for a, b in zip([(-1.0, 0.0)] + ruta[:-1], ruta)])
    libre = np.hypot(puntos[:, 0] - ox, puntos[:, 1] - oy).min() - orad
    print(f'distancia minima a la matera: {libre:.2f} m')
    assert e[:, 0].max() < 0.3 and e[:, 0].mean() < 0.12 and e[:, 2].max() < 3, 'el SLAM se perdio'
    assert e[:, 1].max() > 2 * e[:, 0].max(), 'la odometria sola deberia derivar mas que el SLAM'
    assert ruta and libre > RADIO - 0.05, 'la ruta no esquiva la matera'
    if '--ver' in sys.argv:
        import cv2
        cv2.imshow('Percepcion', imagen(s, ruta, pose))
        cv2.waitKey(0)
    print('percepcion OK')
