<script lang="ts">
	import { SmilePlus, X } from '@lucide/svelte';
	import { REACTIONS, type ReactionId } from '$lib/live/reactions';
	import { DUR, pop, softFade } from '$lib/live/motion';
	import ReactionFlight from './ReactionFlight.svelte';

	/**
	 * Bottom-of-phone reaction bar: a toggle opens a tray of emoji. Each tap is
	 * sent to the big screen and also floats up from the finger, so the phone
	 * feels it too.
	 */
	let { onreact }: { onreact: (id: ReactionId) => boolean } = $props();

	let open = $state(false);
	let flight = $state<ReactionFlight>();
	let bumped = $state<{ id: ReactionId; n: number } | null>(null);

	function tap(e: MouseEvent, r: (typeof REACTIONS)[number]) {
		if (!onreact(r.id)) return;
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
		flight?.launch(r.emoji, { x: box.left + box.width / 2, y: box.top });
		bumped = { id: r.id, n: (bumped?.n ?? 0) + 1 };
		navigator.vibrate?.(8);
	}
</script>

<ReactionFlight bind:this={flight} size={34} rise={0.55} max={30} class="z-40" />

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
	<div class="mx-auto flex max-w-md items-center justify-end gap-2 px-4">
		{#if open}
			<div
				id="reaction-tray"
				role="group"
				aria-label="Send a reaction"
				class="pointer-events-auto flex h-14 min-w-0 flex-1 items-center justify-around rounded-full bg-card/90 px-1.5 shadow-lg ring-1 ring-border backdrop-blur-md"
				in:pop={{ duration: DUR.layout, from: 0.6 }}
				out:softFade={{ duration: DUR.fast }}
				style:transform-origin="right center"
			>
				{#each REACTIONS as r, i (r.id)}
					<button
						type="button"
						class="grid size-11 shrink-0 place-items-center rounded-full text-[26px] leading-none transition-transform duration-150 select-none active:scale-90 [-webkit-tap-highlight-color:transparent]"
						aria-label={r.label}
						title={r.label}
						onclick={(e) => tap(e, r)}
						in:pop={{ duration: DUR.layout, delay: 40 + i * 35, from: 0.2 }}
					>
						{#key bumped?.id === r.id ? bumped.n : 0}
							<span class="block" in:pop={{ duration: DUR.base, from: 0.7 }}>{r.emoji}</span>
						{/key}
					</button>
				{/each}
			</div>
		{/if}
		<button
			type="button"
			class="pointer-events-auto grid size-14 shrink-0 place-items-center rounded-full shadow-lg ring-1 transition-[background-color,transform,color] duration-200 active:scale-95 [-webkit-tap-highlight-color:transparent]
				{open ? 'bg-forest-950 text-cream ring-forest-950' : 'bg-sun text-forest-950 ring-sun/40'}"
			aria-expanded={open}
			aria-controls="reaction-tray"
			aria-label={open ? 'Close reactions' : 'Send a reaction'}
			onclick={() => (open = !open)}
		>
			<span class="grid place-items-center transition-transform duration-300 ease-out {open ? 'rotate-90' : ''}">
				{#if open}<X class="size-6" />{:else}<SmilePlus class="size-6" />{/if}
			</span>
		</button>
	</div>
</div>
