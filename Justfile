# DSA Woodshed public entrypoint. Nix pins the tools; Bazel owns finite actions.
set shell := ["bash", "-euo", "pipefail", "-c"]
root := justfile_directory()
export USE_BAZEL_VERSION := `cat .bazelversion`
bazel_output_user_root_flag := `bash scripts/bazel-output-user-root.sh`

# List product commands.
default:
    @just --list

# Install frozen public dependencies and contributor hooks.
setup:
    pnpm install --frozen-lockfile
    just deps-graph
    just workspace-types
    git config core.hooksPath .githooks
    git config remote.pushDefault origin
    @if git remote | grep -qx upstream; then git remote set-url --push upstream DISABLED-fork-first; fi
    @if [ "$(git config --get commit.gpgsign || true)" != true ]; then echo 'Configure signed commits; see CONTRIBUTING.md'; fi

# Materialize public graph packages for live workspace commands.
deps-graph:
    #!/usr/bin/env bash
    set -euo pipefail
    mapfile -t graph_packages < <(bazelisk {{bazel_output_user_root_flag}} query 'filter("^//:node_modules/(@xoxd|@tummycrypt)/[^/]+$", //:*)' --output=label)
    (( ${#graph_packages[@]} > 0 ))
    bazelisk {{bazel_output_user_root_flag}} build "${graph_packages[@]}"
    for graph_package in "${graph_packages[@]}"; do
        package_path="${graph_package#//:}"
        mkdir -p "$(dirname "$package_path")"
        ln -sfn "$(realpath "bazel-bin/$package_path")" "$package_path"
    done
    mkdir -p static/fonts
    install -m 644 node_modules/@xoxd/theme/fonts/* static/fonts/

# Give the editor the same generated metadata used by finite checks.
workspace-types:
    bazelisk {{bazel_output_user_root_flag}} build //:sveltekit_types
    python3 scripts/bazel_output.py materialize --source bazel-bin/.svelte-kit --destination .svelte-kit --required-path tsconfig.json

# Compare exact bytes with the immutable public organization mirror.
hooks-check mirror="https://raw.githubusercontent.com/DSA-Woodshed/.github/83f555ca5cb0ee01fa35cb6947f1b0e80228d332/githooks":
    #!/usr/bin/env bash
    set -euo pipefail
    hook_fixture=$(mktemp -d)
    trap 'rm -rf "$hook_fixture"' EXIT
    for hook_name in _lib.sh pre-commit commit-msg pre-push test.sh; do
        curl --fail --silent --show-error --location {{quote(mirror)}}/"$hook_name" -o "$hook_fixture/$hook_name"
        cmp ".githooks/$hook_name" "$hook_fixture/$hook_name"
    done
    printf 'Shared hook mirror parity passed\n'

hooks-test:
    bash .githooks/test.sh

# Reproduce the exact committed packet revision, catalog, and booklet.
sync-content:
    node scripts/sync-content.mjs

# Advance the packet and optionally its printable release as one transaction.
packet-lock sha booklet_metadata="":
    #!/usr/bin/env bash
    set -euo pipefail
    lock_args=({{quote(sha)}})
    if [[ -n {{quote(booklet_metadata)}} ]]; then
        lock_args+=(--booklet-metadata {{quote(booklet_metadata)}})
    fi
    node scripts/packet-lock.mjs "${lock_args[@]}"

bazel-lock:
    bazelisk {{bazel_output_user_root_flag}} mod deps --lockfile_mode=update

bazel-graph:
    bazelisk {{bazel_output_user_root_flag}} mod graph

# Compile and verify the declared static build, then materialize it transactionally.
build: sync-content
    bazelisk {{bazel_output_user_root_flag}} build //:build
    python3 scripts/bazel_output.py materialize --source bazel-bin/build --destination build

# CI uses the same graph with its local disk cache disabled.
build-ci: sync-content
    bazelisk {{bazel_output_user_root_flag}} build --config=ci //:build
    python3 scripts/bazel_output.py materialize --source bazel-bin/build --destination build

typecheck: sync-content
    bazelisk {{bazel_output_user_root_flag}} test //:svelte_check_test

check: repo-profile
    just typecheck

repo-profile:
    python3 scripts/check-repo-profile.py

lint:
    bazelisk {{bazel_output_user_root_flag}} test //:lint_suite

format:
    pnpm exec prettier --write .

format-check:
    bazelisk {{bazel_output_user_root_flag}} test //:prettier_check_test

# Cold-checkout metadata is generated within the declared Bazel graph.
test: sync-content
    bazelisk {{bazel_output_user_root_flag}} test //:unit_tests

test-coverage: sync-content
    bazelisk {{bazel_output_user_root_flag}} build //:unit_test_coverage
    python3 scripts/bazel_output.py materialize --source bazel-bin/coverage --destination coverage --required-path index.html

verify-content-sync:
    node scripts/verify-content-sync.mjs

verify-booklet:
    node scripts/sync-booklet.mjs --verify

# Test the already-materialized production artifact.
e2e: build
    pnpm exec playwright test

preview port="4173":
    python3 scripts/bazel_output.py preview --port {{port}}

dev: sync-content deps-graph
    bazelisk {{bazel_output_user_root_flag}} run //:dev

typecheck-watch: sync-content deps-graph workspace-types
    bazelisk {{bazel_output_user_root_flag}} run //:svelte_check_bin -- --watch

analyze: sync-content
    bazelisk {{bazel_output_user_root_flag}} build //:analyze

# The contributor gate records only locally demonstrated outcomes.
gate: hooks-check hooks-test check lint test build
    @echo 'DSA Woodshed local gate passed: typecheck, lint, unit tests, static build'
