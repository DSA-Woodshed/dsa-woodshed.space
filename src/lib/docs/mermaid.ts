// Build-time Mermaid → SVG rendering for the raw markdown lane ($lib/docs/markdown.ts).
//
// WHY THIS EXISTS
//   The reference/guide sheets synced from the DSA study packet occasionally
//   embed a ```mermaid fence (currently: docs/guide/when-to-use-what.md's
//   decision tree). markdown.ts has no client-side diagram engine (a
//   zero-dependency constraint on the hand-rolled renderer itself — see its
//   header comment), so historically a mermaid fence rendered as its own
//   labelled source instead of a picture. This module renders the diagram to
//   an inline SVG at BUILD time via `mermaid-isomorphic` (which drives a real
//   Mermaid instance in a headless Playwright browser), so the shipped HTML
//   carries a real diagram and the client bundle gains zero new JS.
//
// SERVER/BUILD-ONLY
//   Every caller of this module is a `+page.server.ts` load (see the reference
//   and guide `[slug]` routes), which SvelteKit only ever executes on the
//   server / at prerender time. `mermaid-isomorphic` and `playwright` are
//   imported dynamically (mirroring the Shiki highlighter below in
//   markdown.ts) so neither — nor the headless Chromium they drive — is ever
//   part of the client module graph.
//
// CONTENT-ADDRESSED CACHE
//   Every diagram is keyed by the first 16 hex characters of the sha256 of its
//   trimmed source, mirroring jesssullivan.github.io's scripts/render-mermaid.mts.
//   The rendered SVG is written to `.mermaid-cache/<key>.svg` at the repo root
//   (gitignored — this is a build cache, not tracked output). A cache hit skips
//   the browser entirely: repeat builds (and repeat diagrams across pages) pay
//   the Chromium render cost once per unique diagram body, not once per build.
//   Cache reads/writes are best-effort; a cache write failure (e.g. read-only
//   filesystem) never fails the render — the caller still gets the freshly
//   rendered SVG, it just isn't persisted for next time.
//
// BOUNDED RETRY
//   A single `render(diagrams)` call can fail outright (not a per-diagram
//   rejection but a thrown error) on a transient browser/launch flake —
//   crashed Chromium, a closed target, a dropped devtools protocol connection.
//   Cache misses are retried up to 3 attempts, but ONLY when the failure looks
//   transient (see isRetryableRendererError below); a missing package or
//   missing browser binary fails the same way every time, so those bail out
//   immediately rather than wasting two more attempts. This retry wraps the
//   WHOLE batch call, never an individual diagram: mermaid-isomorphic settles
//   each diagram independently, so if the call itself succeeds and one
//   diagram's own promise is rejected (e.g. invalid Mermaid syntax) while
//   others in the same batch fulfill, that rejection is terminal — retrying it
//   would just fail the same way again, since the diagram's syntax hasn't
//   changed.
//
// FAILURE MODE
//   Rendering a diagram needs a Playwright Chromium binary on disk
//   (`pnpm exec playwright install chromium`; CI's runner image pre-bakes it).
//   If the package can't be imported, the browser can't launch, or a single
//   diagram's Mermaid syntax is invalid, this module NEVER throws past its own
//   boundary — every failure resolves to `null` for the affected diagram(s) so
//   the caller can fall back to the existing labelled-source figure. A bad or
//   unrenderable diagram must never fail the site build.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** One Mermaid render outcome: the inline SVG markup, or `null` on any failure. */
export type MermaidRenderOutcome = string | null;

/** The renderer function mermaid-isomorphic's createMermaidRenderer resolves to. */
type MermaidRenderer = (diagrams: string[]) => Promise<PromiseSettledResult<{ svg: string }>[]>;

// Deliberately NOT derived from import.meta.url: Vite/SvelteKit bundles this
// module into `.svelte-kit/output/server/**` at build time (and prerendering
// runs it from a forked worker — see @sveltejs/kit/src/utils/fork.js), so the
// module's own on-disk location and nesting depth at runtime don't match its
// depth in src/. process.cwd() is the same convention the sibling build
// scripts already rely on (scripts/verify-diagrams.mjs, sync-content.mjs use
// cwd-relative paths like 'build', 'src/content'): every caller — `pnpm run
// build`'s prerender, `pnpm exec vitest`, this file's own test — runs with
// the repo root as cwd.
const CACHE_DIR = resolve(process.cwd(), '.mermaid-cache');

// Up to 3 attempts per cache-miss batch call, matching the blog's render-mermaid.mts.
const RENDER_ATTEMPTS = 3;

// Lazily created, reused across every diagram rendered in this build (the
// renderer's own browser instance is created on first use and closed again
// once its in-flight call count returns to zero — see mermaid-isomorphic's
// `createMermaidRenderer`). Held at module scope so multiple pages in the same
// prerender each pay the Chromium launch cost only if they truly overlap.
let rendererPromise: Promise<MermaidRenderer> | null = null;

