# Dota2 BP Advisor — 开发信息索引

> 本目录整理项目从启动到当前所有开发记忆、部署脚本、配置文件和关键文档。
> 分支：`dev-documentation`，主分支：`main`

---

## 1. 开发记忆（Workspace memory/）

| 文件 | 日期 | 内容 |
|---|---|---|
| `memory/2026-04-22.md` | 2026-04-22 | 项目启动、阶段1完成（基础框架+英雄数据） |
| `memory/2026-04-23.md` | 2026-04-23 | 阶段2（手动BP录入）、阶段3（用户英雄池）、阶段4推荐引擎、阶段5优化和工程化、自定义权重 |
| `memory/2026-04-24.md` | 2026-04-24 | PC端布局优化（4:3比例、字体协调、TabBar对齐） |

对应 workspace 路径：`/root/.openclaw/workspace/memory/`

## 2. Git 提交历史（主分支 main, 12 commits）

| # | Commit | 标题 | 日期 |
|---|---|---|---|
| 1 | `bd01dc2` | feat: Dota2 BP Advisor v1.0 | 2026-04-22 |
| 2 | `cb40e9d` | feat: Dota2 BP Advisor v1.0 - 完整BP辅助工具 | 2026-04-22 |
| 3 | `dac3b9f` | feat: 阶段5完善 - 缓存/自动更新/数据时间显示 | 2026-04-23 |
| 4 | `cf3f352` | chore: 删除无用的测试图片文件 | 2026-04-23 |
| 5 | `31f8d5a` | feat: 用户自定义权重 + UI优化 | 2026-04-23 |
| 6 | `60e3530` | docs: 英雄别名协作表，欢迎玩家补充 | 2026-04-23 |
| 7 | `4e4afc7` | fix: PC端布局优化 | 2026-04-24 |
| 8 | `fdfa048` | fix: 数据库自动迁移 + 统一 schema + 图片路径自动生成 | 2026-04-30 |
| 9 | `909c5fa` | feat: add systemd services for long-term keepalive | 2026-04-30 |
| 10 | `9d710cf` | fix: tab title + preserve active tab on refresh | 2026-05-07 |
| 11 | `2b58228` | fix: cap hero grid to 4 columns max on desktop | 2026-05-07 |
| 12 | `4e7992c` | fix: align hero card stats as label-value pairs | 2026-05-07 |

## 3. 部署和保活脚本

### systemd 服务（`systemd/` 目录）

| 文件 | 说明 |
|---|---|
| `systemd/install.sh` | 一键安装所有 systemd 服务和定时器 |
| `systemd/uninstall.sh` | 一键卸载所有 systemd 服务 |
| `systemd/README.md` | systemd 部署说明文档 |
| `systemd/dota2-backend.service` | FastAPI 后端服务 (:8082) |
| `systemd/dota2-frontend.service` | Node.js 前端服务 (:3000) |
| `systemd/dota2-ngrok.service` | ngrok 公网隧道 |
| `systemd/dota2-data-update-weekly.service` | 每周配合数据更新（oneshot） |
| `systemd/dota2-data-update-weekly.timer` | 每周一 04:00 触发 |
| `systemd/dota2-data-update-monthly.service` | 每月分路数据更新（oneshot） |
| `systemd/dota2-data-update-monthly.timer` | 每月1号 04:00 触发 |

### 早期守护脚本

| 文件 | 说明 |
|---|---|
| `keepalive.sh` | bash 守护脚本（早期保活方案，每10分钟检查并重启进程，已被 systemd 方案取代） |

## 4. 数据维护脚本

| 文件 | 说明 |
|---|---|
| `backend/scripts/update_data.py` | 统一数据更新脚本，支持 `--all/--synergy/--lane-roles/--heroes`，原子性写入 + 通知后端热重载 |
| `backend/data/fetch_synergy.py` | 早期配合数据拉取脚本（curl+OpenDota explorer API），已被 `update_data.py` 取代 |

## 5. 数据文件

| 文件 | 说明 |
|---|---|
| `backend/data/dota2.db` | SQLite 主数据库（英雄基础数据） |
| `backend/data/hero_synergy.json` | 127英雄 × 对配合胜率数据（~1.4MB） |
| `backend/data/hero_lane_roles.json` | 127英雄分路角色数据 |
| `backend/data/hero_aliases.json` | 英雄别名搜索数据库 |

## 6. 协作文档

| 文件 | 来源 | 说明 |
|---|---|---|
| `docs/hero-aliases-review.md` | hero-aliases 分支 `60e3530` | 英雄别名协作表，玩家可参与补充别名 |

## 7. 项目元信息

| 项 | 值 |
|---|---|
| GitHub | https://github.com/moon5ckq/dota2-bp-advisor |
| 技术栈 | React+Tailwind+Vite / Python FastAPI+SQLite / OpenDota API |
| 后端端口 | 8082 |
| 前端端口 | 3000 |
| 用户段位 | 传奇 |
| 英雄总数 | 127 |
| 总代码量（阶段5验收时） | 9414行，47文件 |
| 开发阶段 | 5个阶段全部完成验收 |
| 测试账号 | 87278757（Puppey，有公开数据）/ 123769363（caima，数据未公开） |
| 用户 Hero ID | 123769363 |
| 用户 Steam64 | 76561198029616391 |
