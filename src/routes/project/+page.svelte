<script lang="ts">
	import { REPO_URL } from '$lib/repo';
	import { SOURCE_OF_TRUTH_ROUTE } from '$lib/navigation';

	const SECURITY_URL = `${REPO_URL}/security/advisories/new`;
</script>

<main class="mx-auto max-w-5xl px-6 py-16 md:py-24" data-pagefind-body>
	<header class="max-w-4xl">
		<p class="text-primary-600 text-xs font-semibold tracking-widest uppercase">The project</p>
		<h1 class="mt-3 max-w-3xl text-4xl leading-tight font-bold md:text-6xl">A public woodshed</h1>
		<p class="text-surface-700-300 mt-6 max-w-2xl text-xl leading-relaxed font-semibold">
			The DSA Woodshed is a public, company-neutral interview-practice product: a packet repository of problems, tests,
			and print material, plus this reading site, which reproduces an exact packet revision on every deploy.
		</p>
	</header>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="live-now">
		<h2 id="live-now" class="text-2xl font-bold">What is live now</h2>
		<p class="text-surface-700-300 mt-3 max-w-2xl leading-relaxed">
			The Python track has reference solutions and focused tests, isolated editor-first sessions, and a verified
			printable booklet. Python is the only runnable track today. Future languages need their own justified curriculum
			and working exercises. R, Stan, and Quarto reporting will begin with a bounded real-data pilot.
		</p>
	</section>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="who-owns-what">
		<h2 id="who-owns-what" class="text-2xl font-bold">Who owns what</h2>
		<p class="text-surface-700-300 mt-3 max-w-2xl leading-relaxed">
			In a rep, you own the source and the tests: the interviewer conducts and checks visible work, and never writes
			them. In the repository, tracked problems are complete and tested; personal practice state lives in a gitignored
			workspace and never enters the public tree.
		</p>
	</section>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="start-or-contribute">
		<h2 id="start-or-contribute" class="text-2xl font-bold">Start or contribute</h2>
		<ul class="mt-6 max-w-2xl space-y-4 text-sm">
			<li>
				<a
					href="/start"
					target="_blank"
					rel="noopener"
					class="editorial-link text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
					>Choose a session</a
				>
			</li>
			<li>
				<a
					href="/guide/getting-started"
					class="editorial-link text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
					>How it works</a
				>
			</li>
			<li>
				<a
					href={SOURCE_OF_TRUTH_ROUTE}
					class="editorial-link text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
					>Source and privacy contract</a
				>
				<span class="text-surface-700-300"> — the canonical rules for what enters this repository.</span>
			</li>
			<li>
				<a
					href={REPO_URL}
					target="_blank"
					rel="noopener"
					class="editorial-link text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
					>dsa-study-packet on GitHub</a
				>
				<span class="text-surface-700-300">
					— issues and pull requests welcome; <code>just lint</code> and <code>just test</code> are the front door.
				</span>
			</li>
			<li>
				<a
					href={SECURITY_URL}
					target="_blank"
					rel="noopener"
					class="editorial-link text-primary-600 hover:text-primary-700 font-semibold underline underline-offset-2"
					>Report a security issue privately</a
				>
			</li>
		</ul>
	</section>
</main>
