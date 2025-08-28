#!/bin/bash

# ==============================================
# Docker 发布脚本
# 支持单架构和多架构构建
# ==============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# 配置
DOCKER_HUB_USER=${DOCKER_HUB_USER:-"matrixseven"}  # 替换为你的 Docker Hub 用户名
REPO_NAME="file-transfer-go"
IMAGE_NAME="${DOCKER_HUB_USER}/${REPO_NAME}"
VERSION="v1.0.5"

print_header() {
    echo -e "${PURPLE}========================================${NC}"
    echo -e "${PURPLE}🐳 $1${NC}"
    echo -e "${PURPLE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 检查 Docker 是否支持多架构构建
check_multiarch_support() {
    if command -v docker buildx >/dev/null 2>&1; then
        echo "true"
    else
        echo "false"
    fi
}

# 登录 Docker Hub
docker_login() {
    print_info "登录 Docker Hub..."
    if ! docker info | grep -q "Username: ${DOCKER_HUB_USER}"; then
        echo -e "${YELLOW}请输入 Docker Hub 登录信息:${NC}"
        docker login
    else
        print_success "已登录 Docker Hub"
    fi
}

# 推送镜像到 Docker Hub
push_to_dockerhub() {
    print_info "推送镜像到 Docker Hub..."
    docker push "${IMAGE_NAME}:${VERSION}"
    docker push "${IMAGE_NAME}:latest"
    print_success "镜像推送完成"
}

# 单架构构建（当前方法）
build_single_arch() {
    print_header "单架构 Docker 镜像构建"
    
    print_info "构建镜像: ${IMAGE_NAME}:${VERSION}"
    docker build -t "${IMAGE_NAME}:${VERSION}" -t "${IMAGE_NAME}:latest" .
    
    print_success "单架构镜像构建完成"
    docker images "${IMAGE_NAME}"
}

# 多架构构建（需要 buildx）
build_multiarch() {
    print_header "多架构 Docker 镜像构建"
    
    print_info "创建 buildx builder"
    docker buildx create --name multiarch --use 2>/dev/null || true
    docker buildx inspect --bootstrap
    
    print_info "构建多架构镜像: linux/amd64,linux/arm64"
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t "${IMAGE_NAME}:${VERSION}" \
        -t "${IMAGE_NAME}:latest" \
        --push \
        .
    
    print_success "多架构镜像构建并推送完成"
}

# 显示使用说明
show_usage() {
    print_header "Docker 镜像使用说明"
    
    echo -e "${GREEN}🚀 运行镜像:${NC}"
    echo "   docker run -d -p 8080:8080 ${IMAGE_NAME}:${VERSION}"
    echo ""
    
    echo -e "${GREEN}📦 镜像信息:${NC}"
    echo "   - Docker Hub: https://hub.docker.com/r/${DOCKER_HUB_USER}/${REPO_NAME}"
    echo "   - 版本: ${VERSION}"
    echo "   - 大小: ~16MB"
    echo "   - 架构: $(check_multiarch_support && echo "amd64, arm64" || echo "amd64")"
    echo "   - 基础镜像: alpine:3.18"
    echo ""
    
    echo -e "${GREEN}🌟 特性:${NC}"
    echo "   ✅ 静态编译，无外部依赖"
    echo "   ✅ 前端文件完全嵌入"
    echo "   ✅ 多平台文件传输支持"
    echo "   ✅ WebRTC P2P 连接"
    echo "   ✅ 桌面共享功能"
    echo ""
}

# 主函数
main() {
    # 登录 Docker Hub
    docker_login
    
    case "${1:-single}" in
        "multi")
            if [ "$(check_multiarch_support)" = "true" ]; then
                build_multiarch  # 多架构构建会自动推送
            else
                echo -e "${RED}❌ Docker buildx 不可用，回退到单架构构建${NC}"
                build_single_arch
                push_to_dockerhub
            fi
            ;;
        "single"|*)
            build_single_arch
            push_to_dockerhub
            ;;
    esac
    
    show_usage
}

# 检查参数
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "用法: $0 [single|multi]"
    echo ""
    echo "  single    构建单架构镜像并推送到 Docker Hub (默认，amd64)"
    echo "  multi     构建多架构镜像并推送到 Docker Hub (amd64, arm64)"
    echo ""
    echo "环境变量:"
    echo "  DOCKER_HUB_USER    Docker Hub 用户名 (默认: matrixseven)"
    echo ""
    echo "示例:"
    echo "  $0 single          # 单架构构建"
    echo "  $0 multi           # 多架构构建"
    echo "  DOCKER_HUB_USER=yourname $0 single  # 指定用户名"
    echo ""
    exit 0
fi

main "$@"
