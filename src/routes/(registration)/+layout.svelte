<script>
	import '../../site.css';

	let { children } = $props();
</script>

<!-- Same head as main's index.html -->
<svelte:head>
	<link rel="icon" href="/favicon.ico" sizes="48x48" />
	<link rel="icon" href="/favicon.png" type="image/png" sizes="64x64" />
	<link rel="icon" href="/favicon-512.png" type="image/png" sizes="512x512" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<title>ZEN CODE 2026 | Hackathon &amp; Pitch Fest Registration</title>
	<meta name="description" content="Official registration page for ZEN CODE 2026 Hackathon and Pitch Fest. Register your team now." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<div id="app">{@render children()}</div>
