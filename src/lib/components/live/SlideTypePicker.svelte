<script lang="ts">
	import { SLIDE_META } from '$lib/live/slides';
	import { QUESTION_KINDS, QUIZ_KINDS, type SlideKind } from '$lib/live/types';
	import { SLIDE_ICONS } from './slide-icons';
	import Modal from '$lib/components/ui/Modal.svelte';

	let { open, onclose, onpick }: { open: boolean; onclose: () => void; onpick: (kind: SlideKind) => void } = $props();

	const groups = [
		{ title: 'Quiz', hint: 'Scored, timed, on the leaderboard', kinds: QUIZ_KINDS },
		{ title: 'Questions', hint: 'Polls and audience input, not scored', kinds: QUESTION_KINDS }
	];
</script>

<Modal {open} {onclose} size="lg" title="Add a slide" description="Pick what the room will do.">
	<div class="space-y-6">
		{#each groups as g (g.title)}
			<section>
				<h3 class="flex items-baseline gap-2 text-[13px] font-semibold text-foreground">
					{g.title}<span class="font-normal text-muted-foreground">{g.hint}</span>
				</h3>
				<ul class="mt-2 grid gap-2 sm:grid-cols-2">
					{#each g.kinds as kind (kind)}
						{@const Icon = SLIDE_ICONS[kind]}
						<li>
							<button
								type="button"
								onclick={() => onpick(kind)}
								class="group flex w-full items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors duration-150 hover:border-ring/50 hover:bg-muted/60"
							>
								<span
									class="grid size-9 shrink-0 place-items-center rounded-md transition-colors duration-150
										{g.title === 'Quiz' ? 'bg-sun-light/50 text-forest-900' : 'bg-secondary text-secondary-foreground'}"
								>
									<Icon class="size-4" />
								</span>
								<span class="min-w-0">
									<span class="block text-sm font-medium text-foreground">{SLIDE_META[kind].label}</span>
									<span class="block truncate text-[13px] text-muted-foreground">{SLIDE_META[kind].description}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</Modal>
