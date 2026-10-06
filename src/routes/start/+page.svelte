<script lang="ts">
	import SessionDialog from '$lib/components/SessionDialog.svelte';
	let open = $state(true);
</script>

<main class="mx-auto max-w-3xl px-6 py-16" data-pagefind-body>
	<h1 class="text-4xl font-bold">Make time for a rep</h1>
	<p class="text-surface-700-300 mt-6 text-lg">
		Study, implement, read, review, or contribute. Choose the time you have and an available capability.
	</p>
	<button type="button" class="btn preset-filled-primary-500 mt-8" onclick={() => (open = true)}
		>Choose a session</button
	>
</main>
<SessionDialog bind:open />
