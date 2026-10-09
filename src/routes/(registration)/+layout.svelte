<script>
	import '../../site.css';

	let { children } = $props();
</script>

<!-- Same head as main's index.html -->
<svelte:head>
	<link rel="icon" type="image/png" href="/logo.png" />
	<title>ZEN CODE 2026 | Hackathon &amp; Pitch Fest Registration</title>
	<meta name="description" content="Official registration page for ZEN CODE 2026 Hackathon and Pitch Fest. Register your team now." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<div id="app">{@render children()}</div>
