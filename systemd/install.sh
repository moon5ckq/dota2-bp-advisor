#!/bin/bash
# 安装 Dota2 BP Advisor systemd 服务
# 用法: sudo bash install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYSTEMD_DIR="/etc/systemd/system"

echo "🔗 Linking systemd unit files..."
for f in "$SCRIPT_DIR"/*.service "$SCRIPT_DIR"/*.timer; do
  name=$(basename "$f")
  ln -sf "$f" "$SYSTEMD_DIR/$name"
  echo "  $name"
done

echo "🔄 Reloading systemd..."
systemctl daemon-reload

echo "🚀 Enabling and starting services..."
systemctl enable --now dota2-backend.service
systemctl enable --now dota2-frontend.service
systemctl enable --now dota2-ngrok.service
systemctl enable --now dota2-data-update-weekly.timer
systemctl enable --now dota2-data-update-monthly.timer

echo ""
echo "✅ Done! Check status with:"
echo "  systemctl status dota2-backend dota2-frontend dota2-ngrok"
echo "  systemctl list-timers dota2-data-*"
echo "  journalctl -u dota2-backend -f"
