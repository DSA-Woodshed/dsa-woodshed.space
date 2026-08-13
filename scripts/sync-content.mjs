// Cross-repo content sync: copy the DSA study packet's docs into src/content/
// and its machine-readable agent map into static/agent-map.md.
//
// WHAT THIS IS
//   The DSA Woodshed is a *reading surface*. Its prose and reference sheets are
//   authored and version-controlled in a SEPARATE repo: the DSA study packet
//   (Jesssullivan/dsa-study-packet), which is the single source of truth. This
//   script pulls the needed files out of a packet checkout, resolves the mkdocs
//   snippet includes the packet uses, and writes plain markdown / mdsvex files
//   into src/content/ that the SvelteKit build renders.
//
//   Synced files are BUILD INPUTS, not source. They are gitignored (see
//   .gitignore) EXCEPT the manifest below, mirroring the packet's own
//   generated-artifacts discipline. A fresh checkout must run this once
//   (`pnpm run sync-content`, or `just build` which calls it) before building.
//   Those commands reproduce the exact revision in the committed manifest;
//   only `just packet-lock <sha>` advances that revision.
//
// GUARANTEES
//   - Deterministic: no timestamps, entries sorted, byte-stable output.
//   - Idempotent: running twice produces an identical tree and manifest.
//   - Commit-pinned: the committed manifest selects one exact packet revision.
//     Every byte read from the packet, planned inputs and snippet includes alike,
//     comes from `git show <commit>:`, never the working tree or a later HEAD
//     lookup, so a stripped practice file or concurrent ref move cannot change a
//     locked build.
//   - Recorded: src/content/.manifest.json pins the packet commit, the generated
//     agent map, and every content entry (source inputs, resolved output, lane,
//     source-authored title/summary, and content hash) so drift is auditable.
//
// PLAIN NODE. No dependencies or bundler. Runs under `node scripts/sync-content.mjs`.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncAlgorithms } from './sync-algorithms.mjs';
import { syncBookletRelease } from './sync-booklet.mjs';
import { readPacketLock, resolveReachablePacketCommit } from './packet-lock.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const HERE = dirname(THIS_FILE);
const REPO_ROOT = resolve(HERE, '..');
const CONTENT_DIR = join(REPO_ROOT, 'src', 'content');
const MANIFEST_PATH = join(CONTENT_DIR, '.manifest.json');
const AGENT_MAP_INPUT = 'agent-map.md';
const AGENT_MAP_PATH = join(REPO_ROOT, 'static', 'agent-map.md');

// Source object database: dev uses the sibling packet checkout; CI checks out the
// manifest's exact revision and passes its path through WOODSHED_PACKET_PATH.
const PACKET_PATH = resolve(REPO_ROOT, process.env.WOODSHED_PACKET_PATH ?? '../dsa-study-packet');

const MAX_SNIPPET_DEPTH = 10;
const MAX_PROSE_SUMMARY_LENGTH = 180;

// ── Content plan (the SSOT of WHAT to sync) ────────────────────────────────────
// Each entry: which packet file to read (`input`), where it lands under
// src/content (`out`), which render lane the site uses, the packet-relative path
// the "edit this page" affordance points at (`sourcePath`, the file a human
// actually edits), and its section + display order.
//
//   lane: 'markdown' → rendered by $lib/docs/markdown.ts (raw lane). Safe for the
//                      code-heavy sheets and for prose with braces / angle-tags /
//                      mermaid that mdsvex would misparse.
//   lane: 'svx'      → compiled AS a Svelte component by mdsvex. Only hazard-free
//                      prose (no braces, angle-tags, or mermaid) goes here;
//                      assertSvxSafe below rejects script vectors at sync time.
//
// Reference entries read the mkdocs STUB under docs/reference/, whose body is a
// `--8<--` snippet include of the real sheet under reference-sheets/. The sync
// resolves that include, so `sourcePath` points at the sheet (the real prose),
// not the one-line stub.
const REFERENCE_SHEETS = [
	['01-python-stdlib', 'python-stdlib'],
	['02-data-structures', 'data-structures'],
	['03-algorithm-templates', 'algorithm-templates'],
	['04-big-o-complexity', 'big-o-complexity'],
	['05-common-patterns', 'common-patterns'],
	['06-system-design', 'system-design'],
	['07-interview-day-guide', 'interview-day-guide'],
	['08-cross-reference-guide', 'cross-reference-guide'],
	['09-python-314-and-modern-patterns', 'python-314-and-modern-patterns'],
	['10-whiteboard-performance-protocol', 'whiteboard-performance-protocol'],
	['11-14-day-whiteboard-ramp', '14-day-whiteboard-ramp'],
];

