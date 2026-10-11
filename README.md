<div align="center">

# FileLink

**自托管的文件直链分发服务**

把服务器上已有的文件登记进来，即可获得随机短码下载链接 —— 支持断点续传、IP 黑名单、按 IP 的并发与带宽限速，附带一个入口随机、密码随机、带图形验证码的管理控制台。

[![GitHub](https://img.shields.io/badge/GitHub-EndlessPixel%2FFileLink-181717.svg?logo=github&logoColor=white)](https://github.com/EndlessPixel/FileLink)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-339933.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen.svg)](#测试)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-4-brightgreen.svg)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[![Express](https://img.shields.io/badge/express-5-000000.svg?logo=express&logoColor=white)](https://expressjs.com)
[![Vue](https://img.shields.io/badge/vue-3-4FC08D.svg?logo=vuedotjs&logoColor=white)](https://vuejs.org)
[![Vite](https://img.shields.io/badge/vite-5-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind](https://img.shields.io/badge/tailwindcss-4-06B6D4.svg?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![SQLite](https://img.shields.io/badge/sqlite-node%3Asqlite-003B57.svg?logo=sqlite&logoColor=white)](https://nodejs.org/api/sqlite.html)

[特性](#特性) · [快速开始](#快速开始) · [部署](#部署) · [API](#公开-api) · [配置](#配置) · [常见问题](#常见问题) · [贡献](#贡献)

</div>

---

## 特性

**下载链路**

- 路径为 `/d/{16 位十六进制短码}`，短码由 CSPRNG 生成，与文件 sha256 一对一
- 短码非法或不存在时**直接销毁 TCP 连接**，不返回任何状态码 —— 外部无法区分「格式错误」「不存在」「文件已丢失」
- 命中 IP 黑名单直接 `403`，不查询短码；黑名单与白名单均支持 IPv4/IPv6 的单地址与 CIDR 网段
- 完整支持 HTTP `Range`（含后缀区间）与 `HEAD`，下载器可断点续传；非法区间 `416`
- 非 ASCII 文件名使用 `filename*=UTF-8''` 编码，中文名不乱码
- 响应完整写出后累加下载次数

**限速与防滥用**

- 单 IP 并发下载连接上限（默认 16，超出 `503`）
- 单 IP **聚合**带宽上限（默认 1 Mbps）：同一 IP 的所有连接共享一个令牌桶，而不是每条连接各分一份
- 运行时可调，改完立即生效，正在进行的下载下一块数据即套用新速率
- 公开 API 单 IP 每分钟请求上限（默认 30，超出 `429` 带 `Retry-After`）
- IP 白名单：名单内的 IP 不受并发上限与带宽限速约束（内网镜像站、自有服务器常用）

**管理控制台**

- 入口路径与管理员密码默认每次启动随机生成，只打印在服务端标准输出
- 密码第一次出错后强制图形验证码；连续 3 次失败封禁该 IP 5 分钟
- 入口与密码可在后台**改成固定值**（配置后即覆盖随机逻辑），密码要求大小写字母 + 数字 + 特殊符号，以 scrypt 加盐哈希存储
- 文件登记：输入服务器绝对路径，流式计算 sha256；也可用内置**目录浏览器**逐层挑选（带路径输入与面包屑）
- 文件列表支持搜索、排序与分页，并自动标记**磁盘上已不存在的失效映射**，可一键清理
- 一键复制下载链接（点击瞬间才向后端取最新链接，不做轮询）、重新生成链接、移除映射（不动磁盘文件）
- IP 黑名单与白名单管理（均支持 CIDR 网段）、限速与并发配置（含磁盘告警阈值）
- 系统监控：网卡上下行流量 + 磁盘容量与 IO + 内存 + CPU 负载
- 下载日志：分页 / 搜索 / 筛选 / 导出 CSV，并带按天聚合的下载趋势图
- 操作审计：登录、文件、IP 规则、配置与安全设置的每一次变更都有记录可查
- robots.txt 与 security.txt 图形化配置
- 管理接口与页面统一挂在随机前缀下，与公开 `/api` 隔离；访问任何猜测路径一律断连

**工程**

- 运行时零编译依赖：数据库用 Node 内置 `node:sqlite`，密码哈希用内置 `crypto.scrypt`
- 所有 SQL 走预编译参数绑定；前端不使用 `innerHTML`；`helmet` 统一安全响应头
- 管理界面静态资源按内容哈希长缓存（`immutable`），入口 `index.html` 不缓存
- 分层清晰（routes → services → repos），`node:test` 覆盖 99 个用例

## 界面预览

服务启动时会打印本次运行的入口与密码：

```
──────────────────────────────────────────────────────────
  FileLink 已启动
──────────────────────────────────────────────────────────
  监听地址     : 127.0.0.1:3000
  数据库       : /opt/filelink/data/filelink.db
  管理后台路径 : /admin-a3x7k9
  管理员密码   : Xk7pQm2WnB4vRt9z
──────────────────────────────────────────────────────────
  以上凭据仅在本次运行期间有效，重启后会重新生成。
──────────────────────────────────────────────────────────
```

管理控制台为深色控制台风，共八个页面：文件管理、下载日志、系统监控、IP 黑名单、IP 白名单、限速与设置、安全设置、操作审计。

## 快速开始

**要求**：Node.js `>= 22.5`（依赖内置 `node:sqlite`），推荐 24.x。

```bash
git clone <仓库地址> FileLink
cd FileLink

npm install
npm run build:web     # 构建管理控制台，产物输出到 dist/admin
npm start             # 默认监听 0.0.0.0:3000
```

启动后按控制台打印的路径访问管理后台，用打印的密码登录，然后：

1. 「添加文件」→ 输入服务器上文件的绝对路径（或用目录浏览器挑选）
2. 回到列表点「复制链接」，得到形如 `http://<host>/d/0123456789abcdef` 的下载地址
3. 把链接发给使用者即可

> `dist/` 已加入 `.gitignore`，**首次运行前必须执行 `npm run build:web`**，否则访问管理后台会提示尚未构建。

## 部署

### systemd

```ini
# /etc/systemd/system/filelink.service
[Unit]
Description=FileLink file distribution service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/filelink
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=DB_PATH=/opt/filelink/data/filelink.db
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /opt/filelink/src/index.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now filelink
journalctl -u filelink -n 40 --no-pager   # 查看入口与密码
```

### Docker

```bash
docker build -t filelink .
docker run -d --name filelink \
  -p 127.0.0.1:3000:3000 \
  -v filelink-data:/app/data \
  filelink

docker logs filelink        # 查看本次运行的管理入口与密码
```

镜像基于 `node:24-alpine`，多阶段构建：第一阶段构建管理控制台，第二阶段只安装生产依赖，并以非 root 的 `node` 用户运行。数据库文件位于 `/app/data`，请务必挂载卷以持久化。

改用宿主目录挂载时，注意目录需对容器内的 uid 1000 可写：

```bash
mkdir -p ./data && sudo chown -R 1000:1000 ./data
docker run -d --name filelink -p 127.0.0.1:3000:3000 -v "$PWD/data:/app/data" filelink
```

| 变量 | 容器内默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `HOST` | `0.0.0.0` | 容器内必须监听所有网卡，否则宿主机无法访问 |
| `DB_PATH` | `/app/data/filelink.db` | 数据库位置，与挂载卷对应 |

### 反向代理

建议 `HOST=127.0.0.1` 只监听本机，由 Nginx 对外服务：

```nginx
location ^~ / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # 必须覆盖而不是追加，否则客户端可伪造 X-Forwarded-For 绕过黑名单与限流
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;

    # 大文件下载必须关闭缓冲，否则 Nginx 会把响应缓冲落盘
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_max_temp_file_size 0;

    proxy_connect_timeout 10s;
    proxy_send_timeout 3600s;
    proxy_read_timeout 3600s;
}
```

若前面还有 CDN，需要额外用 `set_real_ip_from` 信任 CDN 网段并设置 `real_ip_header`，否则服务只能看到 CDN 节点 IP，限速与黑名单会作用在 CDN 上。详见 [SECURITY.md](./SECURITY.md)。

## 使用

### 添加文件

「添加文件」对话框有两种方式：

- 直接输入服务器上的绝对路径
- 用内置目录浏览器从 `/` 开始逐层进入，选中文件后自动回填路径

目录浏览服务端有内存缓存：比对目录 `mtime` 判断是否变化，未变则命中缓存，另有 5 分钟 TTL 兜底，LRU 上限 200 条。每个目录旁可单独清除缓存。符号链接一律跳过不跟随。

### 下载日志

「下载日志」页记录每一次下载路径（`/d/*`）的请求，包含 IP、方法、路径、状态码、发送字节数、耗时、User-Agent 与 Referer。

- 写入在响应结束后异步入队，**不阻塞下载响应**；队列每 1 秒或累积 200 条时批量落库
- 状态码 `444` 表示该请求被直接断开连接（短码非法或不存在、文件在磁盘上已丢失）
- 支持分页（10 / 20 / 50 / 100）、关键词搜索（路径 / IP / 方法）、时间范围（今天 / 本周 / 本月 / 本年 / 自定义）、状态码筛选、排序（时间 / 耗时 / 字节数）
- 时间范围按**浏览器本地时区**换算后传给服务端，避免服务器时区造成的偏差
- 统计卡片（请求数 / 累计流量 / 444 次数 / Top IP）跟随当前筛选条件变化
- 顶部「下载趋势」图按天聚合请求数与完成下载次数，可切换最近 7 / 14 / 30 天
- 「导出 CSV」按同一筛选条件导出全部匹配记录（上限 5 万行），带 UTF-8 BOM 可直接用 Excel 打开，并对 `=`、`+`、`-`、`@` 开头的值做公式注入防护
- 日志默认保留 30 天，由 `log_retention_days` 配置控制，每小时清理一次

### 系统监控

「系统监控」页分四块：磁盘容量、磁盘 IO、内存与 CPU 负载、网卡流量。

**磁盘容量** —— 展示数据库所在目录与根分区（同一文件系统只保留一条）的总量、已用与剩余，使用率超过「磁盘告警阈值」（默认 90%，可在后台修改）时标红。这是文件分发服务最需要盯的指标：磁盘写满会直接让服务不可用。

**磁盘 IO** —— 解析 `/proc/diskstats` 得到整块设备的读写速率（分区不重复计数），双线面积图，每 5 秒采样、保留最近 30 分钟。可用 `MONITOR_DISK=vda` 指定设备，`MONITOR_DISK_MOUNTS=/data,/` 指定要监控的挂载点。

**内存与负载** —— 内存占用率与峰值、CPU 占用率、1/5/15 分钟平均负载与核心数。

> 容器环境中 `statfs` 读到的是容器的文件系统，容量可能不等于宿主机真实值。

**网卡流量** —— 上行（发送）与下行（接收）实时速率。

- 数据来源是 Linux 的 `/proc/net/dev`；统计接口由 `/proc/net/route` 的默认路由自动识别，也可用环境变量 `MONITOR_INTERFACE=eth0` 手动指定
- 服务端每 5 秒采样一次，保留最近 30 分钟（最多 360 个点）于进程内存，页面每 5 秒拉取一次
- 速率由网卡累计计数器求差得出；计数器回绕时归零而不是出现负数
- 仅支持 Linux，其他平台页面会显示为不支持；在容器中运行时统计的是容器网络命名空间的流量
- 底部展示网卡自开机以来的累计收发量（含该网卡上其他进程的流量）

### 站点声明文件

在「安全设置」页可以图形化配置两个对外公开的声明文件，保存后立即生效：

**robots.txt**（`/robots.txt`）—— 默认启用，策略为禁止全站抓取。提供四个预设：禁止全站 / 允许全站 / 仅禁止下载目录（`Disallow: /d/`）/ 自定义规则；表单内实时预览将要输出的内容。关闭后该路径不再提供文件（按未知路径处理，直接断开连接）。

**security.txt**（`/.well-known/security.txt`）—— 默认关闭。字段遵循 RFC 9116：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `Contact` | 启用时必填 | `mailto:邮箱` 或 `http(s)` 链接 |
| `Expires` | 启用时必填 | ISO 8601 日期，默认给一年后 |
| `Encryption` / `Policy` / `Canonical` / `Acknowledgments` | 可选 | 需为 `http(s)` 链接 |
| `Preferred-Languages` | 可选 | 如 `zh-CN, en` |

未填写的字段不会出现在输出文件中；校验不通过会返回明确的错误提示而不落盘。

### 安全入口与密码

默认随机生成、每次启动变化；在「安全设置」页配置后固定使用：

- **安全入口**：4–64 字符，以 `/` 开头，仅允许字母、数字、`.`、`_`、`~`、`-`，不能与 `/api`、`/d` 冲突。保存后立即生效，页面自动跳转，旧入口立刻失效。
- **登录密码**：至少 8 位，需同时包含大写字母、小写字母、数字与特殊符号。修改时需验证当前密码。

两项持久化在 SQLite 的 `config` 表。想恢复随机凭据：

```bash
sqlite3 data/filelink.db "DELETE FROM config WHERE key IN ('admin_path','admin_password_hash');"
```

修改入口后，当前会话 cookie 会自动迁移到新路径，不会把你踢下线。

### IP 白名单

「IP 白名单」页添加的 IP **不受单 IP 并发上限与带宽限速约束**，适合内网镜像站、自有服务器这类需要全速拉取的场景。

- 与黑名单一样支持单个地址或 CIDR 网段（`10.0.0.0/8`、`2001:db8::/32`）
- 判定顺序：先查黑名单（命中直接 `403`），再查白名单（命中则跳过并发计数与令牌桶）
- 规则缓存在进程内存，下载热路径只读内存，不额外查库；增删即时生效

### 操作审计

「操作审计」页记录管理后台的每一次写操作：登录成功/失败、文件增删、重新生成链接、清理失效映射、黑名单与白名单增删、限速配置修改、安全入口与密码修改、robots.txt 与 security.txt 配置，包含时间、操作类型、对象、说明与来源 IP。

- 支持按关键词与操作类型筛选、分页浏览
- 记录异步入队、批量落库，不给管理请求增加 IO 延迟
- **密码类操作只记录「已修改」，不写入任何密码内容**
- 保留期与下载日志共用 `log_retention_days`（默认 30 天）

## 配置

### 环境变量 / 命令行

| 变量 | 命令行 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | `--port=3000` | `3000` | 监听端口 |
| `HOST` | `--host=127.0.0.1` | `0.0.0.0` | 监听地址 |
| `DB_PATH` | — | `data/filelink.db` | SQLite 数据文件 |
| `ADMIN_PASSWORD` | — | 随机生成 | 固定管理员密码（会被后台保存的自定义密码覆盖） |
| `PUBLIC_BASE_URL` | — | 按请求头推断 | API 返回下载链接时使用的基址 |
| `LOG_LEVEL` | — | `info` | `error` / `warn` / `info` / `debug` |

### 运行时配置

存在 `config` 表，可在管理后台修改并**立即生效**，重启后保持：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `max_speed_bps` | `1000000` | 单 IP 聚合下载带宽上限（bit/s，即 1 Mbps），`0` 为不限速 |
| `max_concurrent_downloads` | `16` | 单 IP 并发下载连接数上限 |
| `api_rate_limit_per_min` | `30` | 公开 API 单 IP 每分钟请求上限 |
| `session_ttl_seconds` | `43200` | 管理会话有效期 |
| `login_max_failures` | `3` | 触发封禁的连续登录失败次数 |
| `login_ban_seconds` | `300` | 登录失败封禁时长 |
| `log_retention_days` | `30` | 下载日志与审计记录的保留天数，`0` 表示永久保留 |
| `disk_alert_percent` | `90` | 磁盘使用率告警阈值（50–100），超过时监控页标红 |

## 公开 API

单 IP 每分钟 30 次，超限返回 `429` 并带 `Retry-After` 与 `X-RateLimit-*` 头。

```bash
# 获取下载链接（该 sha256 尚无可用的短码时自动创建）
curl "http://localhost:3000/api/filelink?sha256=<64位 sha256>"
# => {"sha256":"...","code":"0123456789abcdef","url":"http://host/d/0123456789abcdef","downloadCount":0,"created":true}

# 重新生成链接：旧短码立即失效，下载计数保留
curl -X POST http://localhost:3000/api/refresh \
  -H 'content-type: application/json' -d '{"sha256":"<sha256>"}'

# 查询文件与链接状态
curl "http://localhost:3000/api/info?sha256=<sha256>"
# => {"sha256":"...","size":1048576,"filePath":"/data/app.tar.gz","code":"...","url":"...","downloadCount":3}
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/filelink?sha256=` | 获取（必要时创建）下载链接 |
| `POST` | `/api/refresh` | 重新生成短码，旧链接立即失效 |
| `GET` | `/api/info?sha256=` | 查询文件信息与下载次数 |
| `GET` | `/healthz` | 健康检查，不占 API 限额 |

**健康检查**（`/healthz`）不计入 API 限流，也不写下载日志，可用于 systemd / Nginx / 监控系统探活：

```bash
curl http://localhost:3000/healthz
# => {"status":"ok","db":"ok","uptimeSeconds":128}
```

数据库不可用时返回 `503` 与 `{"status":"degraded","db":"error"}`。

管理接口（文件、黑名单、白名单、限速、安全设置、目录浏览、审计）均挂在随机入口前缀下，且需要登录会话，不在公开 API 之内。

## 架构

请求处理链路：

```
                        ┌─────────────────────────────┐
  下载请求 /d/:code ───▶│ 黑名单 403 → 并发 503 → 查库 │──▶ 令牌桶限速 ──▶ 文件流 (Range)
                        └─────────────────────────────┘        (按 IP 聚合)
  公开 API /api/*   ───▶ 单 IP 限流 429 ──▶ 链接服务 ──▶ 仓储层 ──▶ SQLite
  管理后台 /<入口>/* ──▶ 会话鉴权 ──▶ 文件/黑名单/配置/安全服务 ──▶ 仓储层
  其他路径           ──▶ 直接销毁 TCP 连接（444）
```

分层约定为 `routes → services → db/repos`：路由层不写 SQL，仓储层不处理 HTTP 语义。数据库、配置与安全设置都经仓储层落到 SQLite；并发计数、令牌桶、限流窗口是进程内状态（因此当前实现面向单进程部署）。

九个数据表：`files`、`links`、`ip_blacklist`、`ip_whitelist`、`admin_sessions`、`config`、`login_failures`、`access_logs`、`audit_logs`。

## 开发

```bash
npm start          # 启动服务
npm run dev        # 后端热重启（node --watch）
npm run dev:web    # 管理前端 Vite 开发服务器
npm run build:web  # 构建管理前端到 dist/admin
npm test           # 运行测试
```

### 测试

```bash
npm test                            # 全部 99 个用例
node --test test/api.test.js        # 单个文件
```

测试基于内置 `node:test` + `node:assert/strict`，覆盖短码生成与校验、真实 IP 判定、Range 解析、CIDR 匹配与 IP 白名单豁免、限流窗口有界、磁盘与网卡采样解析、文件列表查询与失效检测、审计记录，以及公开 API 与管理路由的集成行为。新增功能请附带测试，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 项目结构

```
src/
  app.js              Express 装配（中间件顺序集中在此，改动需谨慎）
  index.js            启动入口：建表、装载设置、打印凭据、定时清理、优雅退出
  config/             常量、运行时可调配置、命令行解析
  db/                 node:sqlite 连接、表结构、仓储层
  core/               短码、流式哈希、真实 IP、CIDR 匹配、444 断连、并发计数、令牌桶限速、API 限流
  services/           文件、链接、目录浏览、登录鉴权、安全设置、系统监控、审计
  routes/             下载路由、公开 API、管理后台
  middleware/         会话鉴权与错误处理
  utils/              日志、Range 解析、参数校验
  web/                Vue 3 管理控制台源码（Vite + Tailwind CSS 4）
test/                 node:test 用例
```

## 安全

`node:sqlite` 目前仍是实验性 API，运行时会打印 `ExperimentalWarning`，npm 脚本已用 `--disable-warning=ExperimentalWarning` 抑制。

部署前请务必阅读 [SECURITY.md](./SECURITY.md)，其中包含安全模型、威胁边界与**部署加固清单**。两条最容易踩的：

- 反向代理必须用 `$remote_addr` **覆盖** `X-Forwarded-For`，用 `$proxy_add_x_forwarded_for` 追加会让客户端伪造 IP 绕过黑名单与限流
- 本项目提供的是无鉴权直链，请仅在自控服务器上部署，并把登记文件放在服务账号可读、其他账号不可读的位置

漏洞请通过私有渠道报告，不要在公开 issue 中披露细节。

## 常见问题

**访问很慢，但服务器负载很低？**
先确认链路而不是服务本身：

```bash
curl -o /dev/null -w 'local ttfb=%{time_starttransfer}\n' http://127.0.0.1:3000/d/<code>   # 在服务器上跑
curl -o /dev/null -w 'direct  ttfb=%{time_starttransfer}\n' --resolve your.domain:80:<源站IP> http://your.domain/
curl -o /dev/null -w 'via cdn ttfb=%{time_starttransfer}\n' https://your.domain/
```

如果只有中间一件慢，问题就在 CDN 回源链路。例如 Cloudflare 免费版在中国大陆没有节点，大陆用户会被解析到海外节点，再跨境回源，单次请求数秒起步 —— 这种情况应关闭代理（灰云）让 A 记录直连源站，并在源站配好证书。

**忘记自定义密码了？**
删除 `config` 表中 `admin_path` 与 `admin_password_hash` 两行，重启后用启动时打印的随机密码登录（见[上文](#安全入口与密码)）。

**刷新页面 404 / 打不开管理台？**
检查 `dist/admin` 是否存在，缺失时执行 `npm run build:web`。

**下载中途断了能续传吗？**
可以，服务端完整支持 `Range`。若经过 Nginx，请确保配置了 `proxy_buffering off`，否则大文件会被缓冲落盘。

**多个实例能一起跑吗？**
当前并发计数、令牌桶与限流窗口是进程内状态，多实例部署会各自计数，限制不再准确。请保持单进程。

## 贡献

欢迎提交 Issue 与 PR。请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) —— 其中定义了分支策略（`feat/模块名`）、提交信息格式（`type(scope): 描述`）与合并方式（`git merge --no-ff`）。

安全相关的问题请走 [SECURITY.md](./SECURITY.md) 的私有报告流程。

## 许可

[Apache License 2.0](./LICENSE) © 2026 FileLink contributors

<div align="center">

**如果这个项目对你有帮助，欢迎点一个 Star。**

[github.com/EndlessPixel/FileLink](https://github.com/EndlessPixel/FileLink)

</div>
