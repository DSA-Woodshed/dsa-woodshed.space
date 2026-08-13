# The DSA Woodshed

[The DSA Woodshed](https://dsa-woodshed.space) is a static SvelteKit front door
for editor-first technical interview practice. A visitor can start a GitHub
Codespace, choose a native Copilot slash command, write reasoning as comments,
implement a solution, and run focused tests. No separate agent CLI or repository
API key is required.

The public information architecture is deliberately small:

- **Start** explains the editor practice loop and opens Codespaces.
- **Practice** presents the core Practice Drills.
- **Library** groups algorithms, reference sheets, Advanced Exercises, and
  Printables.
- **Method** explains how and why to practice.
- **Project** is a concise public landing that links the source-of-truth and
  public-boundary contract.

Search covers the landing routes at `/library`, `/challenges`, `/practice`, and
`/printables`, plus their detailed content.

## Content contract

The public
[DSA study packet](https://github.com/Jesssullivan/dsa-study-packet) is the
source of truth for guides, reference sheets, algorithms, and printable source
material. This repository owns the site shell, navigation, route copy, and
rendering code.

`scripts/sync-content.mjs` uses a packet Git checkout at `WOODSHED_PACKET_PATH`,
or `../dsa-study-packet` by default, as an object database and writes build
inputs under the gitignored `src/content/`. The committed
`src/content/.manifest.json` is the exact input lock; ordinary syncs and
builds reproduce its `sourceRepo`, `sourceCommit`, and printable release digest
even when packet `main` or its latest release has advanced. Sync also refreshes the same-origin
`static/agent-map.md` from the packet's machine-readable map. The manifest pins
that map's source path and digest alongside the rendered content. The source
sync resolves the lock once and reads every commit-sourced packet artifact from
that immutable commit. It is deterministic and does not use the packet working
tree or the checkout's current branch. `just verify-content-sync` rejects any
body or map whose published bytes no longer match the manifest.

Advance the packet revision only through `just packet-lock <40-char-sha>`. It
validates that the commit is published, holds an exclusive transaction marker,
regenerates content while retaining the pinned printable, restores tracked and
generated outputs on a caught failure, and prints the old and new revision pair.
Do not interrupt this maintainer transaction. CI and Pages read the same lock
before checkout, verify the checkout, and reject any post-sync manifest,
printable-digest, or agent-map drift.

The same sync downloads the manifest-pinned stable GitHub release's single
`booklet.pdf` and verifies the release size, SHA-256 digest, and PDF
signature before accepting it. Generated metadata lives at the gitignored
`src/content/.booklet.json`; the PDF uses a digest-addressed path under
`static/generated/`. This step requires outbound access to the public GitHub API
and release asset. It fails closed on a timeout, ambiguous asset, oversized
asset, or verification mismatch.

The packet is public. Local builds and GitHub Actions use the normal read-only
checkout path and require no deploy key or repository secret. Each rendered
content page links back to its packet source.

Two rendering lanes keep the build predictable:

- mdsvex renders prose stored as `.svx`.
- `src/lib/docs/markdown.ts` renders code-heavy reference sheets whose Python,
  braces, and angle brackets are unsafe for mdsvex.

The site is fully prerendered with SvelteKit 2, Svelte 5, Skeleton 4, and
`adapter-static`. Pagefind builds the static search index after the site build;
`scripts/verify-search-index.mjs` checks the detailed content lanes, the
required landing routes, and every result URL.

## Develop

Use `just` as the canonical front door. It wraps Node 22 and pnpm 10.13.1, as
pinned by `.nvmrc` and `packageManager`, without hiding the underlying
pnpm/Vite commands.

```sh
just setup
just dev
just check
just lint
just test
just build
just verify-booklet
just e2e
just repo-profile
just packet-lock <40-char-sha>
```

The equivalent underlying setup and development commands are
`pnpm install --frozen-lockfile`, `pnpm run sync-content`, and `pnpm run dev`.
`dev`, `check`, `test`, and `build` sync packet content first. The underlying
`pnpm run check`, `pnpm run lint`, and `pnpm run test:unit` commands can validate
site code against content that is already present. `just verify-booklet` checks
the already-synced static PDF against its generated metadata without fetching it
again. `just repo-profile` checks the repository's declared public-standalone
profile against its tracked files and contributor documentation.

## Repository profile

This repository is a custom public-standalone site derived historically from
`tinyland-inc/site.scaffold`; it is not a full scaffold implementation. The
machine-readable contract in `tinyland.repo.json` is enforced by
`just repo-profile` and the CI lint gate.

- The canonical build is pnpm/Vite through `just`. Bazel proves only the module
  graph and in-house package-pin parity; it does not build or run the site.
- This site owns the public `/agent` orientation page and `static/llms.txt`.
  The packet-synced `static/agent-map.md` remains authoritative in
  `Jesssullivan/dsa-study-packet`.
- The site does not inherit `.agents/skills`, `.claude-plugin`, or
  `plugins/scaffold-core` merely for parity with the house scaffold.
- Runtime backend, auth, payments, and apply authority are all absent.
- CI and Pages temporarily use GitHub-hosted runners as a bounded ownership-
  migration bridge. GitHub-hosted runner pickup proves scheduling. Pickup does not prove
  the matrix. A green exact-head run proves the complete site/browser matrix.
  GloriousFlywheel enrollment, shared-cache attachment, REAPI, and RBE remain
  unproved and unclaimed here and belong to separate maintainer-validation work.

### Selective scaffold audit ledger

Status: pending the site.scaffold v0.4.0 release. After that release,
maintainers review individual public-safe features against this table. These
dispositions are the current baseline, not a claim that the post-release audit
already ran. The audit updates each row in place; it does not create a
wholesale convergence obligation.

| Scaffold surface | Disposition | Woodshed boundary |
| --- | --- | --- |
| Public CI, security, and accessibility checks | Adopt | Only when publicly resolvable and relevant to this static site |
| Public static-Svelte presentation primitives | Adapt | Preserve Woodshed IA, content authority, and product behavior |
| `.agents/skills`, `.claude-plugin`, and `plugins/scaffold-core` | Reject | The Woodshed owns its smaller public `/agent` handoff |
| Nix, private CI or registries, runtime/apply lanes, owner overlays | Reject | This repository has no runtime, auth, payments, or apply authority |

## Deploy

Pushes to `main` and a daily scheduled reproducibility deployment run
`.github/workflows/deploy-pages.yml`. The workflow checks out this repository
and the exact public packet revision and printable committed in the manifest,
syncs content, builds the static site, and publishes `build/` to GitHub Pages at
`dsa-woodshed.space`. A constant concurrency group rejects stale-main runs, and
the deployment finishes only after production serves the embedded site, packet,
and printable receipt. CI runs the same check, lint, unit, build, and browser
gates on pull requests.

The app began as a private house SvelteKit scaffold. Estate coupling was
removed: there is no Nix flake, private CI template, private-registry package,
or house projection bundle here. The deliberately retained public agent
handoff is a Woodshed product surface, not a scaffold marketplace import. The
`MODULE.bazel` / `.bazelrc` pair is a version-parity proof surface against the
public tinyland-inc/bazel-registry (the source of truth for
`@tummycrypt/tinyvectors`, which is never resolved from the public npm registry;
see `scripts/build-tinyvectors.mjs`); the site build itself is plain pnpm/Vite.
