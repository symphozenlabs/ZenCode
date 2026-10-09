<script lang="ts">
	// Styles live in each area's layout: the registration site (from main) uses
	// src/site.css, the admin and games use Tailwind (src/app.css).
	let { children } = $props();
</script>

{@render children()}
