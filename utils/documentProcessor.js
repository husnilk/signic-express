const fs = require('fs/promises');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Embeds a QR code image onto each page of a PDF document.
 *
 * @param {string} documentPath Path to the PDF document.
 * @param {string} qrCodeImageDataUri QR code image as a data URI.
 * @returns {Promise<Uint8Array>} A promise that resolves with the modified PDF document as a Uint8Array.
 * @throws {Error} If PDF loading, QR embedding, or saving fails.
 */
async function embedQrCode(documentPath, qrCodeImageDataUri) {
  try {
    if (!documentPath) {
      throw new Error('Document path cannot be empty or null.');
    }
    if (!qrCodeImageDataUri) {
      throw new Error('QR code image data URI cannot be empty or null.');
    }

    const pdfBytes = await fs.readFile(documentPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Convert data URI to Uint8Array
    // Assumes PNG data URI: "data:image/png;base64,..."
    const base64Data = qrCodeImageDataUri.split(',')[1];
    if (!base64Data) {
        throw new Error('Invalid QR code data URI format.');
    }
    const qrImageBytes = Buffer.from(base64Data, 'base64');

    const qrImage = await pdfDoc.embedPng(qrImageBytes);
    const qrDims = qrImage.scale(0.25); // Scale the QR code to 25% of its original size

    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      // Embed in top-right corner (adjust margins as needed)
      page.drawImage(qrImage, {
        x: width - qrDims.width - 20, // 20 points margin from right
        y: height - qrDims.height - 20, // 20 points margin from top
        width: qrDims.width,
        height: qrDims.height,
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    return modifiedPdfBytes;

  } catch (error) {
    console.error(`Failed to embed QR code in PDF "${documentPath}":`, error);
    throw new Error(`Failed to embed QR code: ${error.message}`);
  }
}

/**
 * Placeholder function for embedding a digital certificate into a document.
 *
 * @param {string} documentPath Path to the document.
 * @param {object} certificateDetails Abstract details of the certificate.
 * @returns {Promise<string>} A promise that resolves with the original document path (mock success).
 * @throws {Error} If basic validation fails.
 */
async function embedCertificate(documentPath, certificateDetails) {
  try {
    if (!documentPath) {
      throw new Error('Document path cannot be empty or null.');
    }
    if (!certificateDetails) {
      throw new Error('Certificate details cannot be empty or null.');
    }

    console.log(`Placeholder: Digital certificate embedding for "${documentPath}" with details:`, certificateDetails);
    // In a real implementation, this would involve modifying the PDF to include certificate data.
    // For now, just returning the original path as a mock.
    return documentPath;

  } catch (error) {
    console.error(`Failed to (placeholder) embed certificate in PDF "${documentPath}":`, error);
    throw new Error(`Failed to (placeholder) embed certificate: ${error.message}`);
  }
}

module.exports = {
  embedQrCode,
  embedCertificate,
};
