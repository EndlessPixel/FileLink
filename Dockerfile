# syntax=docker/dockerfile:1

# ---------- 阶段一：构建管理控制台 ----------
FROM node:24-alpine AS web-builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY src/web ./src/web
RUN npm run build:web

# ---------- 阶段二：运行时 ----------
FROM node:24-alpine AS runtime

# node:sqlite 是 Node 内置模块，无需任何原生编译依赖
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/app/data/filelink.db

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY --from=web-builder /build/dist ./dist

# 数据目录归 node 用户所有，便于以非 root 身份写 SQLite
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000

# 仅探测端口连通性，不依赖业务端点
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;const s=require('node:net').connect(p,'127.0.0.1');s.setTimeout(3000);s.on('connect',()=>{s.end();process.exit(0)});s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))"

# 启动后会打印本次运行的管理入口与密码，用 docker logs 查看
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
