<script lang="ts">
	import { BookOpen, Download, ExternalLink, FileCheck2 } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { BookletMetadata } from '$lib/docs/booklet';

	interface Props {
		booklet: BookletMetadata;
	}

	let { booklet }: Props = $props();
	let pdfViewerEnabled = $state(true);

	const digest = $derived(booklet.asset.digest.replace(/^sha256:/, ''));
	const digestLabel = $derived(`${digest.slice(0, 12)}…${digest.slice(-8)}`);

	onMount(() => {
		pdfViewerEnabled = navigator.pdfViewerEnabled;
	});
</script>

<section
	id="full-booklet"
	aria-labelledby="full-booklet-title"
	class="bg-surface-100-900 border-surface-300-700 my-8 rounded-xl border p-5 sm:p-7"
	data-testid="printable-reader"
>
	<div class="flex flex-col gap-5">
		<header class="space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 id="full-booklet-title" class="text-2xl font-bold tracking-tight">Full booklet</h2>
				<span
					class="border-primary-500/45 bg-primary-500/10 text-primary-700 dark:text-primary-300 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold"
					title={`Published digest ${booklet.asset.digest}`}
				>
					<FileCheck2 size={16} aria-hidden="true" />
					{booklet.tagName} · SHA-256 verified
				</span>
			</div>
			<p class="text-surface-700-300 max-w-3xl leading-relaxed">
				This is the exact public release copied during the site build. Its PDF header and published digest were checked
				before this page was generated.
			</p>
			<p class="text-surface-500 dark:text-surface-400 text-xs">
				Release {booklet.tagName} · {booklet.asset.size.toLocaleString('en-US')} bytes ·
				<code title={digest}>{digestLabel}</code>
			</p>
		</header>

		<nav aria-label="Booklet actions" class="flex flex-col gap-3 sm:flex-row">
			<a
				href={booklet.asset.localUrl}
				target="_blank"
				rel="noopener"
				class="bg-primary-600 hover:bg-primary-700 focus-visible:outline-primary-500 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
			>
				<ExternalLink size={18} aria-hidden="true" />
				Open full screen
				<span class="sr-only"> (opens in a new tab)</span>
			</a>
			<a
				href={booklet.asset.localUrl}
				download={booklet.asset.name}
				class="border-surface-400-600 bg-surface-50-950 hover:bg-surface-200-800 focus-visible:outline-primary-500 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 py-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
			>
				<Download size={18} aria-hidden="true" />
				Download PDF
			</a>
			<a
				href="/reference"
				class="border-surface-400-600 bg-surface-50-950 hover:bg-surface-200-800 focus-visible:outline-primary-500 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 py-2 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
			>
				<BookOpen size={18} aria-hidden="true" />
				Read HTML reference sheets
			</a>
		</nav>
		<p class="text-surface-600-400 text-sm">
			The PDF does not include accessibility tags. The HTML reference sheets provide structured headings and browser
			navigation.
		</p>

		{#if pdfViewerEnabled}
			<div class="border-surface-300-700 hidden overflow-hidden rounded-lg border md:block">
				<div
					class="bg-surface-200-800 text-surface-600-400 flex min-h-11 items-center border-b border-inherit px-4 text-sm font-medium"
				>
					{booklet.asset.name} · native browser reader
				</div>
				<object
					data={booklet.asset.localUrl}
					type="application/pdf"
					title={`The DSA Woodshed booklet ${booklet.tagName}`}
					class="bg-surface-200 h-[70vh] min-h-[36rem] max-h-[56rem] w-full"
				>
					<p class="p-6">
						This browser could not embed the booklet.
						<a class="underline" href={booklet.asset.localUrl}>Open the PDF directly.</a>
					</p>
				</object>
			</div>
		{:else}
			<p
				class="border-surface-300-700 bg-surface-50-950 text-surface-700-300 hidden rounded-lg border p-4 md:block"
				data-testid="pdf-reader-unavailable"
			>
				This browser does not expose a native PDF reader. Use Open full screen or Download PDF above.
			</p>
		{/if}

		<p class="text-surface-600-400 md:hidden">
			Phone PDF viewers vary, so the reliable full-screen and download controls stay outside the document.
		</p>
	</div>
</section>
