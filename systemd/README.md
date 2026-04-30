# systemd 部署说明

将 Dota2 BP Advisor 作为 systemd 服务运行，实现：
- 进程崩溃自动重启（5~10秒内）
- 开机自动启动
- 数据定期自动更新
- 日志由 journald 管理，自动轮转

## 服务清单

| 服务 | 说明 |
|---|---|
| `dota2-backend.service` | FastAPI 后端 (:8082) |
| `dota2-frontend.service` | Node.js 前端 (:3000)，依赖 backend |
| `dota2-ngrok.service` | ngrok 隧道，依赖 frontend |
| `dota2-data-update-weekly.timer` | 每周一 04:00 更新配合数据 |
| `dota2-data-update-monthly.timer` | 每月 1 号 04:00 更新分路数据 |

## 安装

```bash
sudo bash systemd/install.sh
```

## 卸载

```bash
sudo bash systemd/uninstall.sh
```

## 常用命令

```bash
# 查看状态
systemctl status dota2-backend dota2-frontend dota2-ngrok

# 查看定时任务
systemctl list-timers dota2-data-*

# 查看日志（实时）
journalctl -u dota2-backend -f
journalctl -u dota2-ngrok -f

# 手动重启某个服务
systemctl restart dota2-backend

# 手动触发数据更新
systemctl start dota2-data-update-weekly
```

## 注意

- ngrok 服务依赖本机已配置好的 ngrok authtoken (`ngrok config add-authtoken <token>`)
- unit 文件中的路径需要根据实际部署位置修改
