<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { Users, SearchX, Flag, ArrowRight } from '@lucide/svelte';
	import { AVATARS } from '$lib/live/avatars';
	import { PlayerRoom } from '$lib/live/player.svelte';
	import { cleanNickname, formatCode, JOIN_CODE_RE, nicknameError } from '$lib/live/session';
	import { LIMITS } from '$lib/live/types';
	import { DUR, pop, rise, softFade } from '$lib/live/motion';
	import Logo from '$lib/components/site/Logo.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import Avatar from '$lib/components/live/Avatar.svelte';
	import AvatarPicker from '$lib/components/live/AvatarPicker.svelte';
	import ReconnectBanner from '$lib/components/live/ReconnectBanner.svelte';
	import PlayerLive from '$lib/components/live/PlayerLive.svelte';

	const code = page.params.code!;
	const room = new PlayerRoom(code);

	let title = $state('');
	let checking = $state(room.phase === 'profile');
	let nickname = $state('');
	let avatar = $state<string>(AVATARS[Math.floor(Math.random() * AVATARS.length)].id);
	let localError = $state('');

	// Runs once on mount. Untracked: re-running on phase changes would
	// restart the socket in the middle of joining.
	$effect(() => untrack(() => {
		if (!JOIN_CODE_RE.test(code)) {
			room.phase = 'missing';
			return;
		}
		const stop = room.socket.start();
		// New phone: confirm the code before asking for a nickname.
		if (room.phase === 'profile') {
			fetch(`/api/live/join/${code}`)
				.then(async (res) => {
					if (res.ok) title = (await res.json()).title;
					else if (res.status === 404) room.phase = 'missing';
				})
				.catch(() => {})
				.finally(() => (checking = false));
		}
		return stop;
	}));

	const serverError = $derived(
		room.error && ['nickname_taken', 'nickname_invalid', 'rate_limited', 'bad_request'].includes(room.error.code) ? room.error.message : ''
	);
	const error = $derived(localError || serverError);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const clean = cleanNickname(nickname);
		const problem = nicknameError(clean);
		if (problem) {
			localError = problem;
			return;
		}
		localError = '';
		room.join(clean, avatar);
	}

	const me = $derived(room.state?.me);
</script>

<svelte:head><title>{room.state?.title || title || 'Live session'} — ZenCode</title></svelte:head>

<ReconnectBanner status={room.phase === 'ready' || room.phase === 'connecting' ? room.socket.status : 'open'} />

