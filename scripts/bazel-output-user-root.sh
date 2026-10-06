#!/usr/bin/env bash
# Honor the developer's managed Bazel configuration; otherwise use a durable cache.
set -euo pipefail
if [[ -n "${BAZEL_OUTPUT_USER_ROOT:-}" ]]; then
  printf -- '--output_user_root=%s\n' "${BAZEL_OUTPUT_USER_ROOT%/}"
elif [[ -r "${HOME}/.bazelrc" ]] && grep -Eq '^[[:space:]]*startup[[:space:]]+--output_user_root=' "${HOME}/.bazelrc"; then
  exit 0
else
  printf -- '--output_user_root=%s\n' "${XDG_CACHE_HOME:-${HOME}/.cache}/bazel/dsa-woodshed"
fi
