<script lang="ts">
	import type { RegistrationStatus } from '$lib/registrations/model';

	let { status }: { status: RegistrationStatus } = $props();

	const styles: Record<RegistrationStatus, { label: string; cls: string; dot: string }> = {
		approved: { label: 'Approved', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
		rejected: { label: 'Rejected', cls: 'border-red-200 bg-red-50 text-red-800', dot: 'bg-red-500' }
	};
	const s = $derived(styles[status]);
</script>

<span
	class="inline-flex min-h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors duration-200 {s.cls}"
>
	<span class="size-1.5 rounded-full {s.dot}" aria-hidden="true"></span>
	{s.label}
</span>
