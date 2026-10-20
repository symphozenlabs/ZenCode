/**
 * A plain ZIP archive, written here in the browser. Entries are stored, not
 * compressed: certificate PNGs are compressed already, and storing keeps each
 * file a slice of its own Blob instead of one big buffer in memory.
 */

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** @param {Uint8Array} bytes */
function crc32(bytes) {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** The time and date fields of a ZIP header, in MS-DOS form. */
function dosTime(d) {
	return {
		time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
		date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
	};
}

const MAX = 0xffffffff;

/**
 * @param {{ name: string; data: Blob }[]} files
 * @returns {Promise<Blob>}
 */
export async function zipBlob(files) {
	const { time, date } = dosTime(new Date());
	const encoder = new TextEncoder();
	/** @type {BlobPart[]} */
	const parts = [];
	/** @type {Uint8Array[]} */
	const central = [];
	let offset = 0;

	for (const file of files) {
		const name = encoder.encode(file.name);
		const size = file.data.size;
		const crc = crc32(new Uint8Array(await file.data.arrayBuffer()));
		if (offset + 30 + name.length + size > MAX) throw new Error('Too many certificates for one ZIP — download fewer at a time.');

		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true); // version needed
		local.setUint16(6, 0x0800, true); // UTF-8 names
		local.setUint16(8, 0, true); // stored
		local.setUint16(10, time, true);
		local.setUint16(12, date, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, size, true);
		local.setUint32(22, size, true);
		local.setUint16(26, name.length, true);
		local.setUint16(28, 0, true);
		parts.push(local.buffer, name, file.data);

		const entry = new DataView(new ArrayBuffer(46));
		entry.setUint32(0, 0x02014b50, true);
		entry.setUint16(4, 20, true); // made by
		entry.setUint16(6, 20, true); // version needed
		entry.setUint16(8, 0x0800, true);
		entry.setUint16(10, 0, true);
		entry.setUint16(12, time, true);
		entry.setUint16(14, date, true);
		entry.setUint32(16, crc, true);
		entry.setUint32(20, size, true);
		entry.setUint32(24, size, true);
		entry.setUint16(28, name.length, true);
		// extra, comment, disk, attributes: all zero
		entry.setUint32(42, offset, true);
		const record = new Uint8Array(46 + name.length);
		record.set(new Uint8Array(entry.buffer), 0);
		record.set(name, 46);
		central.push(record);

		offset += 30 + name.length + size;
	}

	const centralSize = central.reduce((n, r) => n + r.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, centralSize, true);
	end.setUint32(16, offset, true);

	return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** Has the browser download `blob` as `name`. */
export function saveBlob(blob, name) {
	const url = URL.createObjectURL(blob);
	const a = Object.assign(document.createElement('a'), { href: url, download: name });
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
