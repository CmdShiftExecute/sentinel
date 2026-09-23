#!/usr/bin/env bash
# Install or update the Sentinel power sampler (needs sudo).
# Copies the script to a root-owned path, so the root service never executes
# a file your user account can edit.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sudo install -o root -g root -m 0755 "$here/power-sampler.py" /usr/local/sbin/sentinel-power-sampler
sudo install -o root -g root -m 0644 "$here/node-power-sampler.service" /etc/systemd/system/node-power-sampler.service
sudo systemctl daemon-reload
sudo systemctl enable --now node-power-sampler.service
sudo systemctl restart node-power-sampler.service
sleep 5
systemctl --no-pager --lines=3 status node-power-sampler.service || true
cat /run/node-power/now.json; echo
