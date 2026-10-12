<script lang="ts">
	import { page } from '$app/state';
	import { CloudOff, ArrowLeft } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import StateMessage from '$lib/components/ui/StateMessage.svelte';
	import CertScope from '$lib/components/certificates/CertScope.svelte';
	import CertificateEditor from '$lib/components/certificates/CertificateEditor.svelte';
	import { getTemplate, verifyBase } from '$lib/certificates/store';

	const id = $derived(page.params.id ?? '');
	const loading = $derived(getTemplate(id));
</script>

<svelte:head><title>Edit certificate — ZenCode Admin</title></svelte:head>

<CertScope>
	{#await loading}
		<div class="flex items-center justify-center gap-3 py-24 text-sm text-muted-foreground"><Spinner /> Opening certificate…</div>
	{:then template}
		{#if template}
			{#key template.id}
				<CertificateEditor {template} verifyBase={verifyBase()} />
			{/key}
		{:else}
			<div class="rounded-lg border border-border bg-card">
				<StateMessage icon={CloudOff} title="That certificate does not exist." description="It may have been deleted.">
					<Button variant="outline" href="/admin/certificates"><ArrowLeft class="size-4" /> All certificates</Button>
				</StateMessage>
			</div>
		{/if}
	{:catch}
		<div class="rounded-lg border border-border bg-card">
			<StateMessage tone="error" icon={CloudOff} title="Could not open the certificate." description="Check your connection, then try again.">
				<Button variant="outline" href="/admin/certificates"><ArrowLeft class="size-4" /> All certificates</Button>
			</StateMessage>
		</div>
	{/await}
</CertScope>
