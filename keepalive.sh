#!/bin/bash
# DOTA2 BP Advisor 守护脚本
# 每隔10分钟检查后端和前端是否存活，挂了就重启

PROJECT_DIR="/root/.openclaw/workspace/dota2-bp-advisor"
LOG_FILE="$PROJECT_DIR/keepalive.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

start_backend() {
  cd "$PROJECT_DIR/backend"
  nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8082 >> "$PROJECT_DIR/backend.log" 2>&1 &
  log "Backend started, PID=$!"
}

start_frontend() {
  cd "$PROJECT_DIR/frontend"
  nohup node server.cjs >> "$PROJECT_DIR/frontend.log" 2>&1 &
  log "Frontend (server.cjs + proxy) started, PID=$!"
}

check_and_restart() {
  # 检查后端 8082
  if ! curl -sf http://localhost:8082/docs > /dev/null 2>&1; then
    log "⚠️ Backend (port 8082) is DOWN, restarting..."
    pkill -f "uvicorn main:app.*8082" 2>/dev/null
    sleep 1
    start_backend
  else
    log "✅ Backend OK"
  fi

  # 检查前端 3000
  if ! curl -sf http://localhost:3000 > /dev/null 2>&1; then
    log "⚠️ Frontend (port 3000) is DOWN, restarting..."
    pkill -f "node server.cjs" 2>/dev/null
    pkill -f "serve -s dist -l 3000" 2>/dev/null
    sleep 1
    start_frontend
  else
    log "✅ Frontend OK"
  fi
}

start_ngrok() {
  nohup ngrok http 3000 --log=stdout > "$PROJECT_DIR/ngrok.log" 2>&1 &
  log "ngrok started, PID=$!"
}

check_ngrok() {
  if ! curl -sf http://127.0.0.1:4040/api/tunnels > /dev/null 2>&1; then
    log "⚠️ ngrok is DOWN, restarting..."
    pkill -f "ngrok http 3000" 2>/dev/null
    sleep 1
    start_ngrok
    sleep 3
    local url=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import sys,json; d=json.load(sys.stdin); [print(t['public_url']) for t in d['tunnels']]" 2>/dev/null)
    log "ngrok URL: $url"
  else
    log "✅ ngrok OK"
  fi
}

log "=== Keepalive daemon started ==="

# 首次启动
check_and_restart
check_ngrok

# 每10分钟循环检查
while true; do
  sleep 600
  check_and_restart
  check_ngrok
done
