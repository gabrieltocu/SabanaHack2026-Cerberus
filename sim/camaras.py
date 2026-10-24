"""Camaras del X2 en la simulacion y seguimiento del visitante con camara trasera + lidar.

El X2 real trae una RGBD adelante y una RGB atras de la cabeza (URDF: rgbd_head_front, rgb_head_rear). Aqui se
montan en head_pitch_link y se renderizan fuera de pantalla.

Seguidor (reemplaza a la posicion real del visitante):
1. La camara (trasera; la delantera si el robot se giro a mirarlo) dice SI lo ve y en que direccion. El detector es
   la segmentacion del render, restringida a la persona que acompana. ponytail: detector y re-identificacion
   perfectos; en el robot real va YOLO + color de ropa.
2. El lidar da la distancia en esa direccion (el rayo mas corto en +-6 grados).
3. Si la camara lo pierde (gira en una esquina, lo tapa una pared) sigue con el lidar cerca de donde lo vio, hasta
   3 s. Despues: perdido (distancia inf) y el motor de decision lo espera.
"""
import mujoco
import numpy as np

ANCHO, ALTO = 320, 240
CAMARAS = {'frente': dict(pos=[0.0576, -0.0112, -0.0484], mira=0.0, baja=np.radians(25), fovy=70),
           'atras': dict(pos=[-0.0834, 0.0003, 0.0], mira=np.pi, baja=np.radians(12), fovy=90)}
MEMORIA_S = 3.0          # s que sigue con solo lidar despues de perderlo de vista
CERCA_LIDAR = 0.6        # m: punto del lidar que se acepta como la misma persona
MIN_PIXELES = 40
RADIO_PERSONA = 0.19     # m: el lidar mide hasta la ropa; el centro de la persona esta mas atras


def montar(spec):
    """Agrega las dos camaras a la cabeza del X2 (MjSpec, antes de compilar)."""
    head = next(b for b in spec.bodies if b.name == 'head_pitch_link')
    for nombre, c in CAMARAS.items():
        f = np.array([np.cos(c['mira']) * np.cos(c['baja']), np.sin(c['mira']) * np.cos(c['baja']), -np.sin(c['baja'])])
        up = np.array([np.cos(c['mira']) * np.sin(c['baja']), np.sin(c['mira']) * np.sin(c['baja']), np.cos(c['baja'])])
        z = -f                                            # MuJoCo: la camara mira hacia -z, y arriba = +y
        x = np.cross(up, z)
        q = np.zeros(4)
        mujoco.mju_mat2Quat(q, np.stack([x, up, z], 1).ravel())
        head.add_camera(name=f'cam_{nombre}', pos=c['pos'], quat=q, fovy=c['fovy'])


class Camaras:
    def __init__(self, m, d):
        self.m, self.d = m, d
        self.rgb = mujoco.Renderer(m, ALTO, ANCHO)
        self.seg = mujoco.Renderer(m, ALTO, ANCHO)
        self.seg.enable_segmentation_rendering()
        self.opt = mujoco.MjvOption()
        self.opt.geomgroup[:] = 0
        self.opt.geomgroup[[0, 2, 4]] = 1                  # el club (y su 2.o piso) y la gente, sin el propio robot
        self.opt_seg = mujoco.MjvOption()
        self.opt_seg.geomgroup[:] = 0
        self.opt_seg.geomgroup[4] = 1                      # solo formas del lidar: paredes, muebles y personas (10x mas rapido)
        self.id = {n: mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_CAMERA, f'cam_{n}') for n in CAMARAS}
        self.f = {n: (ALTO / 2) / np.tan(np.radians(c['fovy']) / 2) for n, c in CAMARAS.items()}

    def cerrar(self):
        self.rgb.close()
        self.seg.close()

    def imagen(self, nombre):
        self.rgb.update_scene(self.d, self.id[nombre], self.opt)
        return self.rgb.render()

    def detectar(self, nombre, geoms):
        """-> (direccion en el mundo [rad], caja (x0, y0, x1, y1)) de la persona, o None si no se ve."""
        self.seg.update_scene(self.d, self.id[nombre], self.opt_seg)
        try:
            s = self.seg.render()
        except IndexError:                                # id de segmentacion invalido (driver): este cuadro no cuenta
            return None
        mask = (s[:, :, 1] == mujoco.mjtObj.mjOBJ_GEOM) & np.isin(s[:, :, 0], geoms)
        if mask.sum() < MIN_PIXELES:
            return None
        ys, xs = np.nonzero(mask)
        cx, cy = xs.mean(), ys.mean()
        rayo_cam = np.array([(cx - ANCHO / 2) / self.f[nombre], -(cy - ALTO / 2) / self.f[nombre], -1.0])
        rayo = self.d.cam_xmat[self.id[nombre]].reshape(3, 3) @ rayo_cam
        return float(np.arctan2(rayo[1], rayo[0])), (xs.min(), ys.min(), xs.max(), ys.max())


