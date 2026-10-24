"""X2 que sigue rutas en el club: marcha senoidal + PD (de tools/x2_walk_demo.py) con el arnes moviendose
por la ruta. Gira en el sitio en las esquinas y se detiene (postura de pie) cuando no camina.
"""
import sys
from pathlib import Path

import mujoco
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import x2_walk_demo as gait  # noqa: E402

TURN_RATE = 0.9      # rad/s girando en el sitio
AMP_RATE = 2.0       # 1/s para entrar/salir de la marcha
AGACHE = dict(hip=-1.0, knee=1.8, waist=0.25)   # postura agachada (crouch) para el cambio de bateria
AGACHE_RATE = 0.4    # 1/s: ~2.5 s en agacharse o pararse


class Walker:
    def __init__(self, m, d):
        self.m, self.d = m, d
        self.tables = gait.joint_tables(m)
        self.drop, self.speed = gait.calibrate(m, self.tables)
        self.harness = m.body_mocapid[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, 'harness')]
        self.pos = np.array([0.0, 0.0])
        self.yaw = 0.0
        self.z = 0.0            # altura del piso bajo el robot (sube con el ascensor)
        self.recorrido = 0.0    # metros caminados en total
        self.amp = 0.0          # 0 = de pie, 1 = marcha completa
        self.phase_t = 0.0      # reloj de la marcha (solo avanza caminando)
        self.target_amp = 0.0
        self._settle = 0.0
        self.hold = None         # yaw hacia donde mirar mientras espera en mitad de una ruta (None = caminar)
        self.abort = False       # el escenario corta la ruta (algo en el camino): se detiene donde esta
        self.overlay = None      # gesto activo: funcion t -> {articulacion: objetivo}
        self.overlay_w = 0.0     # peso del gesto (0..1, con rampa)
        self.overlay_t = 0.0
        self._kin = mujoco.MjData(m)   # datos de trabajo para calcular poses de brazo por cinematica
        self._qadr = {mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, j): m.jnt_qposadr[j] for j in range(m.njnt)}
        self.agache, self.target_agache = 0.0, 0.0   # 0 = de pie, 1 = agachado
        self.agache_drop = self._baja_agachado()

    def place(self, xy, yaw):
        self.pos[:] = xy
        self.yaw = yaw
        self._apply_harness()
        self.d.qpos[0:2] = xy
        self.d.qpos[3:7] = [np.cos(yaw / 2), 0, 0, np.sin(yaw / 2)]
        mujoco.mj_forward(self.m, self.d)

    def _baja_agachado(self):
        """Por cinematica: cuanto sube el pie respecto a la pelvis al agacharse = cuanto debe bajar el arnes."""
        k, foot = self._kin, mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_BODY, 'left_ankle_roll_link')
        z = []
        for hip, knee in ((gait.HIP0, gait.KNEE0), (AGACHE['hip'], AGACHE['knee'])):
            k.qpos[:] = self.m.qpos0
            for j, v in (('hip_pitch', hip), ('knee', knee), ('ankle_pitch', -(hip + knee))):
                k.qpos[self._qadr[f'left_{j}_joint']] = v
            mujoco.mj_kinematics(self.m, k)
            z.append(k.xpos[foot][2])
        return z[1] - z[0]

    def _targets(self):
        names = self.tables[0]
        t = self.phase_t
        q = {}
        for side, off in (('left', 0.0), ('right', np.pi)):
            phi = 2 * np.pi * gait.FREQ * t + off
            hip = gait.HIP0 + self.amp * gait.HIP_AMP * np.cos(phi)
            knee = gait.KNEE0 + self.amp * gait.KNEE_LIFT * max(0.0, np.sin(phi))
            hip += self.agache * (AGACHE['hip'] - hip)
            knee += self.agache * (AGACHE['knee'] - knee)
            q[f'{side}_hip_pitch_joint'] = hip
            q[f'{side}_knee_joint'] = knee
            q[f'{side}_ankle_pitch_joint'] = -(hip + knee)
            q[f'{side}_shoulder_pitch_joint'] = -self.amp * gait.ARM_AMP * np.cos(phi + np.pi)
            q[f'{side}_elbow_joint'] = -0.4
        q['left_shoulder_roll_joint'], q['right_shoulder_roll_joint'] = 0.15, -0.15
        q['waist_pitch_joint'] = self.agache * AGACHE['waist']
        if self.overlay is not None and self.overlay_w > 0:
            for j, v in self.overlay(self.overlay_t).items():
                q[j] = (1 - self.overlay_w) * q.get(j, 0.0) + self.overlay_w * v
        return np.array([q.get(n, 0.0) for n in names])

    def _apply_harness(self):
        z = self.z + 0.68 - min(self._settle, 1.0) * self.drop - self.agache * self.agache_drop
        self.d.mocap_pos[self.harness] = [self.pos[0], self.pos[1], z]
        self.d.mocap_quat[self.harness] = [np.cos(self.yaw / 2), 0, 0, np.sin(self.yaw / 2)]

    def step(self, dt):
        """Un paso de control + fisica."""
        self.amp += np.clip(self.target_amp - self.amp, -AMP_RATE * dt, AMP_RATE * dt)
        self.agache += np.clip(self.target_agache - self.agache, -AGACHE_RATE * dt, AGACHE_RATE * dt)
        if self.overlay is not None:
            self.overlay_t += dt
        if self.amp > 1e-3:
            self.phase_t += dt
        elif abs(np.sin(2 * np.pi * gait.FREQ * self.phase_t)) > 0.05:
            self.phase_t += dt          # terminar el ciclo para quedar con ambos pies abajo
        self._settle += dt
        _, qadr, dadr, kp, kd = self.tables
        tau = kp * (self._targets() - self.d.qpos[qadr]) - kd * self.d.qvel[dadr]
        self.d.ctrl[:] = np.clip(tau, self.m.actuator_ctrlrange[:, 0], self.m.actuator_ctrlrange[:, 1])
        self._apply_harness()
        mujoco.mj_step(self.m, self.d)

    # --- acciones de alto nivel (generadores: avanzan un dt por yield) ---
    def turn_to(self, yaw_goal, dt):
        self.target_amp = 0.6          # pasitos en el sitio mientras gira
        while True:
            err = (yaw_goal - self.yaw + np.pi) % (2 * np.pi) - np.pi
            if abs(err) < 0.02:
                break
            self.yaw += np.clip(err, -TURN_RATE * dt, TURN_RATE * dt)
            yield
        self.yaw = yaw_goal

    def walk_path(self, points, dt, trail=None):
        """Camina por los puntos (giro en el sitio en cada esquina). trail: lista donde anota su recorrido."""
        for p in points:
            p = np.array(p, float)
            delta = p - self.pos
            if np.linalg.norm(delta) < 0.05:
                continue
            heading = np.arctan2(delta[1], delta[0])
            yield from self.turn_to(heading, dt)
            self.target_amp = 1.0
            while True:
                if self.abort:
                    self.target_amp = 0.0
                    return
                if self.hold is not None:       # el escenario pide esperar (visitante atras): mirarlo y esperar
                    yield from self.turn_to(self.hold, dt)
                    while self.hold is not None:
                        self.target_amp = 0.0
                        yield
                    yield from self.turn_to(heading, dt)
                    self.target_amp = 1.0
                delta = p - self.pos
                dist = np.linalg.norm(delta)
                if dist < 0.02:
                    break
                v = self.speed * self.amp
                avance = min(v * dt, dist)
                self.pos += delta / dist * avance
                self.recorrido += avance
                if trail is not None:
                    trail.append(self.pos.copy())
                yield
        self.target_amp = 0.0

    def stand(self, seconds, dt):
        self.target_amp = 0.0
        for _ in range(int(seconds / dt)):
            yield

    def agacharse(self, si, dt):
        """Se agacha (si=True) o se pone de pie, quieto; termina cuando llega a la postura."""
        self.target_amp, self.target_agache = 0.0, float(si)
        while abs(self.agache - self.target_agache) > 1e-3:
            yield
        yield from self.stand(0.5, dt)

    # --- gestos (de pie; el arnes sostiene la pelvis) ---
    def gesture(self, pose_fn, seconds, dt, ramp=0.5):
        """Mezcla una pose de tren superior (pose_fn: t -> {articulacion: objetivo}) con rampa de entrada/salida."""
        self.target_amp = 0.0
        self.overlay, self.overlay_t = pose_fn, 0.0
        n = int(seconds / dt)
        for k in range(n):
            t = k * dt
            self.overlay_w = min(t / ramp, (seconds - t) / ramp, 1.0)
            yield
        self.overlay, self.overlay_w = None, 0.0

    def point_pose(self, target_xy):
        """Pose del brazo mas cercano para senalar un punto del piso (por cinematica: busca hombro pitch/roll)."""
        rel = np.array(target_xy) - self.pos
        az = (np.arctan2(rel[1], rel[0]) - self.yaw + np.pi) % (2 * np.pi) - np.pi   # angulo relativo al frente
        side, sign = ('left', 1) if az >= 0 else ('right', -1)
        want = np.array([np.cos(az), np.sin(az), -0.05])   # casi horizontal: a la altura del pecho
        want /= np.linalg.norm(want)
        k = self._kin
        sh = mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_BODY, f'{side}_shoulder_pitch_link')
        wr = mujoco.mj_name2id(self.m, mujoco.mjtObj.mjOBJ_BODY, f'{side}_wrist_roll_link')
        best, best_err = None, 9.0
        for pitch in np.linspace(-1.9, 0.0, 20):
            for roll in np.linspace(0.0, 1.7, 18):
                k.qpos[:] = self.m.qpos0
                k.qpos[self._qadr[f'{side}_shoulder_pitch_joint']] = pitch
                k.qpos[self._qadr[f'{side}_shoulder_roll_joint']] = sign * roll
                k.qpos[self._qadr[f'{side}_elbow_joint']] = -0.15
                mujoco.mj_kinematics(self.m, k)
                v = k.xpos[wr] - k.xpos[sh]
                err = np.arccos(np.clip(v @ want / np.linalg.norm(v), -1, 1))
                if err < best_err:
                    best, best_err = (pitch, sign * roll), err
        head_yaw = float(np.clip(az, -0.33, 0.33))
        pose = {f'{side}_shoulder_pitch_joint': best[0], f'{side}_shoulder_roll_joint': best[1],
                f'{side}_elbow_joint': -0.15, f'{side}_wrist_pitch_joint': 0.0, 'head_yaw_joint': head_yaw}
        return lambda t: pose


