<script>
	import CertificateElement from './CertificateElement.svelte';
	import CertificateHtml from './CertificateHtml.svelte';

	/**
	 * A whole certificate, drawn at `scale` (1 = true size, 96 dpi). Used for
	 * thumbnails, the print sheet and the verify page; the editor draws the
	 * same elements with its own handles on top.
	 *
	 * With `fit`, `scale` is ignored and the page shrinks to fit inside its
	 * parent's box, centred, whatever its size or orientation.
	 */
	let {
		design,
		values = null,
		qrText = '',
		scale = 1,
		fit = false,
		class: className = ''
	} = $props();

	const page = $derived(design.page);

	let boxWidth = $state(0);
	let boxHeight = $state(0);
	const shown = $derived(
		fit
			? boxWidth && boxHeight
				? Math.min(boxWidth / page.width, boxHeight / page.height)
				: 0
			: scale
	);
</script>

{#snippet frame()}
	<div
		class="cp-frame {className}"
		style:width="{page.width * shown}px"
		style:height="{page.height * shown}px"
	>
		<div
			class="cp-page"
			style:width="{page.width}px"
			style:height="{page.height}px"
			style:transform="scale({shown})"
			style:background-color={page.background}
			style:background-image={page.backgroundImage ? `url(${page.backgroundImage})` : 'none'}
		>
			{#if page.html}<CertificateHtml {page} {values} {qrText} />{/if}
			{#each design.elements as el (el.id)}
				<CertificateElement {el} {values} {qrText} />
			{/each}
		</div>
	</div>
{/snippet}

{#if fit}
	<div class="cp-fit" bind:clientWidth={boxWidth} bind:clientHeight={boxHeight}>
		{#if shown}{@render frame()}{/if}
	</div>
{:else}
	{@render frame()}
{/if}

<style>
	.cp-fit {
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		overflow: hidden;
	}

	.cp-frame {
		position: relative;
		overflow: hidden;
		flex-shrink: 0;
	}

	.cp-page {
		position: absolute;
		top: 0;
		left: 0;
		overflow: hidden;
		transform-origin: 0 0;
		background-size: cover;
		background-position: center;
	}
</style>
