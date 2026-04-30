#!/bin/bash
# 卸载 Dota2 BP Advisor systemd 服务

set -e

echo "🛑 Stopping and disabling services..."
systemctl disable --now dota2-backend.service 2>/dev/null || true
systemctl disable --now dota2-frontend.service 2>/dev/null || true
systemctl disable --now dota2-ngrok.service 2>/dev/null || true
systemctl disable --now dota2-data-update-weekly.timer 2>/dev/null || true
systemctl disable --now dota2-data-update-monthly.timer 2>/dev/null || true

echo "🗑️  Removing unit files..."
rm -f /etc/systemd/system/dota2-*.service /etc/systemd/system/dota2-*.timer

echo "🔄 Reloading systemd..."
systemctl daemon-reload

echo "✅ Uninstalled."
