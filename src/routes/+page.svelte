<script lang="ts">
	import { availableCapabilities } from '$lib/capabilities';
	const problemCount = availableCapabilities.filter((capability) => capability.kind === 'algorithm').length;
	const BOOKLET_URL = '/printables';

	const steps = [
		{
			title: 'Write the thinking',
			body: 'Restate the problem, work an example, and name an approach.',
		},
		{
			title: 'Build and test',
			body: 'Implement in your private, gitignored workspace and add focused cases to your test file.',
		},
		{
			title: 'Reconcile the receipt',
			body: 'Run the focused tests; a failed, stale, or missing run asks you to trace, revise, and rerun.',
		},
		{
			title: 'Keep one correction',
			body: 'Finish with one correction to carry into the next rep.',
		},
	];

	const libraryLinks = [
		{
			title: 'Printables',
			href: '/printables',
		},
		{
			title: 'Algorithm Library',
			href: '/algorithms',
		},
		{
			title: 'Reference Sheets',
			href: '/reference',
		},
		{
			title: 'Extended problems',
			href: '/challenges#extended-problems',
		},
	];
</script>

<main class="mx-auto max-w-5xl px-6 py-16 md:py-24" data-pagefind-body>
	<header class="max-w-4xl">
		<p class="text-primary-600 text-xs font-semibold tracking-widest uppercase">The DSA Woodshed</p>
		<h1 class="mt-3 max-w-3xl text-4xl leading-tight font-bold md:text-6xl">Woodshedding for the whiteboard.</h1>
		<p class="text-surface-700-300 mt-6 max-w-2xl text-xl leading-relaxed font-semibold">
			Musicians woodshed: practice the hard passages alone until the performance holds under pressure. This is that room
			for technical interviews: real problems, real code, and a session shaped around the time you have.
		</p>
		<p class="text-surface-700-300 mt-4 max-w-2xl text-lg leading-relaxed">
			Choose study, implementation, tests first, or a conversation before you begin. Write your reasoning in ordinary
			<code>#</code> comments and docstrings. The Python track ships {problemCount} algorithm exercises, a printable booklet,
			and reference sheets.
		</p>

		<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
			<a
				href="/start"
				class="bg-primary-500 hover:bg-primary-600 inline-flex w-fit items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold text-white transition-colors"
			>
				Choose a session
			</a>
			<a
				href={BOOKLET_URL}
				class="border-surface-200-800 hover:border-primary-500 hover:text-primary-600 inline-flex w-fit items-center justify-center rounded-lg border px-5 py-3 text-sm font-semibold transition-colors"
			>
				Read the booklet
			</a>
			<a
				href="/guide/getting-started"
				class="text-primary-600 hover:text-primary-700 inline-flex w-fit px-2 py-3 text-sm font-semibold underline-offset-2 hover:underline"
			>
				How it works
			</a>
		</div>
		<p class="text-surface-500 mt-3 text-sm">
			Basic practice needs no repository API key or private-service credentials.
		</p>
	</header>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="choose-mode">
		<div class="max-w-2xl">
			<p class="text-primary-600 text-xs font-semibold tracking-widest uppercase">The default</p>
			<h2 id="choose-mode" class="mt-2 text-2xl font-bold">Start with ordinary comments</h2>
			<p class="text-surface-700-300 mt-3 leading-relaxed">
				Choose study or implementation, then write your reasoning in ordinary comments. There are no required prefixes
				or labels.
			</p>
			<p class="text-surface-500 mt-4 text-sm">
				Choose an available problem and open its isolated source and test files. Personal interviewer integrations can
				guide the same loop with optional labels.
			</p>
		</div>
	</section>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="rep-loop">
		<p class="text-primary-600 text-xs font-semibold tracking-widest uppercase">One clean loop</p>
		<h2 id="rep-loop" class="mt-2 text-2xl font-bold">How a rep works</h2>
		<p class="text-surface-700-300 mt-3 max-w-2xl leading-relaxed">
			Choose an available capability and a time budget. For an implementation session, use these four movements.
		</p>
		<ol
			class="border-surface-200-800 mt-8 list-decimal divide-y divide-surface-200-800 border-y pl-8 marker:font-mono marker:font-semibold marker:text-primary-600"
		>
			{#each steps as step (step.title)}
				<li class="py-5 pl-2">
					<h3 class="text-lg font-semibold">{step.title}</h3>
					<p class="text-surface-700-300 mt-2 text-sm leading-relaxed">{step.body}</p>
				</li>
			{/each}
		</ol>
		<div class="bg-surface-100-900 mt-6 rounded-lg p-5 text-sm leading-relaxed">
			<p class="font-semibold">You choose when to test.</p>
			<p class="text-surface-700-300 mt-2">
				Starting or resuming a session does not run tests. Study keeps the committed solution and reference tests
				intact; implementation uses an isolated candidate workspace. Start focused tests when you choose to check your
				work.
			</p>
		</div>
	</section>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="why-woodshed">
		<div class="max-w-2xl">
			<p class="text-primary-600 text-xs font-semibold tracking-widest uppercase">The point</p>
			<h2 id="why-woodshed" class="mt-2 text-2xl font-bold">Practice explaining your work</h2>
			<p class="text-surface-700-300 mt-3 leading-relaxed">
				Solving the problem is one skill. Explaining your examples, assumptions, and corrections is another. Use an
				untimed talk session to form a plan, a board session to narrate under a clock, or a mock session to rehearse the
				full conversation.
			</p>
			<p class="text-surface-700-300 mt-4 leading-relaxed">
				Your comments can be the whiteboard. Keep one concrete correction, then stop or choose another session. The <a
					href="/guide/interview-practice-evidence"
					class="editorial-link underline underline-offset-2">practice evidence guide</a
				>
				explains the method and its limits.
			</p>
		</div>
	</section>

	<section id="library" class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="library-heading">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-primary-600 text-xs font-semibold tracking-widest uppercase">Review with a purpose</p>
				<h2 id="library-heading" class="mt-2 text-2xl font-bold">Library</h2>
			</div>
			<a href="/library" class="text-primary-600 text-sm font-semibold underline-offset-2 hover:underline"
				>See the full library</a
			>
		</div>
		<p class="text-surface-700-300 mt-4 max-w-2xl leading-relaxed">
			Study a committed solution and its reference tests before a rep, review a complete solution after a gap, or take a
			printable sheet away from the screen.
		</p>
		<nav class="mt-5 flex flex-wrap gap-x-6 gap-y-1" aria-label="Library shortcuts">
			{#each libraryLinks as item (item.href)}
				<a
					href={item.href}
					class="editorial-link text-primary-600 hover:text-primary-700 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2"
				>
					{item.title}
				</a>
			{/each}
		</nav>
	</section>

	<section class="mt-20 border-t border-surface-200-800 pt-12" aria-labelledby="other-surfaces">
		<h2 id="other-surfaces" class="text-2xl font-bold">Match the surface to the skill</h2>
		<p class="text-surface-700-300 mt-3 max-w-2xl leading-relaxed">
			Choose study when you want the committed source and reference tests open without starting a rep. Choose an untimed
			talk session to slow down and form a plan, or a timed board session when narration under a clock is the skill you
			intend to train.
		</p>
		<p class="text-surface-500 mt-4 text-sm">
			Prefer local VS Code or no agent at all? The same workflow runs through the documented
			<a href="/guide/local-practice" class="editorial-link hover:text-primary-600 underline underline-offset-2"
				>just recipes</a
			>.
		</p>
	</section>
</main>
