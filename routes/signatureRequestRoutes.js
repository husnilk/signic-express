const express = require('express');
const router = express.Router();
const signatureRequestController = require('../controllers/signatureRequestController');
const authMiddleware = require('../authMiddleware'); // Assuming this path and that it exports a middleware function

// Apply authMiddleware to all routes in this router
router.use(authMiddleware);

// Define the routes

// POST / - Create a new signature request
router.post('/', signatureRequestController.createSignatureRequest);

// GET / - List all signature requests (filtered by user context in controller)
// Also handles queries like /?document_id=... or /?signer_id=... or /?requester_id=... or /?status=...
router.get('/', signatureRequestController.listSignatureRequests);

// GET /:id - Get a specific signature request by its ID
router.get('/:id', signatureRequestController.getSignatureRequestById);

// PUT /:id - Update a specific signature request (e.g., by signer to approve/reject)
router.put('/:id', signatureRequestController.updateSignatureRequest);

// PUT /:id/cancel - Cancel a specific signature request (by requester)
router.put('/:id/cancel', signatureRequestController.cancelSignatureRequest);

// GET /document/:documentId - List signature requests filtered by documentId
// The controller's listSignatureRequests function should be able to handle
// documentId from req.params or req.query. We'll make it expect from query for consistency.
// To make this route work as intended, the controller needs to be aware of `req.params.documentId`
// For now, this route will work if listSignatureRequests is adapted or if we pass it via query.
// A simple way is to modify the request object before it hits the controller or adapt controller.
// Let's assume the controller can already handle `document_id` as a query parameter.
// This specific route structure might be better if the controller expects `documentId` from `req.params`.
// For simplicity, and to align with typical REST patterns where path params identify resources,
// we'll assume `listSignatureRequests` can be adapted or this implies a specific type of listing.
// However, the prompt says "controller will handle filtering by documentId if present as a param or query".
// We can make the controller aware of req.params.documentId by slightly modifying the call.
router.get('/document/:documentId', (req, res, next) => {
  // Make documentId from path param available as a query param for the controller
  // This is a common pattern if the controller is designed to primarily use query params for filtering.
  req.query.document_id = req.params.documentId;
  signatureRequestController.listSignatureRequests(req, res, next);
});

// GET /user/:userId - List signature requests filtered by userId (as requester or signer)
// Similar to the /document/:documentId route, we'll pass userId as a query parameter.
// The controller's `listSignatureRequests` is expected to handle `requester_id` or `signer_id` from query.
// This route implies listing requests *related* to a user (either requested by them or to be signed by them).
// The controller's existing logic for `listSignatureRequests` already handles contextually filtering
// for the authenticated user (req.user.id). If :userId is different from req.user.id,
// this implies an admin-like functionality or specific sharing rules not yet defined.
// For now, let's assume this means "list requests where req.params.userId is the requester".
// Or, if the controller's `listSignatureRequests` is advanced, it might interpret this.
// Let's forward it as requester_id for now.
router.get('/user/:userId', (req, res, next) => {
  // This route is ambiguous. Does it mean "requests requested BY :userId" or "requests to be signed BY :userId"?
  // Or both? The controller already has role-based filtering.
  // For this example, let's assume it's for requests *requested by* :userId.
  // The controller would need to be aware of this specific use case.
  // A better approach would be for the controller to check `req.user.id` for authorization
  // if `req.query.requester_id` or `req.query.signer_id` is used.
  req.query.requester_id = req.params.userId; // Or handle more complex logic in controller
  signatureRequestController.listSignatureRequests(req, res, next);
});

module.exports = router;
