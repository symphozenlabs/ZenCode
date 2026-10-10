<script lang="ts">
	import QRCode from 'qrcode';

	/** QR drawn as one SVG path in currentColor, so it takes theme tokens. */
	let { value, label = 'QR code', class: cls = '' }: { value: string; label?: string; class?: string } = $props();

	const qr = $derived.by(() => {
		const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
		const n = modules.size;
		let d = '';
		for (let y = 0; y < n; y++) {
			let x = 0;
			while (x < n) {
				if (!modules.data[y * n + x]) {
					x++;
					continue;
				}
				const start = x;
				while (x < n && modules.data[y * n + x]) x++;
				d += `M${start} ${y}h${x - start}v1h${start - x}z`;
			}
		}
		return { d, n };
	});
</script>

<svg
	viewBox="-2 -2 {qr.n + 4} {qr.n + 4}"
	class={cls}
	role="img"
	aria-label={label}
	shape-rendering="crispEdges"
>
	<path d={qr.d} fill="currentColor" />
</svg>
