# Dota2 BP Advisor

Dota2 Ban/Pick 分析助手 — 基于 OpenDota 数据的英雄胜率统计与阵容推荐工具。

## 技术栈

- **后端**: Python FastAPI + SQLite
- **前端**: React + Vite + Tailwind CSS
- **数据源**: [OpenDota API](https://docs.opendota.com/)

## 快速开始

### Docker Compose (推荐)

```bash
docker-compose up --build
```

访问 http://localhost 即可使用。首次使用请点击右上角「同步数据」按钮拉取英雄数据。

### 本地开发

**后端：**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**前端：**
```bash
cd frontend
npm install
npm run dev
```

前端开发服务器会自动代理 `/api` 请求到后端 8000 端口。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/heroes` | 获取所有英雄 |
| GET | `/api/heroes/stats?rank=5` | 获取英雄统计（rank 1-8） |
| POST | `/api/sync/heroes` | 从 OpenDota 同步数据 |

## 段位映射

| rank | 段位 |
|------|------|
| 1 | 先锋 |
| 2 | 卫士 |
| 3 | 中军 |
| 4 | 传奇 |
| 5 | 万古 |
| 6 | 超凡 |
| 7 | 冠绝 |
| 8 | 万古以上 |
