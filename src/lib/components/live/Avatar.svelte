<script lang="ts">
	import { avatarOf, avatarTint } from '$lib/live/avatars';

	/** Emoji on a tinted disc. Size comes from the caller's classes. */
	let { avatar, class: cls = 'size-10 text-xl' }: { avatar: string; class?: string } = $props();

	const a = $derived(avatarOf(avatar));
	const tint = $derived(`var(--color-chart-${avatarTint(avatar)})`);
</script>

<span
	class="inline-grid shrink-0 place-items-center rounded-full leading-none select-none {cls}"
	style:background="color-mix(in srgb, {tint} 26%, transparent)"
	style:box-shadow="inset 0 0 0 1.5px color-mix(in srgb, {tint} 55%, transparent)"
	role="img"
	aria-label={a.label}
><span aria-hidden="true" class="translate-y-[0.03em]">{a.emoji}</span></span>