const PLAN = [
	...REFERENCE_SHEETS.map(([stem, slug], i) => ({
		section: 'reference',
		slug,
		lane: 'markdown',
		order: i + 1,
		input: `docs/reference/${stem}.md`,
		sourcePath: `reference-sheets/${stem}.md`,
		out: `reference/${slug}.md`,
	})),

	// Guide: hazard-free prose on the mdsvex lane, everything else raw.
	{
		section: 'guide',
		slug: 'interview-practice-evidence',
		lane: 'svx',
		order: 1,
		input: 'docs/guide/interview-practice-evidence.md',
		sourcePath: 'docs/guide/interview-practice-evidence.md',
		out: 'guide/interview-practice-evidence.svx',
	},
	{
		section: 'guide',
		slug: 'getting-started',
		lane: 'markdown',
		order: 2,
		input: 'docs/guide/getting-started.md',
		sourcePath: 'docs/guide/getting-started.md',
		out: 'guide/getting-started.md',
	},
	{
		section: 'guide',
		slug: 'when-to-use-what',
		lane: 'markdown',
		order: 3,
		input: 'docs/guide/when-to-use-what.md',
		sourcePath: 'docs/guide/when-to-use-what.md',
		out: 'guide/when-to-use-what.md',
	},
	{
		section: 'guide',
		slug: 'learning-paths',
		lane: 'markdown',
		order: 4,
		input: 'docs/guide/learning-paths.md',
		sourcePath: 'docs/guide/learning-paths.md',
		out: 'guide/learning-paths.md',
	},
	{
		section: 'guide',
		slug: 'source-of-truth',
		lane: 'markdown',
		order: 5,
		input: 'docs/guide/source-of-truth.md',
		sourcePath: 'docs/guide/source-of-truth.md',
		out: 'guide/source-of-truth.md',
	},
	{
		section: 'guide',
		slug: 'local-practice',
		lane: 'markdown',
		order: 6,
		input: 'docs/guide/local-practice.md',
		sourcePath: 'docs/guide/local-practice.md',
		out: 'guide/local-practice.md',
	},

	// Single-page prose sections (prose, not macro-dependent; migrated raw).
	{
		section: 'printables',
		slug: 'printables',
		lane: 'markdown',
		order: 1,
		input: 'docs/printables.md',
		sourcePath: 'docs/printables.md',
		out: 'printables/printables.md',
	},
	{
		section: 'challenges',
		slug: 'index',
		lane: 'markdown',
		order: 1,
		input: 'docs/challenges/index.md',
		sourcePath: 'docs/challenges/index.md',
		out: 'challenges/index.md',
	},
];

// ── Git-only packet reads (never the working tree) ─────────────────────────────
// A packet checkout can carry working-tree-local state that must never ship: a
// file stripped to a practice scaffold, or WIP prose that has not yet passed the
// packet's commit-time public-boundary lint. Resolve HEAD once, before any read,
// then use that immutable commit for every byte published:
// read via `git show <commit>:`, exactly like the algorithms lane
// (scripts/sync-algorithms.mjs).
export function resolvePacketCommit(packetPath = PACKET_PATH) {
	const commit = execFileSync('git', ['-C', packetPath, 'rev-parse', '--verify', 'HEAD^{commit}'], {
		encoding: 'utf8',
	}).trim();
	if (!/^[0-9a-f]{40}$/.test(commit)) {
		throw new Error(`sync-content: packet HEAD did not resolve to a full commit SHA: ${JSON.stringify(commit)}`);
	}
	return commit;
}

export function resolveLockedPacketCommit(packetPath = PACKET_PATH, requestedCommit) {
	return resolveReachablePacketCommit(packetPath, requestedCommit);
}

