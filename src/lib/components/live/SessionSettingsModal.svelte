<script lang="ts">
	import type { SessionSettings } from '$lib/live/types';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Toggle from '$lib/components/admin/Toggle.svelte';
	import Segmented from './Segmented.svelte';

	let { open, onclose, settings = $bindable() }: { open: boolean; onclose: () => void; settings: SessionSettings } = $props();
</script>

<Modal {open} {onclose} title="Session settings" description="Changes save automatically.">
	<div class="space-y-6">
		<div>
			<Segmented
				label="Quiz scoring"
				bind:value={settings.scoring}
				options={[
					{ value: 'speed', label: 'Faster scores more' },
					{ value: 'equal', label: 'Equal points' }
				]}
			/>
			<p class="mt-2 text-[13px] text-muted-foreground">
				{settings.scoring === 'speed'
					? 'A correct answer earns between half and full points, depending on how fast it came in.'
					: 'Every correct answer earns full points, however long it took.'}
			</p>
		</div>
		<div class="space-y-4 border-t border-border pt-5">
			<Toggle bind:checked={settings.reactions} label="Reactions" description="Emoji taps from phones float up on the big screen." />
			<Toggle bind:checked={settings.qa} label="Audience Q&A" description="Participants can send questions at any time." />
			<Toggle bind:checked={settings.moderation} label="Moderate questions" description="New questions wait for your approval before they show." />
			<Toggle bind:checked={settings.profanityFilter} label="Profanity filter" description="Blocks offensive nicknames and hides offensive words in answers." />
		</div>
	</div>
	{#snippet footer()}
		<Button onclick={onclose}>Done</Button>
	{/snippet}
</Modal>
