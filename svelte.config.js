import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { slugify } from './src/lib/docs/slugify.js';

// Build-time heading ids for the .svx lane. The raw markdown lane stamps ids in
// its renderer; mdsvex ships no equivalent, so without this the prerendered svx
// HTML has bare headings and every TOC fragment link is dead until hydration.
// Hand-rolled hast walker (zero new packages) using the SAME slugify as
// extractHeadings, so TOC hrefs are guaranteed to resolve — statically, no JS.
function rehypeHeadingIds() {
	const HEADING = /^h[1-6]$/;
	/** @param {{ type: string, value?: string, tagName?: string, properties?: Record<string, unknown>, children?: unknown[] }} node */
	const textOf = (node) => (node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join(''));
	return (/** @type {Parameters<typeof textOf>[0]} */ tree) => {
		const seen = new Set();
		const visit = (/** @type {Parameters<typeof textOf>[0]} */ node) => {
			if (node.tagName && HEADING.test(node.tagName) && !node.properties?.id) {
				const base = slugify(textOf(node));
				if (base) {
					let id = base;
					let n = 1;
					while (seen.has(id)) id = `${base}-${n++}`;
					node.properties = { ...node.properties, id };
					seen.add(id);
				}
			} else if (node.properties?.id) {
				seen.add(node.properties.id);
			}
			for (const child of node.children ?? []) visit(child);
		};
		visit(tree);
	};
}

// mdsvex wiring, adapted from greatfallstoolbus.org/svelte.config.js:5-16.
// `.svx` content is compiled AS a Svelte component, so it is the right lane for
// prose pages authored specifically for this site (see src/content/guide). The
// code-heavy DSA reference sheets are rendered through the dependency-free
// $lib/docs/markdown.ts raw lane instead, because their fenced Python (braces,
// angle-brackets) would be misparsed as Svelte syntax by mdsvex.
const mdsvexPreprocess = mdsvex({ extensions: ['.svx'], rehypePlugins: [rehypeHeadingIds] });
const modernMdsvexPreprocess = {
	...mdsvexPreprocess,
	async markup(options) {
		const transformed = await mdsvexPreprocess.markup?.(options);
		if (!transformed?.code) return transformed;
		return {
			...transformed,
			code: transformed.code.replace(/<script\s+context=(["'])module\1>/g, '<script module>'),
		};
	},
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.svx'],
	preprocess: [vitePreprocess(), modernMdsvexPreprocess],
	compilerOptions: {
		runes: true,
	},
	kit: {
		adapter: adapter({
			pages: process.env.BUILD_OUTPUT_DIR || 'build',
			assets: process.env.BUILD_OUTPUT_DIR || 'build',
			// No SPA fallback: build/404.html is the PRERENDERED src/routes/404
			// page (full HTML, no-JS-required), which GitHub Pages serves for
			// every unknown URL. A fallback shell here would shadow it with an
			// untitled, empty-body bootstrap document.
			precompress: true,
			strict: false,
		}),
		alias: {
			// Authored content (mdsvex .svx pages + raw reference sheets) lives
			// under src/content, outside $lib.
			$content: 'src/content',
		},
		paths: {
			// The DSA Woodshed ships on a custom domain (dsa-woodshed.space) via
			// static/CNAME, so base="" is the default — matching the adapter-static
			// custom-domain pattern in greatfallstoolbus.org/svelte.config.js:49-70.
			// A project-path GitHub Pages preview can still set BASE_PATH="/<repo>".
			base: process.env.BASE_PATH ?? '',
			// GitHub Pages serves the prerendered 404.html for ANY missing URL, at
			// any path depth — depth-relative ./_app asset URLs only resolve for
			// top-level misses, leaving deeper 404s unstyled and unhydrated.
			relative: false,
		},
		prerender: {
			// 'fail', deliberately (the kit default, explicit for the record):
			// every detail route throws 404 when its synced body is missing, so
			// under 'warn' a stale or half-synced src/content prerenders to a
			// silently incomplete site — dropped pages, dead cross-links, dead
			// TOC fragments — and the build still exits 0.
			handleHttpError: 'fail',
			handleMissingId: 'fail',
		},
	},
};

export default config;
