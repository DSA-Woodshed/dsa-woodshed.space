<script lang="ts">
	// ── HOUSE CANON IDIOM ──────────────────────────────────────────────────────
	// The git-onboarding affordance: every substantive page links to its own
	// source so a reader can see "this page lives in git" and propose an edit
	// through GitHub's web editor.
	//
	// PROVENANCE: adapted from greatfallstoolbus.org/src/lib/components/SourceLink.svelte.
	// The original resolved a route -> source-path map from the estate-generated
	// $lib/generated/source-map.json. The DSA Woodshed is a reading surface over a
	// SEPARATE content repo, so instead this component takes the content-repo
	// source path directly and resolves edit/view URLs through $lib/repo.ts
	// (pointed at DSA-Woodshed/dsa-study-packet). No org/repo string is hardcoded.
	import { Code, Pencil } from '@lucide/svelte';
	import { editUrl, blobUrl } from '$lib/repo';

	interface Props {
		/** Repo-relative source path in the content repo, e.g. `reference-sheets/03-algorithm-templates.md`. */
		sourcePath: string;
	}

	let { sourcePath }: Props = $props();

	const edit = $derived(editUrl(sourcePath));
	const blob = $derived(blobUrl(sourcePath));
</script>

{#if sourcePath}
	<!-- data-pagefind-ignore: reference/guide render this inside their
	     data-pagefind-body article, and this boilerplate ("edit", "git",
	     "source" — all real DSA query stems) would otherwise pollute every
	     excerpt and cross-match those pages. Harmless on the algorithms
	     route, where SourceLink already sits outside the body wrapper. -->
	<div
		data-pagefind-ignore
		class="text-surface-500 dark:text-surface-400 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
	>
		<span>This page lives in git. Anyone can propose an edit.</span>
		<span class="flex items-center gap-x-3">
			<a
				class="hover:text-primary-600 dark:hover:text-primary-400 inline-flex min-h-11 items-center gap-1 underline-offset-2 hover:underline"
				href={edit}
				target="_blank"
				rel="noopener"
				aria-label="Edit this page on GitHub"
				title="Edit this page"
			>
				<Pencil size={14} aria-hidden="true" />
				<span>Edit this page</span>
			</a>
			<a
				class="hover:text-primary-600 dark:hover:text-primary-400 inline-flex min-h-11 items-center gap-1 underline-offset-2 hover:underline"
				href={blob}
				target="_blank"
				rel="noopener"
				aria-label="View this page's source on GitHub"
				title="View source"
			>
				<Code size={14} aria-hidden="true" />
				<span>View source</span>
			</a>
		</span>
	</div>
{/if}
