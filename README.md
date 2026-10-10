# FileLink

自托管文件直链分发服务。把服务器上已有的文件登记进系统，即可获得随机短码下载链接，支持断点续传、IP 黑名单、按 IP 的并发与带宽限速，并附带一个访问路径随机的管理控制台。

## 快速开始

```bash
npm install
npm run build:web     # 构建管理控制台（产物输出到 dist/admin）
npm start             # 默认监听 3000
```

启动后控制台会打印本次运行的管理后台路径与管理员密码：

```
  监听端口     : 3000
  管理后台路径 : /admin-a3x7k9
  管理员密码   : Xk7pQm2WnB4vRt9z
```

访问该路径即可进入控制台。**路径后缀每次启动重新随机生成**，密码默认随机生成，可用环境变量固定。

开发模式：

```bash
npm run dev       # 后端热重启（node --watch）
npm run dev:web   # 前端 Vite 开发服务器
npm test          # 单元与集成测试（node:test）
```

## 配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口，也可用 `--port=3000` 或 `--port 3000` |
| `HOST` | `0.0.0.0` | 监听地址，反向代理场景建议设为 `127.0.0.1`，也可用 `--host=127.0.0.1` |
| `DB_PATH` | `data/filelink.db` | SQLite 数据文件路径 |
| `ADMIN_PASSWORD` | 随机生成 | 固定管理员密码，便于部署 |
| `PUBLIC_BASE_URL` | 按请求头推断 | API 返回下载链接时使用的基址，如 `https://dl.example.com` |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

限速与登录策略存在 SQLite 的 `config` 表，可在控制台实时修改并立即生效：

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `max_speed_bps` | `1000000` | 单 IP 聚合下载带宽上限（bit/s，即 1 Mbps），`0` 表示不限速 |
| `max_concurrent_downloads` | `16` | 单 IP 并发下载连接数上限，超出返回 503 |
| `api_rate_limit_per_min` | `30` | 公开 API 单 IP 每分钟请求上限，超出返回 429 |
| `session_ttl_seconds` | `43200` | 管理会话有效期 |
| `login_max_failures` | `3` | 触发封禁的连续登录失败次数 |
| `login_ban_seconds` | `300` | 登录失败封禁时长 |

## 下载链路

- 路径格式 `GET /d/{16 位十六进制短码}`，短码无有效期，重新生成后旧短码立即失效。
- 短码格式非法或查库不存在：**直接断开 TCP 连接，不返回任何 HTTP 状态码**（等效 nginx 444）。
- 命中 IP 黑名单：返回 `403`，不查询短码。
- 支持 HTTP `Range`（单区间，含后缀区间），返回 `206` 与 `Content-Range`；非法区间返回 `416`；支持 `HEAD`。
- 并发超限 `503`，限速为**该 IP 所有下载连接共享**的令牌桶。
- 响应完整写出后累加该文件的下载次数。

## 公开 API

所有接口按客户端 IP 限流，超限返回 `429` 并带 `Retry-After`。

```bash
# 获取下载链接（不存在则自动创建）
curl "http://localhost:3000/api/filelink?sha256=<64位sha256>"

# 重新生成链接（旧短码立即失效，下载计数保留）
curl -X POST http://localhost:3000/api/refresh \
  -H 'content-type: application/json' -d '{"sha256":"<sha256>"}'

# 查询文件与链接状态
curl "http://localhost:3000/api/info?sha256=<sha256>"
```

## 管理控制台

- 访问路径为启动时随机生成的 `/admin-xxxxxx`，访问其他 `/admin*` 路径直接断开连接。
- 首次输入管理员密码即可登录；**密码错误一次后**登录需要填写 SVG 图形验证码（答案存于签名 cookie 由服务端校验）。
- 连续 3 次密码或验证码错误，该 IP 被封禁 5 分钟。
- 功能：文件列表与添加（输入服务器绝对路径，流式计算 sha256）、移除映射（不删除磁盘文件）、复制下载链接（点击时实时获取最新链接）、重新生成链接、IP 黑名单增删、限速与并发配置。

## 真实客户端 IP

自动识别，无需开关：

1. 连接来源（`remoteAddress`）为公网 IP 时直接采用；
2. 为内网/回环地址时，依次读取 `X-Forwarded-For` 最左侧的公网 IP、`X-Real-IP`；
3. 都取不到则回退 `remoteAddress`。

## 项目结构

```
src/
  app.js              Express 应用装配（中间件顺序集中在此）
  index.js            启动入口：建表、生成凭据与打印、定时清理
  config/             常量与配置存储（含运行时热更新缓存）
  db/                 node:sqlite 连接、表结构与仓储层
  core/               短码、流式哈希、真实 IP、444 断连、并发计数、令牌桶限速、API 限流
  services/           文件服务、链接服务、登录鉴权服务
  routes/             下载路由、公开 API 路由、管理后台路由
  middleware/         鉴权与错误处理
  utils/              日志、Range 解析、校验
  web/                Vue 3 管理控制台源码（Vite + Tailwind CSS 4）
test/                 node:test 单元与集成测试
```

## 免责声明

本服务为管理员主动登记的文件提供无鉴权直链，请仅在受信任的内网或自控服务器上部署，并注意磁盘文件的访问权限。
