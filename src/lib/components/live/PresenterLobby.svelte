<script lang="ts">
	import { flip } from 'svelte/animate';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { Users, Link as LinkIcon, Check } from '@lucide/svelte';
	import type { PublicParticipant } from '$lib/live/types';
	import { burst, DUR, pop, reduced, rise } from '$lib/live/motion';
	import Avatar from './Avatar.svelte';
	import QrCode from './QrCode.svelte';

	interface Props {
		code: string;
		joinUrl: string;
		joinHost: string;
		participants: PublicParticipant[];
	}
	let { code, joinUrl, joinHost, participants }: Props = $props();

	/** Cap visible chips so 100+ players never overflow the stage. */
	const VISIBLE = 40;
	const shown = $derived(participants.slice(-VISIBLE));
	const hiddenCount = $derived(Math.max(0, participants.length - VISIBLE));

	const count = new Tween(0, { duration: DUR.layout, easing: cubicOut });
	$effect(() => {
		count.set(participants.length, { duration: reduced() ? 0 : DUR.layout });
	});

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(joinUrl);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard blocked: the link is visible anyway */
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- Join instructions -->
	<div class="grid flex-1 items-center gap-[4vw] lg:grid-cols-[1fr_auto]">
		<div class="min-w-0">
			<p class="eyebrow text-sun" in:rise={{ y: 10, duration: DUR.stage }}>Join on your phone</p>
			<p class="mt-[1.5vh] text-stage-md font-medium text-cream/75" in:rise={{ y: 14, duration: DUR.stage, delay: 60 }}>
				Go to <span class="font-semibold text-cream">{joinHost}/join</span> and enter
			</p>
			<p class="mt-[1vh] font-display text-stage-xl font-semibold tracking-[0.06em] text-cream tabular" aria-label="Join code {code.split('').join(' ')}">
				{#each code.split('') as digit, i (i)}
					<span class="inline-block" class:ml-[0.35em]={i === 3} in:rise={{ y: 40, duration: DUR.stage, delay: 120 + i * 55 }}>{digit}</span>
				{/each}
			</p>
			<button
				type="button"
				onclick={copyLink}
				class="mt-[2vh] inline-flex h-10 items-center gap-2 rounded-md px-3 font-mono text-sm text-cream/60 ring-1 ring-stage-line transition-colors duration-150 hover:bg-white/5 hover:text-cream"
				in:rise={{ y: 10, duration: DUR.stage, delay: 480 }}
			>
				{#if copied}<Check class="size-4 text-green-300" /> Link copied{:else}<LinkIcon class="size-4" /> {joinUrl.replace(/^https?:\/\//, '')}{/if}
			</button>
		</div>

		<div
			class="hidden justify-self-end rounded-xl bg-cream p-[1vw] text-forest-950 shadow-[0_0_80px_-20px_var(--color-sun)] lg:block"
			in:pop={{ duration: DUR.stage, delay: 260, from: 0.85 }}
		>
			<QrCode value={joinUrl} label="QR code to join" class="size-[min(22vw,36vh)]" />
		</div>
	</div>

	<!-- Players -->
	<section class="mt-[3vh] flex min-h-[30vh] flex-col" aria-label="Players">
		<div class="flex items-center gap-3 border-t border-stage-line pt-[2vh]">
			<Users class="size-6 text-green-300" aria-hidden="true" />
			<p class="text-stage-sm text-cream/70">
				<span class="font-display text-stage-md font-semibold text-cream tabular">{Math.round(count.current)}</span>
				{participants.length === 1 ? 'player' : 'players'}
			</p>
		</div>

		{#if !participants.length}
			<div class="flex flex-1 items-center justify-center gap-3 text-stage-sm text-cream/50" in:rise={{ y: 8, duration: DUR.stage, delay: 600 }}>
				<span class="flex gap-1.5" aria-hidden="true">
					{#each [0, 1, 2] as i (i)}
						<span class="size-2 animate-pulse-dot rounded-full bg-green-300" style:animation-delay="{i * 200}ms"></span>
					{/each}
				</span>
				Waiting for players to join
			</div>
		{:else}
			<ul class="mt-[2vh] flex flex-wrap content-start gap-3 overflow-hidden">
				{#if hiddenCount}
					<li class="flex h-[clamp(2.25rem,3.4vw,3.25rem)] items-center rounded-full px-5 text-stage-sm text-cream/60 tabular ring-1 ring-stage-line">
						+{hiddenCount} more
					</li>
				{/if}
				{#each shown as p (p.id)}
					<li
						class="flex h-[clamp(2.25rem,3.4vw,3.25rem)] items-center gap-2.5 rounded-full bg-stage-raised/80 pr-4 pl-1 ring-1 ring-stage-line transition-opacity duration-300
							{p.connected ? '' : 'opacity-45'}"
						in:burst={{ duration: 900, rotate: -20 }}
						animate:flip={{ duration: DUR.layout }}
					>
						<Avatar avatar={p.avatar} class="size-[clamp(1.85rem,2.8vw,2.6rem)] text-[clamp(1rem,1.5vw,1.45rem)]" />
						<span class="max-w-[16ch] truncate text-stage-sm font-medium text-cream">{p.nickname}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
