# Maquina GPU en AWS (simulacion y entrenamiento)

g6.xlarge (NVIDIA L4 24 GB, 4 vCPU, 16 GB RAM), Ubuntu 22.04 (Deep Learning Base AMI), escritorio remoto
NICE DCV. ~0.82 USD/h encendida; apagada solo cobra el disco (~8 USD/mes por 100 GB). Se apaga sola tras
30 min sin uso (alarma CloudWatch de CPU < 3 %).

| Archivo | Que hace |
|---|---|
| `user-data.sh` | Arranque de la instancia: escritorio + DCV con GPU, ROS 2 Humble, MuJoCo, modelo del X2 |
| `install_sonic.sh` + `check_pkl.py` | Instala la politica SONIC del X2 (meetsitaram/sonic-x2, commit revisado) en un venv y valida sus `.pkl` (solo numpy/joblib) |
| `caminar.sh` | `~/caminar.sh walk|idle|gangam`: el X2 con la politica SONIC en MuJoCo |

## Uso

```bash
aws sso login --profile ia
aws ec2 start-instances --instance-ids <ID> --profile ia
# escritorio remoto por tunel SSM (sirve aunque la red bloquee el 8443):
aws ssm start-session --target <ID> --profile ia --document-name AWS-StartPortForwardingSession --parameters portNumber=8443,localPortNumber=8443
```
DCV Viewer -> `127.0.0.1:8443`, protocolo WebSocket, usuario `ubuntu`. Para el club: clonar este repo en la
maquina, `pip install -r requirements.txt`, `python sim/run_club.py`.

La camara del laptop **no** se puede usar dentro de DCV en servidores Linux (solo Windows): la vision corre en
el laptop junto al robot.
