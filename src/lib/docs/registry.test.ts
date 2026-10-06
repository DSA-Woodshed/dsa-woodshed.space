import { describe, expect, it } from 'vitest';
import manifest from '$content/.manifest.json';
import { bookletMetadata } from '$lib/docs/booklet';
import { REPO_URL } from '$lib/repo';
import {
	algorithmTopics,
	allEntries,
	entryHref,
	getAlgorithmTopic,
	getEntry,
	getSheet,
	makeLinkResolver,
	neighbors,
	resolveEntrySummary,
	ROUTED_SECTIONS,
	sheetsInOrder,
	sourceCommit,
} from './registry';

// Contract for the registry's routing surface, pinned against the committed
// src/content/.manifest.json. entryHref/neighbors must match the live route
// shapes (flat /{section}/{slug} lanes vs the topic-scoped algorithms lane),
// and makeLinkResolver must keep packet cross-references on-site whenever the
// target is a synced, routed entry. Those invariants are what SiteNav,
// PrevNext, the sitemap, and every rendered markdown link stand on.

describe('entryHref', () => {
	it('builds /{section}/{slug} for flat sections', () => {
		const sheet = getSheet('python-stdlib');
		expect(sheet).toBeDefined();
		expect(entryHref(sheet!)).toBe('/reference/python-stdlib');
	});

	it('inserts the topic segment for algorithms entries', () => {
		const topic = getAlgorithmTopic('arrays');
		expect(topic).toBeDefined();
		const first = topic!.entries[0];
		expect(entryHref(first)).toBe(`/algorithms/arrays/${first.slug}`);
	});

	it('uses the section root for each single-page content section', () => {
		expect(entryHref(getEntry('challenges', 'index')!)).toBe('/challenges');
		expect(entryHref(getEntry('printables', 'printables')!)).toBe('/printables');
	});
});

describe('neighbors', () => {
	it('walks a flat section in display order', () => {
		const sheets = sheetsInOrder();
		const { prev, next } = neighbors('reference', sheets[1].slug);
		expect(prev?.slug).toBe(sheets[0].slug);
		expect(next?.slug).toBe(sheets[2].slug);
	});

	it('stays within one algorithms topic, in topic-index order', () => {
		const topic = algorithmTopics().find((t) => t.entries.length >= 2)!;
		const last = topic.entries[topic.entries.length - 1];
		const { prev, next } = neighbors('algorithms', last.slug, topic.topic);
		expect(prev).toBe(topic.entries[topic.entries.length - 2]);
		expect(next).toBeUndefined();
		expect(neighbors('algorithms', topic.entries[0].slug, topic.topic).prev).toBeUndefined();
	});

	it('returns nothing for an unknown slug or missing algorithms topic', () => {
		expect(neighbors('reference', 'no-such-sheet')).toEqual({});
		expect(neighbors('algorithms', 'two_sum')).toEqual({});
	});
});

describe('makeLinkResolver', () => {
	const resolve = makeLinkResolver('docs/guide/source-of-truth.md');

	it('routes a synced target on-site (input alias, not just sourcePath)', () => {
		// docs/reference/… is an input ALIAS of the sheet whose sourcePath is
		// reference-sheets/…; both must land on the same on-site page.
		expect(resolve('../reference/11-14-day-whiteboard-ramp.md')).toBe('/reference/14-day-whiteboard-ramp');
	});

	it('preserves the #hash on on-site targets', () => {
		expect(resolve('../reference/11-14-day-whiteboard-ramp.md#day-1')).toBe('/reference/14-day-whiteboard-ramp#day-1');
	});

	it('keeps unsynced source links and their anchors at the rendered packet revision', () => {
		expect(resolve('../../scripts/practice_day.py#main')).toBe(
			`${REPO_URL}/blob/${sourceCommit}/scripts/practice_day.py#main`,
		);
	});

	it('routes every registered content section on-site', () => {
		const unrouted = allEntries().filter((e) => !ROUTED_SECTIONS.has(e.section));
		expect(unrouted).toEqual([]);
		expect(makeLinkResolver('README.md')('docs/challenges/index.md')).toBe('/challenges');
		expect(makeLinkResolver('README.md')('docs/printables.md')).toBe('/printables');
	});
});

describe('display copy', () => {
	it('uses the actual locked packet descriptions for every current reading entry', () => {
		for (const entry of allEntries()) {
			const source = manifest.entries.find((record) => record.out === entry.out)!;
			expect(source.summary?.trim(), entry.out).toBeTruthy();
			expect(entry.summary, entry.out).toBe(source.summary.trim());
		}
	});

	it('leaves missing or blank descriptions empty instead of inventing fallback prose', () => {
		expect(resolveEntrySummary({ section: 'guide', slug: 'getting-started' })).toBe('');
		expect(resolveEntrySummary({ section: 'guide', slug: 'getting-started', summary: '  ' })).toBe('');
	});

	it('keeps reading summaries and titles free of literal markdown backticks', () => {
		// Summaries render as plain text (card grids, meta descriptions), so a
		// backtick would show up literally.
		for (const entry of allEntries().filter((e) => e.section !== 'algorithms')) {
			expect(entry.summary, `${entry.section}/${entry.slug} summary`).not.toContain('`');
			expect(entry.title, `${entry.section}/${entry.slug} title`).not.toContain('`');
		}
	});
});

describe('makeLinkResolver special-case packet paths', () => {
	it('routes generated section indexes on-site', () => {
		const resolve = makeLinkResolver('docs/guide/getting-started.md');
		expect(resolve('../algorithms/index.md')).toBe('/algorithms');
		expect(resolve('../reference/index.md')).toBe('/reference');
	});

	it('routes the verified booklet same-origin and keeps sheets on Releases', () => {
		const resolve = makeLinkResolver('docs/printables.md');
		const filenames = [
			'01-python-stdlib.pdf',
			'02-data-structures.pdf',
			'03-algorithm-templates.pdf',
			'04-big-o-complexity.pdf',
			'05-common-patterns.pdf',
			'06-system-design.pdf',
			'07-interview-day-guide.pdf',
			'08-cross-reference-guide.pdf',
			'09-python-314-and-modern-patterns.pdf',
			'10-whiteboard-performance-protocol.pdf',
			'11-14-day-whiteboard-ramp.pdf',
		];

		expect(resolve('assets/booklet.pdf')).toBe(bookletMetadata.asset.localUrl);
		for (const filename of filenames) {
			const packetPath = `assets/sheets/${filename}`;
			expect(resolve(packetPath)).toBe(`${REPO_URL}/releases/latest/download/${filename}`);
		}
	});
});
