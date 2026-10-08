<script lang="ts">
	import { page } from '$app/state';
	import type { EventConfig } from '$lib/config/site';
	import RegistrationPage from '$lib/components/registration/RegistrationPage.svelte';

	let { data } = $props();

	// Admins close registration from /admin/{event} → Event settings.
	const isClosed = (ev: EventConfig) =>
		!ev.registrationOpen ||
		(!!ev.registrationDeadline && Date.now() > new Date(`${ev.registrationDeadline}T23:59:59`).getTime());

	const closed = $derived({
		hackathon: isClosed(data.config.events.hackathon),
		pitchfest: isClosed(data.config.events['pitch-fest'])
	});
	const initialEvent = page.url.searchParams.get('event') === 'pitch-fest' ? 'pitchfest' : 'hackathon';
</script>

<svelte:head>
	<title>Register — {data.config.name}</title>
	<meta name="description" content="Register your team for the {data.config.name} Hackathon and Pitch Fest." />
</svelte:head>

<RegistrationPage {initialEvent} {closed} />