export function packetFileExistsAtCommit(packetPath, sourceCommit, rel) {
	try {
		execFileSync('git', ['-C', packetPath, 'cat-file', '-e', `${sourceCommit}:${rel}`], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

export function readPacketFileAtCommit(packetPath, sourceCommit, rel) {
	return execFileSync('git', ['-C', packetPath, 'show', `${sourceCommit}:${rel}`], { encoding: 'utf8' });
}

function readAtCommit(sourceCommit, rel) {
	return readPacketFileAtCommit(PACKET_PATH, sourceCommit, rel);
}

// ── Snippet resolution ─────────────────────────────────────────────────────────
// The packet's docs/reference/*.md stubs pull in the real sheet with pymdownx
// snippets. mkdocs.yml sets `base_path: ["."]`, so a snippet path is resolved
// against the packet ROOT. We support exactly the quoted single-file form,
// recurse into nested includes, cap the depth, and detect cycles. Any OTHER
// `--8<--` shape (block form, unquoted path, trailing content) would ship as
// literal marker text on a public page, so it fails the sync instead.
const SNIPPET_RE = /^(\s*)--8<--\s+"([^"]+)"\s*$/;

/**
 * @param {string} content raw file text
 * @param {string[]} inputs accumulator of packet-relative files that fed this entry
 * @param {number} depth current recursion depth
 * @param {string[]} stack include chain, for cycle detection (packet-relative)
 * @param {string} packetPath packet checkout used only as a Git object database
 * @param {string} sourceCommit immutable packet commit resolved once at startup
 * @returns {string}
 */
export function resolveSnippetsAtCommit(content, inputs, depth, stack, packetPath, sourceCommit) {
	const file = stack[stack.length - 1];
	return content
		.split('\n')
		.map((line, i) => {
			if (!line.includes('--8<--')) return line;
			const m = line.match(SNIPPET_RE);
			if (!m) {
				throw new Error(
					`unrecognized snippet directive at ${file}:${i + 1}: ${JSON.stringify(line.trim())}. ` +
						'only the quoted single-file form (--8<-- "path") is supported',
				);
			}
			const [, indent, raw] = m;
			if (depth >= MAX_SNIPPET_DEPTH) {
				throw new Error(
					`snippet include depth cap (${MAX_SNIPPET_DEPTH}) exceeded at "${raw}" (chain: ${stack.join(' -> ')})`,
				);
			}
			// Containment: the directive is packet-authored (untrusted); a path that
			// escapes the packet root after normalization (`../`, absolute) must never
			// be read on the build host, let alone published.
			const rel = relative(resolve(packetPath), resolve(packetPath, raw));
			if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
				throw new Error(`snippet include escapes the packet root at ${file}:${i + 1}: "${raw}"`);
			}
			if (stack.includes(rel)) {
				throw new Error(`snippet include cycle: ${[...stack, rel].join(' -> ')}`);
			}
			if (!packetFileExistsAtCommit(packetPath, sourceCommit, rel)) {
				throw new Error(`snippet include not found at packet commit ${sourceCommit}: "${raw}" (at ${file}:${i + 1})`);
			}
			if (!inputs.includes(rel)) inputs.push(rel);
			const included = readPacketFileAtCommit(packetPath, sourceCommit, rel).replace(/\n$/, '');
			const resolved = resolveSnippetsAtCommit(included, inputs, depth + 1, [...stack, rel], packetPath, sourceCommit);
			// Preserve the include line's indentation on every included line so an
			// indented `--8<--` (e.g. inside a code block) stays inside it.
			return indent
				? resolved
						.split('\n')
						.map((l) => (l ? indent + l : l))
						.join('\n')
				: resolved;
		})
		.join('\n');
}

// ── svx-lane safety tripwire ───────────────────────────────────────────────────
// The svx lane compiles packet-authored markdown AS a Svelte component (mdsvex),
// so raw HTML rides straight into the client bundle. The escaping raw lane
// never sees it. Packet content is untrusted input (public repo, PRs); reject
// the script vectors outright rather than trying to sanitize. Anything that
// trips this belongs on the markdown lane.
const SVX_HAZARDS = [
	[/<script/i, '<script tag'],
	[/\bon[a-z]+\s*=/i, 'on<event>= handler attribute'],
	[/javascript:/i, 'javascript: URL'],
	// Svelte evaluates {expression} at compile time. Braces are code here, and
	// the lane contract above already excludes brace-bearing prose.
	[/[{}]/, 'Svelte interpolation brace'],
];

