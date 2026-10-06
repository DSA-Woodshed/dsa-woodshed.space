<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { X } from '@lucide/svelte';
	import { availableCapabilities, MAX_SESSION_MINUTES, sessionCommand } from '$lib/capabilities';
	import { REPO_SLUG, REPO_URL } from '$lib/repo';
	import { sourceCommit } from '$lib/docs/registry';
	let { open = $bindable(false), returnFocus = null } = $props<{ open?: boolean; returnFocus?: HTMLElement | null }>();
	let mode = $state('study');
	let capabilityId = $state('');
	let minutes = $state(30);
	let ready = $state(false);
	let copied = $state(false);
	const modeDescriptions: Record<string, string> = {
		study: 'Read an intact solution and its reference tests before starting implementation.',
		implement: 'Work on an isolated candidate implementation. You own the code and tests.',
		'tests-first': 'Begin with tests, then implement against your examples.',
		talk: 'Reason through an example aloud without writing an implementation.',
		board: 'Practice explaining a solution under a time budget.',
		mock: 'Practice an observed interview with your chosen human or personal assistant.',
		read: 'Read a concept, advanced exercise, reference, or method guide.',
		review: 'Revisit due practice and decide what needs another rep.',
		contribute: 'Prepare a focused contribution from your personal fork.',
	};
	const modes = Object.keys(modeDescriptions).filter((candidate) =>
		availableCapabilities.some((entry) => entry.modes.includes(candidate)),
	);
	const choices = $derived(availableCapabilities.filter((entry) => entry.modes.includes(mode)));
	const selected = $derived(choices.find((entry) => entry.id === capabilityId));
	const candidateMode = $derived(mode === 'implement' || mode === 'tests-first');
	const validMinutes = $derived(Number.isSafeInteger(minutes) && minutes > 0 && minutes <= MAX_SESSION_MINUTES);
	const command = $derived(selected && validMinutes ? sessionCommand(selected, mode, minutes, ready) : '');
	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(command);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

<Dialog
	{open}
	onOpenChange={(details) => {
		open = details.open;
	}}
	closeOnEscape
	closeOnInteractOutside
	preventScroll
	finalFocusEl={() => (returnFocus?.isConnected ? returnFocus : null)}
>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-(--z-modal-backdrop) bg-black/60" />
		<Dialog.Positioner class="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4">
			<Dialog.Content class="bg-surface-50-950 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg p-6 shadow-2xl">
				<div class="flex items-start justify-between gap-4">
					<Dialog.Title class="text-2xl font-bold">Choose your session</Dialog.Title>
					<Dialog.CloseTrigger aria-label="Close session chooser" class="rounded-sm p-2"
						><X class="size-5" /></Dialog.CloseTrigger
					>
				</div>
				<Dialog.Description class="text-surface-700-300 mt-3"
					>Choose your intent and the time you have. Practice works without credentials for private services.</Dialog.Description
				>
				<form class="mt-6 space-y-5" onsubmit={(event) => event.preventDefault()}>
					<label class="block space-y-2"
						><span class="font-medium">What would you like to do?</span><select
							class="select w-full"
							bind:value={mode}
							onchange={() => {
								capabilityId = '';
								ready = false;
								copied = false;
							}}
						>
							{#each modes as value (value)}<option {value}
									>{value === 'tests-first' ? 'Tests first' : value[0].toUpperCase() + value.slice(1)}</option
								>{/each}
						</select></label
					>
					<p class="text-surface-700-300 text-sm">{modeDescriptions[mode]}</p>
					<label class="block space-y-2"
						><span class="font-medium">Choose something to work on</span><select
							class="select w-full"
							bind:value={capabilityId}
							onchange={() => {
								ready = false;
								copied = false;
							}}
						>
							<option value="" disabled>Select an available capability</option>
							{#each choices as capability (capability.id)}<option value={capability.id}
									>{capability.title} · {capability.kind}</option
								>{/each}
						</select></label
					>
					<fieldset>
						<legend class="font-medium">How much time do you have?</legend>
						<div class="mt-2 flex flex-wrap gap-2">
							{#each [15, 30, 60] as budget (budget)}<button
									type="button"
									class="btn {minutes === budget ? 'preset-filled-primary-500' : 'preset-outlined-surface-500'}"
									aria-pressed={minutes === budget}
									onclick={() => {
										minutes = budget;
										copied = false;
									}}>{budget} minutes</button
								>{/each}
						</div>
						<label class="mt-3 flex items-center gap-3 text-sm"
							>Custom minutes<input
								class="input w-24"
								type="number"
								min="1"
								max={MAX_SESSION_MINUTES}
								bind:value={minutes}
								oninput={() => (copied = false)}
							/></label
						>
						<p class="text-surface-700-300 mt-2 text-sm">
							Your chosen budget starts no timer. Starting or resuming runs no tests.
						</p>
					</fieldset>
					{#if candidateMode && selected}
						<div class="space-y-2">
							<p class="text-surface-700-300 text-sm">
								Coming from a study session on this item? Choose readiness to begin your own work.
							</p>
							<label class="flex items-center gap-3 text-sm">
								<input type="checkbox" class="checkbox" bind:checked={ready} onchange={() => (copied = false)} />
								I'm ready to move from study to candidate work
							</label>
						</div>
					{/if}
					{#if selected}
						<p class="text-surface-700-300 text-sm">
							Suggested time: {selected.duration} minutes.
							<a class="underline" href={`${REPO_URL}/blob/${sourceCommit}/${selected.source}`}>View the source</a>.
						</p>
					{/if}
					{#if command}
						<div class="bg-surface-100-900 space-y-3 rounded-md p-4">
							<p class="text-sm">
								Open the Woodshed, then paste this command into its terminal. Your editor session will use the same
								choices.
							</p>
							<code data-testid="session-start-command" class="block break-all text-sm">{command}</code><button
								type="button"
								class="btn preset-outlined-surface-500"
								onclick={copyCommand}>{copied ? 'Copied' : 'Copy command'}</button
							>
						</div>
						<a
							class="btn preset-filled-primary-500"
							href={`https://codespaces.new/${REPO_SLUG}?quickstart=1`}
							target="_blank"
							rel="noopener">Open in Codespaces</a
						>
					{:else if !validMinutes}<p role="alert">Choose a budget from 1 to {MAX_SESSION_MINUTES} minutes.</p>{/if}
					<details class="text-surface-700-300 space-y-3 text-sm">
						<summary class="cursor-pointer font-medium">Continue or close an existing session</summary>
						<p>
							<code>just session current</code> shows your saved choice. <code>just session resume</code> reopens it.
						</p>
						<p>
							Use <code>just session finish "one correction"</code> with your own correction to close it, then choose another
							activity. Closeout records the existing test outcome; it runs no tests and can record unfinished work.
						</p>
					</details>
					<details class="text-surface-700-300 space-y-3 text-sm">
						<summary class="cursor-pointer font-medium">Optional protected services</summary>
						<p>
							This site cannot check your workspace's identity or secret federation. Public study and practice need no
							private credentials.
						</p>
						<p>
							If you choose protected services, run <code>just protected-capability</code> in your workspace. It reports unavailable
							(exit 78) unless an independently installed adapter admits that runtime.
						</p>
					</details>
				</form>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
