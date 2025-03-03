# 构建阶段
FROM node:22.12-alpine AS builder

# 复制项目文件
WORKDIR /app
COPY . .

# 安装依赖并构建项目
RUN npm install
RUN npm run build

# 运行阶段
FROM node:22.12-alpine AS release

# 注意：运行容器时需要提供REPLICATE_API_TOKEN环境变量
# 例如：docker run -e REPLICATE_API_TOKEN=your_token_here ...
# 此环境变量是必需的，用于访问Replicate API生成图像

WORKDIR /app

# 只复制必要的文件
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# 设置生产环境
ENV NODE_ENV=production

# 安装生产依赖
RUN npm ci --ignore-scripts --omit=dev

# 创建输出目录
RUN mkdir -p /app/host_data

# 设置环境变量
ENV OUTPUT_DIR=/app/host_data

# 设置入口点
ENTRYPOINT ["node", "dist/server.js"]