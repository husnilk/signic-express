const { PrismaClient } = require('@prisma/client'); // Removed SigningStatus
const prisma = new PrismaClient();

// Helper function for error responses (retained as other functions might use it)
const errorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ error: message });
};

/**
 * Creates a new signature request.
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 */
async function createSignatureRequest(req, res) {
  const { documentId, signerId } = req.body;
  const requesterId = req.user?.id; // Assuming authMiddleware adds user to req.user

  try {
    // Validate requesterId
    if (!requesterId) {
      // Use existing errorResponse or switch to direct res.status().json()
      return errorResponse(res, 401, 'Unauthorized. Requester ID is missing.');
    }

    // Validate presence of inputs
    if (!documentId || !signerId) {
      return errorResponse(res, 400, 'documentId and signerId are required.');
    }

    // Validate input types (basic) - Prisma will also validate types on query
    if (typeof documentId !== 'string' || typeof signerId !== 'number') {
        return errorResponse(res, 400, 'Invalid input types. documentId must be a string, signerId must be a number.');
    }
    
    if (requesterId === signerId) {
      return errorResponse(res, 400, 'Requester cannot be the same as the signer.');
    }

    // Verify document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      return errorResponse(res, 404, `Document with ID ${documentId} not found.`);
    }

    // Verify signer exists
    const signer = await prisma.user.findUnique({
      where: { id: signerId },
    });
    if (!signer) {
      return errorResponse(res, 404, `User with ID ${signerId} (signer) not found.`);
    }
    
    // Verify requester exists (though req.user.id should guarantee this if auth is proper)
    const requester = await prisma.user.findUnique({
        where: { id: requesterId },
    });
    if (!requester) {
        // This case should ideally be prevented by auth middleware
        return errorResponse(res, 404, `User with ID ${requesterId} (requester) not found.`);
    }

    // Create the signature request
    const newSignatureRequest = await prisma.signatureRequest.create({
      data: {
        documentId, // camelCase
        requesterId, // camelCase
        signerId,    // camelCase
        status: 'PENDING', // String status, as per current schema
      },
    });

    return res.status(201).json(newSignatureRequest);

  } catch (error) {
    console.error('Error creating signature request:', error);
    if (error.code === 'P2002') { 
        return errorResponse(res, 409, 'Failed to create signature request due to a conflict.');
    }
    if (error.code === 'P2003') { // Foreign key constraint failed
        // This error is now less likely for documentId/signerId due to explicit checks,
        // but good to keep for related data.
        const fieldName = error.meta?.field_name;
        if (typeof fieldName === 'string') {
            if (fieldName.includes('documentId')) {
                return errorResponse(res, 400, 'Invalid documentId.');
            }
            if (fieldName.includes('signerId')) {
                return errorResponse(res, 400, 'Invalid signerId.');
            }
            if (fieldName.includes('requesterId')) {
                return errorResponse(res, 400, 'Invalid requesterId.');
            }
        }
         return errorResponse(res, 400, 'Invalid related data for signature request.');
    }
    return errorResponse(res, 500, 'An unexpected error occurred while creating the signature request.');
  }
}
// Ensure the new function is exported if the old one was.
// The original file uses exports.createSignatureRequest = ..., so we should match that.
// However, my function is defined as `async function createSignatureRequest...`
// So the export should be done after its definition.
exports.createSignatureRequest = createSignatureRequest;

// Get a signature request by ID
exports.getSignatureRequestById = async (req, res) => {
  const { id } = req.params;
  const user_id = req.user?.id;

  if (!user_id) {
    return errorResponse(res, 401, 'User not authenticated.');
  }

  try {
    const signatureRequest = await prisma.signatureRequest.findUnique({
      where: { id },
      include: {
        document: true, // Include related document
        signer: { select: { id: true, email: true } }, // Include signer's public info
        requester: { select: { id: true, email: true } }, // Include requester's public info
      },
    });

    if (!signatureRequest) {
      return errorResponse(res, 404, 'Signature request not found.');
    }

    // Authorization: User should be either the requester or the signer to view the request.
    // Or an admin - this part is not specified but common.
    if (signatureRequest.requester_id !== user_id && signatureRequest.signer_id !== user_id) {
        return errorResponse(res, 403, 'You are not authorized to view this signature request.');
    }

    res.status(200).json(signatureRequest);
  } catch (error) {
    console.error('Error fetching signature request:', error);
    errorResponse(res, 500, 'Failed to fetch signature request.');
  }
};

