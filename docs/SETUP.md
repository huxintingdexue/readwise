# ReadWise 开发与部署指南

---

## 本地环境搭建（macOS）

### 1. 检查是否已有 Node.js
```bash
node -v
```
如果显示版本号（如 `v20.x.x`）说明已安装，跳到第3步。
如果提示"command not found"，继续第2步。

### 2. 安装 Node.js
推荐通过 nvm 安装（便于管理版本）：
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# 重启终端后执行：
nvm install 20
nvm use 20
```

### 3. 安装 Vercel CLI
```bash
npm install -g vercel
vercel -v  # 确认安装成功
```

### 4. 克隆仓库到本地
```bash
git clone https://github.com/你的用户名/readwise.git
cd readwise
```

### 5. 安装依赖
```bash
npm install
```

### 6. 配置本地环境变量
```bash
cp .env.example .env.local
```
用文本编辑器打开 `.env.local`，填入三个变量的值（见下方说明）。

### 7. 启动本地开发服务
```bash
vercel dev
```
访问 `http://localhost:3000` 查看前端，`/api/*` 接口同时可用。

---

## 环境变量说明

| 变量 | 获取方式 |
|------|----------|
| `DEEPSEEK_API_KEY` | https://platform.deepseek.com → API Keys |
| `NEON_DATABASE_URL` | Neon Console → 项目 → Connection string，末尾加 `?sslmode=require` |
| `API_SECRET` | 自行生成随机字符串：`openssl rand -hex 32` |

**配置位置：**
- 本地：`.env.local`（已加入 .gitignore，不会提交到 Git）
- Vercel：Dashboard → Project → Settings → Environment Variables（三个都要配）
- GitHub Actions Secrets：`DEEPSEEK_API_KEY` 和 `NEON_DATABASE_URL`（不需要 `API_SECRET`）

---

## 数据库初始化

首次部署时执行一次：
```bash
# 方式一：Neon Console → SQL Editor，粘贴 docs/schema.sql 全部内容执行
# 方式二：命令行
psql $NEON_DATABASE_URL -f docs/schema.sql
```

---

## 首次抓取文章

部署完成后，手动触发一次带 `INITIAL_FETCH=3` 的抓取：
```bash
INITIAL_FETCH=3 node scripts/fetch-articles.js
```
或在 GitHub Actions 页面手动触发 workflow 并设置 `INITIAL_FETCH=3`。

正常每日自动运行时不设此参数，只拉取新文章。

---

## 部署

**前端（GitHub Pages）：**
推送到 `main` 分支后自动部署。访问：`https://你的用户名.github.io/readwise`

**后端（Vercel）：**
推送到 `main` 分支后自动部署，`/api/*` 接口自动生效。

**抓取脚本（GitHub Actions）：**
每天 UTC 14:00（北京时间 22:00）自动运行。

---

## 常见问题

**Q: 前端请求 API 报 401？**
检查 `frontend/js/api.js` 中的 `API_SECRET` 是否与 Vercel 环境变量一致。

**Q: 数据库连接失败？**
确认 `NEON_DATABASE_URL` 末尾带有 `?sslmode=require`。

**Q: 翻译没有触发？**
检查 GitHub Actions Secrets 中 `DEEPSEEK_API_KEY` 是否已配置，查看 Actions 运行日志。

**Q: 划线位置对不上？**
确认前端划线位置计算基于 `content_plain`（纯文本），而非 `content_en`（富文本）。
