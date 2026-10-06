// The on-site content registry: the SSOT for what content exists, in what
// section, on which render lane, in what order, and under which title.
//
// PROVENANCE / SHAPE
//   The bodies this registry describes are authored in a SEPARATE repo: the DSA
//   study packet (DSA-Woodshed/dsa-study-packet), and pulled in by
//   scripts/sync-content.mjs, which writes src/content/** (gitignored build
//   input) plus a committed manifest, src/content/.manifest.json. This registry
//   reads that manifest for the per-entry facts derived from the source
//   (title and summary from frontmatter, sourcePath, lane, order), so those
//   never drift from the packet and are never hand-typed here.
//
//   Bodies are NOT imported here: the raw text is loaded lazily by detail routes
//   via $lib/docs/content.ts, so importing this registry (homepage, section
//   indexes, sitemap) never pulls sheet text into their bundles.
//
//   Navigation consumes the exported `sections()` / `allEntries()` shape.
//   Keep this file about content identity, not layout.
import { bookletMetadata } from '$lib/docs/booklet';
import { REPO_URL, blobUrl } from '$lib/repo';
import manifestJson from '$content/.manifest.json';

export type Lane = 'markdown' | 'svx';
export type SectionId = 'guide' | 'reference' | 'algorithms' | 'printables' | 'challenges';

export interface ContentEntry {
	/** Section this entry belongs to. */
	section: SectionId;
	/** URL slug, unique within its section (for `algorithms`, unique within `topic`). */
	slug: string;
	/** Display title, sourced from the packet doc (frontmatter title, else first H1). */
	title: string;
	/** Short on-site summary, sourced from packet frontmatter when available. */
	summary: string;
	/** Packet-relative path the "edit this page" affordance points at. */
	sourcePath: string;
	/** Render lane: `markdown` (raw lane) or `svx` (mdsvex component). */
	lane: Lane;
	/** Display order within the section (for `algorithms`, within its topic). */
	order: number;
	/** Path under src/content; the key $lib/docs/content.ts loads a raw body by. */
	out: string;
	/** Topic slug, only set for `section: 'algorithms'` entries. */
	topic?: string;
	/** Topic display title, only set for `section: 'algorithms'` entries. */
	topicTitle?: string;
}

interface ManifestEntry {
	section: string;
	slug: string;
	title: string;
	lane: string;
	order: number;
	out: string;
	sourcePath: string;
	inputs: string[];
	sha256: string;
	topic?: string;
	topicTitle?: string;
	/** Source-derived summary: prose frontmatter description or algorithm docstring title. */
	summary?: string;
}

interface Manifest {
	sourceRepo: string;
	sourceCommit: string;
	capabilities: {
		input: string;
		out: string;
		sha256: string;
	};
	entries: ManifestEntry[];
}

const manifest = manifestJson as Manifest;

/** The packet commit the current src/content was synced from (for provenance UIs). */
export const sourceCommit = manifest.sourceCommit;
/** Source and published-path metadata for the generated capability inventory. */
export const capabilitiesMetadata = manifest.capabilities;

export interface Section {
	id: SectionId;
	/** Section display title. */
	title: string;
	/** Section display order. */
	order: number;
	entries: ContentEntry[];
}

// Section display metadata used by the reading navigation.
const SECTION_META: Record<SectionId, { title: string; order: number }> = {
	challenges: { title: 'Practice Problems', order: 1 },
	algorithms: { title: 'Algorithms', order: 3 },
	reference: { title: 'Reference Sheets', order: 4 },
	guide: { title: 'Method', order: 5 },
	printables: { title: 'Printables', order: 6 },
};

export const SINGLE_PAGE_SECTIONS = ['challenges', 'printables'] as const;
export type SinglePageSection = (typeof SINGLE_PAGE_SECTIONS)[number];

const SINGLE_PAGE_SLUGS: Record<SinglePageSection, string> = {
	challenges: 'index',
	printables: 'printables',
};

export function getSinglePageEntry(section: string): ContentEntry | undefined {
	if (!SINGLE_PAGE_SECTIONS.includes(section as SinglePageSection)) return undefined;
	const typedSection = section as SinglePageSection;
	return getEntry(typedSection, SINGLE_PAGE_SLUGS[typedSection]);
}

const LANES = new Set<Lane>(['markdown', 'svx']);

function toEntry(m: ManifestEntry): ContentEntry {
	if (!(m.section in SECTION_META)) throw new Error(`content registry: unknown section "${m.section}" for ${m.out}`);
	if (!LANES.has(m.lane as Lane)) throw new Error(`content registry: unknown lane "${m.lane}" for ${m.out}`);
	return {
		section: m.section as SectionId,
		slug: m.slug,
		title: m.title,
		summary: resolveEntrySummary(m),
		sourcePath: m.sourcePath,
		lane: m.lane as Lane,
		order: m.order,
		out: m.out,
		topic: m.topic,
		topicTitle: m.topicTitle,
	};
}

