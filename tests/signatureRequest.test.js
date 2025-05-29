const {
  createSignatureRequest,
  getSignatureRequests,
  approveSignatureRequest,
  rejectSignatureRequest,
} = require('../controllers/signatureRequestController'); // Adjust path if necessary

// Mock Prisma
const mockPrismaClient = {
  signatureRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  document: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

// Mock utils
jest.mock('../utils/qrCodeGenerator.js', () => ({
  generateQrCode: jest.fn(),
}));
jest.mock('../utils/documentProcessor.js', () => ({
  embedQrCode: jest.fn(),
  embedCertificate: jest.fn(),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  copyFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

// Mock path (specifically for join used in approveSignatureRequest for constants)
// Constants like ORIGINAL_DOCUMENTS_DIR are defined in signatureRequestController.js
// We need to ensure path.join works as expected in that context.
// However, the constants are defined using process.cwd(), so mocking path.join might not be strictly needed
// if we don't assert the exact path strings, or if we mock process.cwd().
// For now, we'll assume path.join works and focus on other mocks.

const { generateQrCode } = require('../utils/qrCodeGenerator');
const { embedQrCode, embedCertificate } = require('../utils/documentProcessor');
const fs = require('fs/promises');

// Helper for Express req/res objects
const mockRequest = (body = {}, params = {}, user = null) => ({
  body,
  params,
  user,
  protocol: 'http',
  get: jest.fn().mockReturnValue('localhost:3000'), // For URL generation
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('SignatureRequestController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = mockResponse();
  });

  describe('createSignatureRequest', () => {
    const mockDoc = { id: 'doc1', title: 'Test Document' };
    const mockSignerUser = { id: 2, email: 'signer@example.com' };
    const mockRequesterUser = { id: 1, email: 'requester@example.com' };

    it('should create a signature request successfully', async () => {
      req = mockRequest({ documentId: 'doc1', signerId: 2 }, {}, { id: 1 });
      mockPrismaClient.document.findUnique.mockResolvedValue(mockDoc);
      mockPrismaClient.user.findUnique
        .mockResolvedValueOnce(mockSignerUser) // First call for signer
        .mockResolvedValueOnce(mockRequesterUser); // Second call for requester
      const createdReq = { id: 1, documentId: 'doc1', signerId: 2, requesterId: 1, status: 'PENDING' };
      mockPrismaClient.signatureRequest.create.mockResolvedValue(createdReq);

      await createSignatureRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(createdReq);
      expect(mockPrismaClient.signatureRequest.create).toHaveBeenCalledWith({
        data: { documentId: 'doc1', signerId: 2, requesterId: 1, status: 'PENDING' },
      });
    });

    it('should return 400 if documentId or signerId is missing', async () => {
      req = mockRequest({ signerId: 2 }, {}, { id: 1 }); // Missing documentId
      await createSignatureRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'documentId and signerId are required.' });
    });

    it('should return 400 if requesterId is same as signerId', async () => {
      req = mockRequest({ documentId: 'doc1', signerId: 1 }, {}, { id: 1 });
      await createSignatureRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Requester cannot be the same as the signer.' });
    });

    it('should return 404 if document not found', async () => {
      req = mockRequest({ documentId: 'doc1', signerId: 2 }, {}, { id: 1 });
      mockPrismaClient.document.findUnique.mockResolvedValue(null);
      await createSignatureRequest(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Document with ID doc1 not found.' });
    });

    it('should return 404 if signer not found', async () => {
        req = mockRequest({ documentId: 'doc1', signerId: 2 }, {}, { id: 1 });
        mockPrismaClient.document.findUnique.mockResolvedValue(mockDoc);
        mockPrismaClient.user.findUnique.mockResolvedValueOnce(null); // Signer not found
        await createSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'User with ID 2 (signer) not found.' });
    });
  });

  describe('getSignatureRequests', () => {
    it('should retrieve signature requests for the logged-in user', async () => {
      req = mockRequest({}, {}, { id: 1 });
      const mockRequests = [{ id: 1, documentId: 'doc1', status: 'PENDING', signerId: 1 }];
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue(mockRequests);

      await getSignatureRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockRequests);
      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith({
        where: { signerId: 1, status: 'PENDING' },
        include: expect.any(Object), // Check if include is there
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return an empty array if no requests are found', async () => {
        req = mockRequest({}, {}, { id: 1 });
        mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
        await getSignatureRequests(req, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should return 401 if user is not authenticated', async () => {
        req = mockRequest({}, {}, null); // No user
        await getSignatureRequests(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('rejectSignatureRequest', () => {
    const mockSigReq = { id: 1, documentId: 'doc1', status: 'PENDING', signerId: 1 };
    const updatedReq = { ...mockSigReq, status: 'REJECTED', rejectionReason: 'Not valid' };

    it('should reject a signature request successfully', async () => {
      req = mockRequest({ rejectionReason: 'Not valid' }, { id: '1' }, { id: 1 });
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockSigReq);
      mockPrismaClient.signatureRequest.update.mockResolvedValue(updatedReq);

      await rejectSignatureRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedReq);
      expect(mockPrismaClient.signatureRequest.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'REJECTED', rejectionReason: 'Not valid' }, // Controller relies on @updatedAt
      });
    });

    it('should return 400 if rejectionReason is missing', async () => {
        req = mockRequest({}, { id: '1' }, { id: 1 });
        await rejectSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'A non-empty rejectionReason is required in the request body.' });
    });
    
    it('should return 404 if signature request not found', async () => {
        req = mockRequest({ rejectionReason: 'Test' }, { id: '1' }, { id: 1 });
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(null);
        await rejectSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 if user is not the signer', async () => {
        req = mockRequest({ rejectionReason: 'Test' }, { id: '1' }, { id: 2 }); // User ID 2, signer ID 1
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockSigReq);
        await rejectSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 409 if request is not PENDING', async () => {
        req = mockRequest({ rejectionReason: 'Test' }, { id: '1' }, { id: 1 });
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue({ ...mockSigReq, status: 'APPROVED' });
        await rejectSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('approveSignatureRequest', () => {
    const mockDocDetails = { id: 'doc1', stored_filename: 'test_doc.pdf' };
    const mockSigReqPending = { 
      id: 1, 
      documentId: 'doc1', 
      status: 'PENDING', 
      signerId: 1,
      document: mockDocDetails 
    };
    const approvedReqData = { 
      ...mockSigReqPending, 
      status: 'APPROVED', 
      qrCodeUrl: expect.any(String), 
      signedDocumentPath: expect.stringContaining('signed_') 
    };

    it('should approve a signature request successfully', async () => {
      req = mockRequest({}, { id: '1' }, { id: 1 });
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockSigReqPending);
      fs.access.mockResolvedValue(undefined); // Original document exists
      generateQrCode.mockResolvedValue('data:image/png;base64,testqrcode');
      fs.mkdir.mockResolvedValue(undefined);
      fs.copyFile.mockResolvedValue(undefined);
      embedQrCode.mockResolvedValue(Buffer.from('pdf-bytes-with-qr'));
      fs.writeFile.mockResolvedValue(undefined);
      embedCertificate.mockResolvedValue(undefined); // Placeholder
      mockPrismaClient.signatureRequest.update.mockResolvedValue(approvedReqData);

      await approveSignatureRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(approvedReqData);
      expect(fs.copyFile).toHaveBeenCalled();
      expect(embedQrCode).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockPrismaClient.signatureRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          qrCodeUrl: `/verify/signature/${mockSigReqPending.id}`,
          signedDocumentPath: expect.stringMatching(/uploads(\/|\\)signed_documents(\/|\\)signed_\d+_test_doc\.pdf/),
        }),
      }));
    });

    it('should return 500 if original document is missing', async () => {
      req = mockRequest({}, { id: '1' }, { id: 1 });
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockSigReqPending);
      fs.access.mockRejectedValue(new Error('File not found')); // Original document does not exist

      await approveSignatureRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('Original document is missing or inaccessible'),
      }));
    });
    
    it('should return 404 if signature request not found for approval', async () => {
        req = mockRequest({}, { id: '1' }, { id: 1 });
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(null);
        await approveSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 403 if user is not signer for approval', async () => {
        req = mockRequest({}, { id: '1' }, { id: 2 }); // User 2, signer 1
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockSigReqPending);
        await approveSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(403);
    });
    
    it('should return 409 if request not PENDING for approval', async () => {
        req = mockRequest({}, { id: '1' }, { id: 1 });
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue({ ...mockSigReqPending, status: 'REJECTED' });
        await approveSignatureRequest(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should attempt cleanup if a file operation fails', async () => {
      req = mockRequest({}, { id: '1' }, { id: 1 });
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockSigReqPending);
      fs.access.mockResolvedValue(undefined);
      generateQrCode.mockResolvedValue('data:image/png;base64,testqrcode');
      fs.mkdir.mockResolvedValue(undefined);
      fs.copyFile.mockResolvedValue(undefined); // Copy succeeds
      embedQrCode.mockRejectedValue(new Error('Embedding failed')); // embedQrCode fails

      await approveSignatureRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/uploads(\/|\\)signed_documents(\/|\\)signed_\d+_test_doc\.pdf/));
    });
  });
});
