<script lang="ts">
	import { fly } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		dirty: boolean;
		saving: boolean;
		message?: { text: string; tone: 'ok' | 'error' } | null;
		onsave: () => void;
		onreset: () => void;
	}
	let { dirty, saving, message, onsave, onreset }: Props = $props();
</script>

{#if dirty || message}
	<div
		class="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg"
		transition:fly={{ y: 12, duration: 180 }}
		aria-live="polite"
	>
		<p class="text-sm {message?.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}">
			{message?.text ?? 'You have unsaved changes.'}
		</p>
		{#if dirty}
			<div class="flex gap-2">
				<Button variant="ghost" onclick={onreset} disabled={saving}>Discard</Button>
				<Button onclick={onsave} loading={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
			</div>
		{/if}
	</div>
{/if}
