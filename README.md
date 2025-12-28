# VoiceFlow（Next.js + PWA + BullMQ + Redis + SQLite）

本项目由 `1.md` 的单文件 React UI 落地为可生产部署的 Next.js 项目：

- Web 进程（Next.js）：接收上传、创建任务、查询任务状态、提供 PWA/静态资源
- Worker 进程（Node）：消费 BullMQ 队列，执行转写/分析，并写回 SQLite
- 持久化：本机文件系统保存音频 + SQLite 保存任务与结果

> 生产运行方式：`next build` + `next start`（禁止用 `next dev` 跑生产）

## 目录结构（最终形态）

```
.
├─ app/                     # Next.js App Router（页面骨架）
├─ components/              # 前端 UI（包含 VoiceFlowApp.jsx）
├─ pages/api/               # API Routes（上传/查询/音频流式）
├─ public/                  # PWA 资源（manifest / sw.js / icon）
├─ server/                  # 仅服务端代码（db/queue/ai/worker 逻辑）
├─ worker/                  # 独立 Worker 进程入口（无 HTTP）
├─ scripts/                 # 运维辅助脚本
├─ ecosystem.config.js      # pm2 一键启动 web + worker
├─ nginx.conf.example       # Nginx 反代示例
├─ .env.example
└─ .env.production.example
```

## 环境要求（目标）

- Ubuntu 20+
- Node.js 18+
- pnpm
- pm2
- Redis（BullMQ 依赖）
- Nginx（反向代理）

## 部署步骤（一步一步）

### 1) 安装 Node / pnpm / pm2

示例（Node 18 + pnpm + pm2）：

```bash
node -v
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
npm i -g pm2
pm2 -v
```

### 2) 安装 Redis

```bash
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
```

### 3) 拉取代码并安装依赖

```bash
pnpm install
```

> 说明：`better-sqlite3` 需要编译环境；如安装失败请先装构建依赖：  
> `sudo apt-get install -y build-essential python3`

### 4) 配置环境变量

```bash
cp .env.production.example .env.production
vim .env.production
```

关键项：

- `REDIS_URL`：Redis 地址
- `DATA_DIR` / `SQLITE_PATH`：数据目录（建议放到 `/var/lib/voiceflow`）
- `UPLOAD_MAX_BYTES`：上传上限（默认 50MB）
- `GEMINI_API_KEY`：不配置也可跑通（会走降级示例输出），配置后才会真实调用 Gemini

初始化数据目录：

```bash
sudo mkdir -p /var/lib/voiceflow
sudo chown -R $USER:$USER /var/lib/voiceflow

NODE_ENV=production node scripts/ensure-data-dirs.js
```

### 5) 构建（生产）

```bash
pnpm build
```

### 6) pm2 启动（一次启动 web + worker）

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

查看日志：

```bash
pm2 logs voiceflow-web
pm2 logs voiceflow-worker
```

### 7) 配置 Nginx 反向代理

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/voiceflow.conf
sudo ln -sf /etc/nginx/sites-available/voiceflow.conf /etc/nginx/sites-enabled/voiceflow.conf
sudo nginx -t
sudo systemctl reload nginx
```

> 如果你只用 HTTP：可以把 `nginx.conf.example` 里的 80 端口 server 块改成直接 `proxy_pass`，并移除 443 相关配置。

### 8) 验证服务

```bash
curl -sS http://127.0.0.1:3000/api/health
curl -sS http://127.0.0.1:3000/api/recordings
```

浏览器访问域名后：

1. 录音 -> 选择资产层级 -> 上传 -> 创建任务
2. worker 消费队列 -> 写入 SQLite -> 前端轮询任务状态 -> 展示转写/摘要

## 生产化要点（已处理）

- 运行方式：`next build` + `next start`
- 上传限制：`UPLOAD_MAX_BYTES`（API）+ `client_max_body_size`（Nginx）
- 密钥隔离：`GEMINI_API_KEY` 仅在 worker/服务端读取，前端不包含任何密钥
- 进程拆分：Web（Next）与 Worker（BullMQ 消费者）由 pm2 同时托管