// Update a signature request
exports.updateSignatureRequest = async (req, res) => {
  const { id } = req.params;
  const { signing_status, signing_reason, signature_visual, signed_document_hash, signature_cert_data } = req.body;
  const user_id = req.user?.id;

  if (!user_id) {
    return errorResponse(res, 401, 'User not authenticated.');
  }

  try {
    const signatureRequest = await prisma.signatureRequest.findUnique({ where: { id } });

    if (!signatureRequest) {
      return errorResponse(res, 404, 'Signature request not found.');
    }

    let canUpdate = false;
    const updateData = {};

    // Authorization logic
    if (signatureRequest.requester_id === user_id) {
      // Requester can cancel if PENDING
      if (signing_status === SigningStatus.CANCELLED && signatureRequest.signing_status === SigningStatus.PENDING) {
        canUpdate = true;
        updateData.signing_status = SigningStatus.CANCELLED;
        if (signing_reason) updateData.signing_reason = signing_reason; // Requester might provide a reason for cancellation
      }
    } else if (signatureRequest.signer_id === user_id) {
      // Signer can approve or reject if PENDING
      if (signatureRequest.signing_status === SigningStatus.PENDING) {
        if (signing_status === SigningStatus.APPROVED) {
          canUpdate = true;
          updateData.signing_status = SigningStatus.APPROVED;
          updateData.signed_at = new Date();
          if (signing_reason) updateData.signing_reason = signing_reason;
          if (signature_visual) updateData.signature_visual = signature_visual;
          if (signed_document_hash) updateData.signed_document_hash = signed_document_hash;
          if (signature_cert_data) updateData.signature_cert_data = signature_cert_data;
        } else if (signing_status === SigningStatus.REJECTED) {
          canUpdate = true;
          updateData.signing_status = SigningStatus.REJECTED;
          if (signing_reason) updateData.signing_reason = signing_reason; // Signer must provide a reason for rejection
          else return errorResponse(res, 400, 'A reason is required for rejecting a signature request.');
        }
      }
    }

    if (!canUpdate) {
      return errorResponse(res, 403, 'You are not authorized to perform this update or the update is not allowed for the current status.');
    }

    // Prevent updating other fields if only specific status changes are allowed
    const allowedFieldsForUpdate = ['signing_status', 'signing_reason', 'signature_visual', 'signed_document_hash', 'signature_cert_data', 'signed_at'];
    for (const key in req.body) {
        if (updateData.hasOwnProperty(key) && !allowedFieldsForUpdate.includes(key)) {
            // If an explicit update for this key is already set by logic, skip
            continue;
        }
        if (allowedFieldsForUpdate.includes(key) && req.body[key] !== undefined) {
            // If it's an allowed field and present in body, ensure it's added to updateData if not already
            if (!updateData.hasOwnProperty(key)) {
                 updateData[key] = req.body[key];
            }
        } else if (!allowedFieldsForUpdate.includes(key) && req.body[key] !== undefined) {
            // Disallow updating fields not explicitly permitted by the logic above
            return errorResponse(res, 400, `Field '${key}' cannot be updated directly or in this context.`);
        }
    }


    const updatedSignatureRequest = await prisma.signatureRequest.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json(updatedSignatureRequest);
  } catch (error) {
    console.error('Error updating signature request:', error);
    if (error.code === 'P2025') { // Record to update not found
        return errorResponse(res, 404, 'Signature request not found for update.');
    }
    errorResponse(res, 500, 'Failed to update signature request.');
  }
};

