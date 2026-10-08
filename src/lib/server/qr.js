import QRCode from 'qrcode';

/**
 * Generates a Data URL (base64 image) representing a QR Code for a given payload string.
 *
 * @param {string} payload - The URL or text string to encode into the QR Code
 * @returns {Promise<string>} Base64 Data URL of the generated QR code PNG
 */
export async function generateTeamQRCode(payload) {
  try {
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      width: 300,
      color: {
        dark: '#0f172a',  // Dark navy dots
        light: '#ffffff'  // Pure white background
      }
    });
    return qrDataUrl;
  } catch (err) {
    console.error('Error generating QR code:', err);
    throw err;
  }
}
