# Dota2 BP Advisor

Dota2 天梯玩家 BP（Ban/Pick）辅助工具，手机网页端使用。

## 功能特点

- 📱 移动端优先，暗色 Dota2 风格
- 🎯 手动录入 BP 状态（天辉/夜魇 Pick + Ban）
- 🧠 6维度智能推荐引擎（克制/段位/个人/位置/能力/配合）
- 📊 动态权重随 BP 阶段自动调整
- 👤 支持多账号绑定，个人英雄池分析
- 🔍 英雄搜索支持中英文名/昵称/拼音

## 技术栈

- **前端**: React + Tailwind CSS + Vite
- **后端**: Python FastAPI + SQLite
- **数据源**: OpenDota API

## 推荐算法

6个评分维度：
1. **克制分** - 候选英雄对敌方英雄的对位胜率
2. **段位分** - 当前段位的英雄胜率（含冷门惩罚）
3. **个人分** - 用户英雄池熟练度×胜率
4. **位置需求分** - 二分图最优匹配，确保阵容位置合理
5. **能力覆盖分** - 补充控制/先手/推进/前排能力
6. **配合分** - 与己方英雄的同队胜率

权重随 BP 阶段动态变化：
- 早期(0-1人): 侧重个人擅长 + 段位强势
- 中期(2人): 侧重克制 + 配合
- 中后期(3人): 位置 + 能力开始提升
- 后期(4人): 位置 + 能力为主

## 快速开始

### 后端
```bash
cd backend
pip install fastapi uvicorn httpx
python -m uvicorn main:app --host 0.0.0.0 --port 8082
```

### 前端
```bash
cd frontend
npm install
npm run build    # 生产构建
npm run dev      # 开发模式
```

### 数据更新
```bash
cd backend
python scripts/update_data.py --all        # 更新所有数据
python scripts/update_data.py --synergy    # 只更新配合数据
python scripts/update_data.py --lane-roles # 只更新分路数据
python scripts/update_data.py --heroes     # 只更新英雄数据
```

## 项目结构
```
dota2-bp-advisor/
├── backend/
│   ├── main.py              # FastAPI 主入口
│   ├── services/
│   │   ├── recommend.py     # 推荐引擎核心算法
│   │   ├── database.py      # 数据库操作
│   │   └── hero_names_cn.py # 英雄中文名映射
│   ├── scripts/
│   │   └── update_data.py   # 数据更新脚本
│   └── data/
│       ├── dota2.db              # SQLite 数据库
│       ├── hero_aliases.json     # 英雄别名
│       ├── hero_lane_roles.json  # 分路数据
│       ├── hero_synergy.json     # 配合数据
│       └── hero_positions.json   # 位置置信度
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── BPAnalysis.jsx  # BP分析页（推荐UI）
│   │   │   ├── Home.jsx        # 首页
│   │   │   └── Profile.jsx     # 个人中心
│   │   ├── api/index.js        # API封装
│   │   └── App.jsx             # 根组件
│   └── package.json
└── README.md
```

## 数据更新

| 数据 | 更新频率 | 方式 |
|------|---------|------|
| 配合数据 | 每周 | `update_data.py --synergy` |
| 分路数据 | 每月 | `update_data.py --lane-roles` |
| 英雄数据 | 新英雄时 | `update_data.py --heroes` |
| 英雄别名 | 人工维护 | 编辑 hero_aliases.json |

## License

MIT
