#!/bin/bash
# Bootstrap de la maquina de simulacion/entrenamiento X2 (cuenta AWS IA). Log: /var/log/ia-setup.log
set -euxo pipefail
exec > /var/log/ia-setup.log 2>&1
export DEBIAN_FRONTEND=noninteractive

# Escritorio en X11 sobre la GPU (DCV console session -> OpenGL acelerado para MuJoCo)
apt-get update
apt-get install -y ubuntu-desktop-minimal gdm3 mesa-utils x11-xserver-utils git curl unzip python3-pip python3-venv
sed -i 's/^#\?WaylandEnable=.*/WaylandEnable=false/' /etc/gdm3/custom.conf
nvidia-xconfig --preserve-busid --enable-all-gpus || true
systemctl set-default graphical.target

# NICE DCV (licencia gratis en EC2)
cd /tmp
curl -fsSLO https://d1uj6qtbmh3dt5.cloudfront.net/nice-dcv-ubuntu2204-x86_64.tgz
tar xzf nice-dcv-ubuntu2204-x86_64.tgz
cd nice-dcv-*-ubuntu2204-x86_64
apt-get install -y ./nice-dcv-server_*.deb ./nice-dcv-web-viewer_*.deb ./nice-xdcv_*.deb ./nice-dcv-gl_*.deb
usermod -aG video dcv
cat >> /etc/dcv/dcv.conf <<'EOF'

[session-management]
create-session = true

[session-management/automatic-console-session]
owner = "ubuntu"
EOF
systemctl enable dcvserver

# ROS 2 Humble (mismo stack que el SDK del X2)
add-apt-repository -y universe
curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu jammy main" > /etc/apt/sources.list.d/ros2.list
apt-get update
apt-get install -y ros-humble-desktop ros-dev-tools ros-humble-rmw-fastrtps-cpp ros-humble-cv-bridge \
  build-essential cmake libeigen3-dev libboost-all-dev libncurses-dev ffmpeg
echo 'source /opt/ros/humble/setup.bash' >> /home/ubuntu/.bashrc

# MuJoCo + modelos X2 (como usuario ubuntu)
sudo -u ubuntu -H bash -lc '
  python3 -m pip install --user mujoco onnxruntime-gpu "numpy<2" scipy joblib pyyaml fast-simplification
  cd ~ && git clone --depth 1 https://github.com/AgibotTech/agibot_x2_urdf.git
'

touch /var/log/ia-setup.done
reboot
