#!/usr/bin/env bash
set -Eeuo pipefail
# Ubuntu EC2, reviewed and run by the owner. Reconnect after installing.
sudo apt-get update
sudo apt-get install -y docker.io curl util-linux
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
echo 'Reconnect over SSH, then verify docker run --rm hello-world.'
