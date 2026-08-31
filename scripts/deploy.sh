#!/usr/bin/env bash
# Deploys the PostgreSQL-backed demo stack through the repository Compose contract.

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd -- "${SCRIPT_DIRECTORY}/.." && pwd)"
readonly COMPOSE_FILE="${PROJECT_ROOT}/compose.yaml"
readonly LEGACY_PROJECT_NAME="adventurers-guild"

# Prints the supported deployment wrapper options.
print_usage() {
  cat <<'EOF'
用法：scripts/deploy.sh [选项]

启动或更新完整 Docker Compose 栈：postgres、migration、seed 和 app。

选项：
  --dry-run  只打印将要执行的 Compose 命令，不连接 Docker
  --help     显示此帮助信息
EOF
}

# Prints a Compose command without executing it for safe preflight inspection.
print_dry_run_command() {
  printf 'DRY RUN:'
  printf ' %q' docker compose -f "${COMPOSE_FILE}" "$@"
  printf '\n'
}

# Executes one Compose command against the repository-owned Compose file.
run_compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

# Removes only legacy project containers so the product rename can reuse its ports safely.
migrate_legacy_project() {
  local legacy_containers
  legacy_containers="$(docker compose -f "${COMPOSE_FILE}" -p "${LEGACY_PROJECT_NAME}" ps -aq)"
  if [[ -z "${legacy_containers}" ]]; then
    return 0
  fi

  printf '迁移旧 Compose 项目：%s（保留旧 PostgreSQL 卷）\n' "${LEGACY_PROJECT_NAME}"
  docker compose -f "${COMPOSE_FILE}" -p "${LEGACY_PROJECT_NAME}" down --remove-orphans
}

# Validates local Docker access, deploys the stack, and prints its final status.
main() {
  local dry_run=false

  case "${1:-}" in
    '') ;;
    --dry-run)
      dry_run=true
      ;;
    --help|-h)
      print_usage
      return 0
      ;;
    *)
      printf '未知选项：%s\n\n' "$1" >&2
      print_usage >&2
      return 64
      ;;
  esac

  if [[ "${dry_run}" == true ]]; then
    print_dry_run_command -p "${LEGACY_PROJECT_NAME}" down --remove-orphans
    print_dry_run_command config --quiet
    print_dry_run_command up -d --build --wait
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    printf '错误：未找到 docker 命令。\n' >&2
    return 127
  fi
  if ! docker compose version >/dev/null 2>&1; then
    printf '错误：当前 Docker 不支持 docker compose。\n' >&2
    return 127
  fi
  if ! docker info >/dev/null 2>&1; then
    printf '错误：无法连接 Docker daemon，请先启动 Docker Desktop 或 OrbStack。\n' >&2
    return 1
  fi

  migrate_legacy_project
  printf '检查 Compose 配置：%s\n' "${COMPOSE_FILE}"
  run_compose config --quiet
  printf '构建并启动容器，等待健康检查和一次性任务完成……\n'
  run_compose up -d --build --wait
  printf '\n容器状态：\n'
  run_compose ps
  printf '\n部署完成：\n'
  printf '  页面：      http://localhost:3000\n'
  printf '  Swagger：   http://localhost:3000/api/docs\n'
  printf '  存活检查：  http://localhost:3000/health/live\n'
  printf '  就绪检查：  http://localhost:3000/health/ready\n'
}

main "$@"