function getRenderer(): Promise<MermaidRenderer> {
	rendererPromise ??= import('mermaid-isomorphic').then(({ createMermaidRenderer }) =>
		createMermaidRenderer({
			launchOptions: { args: ['--no-sandbox'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
		}),
	);
	return rendererPromise;
}

/** sha256 of the trimmed diagram source, first 16 hex characters — the cache key. */
export function cacheKeyFor(source: string): string {
	return createHash('sha256').update(source.trim()).digest('hex').slice(0, 16);
}

function cachePathFor(cacheDir: string, key: string): string {
	return resolve(cacheDir, `${key}.svg`);
}

/** Best-effort cache read: a missing or unreadable entry is a cache miss, never a thrown error. */
function readCachedSvg(cacheDir: string, key: string): string | null {
	const path = cachePathFor(cacheDir, key);
	if (!existsSync(path)) return null;
	try {
		return readFileSync(path, 'utf-8');
	} catch {
		return null;
	}
}

/** Best-effort cache write: failure to persist never fails the render itself. */
function writeCachedSvg(cacheDir: string, key: string, svg: string): void {
	try {
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(cachePathFor(cacheDir, key), svg);
	} catch {
		// Cache is a pure optimization; losing an entry just costs a re-render next time.
	}
}

// Messages that mean "this will fail exactly the same way on attempt 2 and 3"
// — a missing package/binary, not a flaky launch — so retrying wastes time
// instead of recovering. Everything else (crashed target, dropped protocol
// connection, a transient launch timeout) is treated as retryable flake.
const NON_RETRYABLE_MESSAGE_FRAGMENTS = [
	"Cannot find package 'mermaid-isomorphic'",
	"Cannot find package 'playwright'",
	'Executable doesn',
	'Could not find browser',
	'Could not find Chrome',
	'Could not find Chromium',
];

function isRetryableRendererError(message: string): boolean {
	return !NON_RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Invoke the batch renderer with bounded retry. Retries only when the WHOLE
 * call throws (a browser/launch-level flake) and the error looks transient;
 * a per-diagram rejection inside a successfully-returned settled-results array
 * is never retried here (see the module header's BOUNDED RETRY section).
 */
async function renderBatchWithRetry(
	render: MermaidRenderer,
	diagrams: string[],
): Promise<PromiseSettledResult<{ svg: string }>[]> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= RENDER_ATTEMPTS; attempt++) {
		try {
			return await render(diagrams);
		} catch (err) {
			lastError = err;
			const message = err instanceof Error ? err.message : String(err);
			if (attempt < RENDER_ATTEMPTS && isRetryableRendererError(message)) {
				continue;
			}
			break;
		}
	}

	throw lastError;
}

/**
 * The cache + bounded-retry core, with the renderer loader and cache
 * directory injected. `renderMermaidDiagrams` below calls this with the real
 * lazy mermaid-isomorphic loader and the repo-root `.mermaid-cache/` dir; a
 * test can call it directly with a stub loader and a temp dir to exercise
 * cache keying/read/write and retry classification without a real browser.
 *
 * Never rejects: a failure that would prevent rendering ANY diagram (e.g. the
 * package or browser is unavailable) degrades every remaining entry to `null`
 * rather than throwing, so a doc with a mermaid fence never fails the site build.
 */
export async function renderWithCache(
	diagrams: string[],
	loadRenderer: () => Promise<MermaidRenderer>,
	cacheDir: string,
): Promise<MermaidRenderOutcome[]> {
	if (diagrams.length === 0) return [];

	const keys = diagrams.map(cacheKeyFor);
	const outcomes: MermaidRenderOutcome[] = keys.map((key) => readCachedSvg(cacheDir, key));

	const missIndexes: number[] = [];
	for (let i = 0; i < outcomes.length; i++) {
		if (outcomes[i] === null) missIndexes.push(i);
	}
	if (missIndexes.length === 0) return outcomes;

	try {
		const render = await loadRenderer();
		const results = await renderBatchWithRetry(
			render,
			missIndexes.map((i) => diagrams[i]),
		);
		results.forEach((result, j) => {
			const i = missIndexes[j];
			if (result.status === 'fulfilled') {
				outcomes[i] = result.value.svg;
				writeCachedSvg(cacheDir, keys[i], result.value.svg);
			} else {
				if (process.env.WOODSHED_DIAGRAM_DIAGNOSTICS === '1') console.error('Mermaid diagram failed:', result.reason);
				outcomes[i] = null;
			}
		});
	} catch (error) {
		if (process.env.WOODSHED_DIAGRAM_DIAGNOSTICS === '1') console.error('Mermaid browser render failed:', error);
		for (const i of missIndexes) outcomes[i] = null;
	}

	return outcomes;
}

/**
 * Render a batch of Mermaid diagram sources to inline SVG. The returned array
 * has exactly one entry per input, in the same order; an entry is `null` when
 * that diagram could not be rendered (bad syntax, no browser available, or any
 * other failure) so the caller renders its existing fallback figure instead.
 *
 * A diagram whose trimmed source already has a `.mermaid-cache/<key>.svg` hit
 * is returned straight from disk with no browser involved; only cache misses
 * reach mermaid-isomorphic, and that call is retried up to 3 times when it
 * fails in a way that looks like transient browser flake (see the module
 * header for the full cache + retry contract).
 *
 * Never rejects: a failure that would prevent rendering ANY diagram (e.g. the
 * package or browser is unavailable) degrades every entry to `null` rather
 * than throwing, so a doc with a mermaid fence never fails the site build.
 */
export async function renderMermaidDiagrams(diagrams: string[]): Promise<MermaidRenderOutcome[]> {
	if (diagrams.length === 0) return [];
	try {
		return await renderWithCache(diagrams, getRenderer, CACHE_DIR);
	} catch {
		return diagrams.map(() => null);
	}
}
