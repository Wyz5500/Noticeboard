#!/bin/sh
# Builds and updates the local CLI with Node 24/npm 11 without changing the caller's runtime or profile.

set -eu

# Prints portable invocation and runtime selection without requiring Node or repository dependencies.
usage() {
  cat <<'EOF'
用法：sh scripts/update-cli.sh [--prefix <专用安装目录>] [--bin-dir <入口目录>]

打包当前源码并更新本机 noticeboard；保留 profile，不拉取 Git、不发布或部署服务器。
支持 macOS/Linux 的 POSIX sh。需要已安装仓库依赖（npm ci）。
Node 24 查找顺序：NOTICEBOARD_NODE 绝对路径、PATH、NVM_DIR（默认 ~/.nvm）。
npm 11 默认使用所选 Node 的配套 npm，缺失时查找 PATH；可用 NOTICEBOARD_NPM_CLI 指定 npm-cli.js 绝对路径。
默认安装目录和入口由现有本机安装器决定。相对目录以调用时的工作目录为准。
EOF
}

noticeboard_prefix=''
noticeboard_bin_dir=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --prefix|--bin-dir)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        printf '错误：%s 需要目录参数\n' "$1" >&2
        exit 64
      fi
      case "$2" in --*) printf '错误：%s 需要目录参数\n' "$1" >&2; exit 64 ;; esac
      if { [ "$1" = '--prefix' ] && [ -n "$noticeboard_prefix" ]; } ||
         { [ "$1" = '--bin-dir' ] && [ -n "$noticeboard_bin_dir" ]; }; then
        printf '错误：重复参数 %s\n' "$1" >&2
        exit 64
      fi
      case "$2" in
        /*) noticeboard_directory=$2 ;;
        *) noticeboard_directory="$(pwd)/$2" ;;
      esac
      case "$1" in
        --prefix) noticeboard_prefix=$noticeboard_directory ;;
        --bin-dir) noticeboard_bin_dir=$noticeboard_directory ;;
      esac
      shift 2 ;;
    *) printf '错误：未知参数 %s\n' "$1" >&2; exit 64 ;;
  esac
done

# Accepts only an executable Node 24; probing never loads nvm or modifies PATH.
is_node24() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  case "$("$1" --version 2>/dev/null)" in v24.*) return 0 ;; *) return 1 ;; esac
}

noticeboard_node=${NOTICEBOARD_NODE:-}
if [ -n "$noticeboard_node" ]; then
  case "$noticeboard_node" in /*) ;; *) printf '错误：NOTICEBOARD_NODE 必须是 Node 24 的绝对路径\n' >&2; exit 1 ;; esac
  if ! is_node24 "$noticeboard_node"; then
    printf '错误：NOTICEBOARD_NODE 不是可执行的 Node 24\n' >&2
    exit 1
  fi
else
  noticeboard_node=$(command -v node || true)
  if ! is_node24 "$noticeboard_node"; then
    noticeboard_node=''
    for noticeboard_candidate in "${NVM_DIR:-${HOME}/.nvm}"/versions/node/v24.*/bin/node; do
      if is_node24 "$noticeboard_candidate"; then
        noticeboard_node=$noticeboard_candidate
        break
      fi
    done
  fi
fi
if [ -z "$noticeboard_node" ]; then
  printf '错误：找不到 Node 24；请安装或设置 NOTICEBOARD_NODE 绝对路径\n' >&2
  exit 1
fi
noticeboard_node=$("$noticeboard_node" -p 'process.execPath')
noticeboard_npm=${NOTICEBOARD_NPM_CLI:-}
if [ -z "$noticeboard_npm" ]; then
  noticeboard_npm=$("$noticeboard_node" -p 'require("node:path").resolve(require("node:path").dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")')
  if [ ! -f "$noticeboard_npm" ]; then
    noticeboard_npm=$(command -v npm || true)
    if [ -n "$noticeboard_npm" ]; then
      noticeboard_npm=$("$noticeboard_node" -p 'require("node:fs").realpathSync(process.argv[1])' "$noticeboard_npm")
    fi
  fi
fi
case "$noticeboard_npm" in /*) ;; *) printf '错误：请用 NOTICEBOARD_NPM_CLI 指定 npm 11 的 npm-cli.js 绝对路径\n' >&2; exit 1 ;; esac
noticeboard_npm_version=$("$noticeboard_node" "$noticeboard_npm" --version)
case "$noticeboard_npm_version" in 11.*) ;; *) printf '错误：需要 npm 11，当前为 %s\n' "$noticeboard_npm_version" >&2; exit 1 ;; esac

noticeboard_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$noticeboard_root"
if [ ! -d node_modules/esbuild ]; then
  printf '错误：缺少构建依赖；请先在 Node 24/npm 11 环境执行 npm ci\n' >&2
  exit 1
fi

# Propagates verified npm metadata to existing Node entry points while leaving PATH untouched.
npm_execpath=$noticeboard_npm
npm_config_user_agent="npm/$noticeboard_npm_version"
export npm_execpath npm_config_user_agent
printf '使用 Node %s，npm %s\n' "$("$noticeboard_node" --version)" "$noticeboard_npm_version"
"$noticeboard_node" scripts/pack-client.mjs cli
noticeboard_tarball=$("$noticeboard_node" -p 'const p = require("./apps/cli/package.json"); require("node:path").resolve("dist/packages", p.name.replace(/^@/, "").replaceAll("/", "-") + "-" + p.version + ".tgz")')
set -- --tarball "$noticeboard_tarball"
if [ -n "$noticeboard_prefix" ]; then set -- "$@" --prefix "$noticeboard_prefix"; fi
if [ -n "$noticeboard_bin_dir" ]; then set -- "$@" --bin-dir "$noticeboard_bin_dir"; fi
exec "$noticeboard_node" scripts/install-cli-local.mjs "$@"
