const express = require('express');
const router = express.Router();
const {
  uploadDocument,
  listDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  searchDocuments,
  verifyDocumentSignature, // Added import
  upload // Multer instance from controller
} = require('../controllers/documentController');
const authMiddleware = require('../authMiddleware'); // Assuming authMiddleware.js is in the parent directory

// Verification route - placed before router.use(authMiddleware) if it needs to be public.
// For now, placing it after, so it will be protected by authMiddleware.
// Consider if this route should be public or if auth context is useful.
router.get('/verify/signature/:signatureRequestId', verifyDocumentSignature);

// Apply authMiddleware to all document routes that follow
router.use(authMiddleware);

// Route for uploading a new document
// The 'document' string in upload.single('document') is the name of the file input field in the form
router.post('/', upload.single('document'), uploadDocument);

// Route for searching documents
router.get('/search', searchDocuments);

// Route for listing all documents
router.get('/', listDocuments);

// Route for retrieving a specific document by its ID
router.get('/:id', getDocumentById);

// Route for updating a specific document by its ID
router.put('/:id', updateDocument);

// Route for deleting a specific document by its ID
router.delete('/:id', deleteDocument);

module.exports = router;