<div class="flex min-h-dvh flex-col bg-cream text-ink">
	<header class="flex items-center justify-between gap-3 px-4 pt-5">
		<Logo tone="dark" />
		<span class="font-mono text-xs text-muted-foreground tabular">{formatCode(code)}</span>
	</header>

	<main class="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-8 pb-6">
		{#if room.phase === 'missing'}
			<div class="my-auto text-center" in:rise>
				<div class="mx-auto grid size-12 place-items-center rounded-lg bg-secondary text-secondary-foreground"><SearchX class="size-5" /></div>
				<h1 class="mt-4 text-xl font-semibold text-forest-950">We can’t find that session</h1>
				<p class="mt-1 text-[15px] text-muted-foreground">Check the code on the big screen and try again.</p>
				<Button href="/join" size="lg" class="mt-8 w-full">Enter a code</Button>
			</div>
		{:else if room.phase === 'ended'}
			<div class="my-auto text-center" in:rise>
				<div class="mx-auto grid size-12 place-items-center rounded-lg bg-secondary text-secondary-foreground"><Flag class="size-5" /></div>
				<h1 class="mt-4 text-xl font-semibold text-forest-950">This session has ended</h1>
				<p class="mt-1 text-[15px] text-muted-foreground">Thanks for playing.</p>
				<Button href="/join" variant="outline" size="lg" class="mt-8 w-full">Join another session</Button>
			</div>
		{:else if room.phase === 'connecting' || checking}
			<div class="space-y-4" aria-busy="true" aria-label="Connecting">
				<Skeleton class="h-4 w-24" />
				<Skeleton class="h-8 w-3/4" />
				<Skeleton class="mt-8 h-12 w-full" />
				<div class="grid grid-cols-4 gap-2.5">{#each Array(8) as _, i (i)}<Skeleton class="aspect-square h-auto rounded-lg" />{/each}</div>
			</div>
		{:else if room.phase === 'profile' || room.phase === 'joining'}
			<form class="flex flex-1 flex-col" onsubmit={submit} novalidate in:softFade>
				<div in:rise={{ y: 12, duration: DUR.stage }}>
					<p class="eyebrow truncate text-forest-700">{title || 'Live session'}</p>
					<h1 class="mt-2 font-display text-3xl font-semibold tracking-tight text-forest-950">Pick a name and a face</h1>
				</div>

				<div class="mt-7" in:rise={{ y: 12, duration: DUR.stage, delay: 60 }}>
					<label for="nick" class="text-[13px] font-medium text-foreground">Nickname</label>
					<input
						id="nick"
						bind:value={nickname}
						oninput={() => (localError = '')}
						maxlength={LIMITS.nickname}
						autocomplete="nickname"
						autocapitalize="words"
						enterkeyhint="go"
						placeholder="What should we call you?"
						aria-invalid={error ? 'true' : undefined}
						aria-describedby="nick-msg"
						class="mt-1.5 h-12 w-full rounded-lg border bg-card px-4 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 focus:border-ring focus:ring-4 focus:ring-ring/20
							{error ? 'border-destructive' : 'border-input'}"
					/>
					<p id="nick-msg" class="mt-1.5 min-h-5 text-sm {error ? 'text-destructive' : 'text-muted-foreground'}" aria-live="polite">
						{error || `${nickname.length}/${LIMITS.nickname}`}
					</p>
				</div>

				<div class="mt-3" in:rise={{ y: 12, duration: DUR.stage, delay: 120 }}>
					<p class="mb-2 text-[13px] font-medium text-foreground">Avatar</p>
					<AvatarPicker bind:value={avatar} />
				</div>

				<div class="sticky bottom-0 mt-auto bg-cream pt-6 pb-[env(safe-area-inset-bottom)]">
					<Button type="submit" size="xl" class="w-full" loading={room.phase === 'joining'}>
						{room.phase === 'joining' ? 'Joining…' : 'Join'}
						{#if room.phase !== 'joining'}<ArrowRight class="size-4" />{/if}
					</Button>
				</div>
			</form>
		{:else if room.phase === 'ready' && me && room.slide}
			<PlayerLive {room} />
		{:else if room.phase === 'ready' && me}
			<div class="my-auto text-center" in:softFade={{ duration: DUR.layout }}>
				<div class="relative mx-auto w-fit" in:pop={{ duration: DUR.stage, from: 0.3 }}>
					<span class="absolute inset-0 animate-ping rounded-full bg-green-300/30 [animation-duration:2.4s]" aria-hidden="true"></span>
					<Avatar avatar={me.avatar} class="relative size-28 text-6xl" />
				</div>
				<p class="mt-6 eyebrow text-forest-700" in:rise={{ y: 10, delay: 180 }}>You’re in</p>
				<h1 class="mt-2 font-display text-3xl font-semibold tracking-tight wrap-break-word text-forest-950" in:rise={{ y: 10, delay: 240 }}>
					{me.nickname}
				</h1>
				<p class="mt-3 text-[15px] text-muted-foreground" in:rise={{ y: 10, delay: 300 }}>
					{room.state?.status === 'live' ? 'Get ready — the next question is on its way.' : 'Look up at the big screen. The host will start soon.'}
				</p>
				<p class="mt-8 inline-flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground ring-1 ring-border" in:rise={{ y: 10, delay: 360 }}>
					<Users class="size-4 text-brand" aria-hidden="true" />
					<span class="tabular">{room.state?.playerCount ?? 1}</span>
					{room.state?.playerCount === 1 ? 'player' : 'players'} in the room
				</p>
			</div>
		{/if}
	</main>
</div>
