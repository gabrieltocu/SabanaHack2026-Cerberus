"""Self-check del selector anti-duplicados (sin camara): python captura/test_capturar.py"""
import numpy as np

from capturar import DUP_COS, select_diverse


def unit(v):
    return (v / np.linalg.norm(v)).astype(np.float32)


rng = np.random.default_rng(0)
poses = [unit(rng.normal(size=128)) for _ in range(5)]                 # 5 tomas realmente distintas
video = [dict(emb=unit(p + rng.normal(scale=0.01, size=128)), yaw=float(rng.uniform(0.01, 0.3))) for p in poses for _ in range(40)]
picked = select_diverse(video, 15)
assert len(picked) == 5, len(picked)                                  # 200 frames -> solo las 5 tomas distintas
embs = np.array([c['emb'] for c in picked])
assert (embs @ embs.T - np.eye(5)).max() < DUP_COS
assert select_diverse(video, 3) and len(select_diverse(video, 3)) == 3   # respeta el tope n
assert len(select_diverse(video, 15, seed_embs=poses)) == 0           # ya tiene esas tomas: nada nuevo
# intrusos: el que se enrola es A; B (ya registrado) y C (no registrado) pasaron frente a la camara
from capturar import drop_intruders  # noqa: E402
A, B, C = (unit(rng.normal(size=128)) for _ in range(3))
take = lambda p: dict(emb=unit(p + rng.normal(scale=0.03, size=128)), yaw=0.0)
cands = [take(A) for _ in range(9)] + [take(B) for _ in range(4)] + [take(C) for _ in range(2)]
kept, who = drop_intruders(cands, {'b': np.array([take(B)['emb']])})
assert len(kept) == 9 and who == {'b': 4, '?': 2}, (len(kept), who)       # B por parecido, C por no ser la mayoria
kept, who = drop_intruders([take(C) for _ in range(3)] + [take(A)], {}, ref=[take(A)['emb'] for _ in range(3)])
assert len(kept) == 1 and who == {'?': 3}                                    # con fotos previas, mandan esas
assert len(drop_intruders([take(A) for _ in range(5)], {'b': np.array([B])})[0]) == 5   # sin intrusos no saca nada
print('test_capturar OK')
