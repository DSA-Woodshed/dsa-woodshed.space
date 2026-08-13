# The DSA Woodshed — task runner.
#
# This is a minimal, self-contained Justfile: it wraps the pnpm scripts in
# package.json and needs no Nix devshell or estate tooling. The canonical
# site build is pnpm/Vite; Bazel exists only for module-graph integrity
# proofs against tinyland-inc/bazel-registry (`just bazel-graph`, see
# MODULE.bazel). If pnpm is not on PATH, run inside
# `nix shell nixpkgs#nodejs nixpkgs#pnpm`.

set shell := ["bash", "-uc"]

# List recipes.
default:
	@just --list

# Install dependencies (frozen lockfile).
setup:
	pnpm install --frozen-lockfile

# Sync content from the DSA study packet into src/content/ (BUILD INPUT).
# Reproduces the exact revision in src/content/.manifest.json. The packet Git
# object database defaults to ../dsa-study-packet; override WOODSHED_PACKET_PATH.
sync-content:
	pnpm run sync-content

# Advance the committed packet revision and regenerate all packet-owned inputs
# as one rollback unit. SHA must be a reachable lowercase 40-character commit.
packet-lock sha:
	node scripts/packet-lock.mjs "{{sha}}"

# Type-check + svelte-check.
check: sync-content
	pnpm run check

# Lint (prettier --check + eslint + in-house package parity).
lint:
	pnpm run lint

# Verify @tummycrypt/@tinyland npm package versions match MODULE.bazel.
inhouse-package-parity:
	python3 scripts/check-inhouse-package-parity.py

# Verify the declared custom public-standalone repository profile.
repo-profile:
	pnpm run verify:repo-profile

# Bazel mod graph smoke (registry-resolution proof)
bazel-graph:
	bazelisk --output_user_root="${BAZEL_OUTPUT_USER_ROOT:-${TMPDIR:-/tmp}/site-scaffold-bazel-user-root}" mod graph

# Auto-format.
format:
	pnpm run format

# Unit tests (vitest). Generate only SvelteKit's derived TypeScript metadata;
# unlike `just check`, this does not run the full type-check.
test: sync-content
	pnpm exec svelte-kit sync
	pnpm run test:unit

# Verify the already-synced static booklet against its generated metadata.
# `just build` separately verifies the copied production asset after SvelteKit.
verify-booklet:
	pnpm run verify:booklet

# Verify generated packet bodies and the served agent map against the manifest.
verify-content-sync:
	pnpm run verify:content-sync

# End-to-end tests (playwright).
e2e:
	pnpm run test:e2e

# Production static build (adapter-static -> build/). Custom-domain base="".
# Syncs content first: the packet is the SSOT and src/content is gitignored.
build: sync-content
	pnpm run build

# Preview the built site locally.
preview:
	pnpm run preview

# Dev server.
dev: sync-content
	pnpm run dev
