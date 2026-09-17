# syntax=docker/dockerfile:1

# ---- 构建阶段：安装全部依赖并产出静态文件 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# ---- 验收阶段：运行 Vitest（预言机 + 满规模 4 秒核对），一次性退出 ----
FROM node:20-alpine AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY test ./test
# package.json 中 test 即 "vitest run"：进程退出码就是验收结论，不 watch、不常驻
CMD ["npm", "test"]

# ---- 发布阶段：纯静态 nginx ----
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1
