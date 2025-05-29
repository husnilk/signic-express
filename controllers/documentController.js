const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '..', 'uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper function for error responses, similar to other controllers
const errorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ error: message });
};

// Controller Functions
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { title, description, owner_id } = req.body;
    const uploader_id = req.user.id; // Assuming req.user.id is set by auth middleware

    if (!title || !owner_id || !uploader_id) {
      fs.unlinkSync(req.file.path); // Delete uploaded file if metadata is missing
      return res.status(400).json({ error: 'Missing required fields: title, owner_id.' });
    }
    
    const ownerIdInt = parseInt(owner_id);
    if (isNaN(ownerIdInt)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid owner_id format.' });
    }


    const document = await prisma.document.create({
      data: {
        title,
        description,
        uploader_id: parseInt(uploader_id),
        owner_id: ownerIdInt,
        original_filename: req.file.originalname,
        stored_filename: req.file.filename,
        storage_path: req.file.path,
        filesize: req.file.size,
        status: 'uploaded', // Initial status
      },
    });
    res.status(201).json(document);
  } catch (error) {
    console.error('Error uploading document:', error);
    if (req.file && req.file.path) {
      // Attempt to delete the file if an error occurs after upload
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file after upload error:', unlinkError);
      }
    }
    res.status(500).json({ error: 'Failed to upload document.' });
  }
};

const listDocuments = async (req, res) => {
  try {
    const { skip, take } = req.query;
    const documents = await prisma.document.findMany({
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
    });
    res.status(200).json(documents);
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
};

const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await prisma.document.findUnique({
      where: { id },
    });
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    res.status(200).json(document);
  } catch (error) {
    console.error('Error getting document by ID:', error);
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
};

const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, owner_id, status } = req.body;
    
    let ownerIdInt;
    if (owner_id !== undefined) {
        ownerIdInt = parseInt(owner_id);
        if (isNaN(ownerIdInt)) {
            return res.status(400).json({ error: 'Invalid owner_id format.' });
        }
    }

    const document = await prisma.document.update({
      where: { id },
      data: {
        title,
        description,
        owner_id: ownerIdInt,
        status,
      },
    });
    res.status(200).json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    if (error.code === 'P2025') { // Prisma error code for record not found
        return res.status(404).json({ error: 'Document not found.' });
    }
    res.status(500).json({ error: 'Failed to update document.' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete file from filesystem
    if (fs.existsSync(document.storage_path)) {
      fs.unlinkSync(document.storage_path);
    } else {
      console.warn(`File not found for deletion: ${document.storage_path}. Proceeding to delete DB record.`);
    }
    

    await prisma.document.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('Error deleting document:', error);
     if (error.code === 'P2025') {
        // This case might be redundant due to the check above, but good for safety
        return res.status(404).json({ error: 'Document not found.' });
    }
    res.status(500).json({ error: 'Failed to delete document.' });
  }
};

const searchDocuments = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required.' });
    }
    const documents = await prisma.document.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { original_filename: { contains: q, mode: 'insensitive' } },
        ],
      },
    });
    res.status(200).json(documents);
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents.' });
  }
};

module.exports = {
  uploadDocument,
  listDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  searchDocuments,
  upload // Export multer instance for use in routes
};

// --- Add verifyDocumentSignature function here ---

async function verifyDocumentSignature(req, res) {
  const { signatureRequestId: signatureRequestIdStr } = req.params;

  const signatureRequestId = parseInt(signatureRequestIdStr);
  if (isNaN(signatureRequestId)) {
    return errorResponse(res, 400, `Invalid Signature Request ID format: "${signatureRequestIdStr}". Must be an integer.`);
  }

  try {
    const signatureRequest = await prisma.signatureRequest.findUnique({
      where: { id: signatureRequestId },
      include: {
        document: { 
          select: { 
            title: true, 
            original_filename: true, 
            // Consider adding other fields like owner_id or uploader_id if relevant for verification context
          } 
        },
        signer: { 
          select: { 
            id: true, // It's good practice to include ID
            email: true, 
            // Add 'name' if your User model has it and it's appropriate to display
          } 
        },
        requester: { 
          select: { 
            id: true,
            email: true,
            // Add 'name' if your User model has it
          } 
        },
      },
    });

    if (!signatureRequest) {
      return errorResponse(res, 404, `Signature Request with ID ${signatureRequestId} not found.`);
    }

    // Construct the response object
    const verificationDetails = {
      signatureRequestId: signatureRequest.id,
      status: signatureRequest.status,
      processedAt: signatureRequest.updatedAt, // Timestamp of approval/rejection
      document: signatureRequest.document ? {
        title: signatureRequest.document.title,
        originalFilename: signatureRequest.document.original_filename,
      } : null,
      signer: signatureRequest.signer ? {
        email: signatureRequest.signer.email,
        // name: signatureRequest.signer.name, // Uncomment if name exists and is selected
      } : null,
      requester: signatureRequest.requester ? {
        email: signatureRequest.requester.email,
        // name: signatureRequest.requester.name, // Uncomment if name exists and is selected
      } : null,
    };

    if (signatureRequest.status === 'REJECTED') {
      verificationDetails.rejectionReason = signatureRequest.rejectionReason;
    }
    
    if (signatureRequest.status === 'APPROVED') {
      // For approved documents, you might want to include a way to access/verify the actual signed document.
      // qrCodeUrl was stored with the full URL or relative path during approval.
      verificationDetails.verificationUrlUsedInQr = signatureRequest.qrCodeUrl; 
      // signedDocumentPath is sensitive, decide if it should be exposed or if a download link is better.
      // For now, not exposing direct path.
    }

    return res.status(200).json(verificationDetails);

  } catch (error) {
    console.error(`Error verifying signature request ${signatureRequestId}:`, error);
    // Check for Prisma's specific error code for "record not found" - though findUnique should handle this with returning null.
    // This is more for mutation operations, but good to be aware of.
    if (error.code === 'P2025') { 
        return errorResponse(res, 404, `Error locating related data for Signature Request ${signatureRequestId}.`);
    }
    return errorResponse(res, 500, 'Failed to verify signature request due to an internal server error.');
  }
}

// Add the new function to module.exports
module.exports = {
  uploadDocument,
  listDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  searchDocuments,
  verifyDocumentSignature, // Added new function
  upload 
};
