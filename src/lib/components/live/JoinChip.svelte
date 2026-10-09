<script lang="ts">
	import { formatCode } from '$lib/live/session';
	import QrCode from './QrCode.svelte';

	/** Small corner reminder of how to join, once the lobby is gone. */
	let { code, joinUrl, joinHost }: { code: string; joinUrl: string; joinHost: string } = $props();
</script>

<div class="flex items-center gap-3 rounded-lg bg-stage-raised/80 py-1.5 pr-4 pl-1.5 ring-1 ring-stage-line backdrop-blur-sm">
	<div class="rounded-md bg-cream p-1 text-forest-950"><QrCode value={joinUrl} label="QR code to join" class="size-[clamp(2.75rem,6vh,4rem)]" /></div>
	<div class="leading-tight">
		<p class="text-[clamp(0.7rem,1vw,0.9rem)] text-cream/60">Join at {joinHost}/join</p>
		<p class="font-display text-[clamp(1.1rem,2vw,1.75rem)] font-semibold tracking-wider text-cream tabular">{formatCode(code)}</p>
	</div>
</div>
