# ==============================================
# 最简 Dockerfile - 专为 Docker 环境优化
# ==============================================

FROM node:20-alpine AS builder

# 国内镜像源优化
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    npm config set registry https://registry.npmmirror.com

# 安装必要工具
RUN apk add --no-cache bash git curl wget make ca-certificates tzdata

# 安装 Go
ENV GO_VERSION=1.21.5
RUN wget https://mirrors.aliyun.com/golang/go${GO_VERSION}.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz

# Go 环境
ENV PATH=/usr/local/go/bin:$PATH
ENV GOPROXY=https://goproxy.cn,direct

WORKDIR /app

# Go 依赖
COPY go.mod go.sum ./
RUN go mod download

# 前端依赖和构建
COPY chuan-next/package.json ./chuan-next/
RUN cd chuan-next && npm install

COPY chuan-next/ ./chuan-next/
# 临时移除 API 目录进行 SSG 构建（模仿 build-fullstack.sh）
RUN cd chuan-next && \
    if [ -d "src/app/api" ]; then mv src/app/api /tmp/api-backup; fi && \
    NEXT_EXPORT=true npm run build && \
    if [ -d "/tmp/api-backup" ]; then mv /tmp/api-backup src/app/api; fi

# Go 源码和构建
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# 嵌入前端文件
RUN mkdir -p internal/web/frontend && \
    cp -r chuan-next/out/* internal/web/frontend/

# 构建 Go 应用
RUN CGO_ENABLED=0 go build -ldflags='-w -s' -o server ./cmd

# ==============================================

FROM alpine:3.18

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache ca-certificates tzdata && \
    adduser -D -s /bin/sh appuser

WORKDIR /app
COPY --from=builder --chown=appuser:appuser /app/server ./
USER appuser

EXPOSE 8080
CMD ["./server"]