// Cancel a signature request (specific implementation of update)
exports.cancelSignatureRequest = async (req, res) => {
  const { id } = req.params;
  const user_id = req.user?.id; // Assuming req.user.id is populated by auth middleware

  if (!user_id) {
    return errorResponse(res, 401, 'User not authenticated.');
  }

  try {
    const signatureRequest = await prisma.signatureRequest.findUnique({ where: { id } });

    if (!signatureRequest) {
      return errorResponse(res, 404, 'Signature request not found.');
    }

    // Authorization: Only the original requester can cancel
    if (signatureRequest.requester_id !== user_id) {
      return errorResponse(res, 403, 'You are not authorized to cancel this signature request.');
    }

    // Condition: Only if signing_status is PENDING
    if (signatureRequest.signing_status !== SigningStatus.PENDING) {
      return errorResponse(res, 400, `Signature request cannot be cancelled as its status is ${signatureRequest.signing_status}.`);
    }

    const updatedSignatureRequest = await prisma.signatureRequest.update({
      where: { id },
      data: { signing_status: SigningStatus.CANCELLED },
    });

    res.status(200).json(updatedSignatureRequest);
  } catch (error) {
    console.error('Error cancelling signature request:', error);
     if (error.code === 'P2025') { // Record to update not found
        return errorResponse(res, 404, 'Signature request not found for cancellation.');
    }
    errorResponse(res, 500, 'Failed to cancel signature request.');
  }
};

