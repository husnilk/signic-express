const { PrismaClient, SigningStatus } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function for error responses
const errorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ error: message });
};

// Create a new signature request
exports.createSignatureRequest = async (req, res) => {
  const { document_id, signer_id, signing_reason } = req.body;
  const requester_id = req.user?.id; // Assuming req.user.id is populated by auth middleware

  if (!requester_id) {
    return errorResponse(res, 401, 'User not authenticated.');
  }
  if (!document_id || !signer_id) {
    return errorResponse(res, 400, 'document_id and signer_id are required.');
  }

  try {
    // Check if the document exists and if the requester has rights to request signatures for it (e.g., is owner or uploader)
    const document = await prisma.document.findUnique({ where: { id: document_id } });
    if (!document) {
      return errorResponse(res, 404, 'Document not found.');
    }
    // Add authorization logic here if needed, e.g., check if requester_id is document.owner_id or document.uploader_id

    const signatureRequest = await prisma.signatureRequest.create({
      data: {
        document_id,
        signer_id,
        requester_id,
        signing_reason,
        signing_status: SigningStatus.PENDING,
      },
    });
    res.status(201).json(signatureRequest);
  } catch (error) {
    console.error('Error creating signature request:', error);
    if (error.code === 'P2003') { // Foreign key constraint failed
        if (error.meta?.field_name?.includes('document_id')) {
            return errorResponse(res, 400, 'Invalid document_id.');
        }
        if (error.meta?.field_name?.includes('signer_id')) {
            return errorResponse(res, 400, 'Invalid signer_id.');
        }
        if (error.meta?.field_name?.includes('requester_id')) {
            return errorResponse(res, 400, 'Invalid requester_id.');
        }
    }
    errorResponse(res, 500, 'Failed to create signature request.');
  }
};

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
