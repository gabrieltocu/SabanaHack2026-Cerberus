#!/bin/bash
# Corre como ubuntu. Instala sonic-x2 (commit revisado) en venv aislado y prueba la caminata sin ventana.
set -euo pipefail
cd ~
[ -d sonic-x2 ] || GIT_LFS_SKIP_SMUDGE=1 git clone -q https://github.com/meetsitaram/sonic-x2
cd sonic-x2
git checkout -q c9959443f80276533083a8b31ecd3760a41eaa65
echo "commit $(git rev-parse --short HEAD)"
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q "mujoco>=3.1" "onnxruntime>=1.17" "numpy<2" scipy joblib pyyaml
cp ~/agibot_x2_urdf/X2_URDF-v1.3.0/meshes/*.STL assets/urdf/x2_ultra/meshes/
echo "meshes: $(ls assets/urdf/x2_ultra/meshes/*.STL | wc -l)"
.venv/bin/python -I /tmp/check_pkl.py motions/x2_relaxed_walk.pkl motions/x2_idle_stand.pkl motions/x2_gangam_dance.pkl
MUJOCO_GL=egl timeout 600 .venv/bin/python scripts/eval_x2_mujoco_onnx.py \
  --onnx models/x2_sonic_frozen_g1core_lora_v2.onnx --motion motions/x2_relaxed_walk.pkl \
  --tuning '' --action-clip 20 --freeze-wrist --no-viewer --total-sim-seconds 15 2>&1 | tail -n 15
echo INSTALL_OK
