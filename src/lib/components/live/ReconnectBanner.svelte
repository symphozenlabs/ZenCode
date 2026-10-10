<script lang="ts">
	import { WifiOff } from '@lucide/svelte';
	import type { SocketStatus } from '$lib/live/socket.svelte';
	import { rise, sink } from '$lib/live/motion';

	/** Slim banner while the socket is down. Doesn't steal focus. */
	let { status, tone = 'light' }: { status: SocketStatus; tone?: 'light' | 'stage' } = $props();
</script>

<div class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-2" aria-live="polite">
	{#if status === 'reconnecting'}
		<p
			in:rise={{ y: -12, duration: 220 }}
			out:sink={{ y: -12 }}
			class="flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium shadow-lg
				{tone === 'stage' ? 'bg-stage-raised text-cream ring-1 ring-stage-line' : 'bg-forest-900 text-cream'}"
		>
			<WifiOff class="size-3.5 text-sun" aria-hidden="true" />
			Reconnecting…
		</p>
	{/if}
</div>
