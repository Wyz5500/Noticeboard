#!/usr/bin/env bash
# Deploys the PostgreSQL-backed demo stack through the repository Compose contract.

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd -- "${SCRIPT_DIRECTORY}/.." && pwd)"
readonly INSTANCE_SCRIPT="${SCRIPT_DIRECTORY}/instance.mjs"

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

# Executes the instance-aware lifecycle entry point.
run_instance() {
  node "${INSTANCE_SCRIPT}" up "$@"
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
    node "${INSTANCE_SCRIPT}" up --dry-run
    return 0
  fi

  run_instance
}

main "$@"