function assertSvxSafe(text, input) {
	for (const [re, what] of SVX_HAZARDS) {
		const m = text.match(re);
		if (m) {
			throw new Error(
				`svx-lane input ${input} contains a ${what} (${JSON.stringify(m[0])}). ` +
					'svx compiles to a Svelte component; move the entry to the markdown lane or remove the hazard',
			);
		}
	}
}

// ── svx-lane link rewriting ────────────────────────────────────────────────────
// The markdown lane resolves packet-relative .md links at render time
// ($lib/docs/registry.ts makeLinkResolver); the svx lane has no render-time hook
// (mdsvex compiles the file as-is), so rewrite at sync time instead. A relative
// .md link that resolves to another synced entry becomes that entry's on-site
// route; anything else becomes the canonical GitHub blob URL, the same shape
// the render-time resolver produces. Idempotent: rewritten hrefs are absolute
// (`/…` or `https://…`) and no longer match the relative-.md pattern.
const MD_LINK_RE = /\]\(([^)\s]+\.md(?:#[^)]*)?)\)/g;

/** Posix-normalize `relPath` against packet dir `dir` (mirrors registry.ts normalizeJoin). */
function packetJoin(dir, relPath) {
	const segments = dir === '.' ? [] : dir.split('/');
	for (const part of relPath.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') segments.pop();
		else segments.push(part);
	}
	return segments.join('/');
}

/** Packet-relative source path → on-site route, for every planned prose entry.
 * Both the mkdocs stub (`input`) and the real sheet (`sourcePath`) address the
 * same page, so either form of cross-reference lands on the synced route. */
function planRoutes() {
	// Keep these shapes in sync with entryHref in src/lib/docs/registry.ts.
	const ROUTED_SECTIONS = new Set(['guide', 'algorithms', 'reference', 'challenges', 'printables']);
	const SINGLE_PAGE_SLUGS = new Map([
		['challenges', 'index'],
		['printables', 'printables'],
	]);
	const routes = new Map();
	for (const item of PLAN) {
		if (!ROUTED_SECTIONS.has(item.section)) continue;
		const route =
			SINGLE_PAGE_SLUGS.get(item.section) === item.slug ? `/${item.section}` : `/${item.section}/${item.slug}`;
		routes.set(item.input, route);
		routes.set(item.sourcePath, route);
	}
	return routes;
}

function rewriteSvxLinks(text, entryInput, sourceRepo, sourceCommit) {
	const routes = planRoutes();
	const dir = dirname(entryInput);
	return text.replace(MD_LINK_RE, (whole, target) => {
		// Absolute URLs (scheme:) and site-rooted paths are already resolved.
		if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return whole;
		const hashIndex = target.indexOf('#');
		const path = hashIndex === -1 ? target : target.slice(0, hashIndex);
		const hash = hashIndex === -1 ? '' : target.slice(hashIndex);
		const resolved = packetJoin(dir, path);
		const route = routes.get(resolved);
		return route ? `](${route}${hash})` : `](https://github.com/${sourceRepo}/blob/${sourceCommit}/${resolved}${hash})`;
	});
}

// ── Metadata extraction ────────────────────────────────────────────────────────
export function stripFrontmatter(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
	return { frontmatter: m ? m[1] : '', body: m ? text.slice(m[0].length) : text };
}

/** Read one frontmatter scalar. Concise one-line and folded YAML values are supported. */
function frontmatterScalar(frontmatter, key) {
	const lines = frontmatter.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const match = lines[i].match(new RegExp(`^${key}:\\s*(.*?)\\s*$`));
		if (!match) continue;

		const raw = match[1];
		if (/^[>|][-+]?$/.test(raw)) {
			const parts = [];
			for (let j = i + 1; j < lines.length; j += 1) {
				const line = lines[j];
				if (line.trim() === '') {
					if (parts.length > 0) parts.push('');
					continue;
				}
				if (!/^\s+/.test(line)) break;
				parts.push(line.trim());
			}
			return parts.join(' ').replace(/\s+/g, ' ').trim();
		}

		const first = raw[0];
		const last = raw[raw.length - 1];
		return first && first === last && (first === '"' || first === "'") ? raw.slice(1, -1).trim() : raw.trim();
	}
	return undefined;
}

/** Title = frontmatter `title:` if declared, else the first H1, else the slug. */
export function extractTitle(text, fallback) {
	const { frontmatter, body } = stripFrontmatter(text);
	const title = frontmatterScalar(frontmatter, 'title');
	if (title) return title;
	const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m);
	if (h1) return h1[1].trim();
	return fallback;
}

