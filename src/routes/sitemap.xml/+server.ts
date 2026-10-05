// Prerendered by adapter-static so the
// XML lives at build/sitemap.xml. Add additional routes here as new lanes land.
import {
	algorithmParams,
	algorithmTopicSlugs,
	guideMarkdownSlugs,
	sheetSlugs,
	SINGLE_PAGE_SECTIONS,
} from '$lib/docs/registry';
import { PROJECT_ROUTE } from '$lib/navigation';
import type { RequestHandler } from './$types';

const SITE = 'https://dsa-woodshed.space';
// Enumerate exactly the routed pages. Reference + guide + algorithms are driven
// by the content registry so new synced entries appear here without a hand edit.
const PAGES: string[] = [
	...new Set([
		'/',
		'/start',
		'/library',
		...SINGLE_PAGE_SECTIONS.map((section) => `/${section}`),
		'/reference',
		...sheetSlugs().map((s) => `/reference/${s}`),
		'/guide/interview-practice-evidence',
		PROJECT_ROUTE,
		...guideMarkdownSlugs().map((s) => `/guide/${s}`),
		'/algorithms',
		...algorithmTopicSlugs().map((t) => `/algorithms/${t}`),
		...algorithmParams().map((p) => `/algorithms/${p.topic}/${p.slug}`),
	]),
];

export const prerender = true;

export const GET: RequestHandler = () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>
`;
	return new Response(xml, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
		},
	});
};
