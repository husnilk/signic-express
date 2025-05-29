const express = require('express');
const router = express.Router();
const {
  createSignatureRequest,
  getSignatureRequests, // This is for the logged-in user as signer, getting their pending requests
  approveSignatureRequest,
  rejectSignatureRequest,
  // The following are existing functions that might be used by other routes if kept
  // listSignatureRequests, 
  // getSignatureRequestById,
  // updateSignatureRequest,
  // cancelSignatureRequest
} = require('../controllers/signatureRequestController');
const authMiddleware = require('../authMiddleware');

// Apply authMiddleware to all routes in this router
router.use(authMiddleware);

// POST / - Create a new signature request
router.post('/', createSignatureRequest);

// GET / - Get signature requests for the logged-in user (as signer, pending)
router.get('/', getSignatureRequests);

// POST /:id/approve - Approve a specific signature request
// :id refers to signatureRequestId
router.post('/:id/approve', approveSignatureRequest);

// POST /:id/reject - Reject a specific signature request
// :id refers to signatureRequestId
router.post('/:id/reject', rejectSignatureRequest);

// Note: Other routes from the original file (GET /:id, PUT /:id, etc.) have been omitted
// to focus on the specific requirements of the subtask. They can be added back if needed.

module.exports = router;