/**
 * Summary = packet frontmatter `description:` when present. Missing values are
 * intentionally allowed so older packet commits keep using the registry's
 * compatibility fallback.
 */
export function extractDescription(text, input = 'content') {
	const { frontmatter } = stripFrontmatter(text);
	const description = frontmatterScalar(frontmatter, 'description');
	if (!description) return undefined;
	if (description.length > MAX_PROSE_SUMMARY_LENGTH) {
		throw new Error(
			`${input} frontmatter description is ${description.length} characters; ` +
				`keep prose summaries at or below ${MAX_PROSE_SUMMARY_LENGTH}`,
		);
	}
	if (description.includes('`')) {
		throw new Error(`${input} frontmatter description contains a markdown backtick; summaries render as plain text`);
	}
	return description;
}

function sha256(text) {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── Filesystem helpers ─────────────────────────────────────────────────────────
/** Remove every generated file under src/content, keeping the dir itself. */
function cleanContentDir() {
	if (!existsSync(CONTENT_DIR)) return;
	for (const name of readdirSync(CONTENT_DIR)) {
		if (name === '.manifest.json') continue;
		rmSync(join(CONTENT_DIR, name), { recursive: true, force: true });
	}
}

function writeFileDeep(absPath, text) {
	mkdirSync(dirname(absPath), { recursive: true });
	writeFileSync(absPath, text);
}

/**
 * Publish the two tracked sync outputs as one rollback unit after content
 * generation succeeds. The replacements are sequential, not crash-atomic; the
 * build-time digest verifier rejects an interrupted pair. If either replacement
 * throws, restore both prior files and retain both errors if rollback also fails.
 *
 * @param {{
 *   agentMapPath: string,
 *   manifestPath: string,
 *   agentMap: string,
 *   manifestText: string,
 *   replaceFile?: typeof import('node:fs').renameSync,
 * }} args
 */
export function publishTrackedOutputs({
	agentMapPath,
	manifestPath,
	agentMap,
	manifestText,
	replaceFile = renameSync,
}) {
	const priorMap = existsSync(agentMapPath) ? readFileSync(agentMapPath, 'utf8') : undefined;
	const priorManifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : undefined;
	const nonce = `${process.pid}-${Date.now()}`;
	const mapTemp = `${agentMapPath}.tmp-${nonce}`;
	const manifestTemp = `${manifestPath}.tmp-${nonce}`;

	try {
		writeFileDeep(mapTemp, agentMap);
		writeFileDeep(manifestTemp, manifestText);
		replaceFile(mapTemp, agentMapPath);
		replaceFile(manifestTemp, manifestPath);
	} catch (error) {
		const rollbackErrors = [];
		try {
			if (priorMap === undefined) rmSync(agentMapPath, { force: true });
			else writeFileDeep(agentMapPath, priorMap);
		} catch (rollbackError) {
			rollbackErrors.push(rollbackError);
		}
		try {
			if (priorManifest === undefined) rmSync(manifestPath, { force: true });
			else writeFileDeep(manifestPath, priorManifest);
		} catch (rollbackError) {
			rollbackErrors.push(rollbackError);
		}
		if (rollbackErrors.length) {
			throw new AggregateError([error, ...rollbackErrors], 'tracked output publication and rollback both failed');
		}
		throw error;
	} finally {
		rmSync(mapTemp, { force: true });
		rmSync(manifestTemp, { force: true });
	}
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
	if (!existsSync(PACKET_PATH) || !statSync(PACKET_PATH).isDirectory()) {
		console.error(`sync-content: packet checkout not found at ${PACKET_PATH}`);
		console.error('  Set WOODSHED_PACKET_PATH, or place the packet at ../dsa-study-packet.');
		process.exit(1);
	}

	const lock = readPacketLock(MANIFEST_PATH);
	const sourceRepo = lock.sourceRepo;
	const sourceCommit = resolveLockedPacketCommit(PACKET_PATH, lock.sourceCommit);
	cleanContentDir();

	if (!packetFileExistsAtCommit(PACKET_PATH, sourceCommit, AGENT_MAP_INPUT)) {
		throw new Error(`sync-content: agent map missing at packet commit ${sourceCommit}: ${AGENT_MAP_INPUT}`);
	}
	const agentMap = readAtCommit(sourceCommit, AGENT_MAP_INPUT).replace(/\n*$/, '\n');
	if (!agentMap.trim()) {
		throw new Error(`sync-content: agent map is empty at packet commit ${sourceCommit}: ${AGENT_MAP_INPUT}`);
	}

	const entries = [];
	for (const item of PLAN) {
		if (!packetFileExistsAtCommit(PACKET_PATH, sourceCommit, item.input)) {
			throw new Error(`sync-content: planned input missing at packet commit ${sourceCommit}: ${item.input}`);
		}
		const inputs = [item.input];
		const raw = readAtCommit(sourceCommit, item.input);
		// Resolve snippet includes, then normalize to exactly one trailing newline.
		let resolved = resolveSnippetsAtCommit(raw, inputs, 0, [item.input], PACKET_PATH, sourceCommit).replace(
			/\n*$/,
			'\n',
		);
		if (item.lane === 'svx') {
			assertSvxSafe(resolved, item.input);
			resolved = rewriteSvxLinks(resolved, item.input, sourceRepo, sourceCommit);
		}

		writeFileDeep(join(CONTENT_DIR, item.out), resolved);
		const summary = extractDescription(resolved, item.input);

		entries.push({
			section: item.section,
			slug: item.slug,
			title: extractTitle(resolved, item.slug),
			...(summary ? { summary } : {}),
			lane: item.lane,
			order: item.order,
			out: item.out,
			sourcePath: item.sourcePath,
			inputs: inputs.slice().sort(),
			sha256: sha256(resolved),
		});
	}

	// Algorithms lane: one markdown doc per packet src/algo/<topic>/<problem>.py
	// implementation. A dedicated module (scripts/sync-algorithms.mjs) owns the
	// docstring parsing and per-problem doc rendering; like the prose lane above,
	// every file it reads comes from the same immutable sourceCommit, never the
	// working tree or a second HEAD lookup.
	entries.push(
		...syncAlgorithms({
			packetPath: PACKET_PATH,
			sourceCommit,
			contentDir: CONTENT_DIR,
			mkdirSync,
			writeFileSync,
			sha256,
		}),
	);

	// Deterministic ordering: section, then display order, then slug.
	entries.sort((a, b) => a.section.localeCompare(b.section) || a.order - b.order || a.slug.localeCompare(b.slug));

	const manifest = {
		note: 'Generated by scripts/sync-content.mjs. Do not edit by hand; advance with `just packet-lock <sha>`.',
		sourceRepo,
		sourceCommit,
		booklet: lock.booklet,
		agentMap: {
			input: AGENT_MAP_INPUT,
			out: 'static/agent-map.md',
			sha256: sha256(agentMap),
		},
		entries,
	};
	const manifestText = JSON.stringify(manifest, null, '\t') + '\n';

	publishTrackedOutputs({
		agentMapPath: AGENT_MAP_PATH,
		manifestPath: MANIFEST_PATH,
		agentMap,
		manifestText,
	});

	const rel = (p) => relative(REPO_ROOT, p);
	console.log(
		`sync-content: wrote ${entries.length} entries to ${rel(CONTENT_DIR)}/ from ${sourceRepo}@${manifest.sourceCommit.slice(0, 12)}`,
	);
	const booklet = await syncBookletRelease({ lockedMetadata: lock.booklet });
	console.log(`sync-content: wrote verified ${booklet.asset.name} from ${booklet.sourceRepo}@${booklet.tagName}`);
}

if (resolve(process.argv[1] ?? '') === THIS_FILE) {
	await main();
}
