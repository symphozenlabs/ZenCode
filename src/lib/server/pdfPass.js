import QRCode from 'qrcode';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function escapePdfText(value) {
  return String(value || '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfText(text, x, y, size = 12) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET\n`;
}

function rect(x, y, width, height) {
  return `${x} ${y} ${width} ${height} re f\n`;
}

function drawQrCode(checkInUrl, x, y, size) {
  const qr = QRCode.create(checkInUrl, { errorCorrectionLevel: 'H' });
  const moduleCount = qr.modules.size;
  const moduleSize = size / moduleCount;
  const commands = [];

  commands.push('1 1 1 rg\n');
  commands.push(rect(x - 8, y - 8, size + 16, size + 16));
  commands.push('0 0 0 rg\n');

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.modules.get(row, col)) continue;

      const rx = (x + col * moduleSize).toFixed(2);
      const ry = (y + (moduleCount - row - 1) * moduleSize).toFixed(2);
      const rSize = moduleSize.toFixed(2);
      commands.push(rect(rx, ry, rSize, rSize));
    }
  }

  return commands.join('');
}

function createPdf(content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

export function buildRegistrationPassPdfBase64({
  member,
  eventName,
  teamName,
  teamId,
  checkInUrl
}) {
  const studentName = member?.name || 'Participant';
  const admissionNumber = member?.admissionNumber || 'N/A';
  const yearOfStudy = member?.yearOfStudy || 'N/A';

  let content = '';
  content += '0.075 0.227 0.161 rg\n';
  content += rect(0, PAGE_HEIGHT - 130, PAGE_WIDTH, 130);
  content += '0.941 0.769 0.361 rg\n';
  content += rect(0, PAGE_HEIGHT - 133, PAGE_WIDTH, 3);
  content += '1 1 1 rg\n';
  content += pdfText('ZEN CODE 2026', 72, 730, 30);
  content += pdfText('Official Event Check-in Pass', 72, 704, 14);

  content += '0.095 0.275 0.18 rg\n';
  content += pdfText(eventName || 'Event', 72, 630, 20);
  content += '0.095 0.137 0.102 rg\n';
  content += pdfText(`Student: ${studentName}`, 72, 592, 14);
  content += pdfText(`Admission No: ${admissionNumber}`, 72, 566, 14);
  content += pdfText(`Year of Study: ${yearOfStudy}`, 72, 540, 14);
  content += pdfText(`Team: ${teamName || 'Registered Team'}`, 72, 514, 14);
  content += pdfText(`Team ID: ${teamId || 'N/A'}`, 72, 488, 14);

  content += '0.392 0.439 0.392 rg\n';
  content += pdfText('Present this pass or the QR code in your email at the event check-in desk.', 72, 430, 11);
  content += pdfText('This pass is issued exclusively for ZEN CODE 2026.', 72, 414, 11);

  content += '0.095 0.275 0.18 rg\n';
  content += pdfText('Team QR Code', 410, 620, 12);
  content += drawQrCode(checkInUrl, 374, 456, 150);

  return createPdf(content).toString('base64');
}