# Gestos por categoria (poses del tren superior; los signos se verificaron por cinematica:
# hombro pitch < 0 levanta al frente, roll izq > 0 / der < 0 abre, codo < 0 flexiona, cintura pitch > 0 inclina)
def bow(t):          # VIP: reverencia
    return {'waist_pitch_joint': 0.28, 'head_pitch_joint': 0.3,
            'left_shoulder_pitch_joint': -0.25, 'right_shoulder_pitch_joint': -0.25,
            'left_elbow_joint': -0.6, 'right_elbow_joint': -0.6}


def wave(t):         # Regular: saludo con la mano derecha
    return {'right_shoulder_pitch_joint': -2.3, 'right_shoulder_roll_joint': -0.35,
            'right_elbow_joint': -0.9 - 0.35 * np.sin(2 * np.pi * 1.5 * t)}


def welcome(t):      # Invitado: brazos abiertos de bienvenida
    return {'left_shoulder_pitch_joint': -0.7, 'right_shoulder_pitch_joint': -0.7,
            'left_shoulder_roll_joint': 0.9, 'right_shoulder_roll_joint': -0.9,
            'left_elbow_joint': -0.35, 'right_elbow_joint': -0.35, 'head_pitch_joint': -0.1}


def nod(t):          # Personal: asentir, breve
    return {'head_pitch_joint': 0.25 * max(0.0, np.sin(2 * np.pi * 1.2 * t))}


GESTURES = {'VIP': bow, 'REGULAR': wave, 'INVITADO': welcome, 'PERSONAL': nod}