class Seguidor:
    """Distancia al visitante que acompana, medida con camaras + lidar (no con su posicion real)."""

    def __init__(self, camaras, slam):
        self.cam, self.slam = camaras, slam
        self.objetivo, self.memoria = None, None
        self.geoms = np.array([], int)
        self.estado = {'distancia': None, 'fuente': '', 'camara': None, 'caja': None}
        self.registro = []                                # (distancia real, estimada, fuente) para --check

    def seguir(self, body):
        """body: nombre del cuerpo de la persona que acompana (None = va solo)."""
        self.objetivo, self.memoria = body, None
        m = self.cam.m
        if body is None:
            self.geoms = np.array([], int)
            self.estado = {'distancia': None, 'fuente': '', 'camara': None, 'caja': None}
            return
        b = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, body)
        self.geoms = np.nonzero(m.geom_bodyid == b)[0]

    def _lidar(self, rel, ancho=np.radians(6)):
        """Distancia del lidar en la direccion rel (marco del robot)."""
        lid, r = self.slam.lidar, self.slam.ultimo
        dif = np.abs((lid.ang - rel + np.pi) % (2 * np.pi) - np.pi)
        cerca = r[dif <= ancho]
        return float(cerca.min()) + RADIO_PERSONA if cerca.size and np.isfinite(cerca).any() else None

    def actualizar(self, yaw_real, t, real=None):
        """Una medicion (5 Hz, con cada escaneo del lidar). yaw_real: rumbo del cuerpo (para pasar de la camara al
        marco del lidar, que van montados en el mismo robot). real: distancia verdadera, solo para el registro."""
        if self.objetivo is None:
            return
        pose = self.slam.pose
        visto = None
        for nombre in ('atras', 'frente'):
            v = self.cam.detectar(nombre, self.geoms)
            if v:
                visto = (nombre, *v)
                break
        if visto:
            nombre, rumbo, caja = visto
            rel = (rumbo - yaw_real + np.pi) % (2 * np.pi) - np.pi
            dist = self._lidar(rel)
            if dist is not None:
                punto = pose[:2] + dist * np.array([np.cos(pose[2] + rel), np.sin(pose[2] + rel)])
                self.memoria = (punto, t)
                self.estado = {'distancia': dist, 'fuente': f'camara {nombre} + lidar', 'camara': nombre, 'caja': caja}
        elif self.memoria and t - self.memoria[1] <= MEMORIA_S:     # no se ve: sigue con el lidar donde estaba
            lid, r = self.slam.lidar, self.slam.ultimo
            ok = np.isfinite(r)
            pts = pose[:2] + r[ok, None] * np.stack([np.cos(pose[2] + lid.ang[ok]), np.sin(pose[2] + lid.ang[ok])], 1)
            cerca = np.linalg.norm(pts - self.memoria[0], axis=1)
            if cerca.size and cerca.min() < CERCA_LIDAR:
                punto = pts[cerca.argmin()]
                self.memoria = (punto, self.memoria[1])
                self.estado = {'distancia': float(np.linalg.norm(punto - pose[:2])) + RADIO_PERSONA, 'fuente': 'solo lidar',
                               'camara': None, 'caja': None}
        else:
            self.estado = {'distancia': np.inf, 'fuente': 'perdido', 'camara': None, 'caja': None}
        if real is not None:
            self.registro.append((real, self.estado['distancia'], self.estado['fuente']))

    def direccion(self):
        """Hacia donde lo vio por ultima vez (mundo, segun su pose del SLAM), para girarse a buscarlo."""
        if not self.memoria:
            return None
        d = self.memoria[0] - self.slam.pose[:2]
        return float(np.arctan2(d[1], d[0]))

    def ventana(self):
        """Imagen BGR con lo que ven las dos camaras y el estado del seguidor."""
        import cv2
        out = []
        for nombre, titulo in (('frente', 'Delantera (RGBD)'), ('atras', 'Trasera (RGB)')):
            im = np.ascontiguousarray(self.cam.imagen(nombre)[:, :, ::-1])
            if self.estado['camara'] == nombre and self.estado['caja'] is not None:
                x0, y0, x1, y1 = (int(v) for v in self.estado['caja'])
                cv2.rectangle(im, (x0, y0), (x1, y1), (60, 220, 60), 2)
                cv2.putText(im, f'{self.estado["distancia"]:.1f} m', (x0, max(14, y0 - 4)), cv2.FONT_HERSHEY_SIMPLEX,
                            0.5, (60, 220, 60), 2)
            cv2.putText(im, titulo, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            out.append(im)
        im = np.hstack(out)
        barra = np.full((28, im.shape[1], 3), 30, np.uint8)
        e = self.estado
        if self.objetivo is None:
            txt = 'Sin acompanar a nadie'
        elif e['distancia'] is None:
            txt = 'Buscando al visitante...'
        elif not np.isfinite(e['distancia']):
            txt = 'Visitante perdido: lo espera'
        else:
            txt = f'Visitante a {e["distancia"]:.1f} m ({e["fuente"]})'
        cv2.putText(barra, txt, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (230, 230, 230), 1)
        return np.vstack([im, barra])
