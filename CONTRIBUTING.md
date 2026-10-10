# 贡献指南

感谢你有兴趣为 FileLink 做出贡献。本文档说明本地开发方式、代码约定与提交规范。

## 行为准则

参与本项目即表示你同意：讨论保持聚焦技术本身，尊重不同经验水平的贡献者，不接受针对个人的攻击、骚扰或歧视性言论。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | `>= 22.5`（数据库使用内置 `node:sqlite`），推荐 24.x |
| npm | 10 及以上 |
| 操作系统 | Linux / macOS；Windows 下需 WSL 或 Git Bash |

`node:sqlite` 目前仍标记为实验性，运行时可能打印 `ExperimentalWarning`，项目的 npm 脚本已用 `--disable-warning=ExperimentalWarning` 抑制。

## 本地开发

```bash
git clone <仓库地址> FileLink
cd FileLink
npm install
npm run build:web     # 管理控制台需要先构建，产物在 dist/admin
npm start             # 默认 http://0.0.0.0:3000
```

启动后控制台会打印本次运行的管理后台路径与管理员密码。为了调试方便，可以固定这两项：

```bash
ADMIN_PASSWORD=dev123456 HOST=127.0.0.1 PORT=3000 npm run dev
```

前端单独开发时，用 `npm run dev:web` 启动 Vite 开发服务器。

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动服务 |
| `npm run dev` | 后端热重启（`node --watch`） |
| `npm run dev:web` | 管理前端 Vite 开发服务器 |
| `npm run build:web` | 构建管理前端到 `dist/admin` |
| `npm test` | 运行全部测试（`node:test`） |

## 项目结构

```
src/
  app.js          Express 装配，中间件顺序集中在此（改动需谨慎）
  index.js        启动入口：建表、打印凭据、定时清理、优雅退出
  config/         常量、配置存储（内存缓存 + 热更新）、命令行解析
  db/             node:sqlite 连接、表结构、仓储层
  core/           短码、流式哈希、真实 IP、444 断连、并发计数、令牌桶限速、API 限流
  services/       文件服务、链接服务、登录鉴权服务
  routes/         下载 / 公开 API / 管理后台
  middleware/     鉴权与错误处理
  utils/          日志、Range 解析、校验
  web/            Vue 3 管理控制台源码
test/             node:test 测试
```

分层约定是 `routes → services → db/repos`，路由层不直接写 SQL，仓储层不处理 HTTP 语义。

## Git 工作流

本项目遵循以下规则，请勿直接在 `main` 上提交：

1. `main` 只接受合并，所有开发都在分支上进行。
2. 每个大功能模块新建分支，命名 `feat/模块名`；缺陷修复用 `fix/问题简述`。
3. **每个独立功能点完成后提交一次**，不要把多个不相关的改动塞进一个 commit。
4. commit message 格式：`type(scope): 描述`

   - `type` 仅限：`feat`（新功能）、`fix`（缺陷修复）、`refactor`（重构，行为不变）、`chore`（构建/依赖/杂项）
   - `scope` 建议用模块名，如 `download`、`api`、`admin`、`web`、`db`、`server`

   示例：

   ```
   feat(download): 支持后缀形式的 Range 请求
   fix(throttle): 修复低速限速下令牌桶死锁
   chore(deps): 升级 express 到 5.3
   ```

5. 模块开发完成后合并回 `main`：

   ```bash
   git checkout main
   git merge --no-ff feat/模块名 -m "chore(merge): 合并XXX模块"
   git branch -d feat/模块名
   ```

   始终使用 `--no-ff`，即使可以 fast-forward 也要保留合并提交。

## 代码规范

- 后端为 ESM（`"type": "module"`），统一使用 `import` / `export`。
- 缩进 2 空格，语句结尾带分号，字符串默认单引号，不加尾随逗号。
- 单个文件尽量不超过 300 行；超出时按职责拆分，而不是压缩成难读的一行。
- 注释写「为什么」，不写「是什么」；对外导出的函数用 JSDoc 简述契约。
- 日志禁止输出敏感值：管理员密码、会话 ID、验证码答案、文件的实际绝对路径不要进常规日志（启动凭据打印是规格要求，走 `printBanner` 单独区块）。
- 数据库访问一律使用预编译语句与参数绑定，禁止拼接 SQL 字符串。
- 前端不使用 `innerHTML` 与 `v-html`，用户可控内容靠 Vue 的文本插值转义。

### 前端

- Vue 3 组合式 API + `<script setup>`，样式统一用 Tailwind CSS 4 工具类。
- 自定义组件类（如 `.btn-primary`）之间不要相互 `@apply`，Tailwind 4 不支持，用分组选择器合并公共部分。
- 颜色、字体等设计变量定义在 `src/web/src/assets/main.css` 的 `@theme` 中，不要在组件里硬编码色值。

## 测试

新增功能请附带测试，缺陷修复请先写能复现的用例。

```bash
npm test                            # 全部
node --test test/api.test.js        # 单个文件
```

- 测试使用内置 `node:test` + `node:assert/strict`，不引入额外测试框架。
- 涉及数据库的测试请 `initDb()` 到 `os.tmpdir()` 下的临时文件，结束时清理，不要污染 `data/`。
- 涉及 HTTP 的测试用 `app.listen(0)` 拿随机端口，不要固定端口。
- 请在提交前确认 `npm test` 全绿，并且 `npm run build:web` 能通过。

## 提交前检查清单

- [ ] `npm test` 全绿
- [ ] `npm run build:web` 构建成功
- [ ] 本地起服务手动验证过改动路径（含管理后台相关改动的实际点击验证）
- [ ] commit message 符合 `type(scope): 描述`
- [ ] 没有把 `data/`、`dist/`、`node_modules/` 或任何密钥提交进仓库

## 安全相关问题

请勿在公开 issue 中披露漏洞细节，按 [SECURITY.md](./SECURITY.md) 的流程私下报告。

## 许可

提交贡献即表示你同意以 [Apache License 2.0](./LICENSE) 授权你的贡献（对应许可证第 5 条）。
