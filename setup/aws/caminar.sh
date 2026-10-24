#!/bin/bash
# X2 con la politica SONIC en MuJoCo. Uso: ~/caminar.sh [walk|idle|gangam]
cd ~/sonic-x2
case "${1:-walk}" in
  walk) M=motions/x2_relaxed_walk.pkl ;;
  idle) M=motions/x2_idle_stand.pkl ;;
  gangam) M=motions/x2_gangam_dance.pkl ;;
  *) echo "uso: $0 [walk|idle|gangam]"; exit 2 ;;
esac
exec .venv/bin/python scripts/eval_x2_mujoco_onnx.py --onnx models/x2_sonic_frozen_g1core_lora_v2.onnx \
  --motion "$M" --tuning '' --action-clip 20 --freeze-wrist
