#!/usr/bin/env bash
# Delegates permanent deployment to the primary-checkout-only Node entry point.

set -Eeuo pipefail

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_SCRIPT="${SCRIPT_DIRECTORY}/deploy.mjs"

# Executes the cross-platform deployment CLI without adding lifecycle capabilities.
main() {
  node "${DEPLOY_SCRIPT}" "$@"
}

main "$@"
