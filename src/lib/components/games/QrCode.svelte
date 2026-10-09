<script lang="ts">
	import qrcode from 'qrcode-generator';

	let { value, class: cls = '', label = 'QR code' }: { value: string; class?: string; label?: string } = $props();

	const QUIET = 3;
	const qr = $derived.by(() => {
		const code = qrcode(0, 'M');
		code.addData(value);
		code.make();
		const n = code.getModuleCount();
		let d = '';
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
		return { size: n + QUIET * 2, d };
	});
</script>

<!-- QR codes need a light quiet zone to scan, so this is always white on forest. -->
<svg viewBox="0 0 {qr.size} {qr.size}" class="block h-auto w-full rounded-lg {cls}" role="img" aria-label={label} shape-rendering="crispEdges">
	<rect width={qr.size} height={qr.size} fill="white" />
	<path d={qr.d} fill="var(--color-forest-950)" />
</svg>