/** Use packet-authored metadata; missing descriptions stay empty. */
export function resolveEntrySummary(m: Pick<ManifestEntry, 'section' | 'slug' | 'summary'>): string {
	return m.summary?.trim() ?? '';
}

/** Every content entry, in a stable (section order, then entry order, then slug) sort. */
export const contentEntries: ContentEntry[] = manifest.entries
	.map(toEntry)
	.sort(
		(a, b) =>
			SECTION_META[a.section].order - SECTION_META[b.section].order ||
			a.order - b.order ||
			a.slug.localeCompare(b.slug),
	);

export function allEntries(): ContentEntry[] {
	return contentEntries;
}

/** Entries in one section, in display order. */
export function entriesInSection(section: SectionId): ContentEntry[] {
	return contentEntries.filter((e) => e.section === section);
}

/** Sections in display order, each with its ordered entries. */
export function sections(): Section[] {
	return (Object.keys(SECTION_META) as SectionId[])
		.map((id) => ({ id, title: SECTION_META[id].title, order: SECTION_META[id].order, entries: entriesInSection(id) }))
		.filter((s) => s.entries.length > 0)
		.sort((a, b) => a.order - b.order);
}

export function getEntry(section: SectionId, slug: string): ContentEntry | undefined {
	return contentEntries.find((e) => e.section === section && e.slug === slug);
}

// Every registered section has a live page route. The three single-page
// sections use their section root; guide/reference use flat detail pages, and
// algorithms include a topic segment.
export const ROUTED_SECTIONS: ReadonlySet<SectionId> = new Set([
	'guide',
	'algorithms',
	'reference',
	'challenges',
	'printables',
]);

/**
 * The entry's URL: `/{section}` for a single-page section,
 * `/{section}/{slug}` for flat detail sections, and
 * `/algorithms/{topic}/{slug}` for algorithms.
 */
export function entryHref(entry: ContentEntry): string {
	if (
		SINGLE_PAGE_SECTIONS.includes(entry.section as SinglePageSection) &&
		SINGLE_PAGE_SLUGS[entry.section as SinglePageSection] === entry.slug
	) {
		return `/${entry.section}`;
	}
	return entry.topic ? `/${entry.section}/${entry.topic}/${entry.slug}` : `/${entry.section}/${entry.slug}`;
}

/**
 * Adjacent entries (in display order) for prev/next footer nav. Flat sections
 * walk the whole section; algorithms entries (slug unique only within a topic)
 * walk their topic's problems in the order the topic index lists them; pass
 * `topic` for that lane.
 */
export function neighbors(
	section: SectionId,
	slug: string,
	topic?: string,
): { prev?: ContentEntry; next?: ContentEntry } {
	const list = section === 'algorithms' ? (getAlgorithmTopic(topic ?? '')?.entries ?? []) : entriesInSection(section);
	const i = list.findIndex((e) => e.slug === slug);
	if (i === -1) return {};
	return { prev: list[i - 1], next: list[i + 1] };
}

// ── Reference-sheet helpers (kept stable for existing /reference routes) ────────
/** Reference sheets in display order. */
export function sheetsInOrder(): ContentEntry[] {
	return entriesInSection('reference');
}

export function getSheet(slug: string): ContentEntry | undefined {
	return getEntry('reference', slug);
}

export function sheetSlugs(): string[] {
	return sheetsInOrder().map((s) => s.slug);
}

// ── Guide-lane helpers ──────────────────────────────────────────────────────────
/** Raw-lane guide slugs (the `.svx` guide entry has its own dedicated route). */
export function guideMarkdownSlugs(): string[] {
	return entriesInSection('guide')
		.filter((e) => e.lane === 'markdown')
		.map((e) => e.slug);
}

// ── Algorithms-lane helpers ──────────────────────────────────────────────────────
// One entry per packet src/algo/<topic>/<problem>.py implementation
// (scripts/sync-algorithms.mjs), grouped by topic for the /algorithms index and
// per-topic index pages, and looked up by (topic, slug) for the problem page.

export interface AlgorithmTopic {
	/** Topic directory slug, e.g. `dp`. */
	topic: string;
	/** Topic display title, e.g. `Dynamic Programming`. */
	title: string;
	/** This topic's problems, in display order. */
	entries: ContentEntry[];
}

