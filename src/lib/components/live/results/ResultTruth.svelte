<script lang="ts">
	import { Check, X } from '@lucide/svelte';
	import type { Option, SlideResults } from '$lib/live/types';
	import { rise } from '$lib/live/motion';

	/**
	 * Truth or lie: two cards fill with votes; once voting closes the room
	 * gets a drumroll, then a stamp slams onto the right card.
	 */
	interface Props {
		options: Option[];
		results: SlideResults | null;
		show: boolean;
		correctIds: string[] | null;
		closed: boolean;
	}
	let { options, results, show, correctIds, closed }: Props = $props();

	const counts = $derived<Record<string, number>>(results?.input === 'tap' ? results.counts : {});
	const total = $derived(results?.input === 'tap' ? results.total : 0);
	const drumroll = $derived(closed && !correctIds);
</script>

<div class="flex h-full flex-col items-center justify-center">
	<ul class="grid w-full max-w-[min(100%,70rem)] grid-cols-2 gap-[3vw]" aria-label="Results">
		{#each options as o, i (o.id)}
			{@const truth = o.id === 'true'}
			{@const color = truth ? 'var(--color-green-300)' : 'var(--color-wrong-stage)'}
			{@const count = counts[o.id] ?? 0}
			{@const share = show && total ? count / total : 0}
			{@const isCorrect = correctIds?.includes(o.id) ?? false}
			{@const isWrong = !!correctIds && !isCorrect}
			<li in:rise={{ y: 40, duration: 900, delay: 100 + i * 150 }}>
				<div
					class="relative flex aspect-[4/3] max-h-[48vh] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-stage-raised ring-2 transition-[transform,opacity,filter,box-shadow] duration-700 ease-out-quart
						{drumroll ? 'shake' : ''}"
					style:--tw-ring-color={isCorrect ? color : 'var(--color-stage-line)'}
					style:--shake-delay="{i * 140}ms"
					style:transform={isWrong ? 'rotate(-2deg) scale(0.94)' : isCorrect ? 'scale(1.03)' : 'none'}
					style:opacity={isWrong ? 0.4 : 1}
					style:filter={isWrong ? 'grayscale(0.8)' : 'none'}
					style:box-shadow={isCorrect ? `0 0 80px -10px ${color}` : 'none'}
				>
					<!-- Vote fill rises from the bottom -->
					<div
						aria-hidden="true"
						class="absolute inset-0 origin-bottom"
						style:transform="scaleY({share})"
						style:transition="transform 1100ms var(--ease-spring)"
						style:background="linear-gradient(0deg, color-mix(in srgb, {color} 40%, transparent), color-mix(in srgb, {color} 8%, transparent))"
					></div>
					<span
						class="relative grid size-[clamp(3.5rem,10vh,6rem)] place-items-center rounded-full"
						style:background="color-mix(in srgb, {color} 22%, transparent)"
						style:color
					>
						{#if truth}<Check class="size-1/2" strokeWidth={3} />{:else}<X class="size-1/2" strokeWidth={3} />{/if}
					</span>
					<p class="relative mt-[2vh] font-display text-stage-xl font-bold text-cream">{o.text}</p>
					<p class="relative mt-[1vh] text-stage-md text-cream/70 tabular transition-opacity duration-500" style:opacity={show ? 1 : 0}>
						{Math.round(share * 100)}% · {count}
					</p>

					{#if isCorrect}
						<span
							class="stamp absolute top-[10%] right-[6%] rounded-lg border-4 px-[1.2vw] py-[0.6vh] font-display text-stage-lg font-black tracking-wider uppercase"
							style:border-color={color}
							style:color
							style:background="color-mix(in srgb, var(--color-stage) 75%, transparent)">{truth ? 'True!' : 'A lie!'}</span
						>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	<p class="mt-[4vh] h-[1.5em] font-mono text-stage-sm tracking-[0.3em] text-sun uppercase transition-opacity duration-500" style:opacity={drumroll ? 1 : 0}>
		Drumroll…
	</p>
</div>
