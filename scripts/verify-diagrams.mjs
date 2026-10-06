// Build-artifact check for build-time mermaid rendering (see package.json
// `postbuild`).
//
// mermaid-isomorphic renders through a Playwright browser at build time and
// falls back to a labelled-source figure when the browser is missing or the
// render fails. That fallback is the right behavior for one bad diagram, but
// it also means a missing browser binary in CI degrades EVERY diagram
// silently while the build stays green — exactly what happened when the
// deploy workflow lacked the `playwright install chromium` step. This gate
// makes that failure loud:
//   1. Find every ```mermaid fence in the synced content that reaches a
//      rendered lane (src/content/guide + src/content/reference markdown).
//   2. If none exist, pass — nothing to render.
//   3. If any exist, the corresponding built HTML must contain at least one
//      rendered `figure class="diagram"` and zero `diagram-fallback`
//      figures. A single bad diagram among good renders still fails here,
//      which is intentional: fallback in a shipped build is a regression to
//      fix or consciously re-accept, never a silent default.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BUILD_DIR = process.env.BUILD_OUTPUT_DIR || 'build';
const CONTENT_LANES = ['src/content/guide', 'src/content/reference'];
const FENCE = /^```mermaid\b/m;

function markdownFilesWithMermaid() {
	const hits = [];
	for (const lane of CONTENT_LANES) {
		if (!existsSync(lane)) continue;
		for (const name of readdirSync(lane)) {
			if (!name.endsWith('.md')) continue;
			const path = join(lane, name);
			if (FENCE.test(readFileSync(path, 'utf8'))) hits.push(path);
		}
	}
	return hits;
}

function builtHtmlFor(mdPath) {
	// guide/foo.md prerenders to build/guide/foo.html (flat file) or
	// build/guide/foo/index.html depending on adapter trailingSlash config;
	// accept either so this gate tracks the adapter, not one layout.
	const rel = mdPath.replace(/^src\/content\//, '').replace(/\.md$/, '');
	const candidates = [join(BUILD_DIR, `${rel}.html`), join(BUILD_DIR, rel, 'index.html')];
	return candidates.find(existsSync);
}

const sources = markdownFilesWithMermaid();
if (sources.length === 0) {
	console.log('verify-diagrams: OK: no mermaid fences in rendered content lanes.');
	process.exit(0);
}

const failures = [];
for (const md of sources) {
	const html = builtHtmlFor(md);
	if (!html) {
		failures.push(`${md}: no built HTML found for this page`);
		continue;
	}
	const text = readFileSync(html, 'utf8');
	const rendered = (text.match(/<figure class="diagram"/g) ?? []).length;
	const fallbacks = (text.match(/diagram-fallback/g) ?? []).length;
	if (rendered < 1 || fallbacks > 0) {
		failures.push(
			`${html}: rendered=${rendered} fallback=${fallbacks} (expected >=1 rendered, 0 fallback — is the Playwright chromium binary installed before the build?)`,
		);
	}
}

if (failures.length > 0) {
	console.error(`verify-diagrams: FAIL:\n  ${failures.join('\n  ')}`);
	process.exit(1);
}
console.log(
	`verify-diagrams: OK: ${sources.length} page(s) with mermaid fences all render to inline SVG, no fallbacks.`,
);