/** All algorithm topics, alphabetically, each with its problems in display order. */
export function algorithmTopics(): AlgorithmTopic[] {
	const bySlug = new Map<string, AlgorithmTopic>();
	for (const entry of entriesInSection('algorithms')) {
		const topic = entry.topic ?? '';
		let group = bySlug.get(topic);
		if (!group) {
			group = { topic, title: entry.topicTitle ?? topic, entries: [] };
			bySlug.set(topic, group);
		}
		group.entries.push(entry);
	}
	return [...bySlug.values()].sort((a, b) => a.topic.localeCompare(b.topic));
}

/** One algorithm topic (problems in display order), or undefined if unknown. */
export function getAlgorithmTopic(topic: string): AlgorithmTopic | undefined {
	return algorithmTopics().find((t) => t.topic === topic);
}

/** Every algorithm topic's slug, alphabetically, for the `/algorithms/[topic]` prerender entries. */
export function algorithmTopicSlugs(): string[] {
	return algorithmTopics().map((t) => t.topic);
}

/** Every (topic, slug) pair for the `/algorithms/[topic]/[slug]` prerender entries. */
export function algorithmParams(): { topic: string; slug: string }[] {
	return entriesInSection('algorithms').map((e) => ({ topic: e.topic ?? '', slug: e.slug }));
}

/** One algorithm problem entry, scoped to its topic (so a mismatched URL 404s). */
export function getAlgorithm(topic: string, slug: string): ContentEntry | undefined {
	return entriesInSection('algorithms').find((e) => e.topic === topic && e.slug === slug);
}

function normalizeJoin(dirSegments: string[], relative: string): string {
	const segments = relative.startsWith('/') ? [] : [...dirSegments];
	for (const part of relative.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') segments.pop();
		else segments.push(part);
	}
	return segments.join('/');
}

// Packet-relative path → registry entry, covering every synced entry's
// sourcePath AND its input aliases (e.g. docs/reference/01-python-stdlib.md and
// reference-sheets/01-python-stdlib.md both name the python-stdlib sheet), so
// the resolver below can keep cross-references between synced docs on-site.
// Restricted to ROUTED_SECTIONS so a future staged content lane cannot emit a
// route until its page surface exists.
const entryByPacketPath = (() => {
	const byOut = new Map(contentEntries.map((e) => [e.out, e]));
	const map = new Map<string, ContentEntry>();
	for (const m of manifest.entries) {
		const entry = byOut.get(m.out);
		if (!entry || !ROUTED_SECTIONS.has(entry.section)) continue;
		for (const path of new Set([m.sourcePath, ...m.inputs])) map.set(path, entry);
	}
	return map;
})();

// Special-case packet paths with no synced entry but a better target than a
// GitHub blob. The routed section indexes have generated mkdocs stubs, and
// docs/algorithms/index.md is gitignored, so its blob URL is a hard 404.
const SPECIAL_PACKET_ROUTES = new Map<string, string>([
	['docs/algorithms/index.md', '/algorithms'],
	['docs/reference/index.md', '/reference'],
]);

// Printable PDFs are generated release assets, not tracked packet files.
// The full booklet is copied and digest-verified during content sync so its
// reading route can use a same-origin native PDF object. Individual sheets stay
// on GitHub Releases. Accept both historical packet-relative directory shapes.
function printableAssetUrl(path: string): string | undefined {
	const match = /^docs\/assets\/(?:sheets\/)?([^/]+\.pdf)$/.exec(path);
	if (!match) return undefined;
	return match[1] === 'booklet.pdf'
		? bookletMetadata.asset.localUrl
		: `${REPO_URL}/releases/latest/download/${match[1]}`;
}

/**
 * Build a link resolver for one entry: resolves its relative markdown links
 * against the packet tree, then routes them on-site (entryHref, hash preserved)
 * when the target is a synced entry, else to the canonical GitHub blob URL in
 * the CONTENT repo at the locked revision (anchors and absolute URLs are
 * handled upstream in markdown.ts and never reach here). Repo identity comes
 * from $lib/repo.ts, so no org/repo string is hardcoded here.
 */
export function makeLinkResolver(sourcePath: string): (href: string) => string {
	const dirSegments = sourcePath.split('/').slice(0, -1);
	return (href: string) => {
		const hashIndex = href.indexOf('#');
		const pathPart = hashIndex === -1 ? href : href.slice(0, hashIndex);
		const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
		const resolved = normalizeJoin(dirSegments, pathPart);
		const entry = entryByPacketPath.get(resolved);
		if (entry) return `${entryHref(entry)}${hash}`;
		const printable = printableAssetUrl(resolved);
		if (printable) return `${printable}${hash}`;
		const special = SPECIAL_PACKET_ROUTES.get(resolved);
		if (special) return `${special}${hash}`;
		return `${blobUrl(resolved, sourceCommit)}${hash}`;
	};
}
