"""X2 caminando en MuJoCo con arnes (como la grua de AgiBot): marcha senoidal + PD propio.

No es una politica de equilibrio: la pelvis cuelga de un "arnes" (mocap + weld suave) que avanza
a la velocidad de la zancada; las piernas hacen la marcha con fisica y contacto real con el piso.

Uso:  python x2_walk_demo.py [scene.xml]            -> visor
      python x2_walk_demo.py [scene.xml] --check 10 -> sin ventana, verifica que avanza y alterna pies
"""
import sys
import time
from pathlib import Path

import mujoco
import numpy as np

DEFAULT_SCENE = Path(__file__).resolve().parents[1] / 'assets' / 'x2_urdf' / 'X2_URDF-v1.3.0-lite' / 'scene.xml'

FREQ = 0.9         # ciclos de marcha por segundo (2 pasos por ciclo)
HIP_AMP = 0.18     # rad de oscilacion de cadera
KNEE_LIFT = 0.55   # rad extra de rodilla al levantar el pie
HIP0, KNEE0 = -0.25, 0.5   # postura con rodillas flexionadas
ARM_AMP = 0.35
RAMP = 1.5         # s para entrar suave en la marcha

# ponytail: ganancias a ojo para sim, no son las del robot real (ver x2-cpp: kp 20-80)
GAINS = {'hip': (800, 15), 'knee': (800, 15), 'ankle': (200, 4), 'waist': (400, 10),
         'shoulder': (60, 2), 'elbow': (60, 2), 'wrist': (20, 1), 'head': (10, 0.5)}


def build(scene):
    spec = mujoco.MjSpec.from_file(str(scene))
    spec.worldbody.add_body(name='harness', mocap=True, pos=[0, 0, 0.68])
    spec.add_equality(type=mujoco.mjtEq.mjEQ_WELD, name1='harness', name2='pelvis',
                      objtype=mujoco.mjtObj.mjOBJ_BODY, solref=[0.03, 1])
    m = spec.compile()
    return m, mujoco.MjData(m)


def joint_tables(m):
    names = [mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_JOINT, m.actuator_trnid[i, 0]) for i in range(m.nu)]
    qadr = np.array([m.jnt_qposadr[m.actuator_trnid[i, 0]] for i in range(m.nu)])
    dadr = np.array([m.jnt_dofadr[m.actuator_trnid[i, 0]] for i in range(m.nu)])
    kp, kd = np.zeros(m.nu), np.zeros(m.nu)
    for i, n in enumerate(names):
        key = next(k for k in GAINS if k in n)
        kp[i], kd[i] = GAINS[key]
    return names, qadr, dadr, kp, kd


def gait_targets(names, t):
    """Objetivo articular a tiempo t. Pierna izq fase phi, der phi+pi. Pie plano: tobillo = -(cadera+rodilla)."""
    r = min(t / RAMP, 1.0)
    q = {}
    for side, off in (('left', 0.0), ('right', np.pi)):
        phi = 2 * np.pi * FREQ * t + off
        hip = HIP0 + r * HIP_AMP * np.cos(phi)            # sin(phi)>0: pie en el aire avanzando
        knee = KNEE0 + r * KNEE_LIFT * max(0.0, np.sin(phi))
        q[f'{side}_hip_pitch_joint'] = hip
        q[f'{side}_knee_joint'] = knee
        q[f'{side}_ankle_pitch_joint'] = -(hip + knee)
        q[f'{side}_shoulder_pitch_joint'] = -r * ARM_AMP * np.cos(phi + np.pi)  # brazo opuesto a la pierna
        q[f'{side}_elbow_joint'] = -0.4
    q['left_shoulder_roll_joint'], q['right_shoulder_roll_joint'] = 0.15, -0.15  # brazos separados del torso
    return np.array([q.get(n, 0.0) for n in names])


def harness_pos(t):
    r = min(t / RAMP, 1.0)
    x = SPEED * max(0.0, t - RAMP / 2) if t > RAMP / 2 else 0.0
    return [x, 0.0, 0.68 - r * PELVIS_DROP]


