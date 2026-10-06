<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';
	import { SESSION_DIALOG_CONTEXT, type SessionLauncher } from '$lib/session-dialog';
	const openSessionDialog = getContext<SessionLauncher>(SESSION_DIALOG_CONTEXT);
	let launcher = $state<HTMLButtonElement>();
	onMount(() => {
		// The layout's shared dialog mounts after this route's children.
		void tick().then(() => openSessionDialog(launcher));
	});
</script>

<main class="mx-auto max-w-3xl px-6 py-16" data-pagefind-body>
	<h1 class="text-4xl font-bold">Make time for a rep</h1>
	<p class="text-surface-700-300 mt-6 text-lg">
		Study, implement, read, review, or contribute. Choose the time you have and an available capability.
	</p>
	<button
		bind:this={launcher}
		type="button"
		class="btn preset-filled-primary-500 mt-8"
		onclick={(event) => openSessionDialog(event.currentTarget)}>Choose a session</button
	>
</main>
