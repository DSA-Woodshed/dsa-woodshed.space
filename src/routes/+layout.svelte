<script lang="ts">
	import { onMount, setContext } from 'svelte';
	import { page } from '$app/state';
	import { PublicNavigation, SiteFooter } from '@xoxd/public-chrome';
	import { FOUC_SCRIPT } from '@xoxd/public-chrome/fouc';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import SiteNav from '$lib/components/SiteNav.svelte';
	import SearchDialog from '$lib/components/SearchDialog.svelte';
	import SessionDialog from '$lib/components/SessionDialog.svelte';
	import { SESSION_DIALOG_CONTEXT } from '$lib/session-dialog';
	import { REPO_URL } from '$lib/repo';
	import { SITE_REPO_URL } from '$lib/site-repo';
	import { buildSha, buildShaShort } from '$lib/build-info';
	import { PRIMARY_NAV_LINKS, SOURCE_OF_TRUTH_ROUTE, isPathInSection, primaryNavState } from '$lib/navigation';
	import '../app.css';

	let { children } = $props();
	// Preserve /start's initial-open behavior before the controlled dialog connects.
	let sessionOpen = $state(page.url.pathname === '/start');
	// Expose choices only after the client can bind their event handlers.
	let sessionMounted = $state(false);
	onMount(() => {
		sessionMounted = true;
	});
	let sessionReturnFocus = $state<HTMLElement | null>(null);
	function openSessionDialog(trigger?: HTMLElement): void {
		const active = document.activeElement;
		// The shared mobile drawer closes before invoking its action. Return to
		// its persistent launcher rather than the button in the dismissed drawer.
		sessionReturnFocus =
			trigger ??
			(active instanceof HTMLElement && !active.closest('[role="dialog"]') && active !== document.body
				? active
				: document.querySelector<HTMLElement>('button[aria-label="Open navigation"]'));
		sessionOpen = true;
	}
	setContext(SESSION_DIALOG_CONTEXT, openSessionDialog);
	const SITE_NAME = 'The DSA Woodshed';
	const SITE_URL = 'https://dsa-woodshed.space';
	const SITE_DESCRIPTION =
		'Choose a practice goal and a time budget. Study, implement, test, or read in a real editor with the DSA Woodshed.';
	const identity = { name: SITE_NAME, homeHref: '/' };
	const navLinks = $derived(
		PRIMARY_NAV_LINKS.map((link) => ({
			href: link.href,
			label: link.label,
			current: primaryNavState(page.url.pathname, link) !== undefined,
		})),
	);
	const headTitle = $derived(
		page.data.title ? `${page.data.title} | ${SITE_NAME}` : `${SITE_NAME} | Guided technical practice`,
	);
	const headDescription = $derived(page.data.summary || SITE_DESCRIPTION);
	const showMobileSectionNav = $derived(
		page.url.pathname !== SOURCE_OF_TRUTH_ROUTE &&
			['/guide', '/reference', '/algorithms'].some((section) => isPathInSection(page.url.pathname, section)),
	);
	const jsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		url: SITE_URL,
		name: SITE_NAME,
		description: SITE_DESCRIPTION,
		inLanguage: 'en',
	};
	const footerSections = [
		{
			heading: 'Practice',
			links: [
				{ href: '/start', label: 'Choose a session' },
				{ href: '/guide/getting-started', label: 'How it works' },
				{ href: '/library', label: 'Library' },
			],
		},
		{
			heading: 'Sources',
			links: [
				{ href: REPO_URL, label: 'Study packet' },
				{ href: SITE_REPO_URL, label: 'Website' },
				{ href: `${SITE_REPO_URL}/blob/main/CONTRIBUTING.md`, label: 'Contribute from your fork' },
			],
		},
		{
			heading: 'Project',
			links: [
				{ href: '/project', label: 'About the Woodshed' },
				{ href: SOURCE_OF_TRUTH_ROUTE, label: 'Source and privacy contract' },
				{ href: `${SITE_REPO_URL}/security/advisories/new`, label: 'Security' },
			],
		},
	];
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- Static script from the immutable shared chrome package. -->
	{@html `<script>${FOUC_SCRIPT}</` + `script>`}
</svelte:head>
<SEOHead
	title={headTitle}
	description={headDescription}
	image={`${SITE_URL}/og-image.png`}
	imageAlt={headTitle}
	siteName={SITE_NAME}
	origin={SITE_URL}
	noindex={page.data.noindex ?? false}
	{jsonLd}
/>

<div class="relative flex min-h-screen flex-col">
	<a
		href="#content"
		class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-tooltip) focus:rounded-sm focus:bg-primary-500 focus:px-4 focus:py-2 focus:text-white"
		>Skip to content</a
	>
	<div data-pagefind-ignore>
		<PublicNavigation
			{identity}
			pathname={page.url.pathname}
			{navLinks}
			action={{ label: 'Start', onselect: () => openSessionDialog() }}
		>
			{#snippet trailing()}<SearchDialog />{/snippet}
			{#snippet mobileSection(close)}
				{#if showMobileSectionNav}<SiteNav currentSectionOnly onNavigate={close} />{/if}
			{/snippet}
		</PublicNavigation>
	</div>
	<div id="content" class="flex-1">{@render children?.()}</div>
	<div data-pagefind-ignore>
		<SiteFooter
			{identity}
			tagline="A room for deliberate technical practice."
			description="Choose a goal, use the time you have, and reason in ordinary comments and docstrings. Content and its exact source revision travel together."
			licenseText="Public source under the MIT license."
			sections={footerSections}
		>
			{#snippet provenance()}
				{#if buildShaShort}<p class="text-surface-600-400 text-xs">
						Built from <a
							href={`${SITE_REPO_URL}/commit/${buildSha}`}
							class="font-mono underline underline-offset-2"
							aria-label={`source commit ${buildShaShort} on GitHub`}>{buildShaShort}</a
						>
					</p>{/if}
			{/snippet}
		</SiteFooter>
	</div>
</div>
{#if sessionMounted}
	<SessionDialog bind:open={sessionOpen} returnFocus={sessionReturnFocus} />
{/if}
