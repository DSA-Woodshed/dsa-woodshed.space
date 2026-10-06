<script lang="ts">
	// mdsvex .svx lane: the content page is compiled to a Svelte component at
	// build time (see svelte.config.js). `metadata` is its YAML frontmatter.
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PrevNext from '$lib/components/PrevNext.svelte';
	import SourceLink from '$lib/components/SourceLink.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import Content, { metadata } from '$content/guide/interview-practice-evidence.svx';
	import { entryHref, neighbors } from '$lib/docs/registry';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The canonical source lives in the content repo (DSA-Woodshed/dsa-study-packet).
	const sourcePath = 'docs/guide/interview-practice-evidence.md';
	const title = (metadata.title as string) ?? 'Interview practice evidence';
	const adjacent = $derived(neighbors('guide', 'interview-practice-evidence'));
</script>

<main class="mx-auto max-w-5xl py-16">
	<Breadcrumbs
		items={[
			{ label: 'The DSA Woodshed', href: '/' },
			{ label: 'Method', href: '/guide/getting-started' },
			{ label: title },
		]}
	/>
	<div class="xl:grid xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start xl:gap-10">
		<article class="min-w-0" data-pagefind-body>
			<!-- Heading ids are stamped at build time by the mdsvex rehype
			     heading-id plugin in svelte.config.js, so the TOC anchors below
			     resolve in the static HTML with zero client JS. -->
			<div class="prose max-w-none">
				<Content />
			</div>
			<SourceLink {sourcePath} />
			<PrevNext
				prev={adjacent.prev && { title: adjacent.prev.title, href: entryHref(adjacent.prev) }}
				next={adjacent.next && { title: adjacent.next.title, href: entryHref(adjacent.next) }}
			/>
		</article>
		<aside class="hidden xl:sticky xl:top-20 xl:block" aria-label="Page sections">
			<TableOfContents headings={data.headings} />
		</aside>
	</div>
</main>
