# 股票达人小程序后端 API

> 一个基于 Node.js + Express + MySQL 的股票推荐竞赛平台后端服务

## 📋 项目概述

股票达人小程序后端提供完整的股票推荐、用户管理、排行榜等功能，支持微信小程序登录和多维度数据统计。

### 核心功能

- 🔐 **用户系统** - 微信登录、用户信息管理、积分等级
- 📈 **股票管理** - 股票搜索、价格更新、推荐统计
- 💡 **推荐系统** - 创建推荐、跟投功能、收益计算
- 🏆 **排行榜** - 周榜/月榜/总榜、趋势分析
- 👥 **社交功能** - 跟投、收藏、分享

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- MySQL >= 5.7
- npm >= 8.0.0

### 安装部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd stock-contest-backend

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等

# 4. 创建数据库
mysql -u root -p -e "CREATE DATABASE stock_contest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 5. 启动服务
npm run dev          # 开发环境
npm start            # 生产环境
```

### 环境配置

创建 `.env` 文件并配置以下变量：

```env
# 服务器配置
PORT=3000
NODE_ENV=development

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=stock_contest
DB_USER=your_username
DB_PASSWORD=your_password

# JWT配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d

# 微信小程序配置
WECHAT_APPID=your_wechat_appid
WECHAT_APP_SECRET=your_wechat_app_secret

# 系统API密钥
SYSTEM_API_KEY=your-system-api-key
```

## 📚 API 文档

### 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: Bearer Token (JWT)
- **响应格式**: JSON

### 通用响应格式

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {}
}
```

### 接口列表

#### 🔐 用户相关 `/api/user`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/login` | 微信登录 | ❌ |
| GET | `/info` | 获取用户信息 | ✅ |
| PUT | `/info` | 更新用户信息 | ✅ |
| GET | `/stats` | 获取用户统计 | ✅ |
| PUT | `/settings` | 更新用户设置 | ✅ |
| DELETE | `/account` | 注销账户 | ✅ |

#### 📈 股票相关 `/api/stock`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/search` | 搜索股票 | ❌ |
| GET | `/detail/:code` | 获取股票详情 | ❌ |
| GET | `/history` | 获取价格历史 | ❌ |
| GET | `/popular` | 获取热门股票 | ❌ |
| GET | `/recommend-ranking` | 股票推荐排行 | ❌ |

#### 💡 推荐相关 `/api/recommend`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/create` | 创建推荐 | ✅ |
| GET | `/list` | 获取推荐列表 | ❌ |
| GET | `/my` | 获取我的推荐 | ✅ |
| GET | `/detail/:id` | 获取推荐详情 | 可选 |
| POST | `/:id/follow` | 跟投推荐 | ✅ |
| DELETE | `/:id/follow` | 取消跟投 | ✅ |

#### 🏆 排行榜相关 `/api/ranking`

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/weekly` | 获取周排行榜 | ❌ |
| GET | `/monthly` | 获取月排行榜 | ❌ |
| GET | `/total` | 获取总排行榜 | ❌ |
| GET | `/user/:id?` | 获取用户排名 | 可选 |
| GET | `/stats` | 获取排行榜统计 | ❌ |

#### 🧪 测试相关 `/api/test` (开发环境)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/create-test-user` | 创建测试用户 |
| GET | `/create-test-recommends` | 创建测试推荐 |
| GET | `/init-ranking` | 初始化排名 |
| GET | `/get-test-token` | 获取测试Token |

### 请求示例

#### 微信登录

```bash
POST /api/user/login
Content-Type: application/json

{
  "code": "微信登录code",
  "userInfo": {
    "nickName": "用户昵称",
    "avatarUrl": "头像URL"
  }
}
```

#### 创建推荐

```bash
POST /api/recommend/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "stockCode": "600519",
  "stockName": "贵州茅台",
  "currentPrice": 1680.50,
  "predictChange": 5.2,
  "reason": "推荐理由",
  "holdPeriod": "1week",
  "confidence": 4
}
```

#### 搜索股票

```bash
GET /api/stock/search?keyword=茅台
```

## 🗄️ 数据库设计

### 核心表结构

#### users - 用户表

```sql
id, open_id, nickname, avatar, total_score, level, 
total_recommends, success_recommends, current_streak, 
settings, status, created_at, updated_at
```

#### stocks - 股票表

```sql
id, code, name, market, current_price, change_percent,
recommend_count, success_rate, status, created_at, updated_at
```

#### recommends - 推荐表

```sql
id, user_id, stock_code, predict_change, reason, entry_price,
current_return, actual_return, status, start_date, end_date,
created_at, updated_at
```

#### rankings - 排名表

```sql
id, user_id, rank, score, ranking_type, period,
win_rate, avg_return, created_at, updated_at
```

## 🔧 开发指南

### 项目结构

```
├── config/           # 配置文件
│   └── database.js   # 数据库配置
├── controllers/      # 控制器
│   ├── userController.js
│   ├── stockController.js
│   ├── recommendController.js
│   └── rankingController.js
├── middleware/       # 中间件
│   ├── authMiddleware.js
│   └── errorMiddleware.js
├── models/           # 数据模型
│   ├── User.js
│   ├── Stock.js
│   ├── Recommend.js
│   └── Ranking.js
├── routes/           # 路由
│   ├── userRoutes.js
│   ├── stockRoutes.js
│   ├── recommendRoutes.js
│   └── rankingRoutes.js
├── utils/            # 工具函数
│   └── logger.js
├── app.js            # 应用入口
└── package.json
```

### 代码规范

- 使用 ES6+ 语法
- 采用 async/await 处理异步
- 统一错误处理和日志记录
- RESTful API 设计
- 输入验证和安全防护

### 测试数据初始化

开发环境可以通过以下步骤快速初始化测试数据：

```bash
# 1. 创建测试用户
curl http://localhost:3000/api/test/create-test-user

# 2. 添加股票数据
curl http://localhost:3000/api/test/create-test-stocks

# 3. 创建测试推荐
curl http://localhost:3000/api/test/create-test-recommends

# 4. 初始化排名
curl http://localhost:3000/api/test/init-ranking
```

## 🚦 API 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未授权/token无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |

## 🔒 安全特性

- JWT Token 认证
- API 请求频率限制
- 输入参数验证和清理
- SQL 注入防护 (Sequelize ORM)
- XSS 攻击防护
- CORS 跨域配置
- 敏感信息过滤

## 📊 监控和日志

### 日志系统

- 使用 Winston 记录结构化日志
- 按级别分类：info, warn, error
- 自动日志轮转和文件大小限制
- 开发环境控制台输出

### 健康检查

```bash
GET /health
```

返回服务器运行状态、数据库连接状态等信息。

## 🚀 部署

### 生产环境部署

1. **环境配置**

```bash
NODE_ENV=production
PORT=3000
# 配置生产环境数据库和密钥
```

2. **使用 PM2 管理进程**

```bash
npm install -g pm2
pm2 start app.js --name stock-contest-api
pm2 startup
pm2 save
```

3. **Nginx 反向代理**

```nginx
server {
    listen 80;
    server_name your-api-domain.com;
    
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Docker 部署

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 更新日志

### v1.0.0 (2024-01-XX)

- ✨ 基础用户系统和微信登录
- ✨ 股票搜索和数据管理
- ✨ 推荐创建和跟投功能
- ✨ 多维度排行榜系统
- ✨ 完整的 RESTful API

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📞 联系方式

- 项目地址: [GitHub Repository]
- 问题反馈: [GitHub Issues]
- 邮箱: <your-email@example.com>

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
