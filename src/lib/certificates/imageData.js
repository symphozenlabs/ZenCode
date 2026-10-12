/**
 * Reads an image file into a data URL no larger than `maxSide` pixels on its
 * longest side, so it can live inside a certificate design. PNGs (logos,
 * signatures, anything with transparency) stay PNG; photos become JPEG.
 * SVGs are kept as they are: they are already small and scale cleanly.
 * `opaque` makes everything a JPEG on white, for a full-page scan where
 * transparency buys nothing and PNG would weigh megabytes.
 *
 * @param {File} file
 * @param {number} [maxSide]
 * @param {{ opaque?: boolean }} [options]
 * @returns {Promise<{ src: string, width: number, height: number }>}
 */
export async function readImage(file, maxSide = 1600, { opaque = false } = {}) {
	if (!file?.type?.startsWith('image/')) throw new Error('That file is not an image.');
	if (file.size > 15_000_000) throw new Error('That image is over 15 MB. Choose a smaller one.');

	const original = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error('Could not read that file.'));
		reader.readAsDataURL(file);
	});

	const img = await new Promise((resolve, reject) => {
		const el = new Image();
		el.onload = () => resolve(el);
		el.onerror = () => reject(new Error('Could not open that image.'));
		el.src = original;
	});
	const width = img.naturalWidth || 300;
	const height = img.naturalHeight || 300;

	if (file.type === 'image/svg+xml' && !opaque) return { src: original, width, height };

	const scale = Math.min(1, maxSide / Math.max(width, height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);
	const context = canvas.getContext('2d');
	if (opaque) {
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(img, 0, 0, canvas.width, canvas.height);

	const keepAlpha =
		!opaque &&
		(file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif');
	const src = keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.82);
	return { src, width: canvas.width, height: canvas.height };
}
