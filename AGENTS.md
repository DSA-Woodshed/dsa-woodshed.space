# AGENTS.md — The DSA Woodshed

Guidance for AI agents and contributors working in this repo.

## What this is

A static SvelteKit reading surface for the DSA study packet. Prose and reference
sheets are authored in `Jesssullivan/dsa-study-packet`; this repo renders a
curated subset. It is a custom public-standalone site derived historically from
`tinyland-inc/site.scaffold`, with estate coupling removed. It owns a small
public product handoff at `/agent`, `static/llms.txt`, and
`static/agent-map.md`; it does not inherit the scaffold's private projection or
plugin marketplace.

## Ground rules

- **The declared profile is binding.** `tinyland.repo.json` records this
  repository's provenance, authority, toolchain, agent-handoff inventory, and
  execution-evidence boundary. `just repo-profile` validates that declaration
  against this guide, `README.md`, and the tracked tree. A post-v0.4.0 scaffold
  audit may classify individual public-safe features as adopt, adapt, or reject;
  it is not a bulk migration. Do not add `.agents/skills`, `.claude-plugin`, or
  `plugins/scaffold-core` merely for scaffold parity.
- **Public resolvability only.** No Nix `flake.nix`, no private CI templates,
  no private registries, no credentials. Every dependency must resolve
  unauthenticated from public infrastructure. The retained
  `@tummycrypt/vite-plugin-a11y` and `@tummycrypt/vite-plugin-skeleton-colors`
  come from the public npm registry; `@tummycrypt/tinyvectors` is pinned to the
  public tinyland-inc/bazel-registry source seam (the GitHub tag archive named
  by the registry's `source.json`) and is NEVER resolved from the public npm
  registry — `scripts/build-tinyvectors.mjs` (the root `prepare` hook) compiles
  it after install.
- **Bazel is a proof surface, not a build.** `MODULE.bazel` / `BUILD.bazel` /
  `.bazelrc` exist solely so `just bazel-graph` and
  `scripts/check-inhouse-package-parity.py` (chained into `pnpm run lint`) can
  prove the in-house package pins match tinyland-inc/bazel-registry. The
  canonical site build is pnpm/Vite through `just`; never wire the site build
  through Bazel.
- **The hosted bridge is not remote-execution evidence.** CI and Pages
  temporarily use the GitHub-hosted `ubuntu-latest` capability during ownership
  migration. GitHub-hosted runner pickup does not prove GloriousFlywheel
  consumer enrollment, shared-cache attachment, REAPI, or RBE; those remain
  unproved and unclaimed here.
- **The public agent handoff stays product-owned.** Preserve `/agent`,
  `static/llms.txt`, and the packet-synced `static/agent-map.md`, including
  their prerender, sitemap, and browser coverage. This site owns `/agent` and
  `static/llms.txt`; the machine-map authority remains
  `Jesssullivan/dsa-study-packet`.
- **Stack pins are a contract.** `src/lib/house-stack-contract.test.ts` asserts
  Skeleton 4.15.2, TypeScript 6.0.x, pnpm 10.13.1, scoped `@lucide/svelte`, no
  direct `@zag-js`, Node 22. Change the pin and the test in the same commit.
- **Two content lanes** (see `README.md`): mdsvex `.svx` for prose,
  `src/lib/docs/markdown.ts` for code-heavy reference sheets. Do not run the
  reference sheets through mdsvex — their fenced Python breaks it.
- **Source-of-truth for content is the study-packet repo.** To change a
  reference sheet's text, edit it there; here you only re-copy it into
  `src/content/` and register it in `src/lib/docs/registry.ts`.
- **Security:** static site, no secrets. Never commit credentials.

## Commands

`just setup | dev | check | lint | test | e2e | build` (thin wrappers over the
`package.json` pnpm scripts). The committed content manifest pins the packet
repository, commit, and printable digest; only `just packet-lock <40-char-sha>`
advances the source commit. Do not interrupt or run concurrent lock advances.
Use `nix shell
nixpkgs#nodejs nixpkgs#pnpm -c ...` if node/pnpm are not on PATH.