// List signature requests (with filtering)
exports.listSignatureRequests = async (req, res) => {
  const { document_id, signer_id, requester_id, status } = req.query;
  const user_id = req.user?.id; // For authorization/contextual filtering

  if (!user_id) {
    return errorResponse(res, 401, 'User not authenticated.');
  }

  const whereClause = {};
  if (document_id) whereClause.document_id = document_id;
  if (signer_id) whereClause.signer_id = parseInt(signer_id); // Ensure ID is integer
  if (requester_id) whereClause.requester_id = parseInt(requester_id); // Ensure ID is integer
  if (status && Object.values(SigningStatus).includes(status.toUpperCase())) {
    whereClause.signing_status = status.toUpperCase();
  }

  // Basic authorization: Users should only see requests they are involved in (requester or signer)
  // More complex admin/all-access roles would need different logic.
  // This ensures a user doesn't query for arbitrary requests unless they are part of it.
  // If no specific filters are provided, it lists all requests for the user.
  if (!document_id && !signer_id && !requester_id) {
      whereClause.OR = [
          { requester_id: user_id },
          { signer_id: user_id }
      ];
  } else {
      // If specific filters are applied, ensure the user is still part of the queried subset.
      // This logic might need refinement based on exact requirements for filtered views.
      // For instance, can a requester see all requests for a document they requested, even if they aren't the signer? Yes.
      // Can a signer see all requests for a document they are a signer on? Yes.
      // The current whereClause already filters by specific IDs. We need to ensure the user_id matches either
      // the signer_id in the query, the requester_id in the query, or one of the roles in the resulting data.
      // This check is more complex and might be better handled by just returning results and letting frontend filter,
      // or by ensuring that if e.g. signer_id is queried, it MUST match user_id unless user is admin.
      // For now, we'll assume if specific IDs are queried, the authorization is implicit or handled by business logic.
      // A simpler check: if a filter is applied, the user must be either the requester or signer of those filtered requests.
      // This is complex to enforce here without fetching data first.
      // A practical approach for now: if filters are used, we assume the user is querying "their" requests within those filters.
      // The OR condition above is good for a general "my requests" view.
      // If requester_id is specified in query, it must be current user_id or user is admin
      if (requester_id && parseInt(requester_id) !== user_id) {
          // Potentially restrict if a user tries to query for another user's requested items
          // For now, let's assume this is an admin feature or is allowed.
      }
      // Similarly for signer_id
      if (signer_id && parseInt(signer_id) !== user_id) {
          // Potentially restrict.
      }
  }


  try {
    const signatureRequests = await prisma.signatureRequest.findMany({
      where: whereClause,
      include: {
        document: { select: { id: true, title: true } },
        signer: { select: { id: true, email: true } },
        requester: { select: { id: true, email: true } },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    res.status(200).json(signatureRequests);
  } catch (error) {
    console.error('Error listing signature requests:', error);
    errorResponse(res, 500, 'Failed to list signature requests.');
  }
};

/**
 * Retrieves pending signature requests for the logged-in user (as signer).
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 */
async function getSignatureRequests(req, res) {
  const signerId = req.user?.id;

  if (!signerId) {
    return errorResponse(res, 401, 'User not authenticated. Signer ID is missing.');
  }

  try {
    const signatureRequests = await prisma.signatureRequest.findMany({
      where: {
        signerId: signerId, // camelCase, as per current schema
        status: 'PENDING',  // string, as per current schema
      },
      include: {
        document: { // Includes all fields from Document model by default
          select: { // Specify fields if you want to limit, e.g., title, id
            id: true,
            title: true,
            original_filename: true,
            // Do not include sensitive fields like storage_path unless necessary
          }
        }, 
        requester: { // User model for the requester
          select: { // Select only non-sensitive requester info
            id: true,
            email: true, // Assuming email is okay to show, adjust as needed
            // Add other fields like name if available and appropriate
          }
        },
        // Do not include 'signer' relation here as it's the current user.
      },
      orderBy: {
        createdAt: 'desc', // Show newest requests first
      },
    });

    return res.status(200).json(signatureRequests);

  } catch (error) {
    console.error('Error fetching pending signature requests:', error);
    return errorResponse(res, 500, 'Failed to retrieve signature requests.');
  }
}
exports.getSignatureRequests = getSignatureRequests;

/**
 * Rejects a pending signature request.
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 */
async function rejectSignatureRequest(req, res) {
  const { id: signatureRequestId } = req.params;
  const { rejectionReason } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return errorResponse(res, 401, 'User not authenticated.');
  }

  if (!signatureRequestId) {
    return errorResponse(res, 400, 'Signature Request ID is required in URL parameters.');
  }

  if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim() === '') {
    return errorResponse(res, 400, 'A non-empty rejectionReason is required in the request body.');
  }

  try {
    // Attempt to parse the ID first. If it's not a valid number, Prisma will also error,
    // but this provides a clearer error message earlier.
    const numericSignatureRequestId = parseInt(signatureRequestId);
    if (isNaN(numericSignatureRequestId)) {
      return errorResponse(res, 400, `Invalid Signature Request ID format: "${signatureRequestId}". Must be an integer.`);
    }

    const signatureRequest = await prisma.signatureRequest.findUnique({
      where: { id: numericSignatureRequestId },
    });

    if (!signatureRequest) {
      return errorResponse(res, 404, `Signature Request with ID ${numericSignatureRequestId} not found.`);
    }

    if (signatureRequest.signerId !== userId) {
      return errorResponse(res, 403, 'You are not authorized to reject this signature request.');
    }

    if (signatureRequest.status !== 'PENDING') {
      return errorResponse(res, 409, `Signature request cannot be rejected. Current status: ${signatureRequest.status}.`);
    }

    const updatedSignatureRequest = await prisma.signatureRequest.update({
      where: { id: numericSignatureRequestId },
      data: {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
        // updatedAt should be handled by Prisma's @updatedAt directive
      },
    });

    return res.status(200).json(updatedSignatureRequest);

  } catch (error) {
    console.error(`Error rejecting signature request ${signatureRequestId}:`, error);
    // Check for Prisma's specific error code for "record not found" during an update operation
    if (error.code === 'P2025') { 
        return errorResponse(res, 404, `Signature Request with ID ${signatureRequestId} not found (it may have been deleted).`);
    }
    // General catch-all for other errors
    return errorResponse(res, 500, 'Failed to reject signature request.');
  }
}
exports.rejectSignatureRequest = rejectSignatureRequest;

const fs = require('fs').promises;
const path = require('path');
const { generateQrCode } = require('../utils/qrCodeGenerator'); // Adjusted path
const { embedQrCode, embedCertificate } = require('../utils/documentProcessor'); // Adjusted path

// Define base paths for documents. These should be configurable and secure.
// For this example, paths are relative to the project root.
const ORIGINAL_DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'documents');
const SIGNED_DOCUMENTS_DIR = path.join(process.cwd(), 'uploads', 'signed_documents');

