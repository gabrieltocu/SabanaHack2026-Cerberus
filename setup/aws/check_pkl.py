"""Carga los PKL de joblib permitiendo SOLO clases de numpy/joblib; aborta ante cualquier otra (posible codigo)."""
import sys
from joblib import numpy_pickle

ALLOWED = {
    ('joblib.numpy_pickle', 'NumpyArrayWrapper'),
    ('numpy', 'ndarray'), ('numpy', 'dtype'),
    ('numpy.core.multiarray', '_reconstruct'), ('numpy.core.multiarray', 'scalar'),
    ('numpy._core.multiarray', '_reconstruct'), ('numpy._core.multiarray', 'scalar'),
    ('collections', 'OrderedDict'), ('builtins', 'dict'), ('builtins', 'list'),
}


class Safe(numpy_pickle.NumpyUnpickler):
    def find_class(self, module, name):
        if (module, name) not in ALLOWED:
            raise RuntimeError(f'clase no permitida en el pkl: {module}.{name}')
        return super().find_class(module, name)


for path in sys.argv[1:]:
    with open(path, 'rb') as f:
        data = Safe(path, f, ensure_native_byte_order=True, mmap_mode=None).load()
    for clip, d in data.items():
        print(path, '|', clip[:60], '| fps', d.get('fps'), '| dof', getattr(d.get('dof'), 'shape', None))
print('PKL OK: solo numpy/joblib')
