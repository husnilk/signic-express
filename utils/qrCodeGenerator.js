const QRCode = require('qrcode');

/**
 * Generates a QR code for the given URL and returns it as a data URI string.
 *
 * @param {string} url The URL to encode in the QR code.
 * @returns {Promise<string>} A promise that resolves with the QR code data URI.
 * @throws {Error} If the URL is invalid or QR code generation fails.
 */
async function generateQrCode(url) {
  try {
    if (!url) {
      throw new Error('URL cannot be empty or null.');
    }
    // Basic URL validation (can be enhanced)
    new URL(url); // This will throw an error if the URL is invalid

    const qrCodeDataUri = await QRCode.toDataURL(url);
    return qrCodeDataUri;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    // Re-throw the error or return a specific error message/code
    // For now, re-throwing the original error to let the caller handle it.
    throw new Error(`Failed to generate QR code for URL "${url}": ${error.message}`);
  }
}

module.exports = {
  generateQrCode,
};