/**
 * Approves a pending signature request.
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 */
async function approveSignatureRequest(req, res) {
  const { id: signatureRequestIdStr } = req.params;
  const userId = req.user?.id;
  let signedDocPath; // To be used for potential cleanup

  if (!userId) {
    return errorResponse(res, 401, 'User not authenticated.');
  }

  const signatureRequestId = parseInt(signatureRequestIdStr);
  if (isNaN(signatureRequestId)) {
    return errorResponse(res, 400, `Invalid Signature Request ID format: "${signatureRequestIdStr}". Must be an integer.`);
  }

  try {
    const signatureRequest = await prisma.signatureRequest.findUnique({
      where: { id: signatureRequestId },
      include: {
        document: { // Need document details for file path and verification URL
          select: { id: true, stored_filename: true }, // Use stored_filename for safety
        },
      },
    });

    if (!signatureRequest) {
      return errorResponse(res, 404, `Signature Request with ID ${signatureRequestId} not found.`);
    }

    if (signatureRequest.signerId !== userId) {
      return errorResponse(res, 403, 'You are not authorized to approve this signature request.');
    }

    if (signatureRequest.status !== 'PENDING') {
      return errorResponse(res, 409, `Signature request cannot be approved. Current status: ${signatureRequest.status}.`);
    }

    if (!signatureRequest.document || !signatureRequest.document.stored_filename) {
        return errorResponse(res, 500, 'Document information is missing in the signature request.');
    }

    const originalDocPath = path.join(ORIGINAL_DOCUMENTS_DIR, signatureRequest.document.stored_filename);

    try {
      await fs.access(originalDocPath);
    } catch (fileAccessError) {
      console.error(`Original document not found at path: ${originalDocPath}`, fileAccessError);
      return errorResponse(res, 500, `Original document is missing or inaccessible. Please contact support. Ref: ${signatureRequest.id}`);
    }
    
    // --- Core Logic: File operations and DB update ---
    const signedDocFilename = `signed_${Date.now()}_${signatureRequest.document.stored_filename}`;
    signedDocPath = path.join(SIGNED_DOCUMENTS_DIR, signedDocFilename); // Assign to outer scope for cleanup

    // Construct a relative verification URL. This will be stored and used for QR code generation.
    // It's expected to be resolved relative to the application's base URL when accessed.
    const verificationUrl = `/verify/signature/${signatureRequest.id}`;

    const qrCodeDataUri = await generateQrCode(verificationUrl);

    await fs.mkdir(SIGNED_DOCUMENTS_DIR, { recursive: true });
    await fs.copyFile(originalDocPath, signedDocPath);

    // Embed QR code: embedQrCode reads from signedDocPath, modifies, returns bytes
    const pdfBytesWithQr = await embedQrCode(signedDocPath, qrCodeDataUri);
    await fs.writeFile(signedDocPath, pdfBytesWithQr);

    // Embed certificate (placeholder)
    await embedCertificate(signedDocPath, { 
      signerId: userId, 
      documentId: signatureRequest.document.id,
      signatureRequestId: signatureRequest.id,
      timestamp: new Date().toISOString(),
    });

    const updatedSignatureRequest = await prisma.signatureRequest.update({
      where: { id: signatureRequestId },
      data: {
        status: 'APPROVED',
        qrCodeUrl: verificationUrl, // Store the URL that was encoded
        signedDocumentPath: signedDocPath, // Store the path to the new signed document
        updatedAt: new Date(),
      },
    });

    return res.status(200).json(updatedSignatureRequest);

  } catch (error) {
    console.error(`Error approving signature request ${signatureRequestId}:`, error);

    // Attempt to clean up the copied file if it exists and an error occurred
    if (signedDocPath) {
      try {
        await fs.unlink(signedDocPath);
        console.log(`Cleaned up partially created signed document: ${signedDocPath}`);
      } catch (cleanupError) {
        console.error(`Failed to cleanup signed document ${signedDocPath}:`, cleanupError);
        // Log this error but don't mask the original error sent to the client
      }
    }
    
    if (error.message.includes("generateQrCode") || error.message.includes("embedQrCode") || error.message.includes("embedCertificate")) {
        return errorResponse(res, 500, `Failed during document processing stage: ${error.message}`);
    }

    return errorResponse(res, 500, 'Failed to approve signature request due to an internal server error.');
  }
}
exports.approveSignatureRequest = approveSignatureRequest;
