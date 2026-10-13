<script>
	import { filledHtml, layerBox } from '$lib/certificates/htmlCert.js';

	/**
	 * The page layer of an uploaded HTML certificate, in a sandboxed frame
	 * (no scripts, no same-origin access) laid out exactly as it was uploaded,
	 * then scaled onto the page and cropped to the certificate box.
	 */
	let { page, values = null, qrText = '' } = $props();

	const layer = $derived(page.html);
	const box = $derived(layerBox(page, layer));
	const doc = $derived(filledHtml(layer, values, qrText));
</script>

<div
	class="ch"
	style:left="{box.left}px"
	style:top="{box.top}px"
	style:width="{box.w}px"
	style:height="{box.h}px"
	aria-hidden="true"
>
	<iframe
		title=""
		tabindex="-1"
		sandbox=""
		srcdoc={doc}
		style:width="{layer.viewW}px"
		style:height="{layer.viewH}px"
		style:transform="translate({-layer.crop.x * box.k}px, {-layer.crop.y * box.k}px) scale({box.k})"
	></iframe>
</div>

<style>
	.ch {
		position: absolute;
		overflow: hidden;
		pointer-events: none;
	}

	iframe {
		position: absolute;
		top: 0;
		left: 0;
		border: 0;
		background: transparent;
		transform-origin: 0 0;
		pointer-events: none;
	}
</style>
