
# ==============================================
# AMD64 Dockerfile - 使用官方 Go 基础镜像
# ==============================================

# 前端构建阶段
FROM node:20-alpine AS frontend-builder

# 国内镜像源优化
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    npm config set registry https://registry.npmmirror.com

WORKDIR /app/chuan-next

# 前端依赖和构建
COPY chuan-next/package.json ./
RUN npm install

COPY chuan-next/ ./
# 临时移除 API 目录进行 SSG 构建
RUN if [ -d "src/app/api" ]; then mv src/app/api /tmp/api-backup; fi && \
    NEXT_EXPORT=true npm run build && \
    if [ -d "/tmp/api-backup" ]; then mv /tmp/api-backup src/app/api; fi

# ==============================================

# Go 构建阶段
FROM golang:1.21-alpine AS go-builder

# 国内镜像源和代理优化
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache git ca-certificates tzdata

ENV GOPROXY=https://goproxy.cn,direct
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

WORKDIR /app

# Go 依赖
COPY go.mod go.sum ./
RUN go mod download

# 拷贝前端构建结果
COPY --from=frontend-builder /app/chuan-next/out ./internal/web/frontend

# Go 源码
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# 构建 Go 应用 - AMD64 架构
RUN go build -ldflags='-w -s' -o server ./cmd

# ==============================================

FROM alpine:3.18

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache ca-certificates tzdata && \
    adduser -D -s /bin/sh appuser

WORKDIR /app
COPY --from=go-builder --chown=appuser:appuser /app/server ./
USER appuser

EXPOSE 8080
CMD ["./server"]

