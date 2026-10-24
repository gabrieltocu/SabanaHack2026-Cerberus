"""Crea una copia "-lite" de un modelo MuJoCo con las meshes STL simplificadas (render rapido en GPU integrada).

Uso:  python decimate_x2.py <dir_modelo> [max_caras_por_mesh=8000]
      python decimate_x2.py --selftest
Genera <dir_modelo>-lite/ con los mismos xml/urdf y meshes/ decimadas.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
import fast_simplification

STL_DTYPE = np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('attr', '<u2')])


def read_stl(path):
    raw = path.read_bytes()
    n = int(np.frombuffer(raw, '<u4', 1, 80)[0])
    if 84 + n * 50 != len(raw):
        raise ValueError(f'{path.name}: no es STL binario')
    tris = np.frombuffer(raw, STL_DTYPE, n, 84)['v'].reshape(-1, 3)
    # STL repite vertices por triangulo; se sueldan a 1e-5 m para que la malla quede cerrada al simplificar
    verts, idx = np.unique(np.round(tris, 5), axis=0, return_inverse=True)
    return verts.astype(np.float64), idx.reshape(-1, 3)


def write_stl(path, verts, faces):
    tri = verts[faces].astype('<f4')
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    out = np.zeros(len(faces), STL_DTYPE)
    out['n'], out['v'] = n, tri
    path.write_bytes(b'decimated'.ljust(80, b'\0') + np.uint32(len(faces)).tobytes() + out.tobytes())


def decimate(verts, faces, max_faces):
    if len(faces) <= max_faces:
        return verts, faces
    v, f = fast_simplification.simplify(verts, faces, target_reduction=1 - max_faces / len(faces), agg=3)  # agg 7 (default) rompe mallas CAD no-manifold
    return v, f


def build_lite(src, max_faces):
    """Render: meshes decimadas. Colision: envolvente convexa exacta de la mesh original
    (MuJoCo colisiona con el hull de todas formas, asi la fisica no cambia)."""
    import mujoco
    from scipy.spatial import ConvexHull
    dst = src.with_name(src.name + '-lite')
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns('meshes', 'visual'))
    (dst / 'meshes').mkdir()
    spec = mujoco.MjSpec.from_file(str(src / 'scene.xml'))
    col = {g.meshname for g in spec.geoms
           if g.type == mujoco.mjtGeom.mjGEOM_MESH and (g.contype or g.conaffinity)}
    before = after = 0
    for mesh in list(spec.meshes):
        v, f = read_stl(src / 'meshes' / mesh.file)
        v2, f2 = decimate(v, f, max_faces)
        write_stl(dst / 'meshes' / mesh.file, v2, f2)
        before, after = before + len(f), after + len(f2)
        if mesh.name in col:
            hull_file = Path(mesh.file).stem + '_hull.STL'
            write_stl(dst / 'meshes' / hull_file, v, ConvexHull(v).simplices)
            spec.add_mesh(name=mesh.name + '_hull', file=hull_file, scale=mesh.scale)
    for g in spec.geoms:
        if g.meshname in col and (g.contype or g.conaffinity):
            g.meshname += '_hull'
    spec.visual.quality.shadowsize = 0  # sombras: de 26 a 180 FPS en Intel UHD
    spec.modelfiledir = str(dst)  # resolver meshes desde la copia lite
    spec.compile()
    (dst / 'scene.xml').write_text(spec.to_xml(), encoding='utf-8')
    print(f'{dst}: caras render {before} -> {after}, {len(col)} hulls de colision')
    return dst


def selftest():
    import tempfile
    # icosfera subdividida: muchas caras, cerrada
    v = np.array([[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]], float)
    f = np.array([[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]])
    for _ in range(4):
        mids, nf = {}, []
        def mid(a, b):
            k = tuple(sorted((a, b)))
            if k not in mids:
                p = (v_list[a] + v_list[b]) / 2
                v_list.append(p / np.linalg.norm(p)); mids[k] = len(v_list) - 1
            return mids[k]
        v_list = list(v)
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        v, f = np.array(v_list), np.array(nf)
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / 'a.stl'
        write_stl(p, v, f)
        v1, f1 = read_stl(p)
        assert len(f1) == len(f) == 2048 and len(v1) == len(v), (len(f1), len(v1))
        v2, f2 = decimate(v1, f1, 200)
        assert 0 < len(f2) < len(f1) / 2, len(f2)  # agg=3 puede parar antes del objetivo
        assert np.allclose(np.linalg.norm(v2, axis=1), 1, atol=0.1)  # sigue siendo una esfera
        write_stl(p, v2, f2)
        assert len(read_stl(p)[1]) == len(f2)
    print('selftest OK')


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    else:
        build_lite(Path(sys.argv[1]).resolve(), int(sys.argv[2]) if len(sys.argv) > 2 else 8000)
