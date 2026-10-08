<script lang="ts">
	/** A few outlined geometric marks drifting slowly — technical, not decorative noise. */
	const shapes = [
		{ kind: 'square', x: '8%', y: '22%', s: 46, d: '0s' },
		{ kind: 'tri', x: '86%', y: '18%', s: 54, d: '-4s' },
		{ kind: 'circle', x: '78%', y: '72%', s: 38, d: '-8s' },
		{ kind: 'plus', x: '16%', y: '76%', s: 30, d: '-2s' },
		{ kind: 'bracket', x: '92%', y: '46%', s: 34, d: '-6s' }
	] as const;
</script>

<div aria-hidden="true" class="pointer-events-none absolute inset-0 hidden md:block">
	{#each shapes as s (s.kind)}
		<svg
			class="absolute animate-float-slow text-green-300/25"
			style:left={s.x}
			style:top={s.y}
			style:animation-delay={s.d}
			width={s.s}
			height={s.s}
			viewBox="0 0 40 40"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		>
			{#if s.kind === 'square'}
				<rect x="6" y="6" width="28" height="28" transform="rotate(12 20 20)" />
			{:else if s.kind === 'tri'}
				<path d="M20 5 L36 33 H4 Z" />
			{:else if s.kind === 'circle'}
				<circle cx="20" cy="20" r="14" />
			{:else if s.kind === 'plus'}
				<path d="M20 6 V34 M6 20 H34" />
			{:else}
				<path d="M15 6 H8 V34 H15 M25 6 H32 V34 H25" />
			{/if}
		</svg>
	{/each}
</div>