def control(m, d, tables, t):
    names, qadr, dadr, kp, kd = tables
    qdes = gait_targets(names, t)
    tau = kp * (qdes - d.qpos[qadr]) - kd * d.qvel[dadr]
    d.ctrl[:] = np.clip(tau, m.actuator_ctrlrange[:, 0], m.actuator_ctrlrange[:, 1])
    d.mocap_pos[0] = harness_pos(t)


def calibrate(m, tables):
    """Por cinematica: cuanto baja la pelvis con rodillas flexionadas y cuanto retrocede el pie
    en apoyo por medio ciclo -> velocidad del arnes igual a la de la zancada (pies sin arrastrar)."""
    names, qadr, *_ = tables
    d = mujoco.MjData(m)
    foot = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, 'left_ankle_roll_link')

    def foot_at(t):
        d.qpos[qadr] = gait_targets(names, t)
        mujoco.mj_kinematics(m, d)
        return d.xpos[foot].copy()

    mujoco.mj_kinematics(m, d)
    z_straight = d.xpos[foot][2]
    drop = foot_at(_t_phase(1.5 * np.pi))[2] - z_straight               # mitad del apoyo izq
    stride = foot_at(_t_phase(np.pi))[0] - foot_at(_t_phase(2 * np.pi))[0]  # apoyo izq: phi pi -> 2pi
    return drop, stride * 2 * FREQ


def _t_phase(phi):
    """Tiempo (despues de la rampa) en que la pierna izquierda esta en fase phi."""
    k = np.ceil(RAMP * FREQ)
    return (k + phi / (2 * np.pi)) / FREQ


def check(m, d, tables, seconds):
    feet = [mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, f'{s}_ankle_roll_link') for s in ('left', 'right')]
    floor = 0  # geom 0 = plano del piso en scene.xml
    lead, swaps, max_tilt = None, 0, 0.0
    for _ in range(int(seconds / m.opt.timestep)):
        control(m, d, tables, d.time)
        mujoco.mj_step(m, d)
        if d.time > RAMP:
            x = [d.xpos[f][0] for f in feet]
            now = int(x[1] > x[0])
            swaps += lead is not None and now != lead
            lead = now
            up = d.xmat[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, 'pelvis')].reshape(3, 3)[:, 2]
            max_tilt = max(max_tilt, np.degrees(np.arccos(np.clip(up[2], -1, 1))))
    touching = {m.geom_bodyid[c.geom2] if c.geom1 == floor else m.geom_bodyid[c.geom1] for c in d.contact[:d.ncon]}
    dist = d.qpos[0]
    print(f'avance {dist:.2f} m en {seconds:.0f}s (arnes {SPEED:.2f} m/s), cambios de pie lider {swaps}, '
          f'inclinacion max pelvis {max_tilt:.1f} deg, cuerpos tocando piso {len(touching)}')
    assert np.isfinite(d.qpos).all()
    assert dist > 0.6 * SPEED * (seconds - RAMP), 'no avanza'
    assert swaps >= 2 * FREQ * (seconds - RAMP) - 2, 'no alterna los pies'
    assert max_tilt < 15, 'pelvis muy inclinada'
    print('check OK')


def main():
    secs = float(sys.argv.pop(sys.argv.index('--check') + 1)) if '--check' in sys.argv else None
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    m, d = build(Path(args[0]) if args else DEFAULT_SCENE)
    tables = joint_tables(m)
    global PELVIS_DROP, SPEED
    PELVIS_DROP, SPEED = calibrate(m, tables)
    if secs:
        return check(m, d, tables, secs)

    import mujoco.viewer
    with mujoco.viewer.launch_passive(m, d) as v:
        v.cam.type = mujoco.mjtCamera.mjCAMERA_TRACKING
        v.cam.trackbodyid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, 'pelvis')
        v.cam.distance, v.cam.azimuth, v.cam.elevation = 3.0, 135, -15
        start = time.perf_counter()
        while v.is_running():
            while d.time < time.perf_counter() - start:  # tiempo real
                control(m, d, tables, d.time)
                mujoco.mj_step(m, d)
            v.sync()


PELVIS_DROP = SPEED = 0.0  # los fija calibrate()

if __name__ == '__main__':
    main()
