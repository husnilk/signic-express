const request = require('supertest');
const express = require('express');
const signatureRequestRoutes = require('../routes/signatureRequestRoutes');
const { SigningStatus } = require('@prisma/client'); // For enum values

// Mock Prisma Client
const mockPrismaClient = {
  signatureRequest: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  document: { // For createSignatureRequest document check
    findUnique: jest.fn(),
  },
  // Add other models and methods as needed by controller logic
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
  SigningStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
}));

// Mock authMiddleware
// This mock will inject a user object into req for testing purposes
const mockAuthMiddleware = (req, res, next) => {
  req.user = { id: 1, email: 'testuser@example.com' }; // Default test user
  next();
};
jest.mock('../authMiddleware', () => mockAuthMiddleware);


const app = express();
app.use(express.json()); // To parse request bodies
app.use('/api/signature-requests', signatureRequestRoutes); // Mount the routes to be tested

// Helper to reset mocks before each test
const resetMocks = () => {
  mockPrismaClient.signatureRequest.create.mockReset();
  mockPrismaClient.signatureRequest.findUnique.mockReset();
  mockPrismaClient.signatureRequest.findMany.mockReset();
  mockPrismaClient.signatureRequest.update.mockReset();
  mockPrismaClient.document.findUnique.mockReset();
};

describe('Signature Request API Routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  // --- POST / --- (Create Signature Request) ---
  describe('POST /api/signature-requests', () => {
    it('should create a signature request successfully with valid data', async () => {
      const requestData = { document_id: 'doc1', signer_id: 2, signing_reason: 'Test sign' };
      const mockCreatedRequest = { 
        id: 'sr1', 
        ...requestData, 
        requester_id: 1, 
        signing_status: SigningStatus.PENDING,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrismaClient.document.findUnique.mockResolvedValue({ id: 'doc1', owner_id: 1 }); // Document exists
      mockPrismaClient.signatureRequest.create.mockResolvedValue(mockCreatedRequest);

      const response = await request(app)
        .post('/api/signature-requests')
        .send(requestData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockCreatedRequest);
      expect(mockPrismaClient.signatureRequest.create).toHaveBeenCalledWith({
        data: {
          ...requestData,
          requester_id: 1, // from mocked authMiddleware
          signing_status: SigningStatus.PENDING,
        },
      });
    });

    it('should fail with missing document_id (400)', async () => {
      const requestData = { signer_id: 2 };
      const response = await request(app)
        .post('/api/signature-requests')
        .send(requestData);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('document_id and signer_id are required.');
    });

    it('should fail with missing signer_id (400)', async () => {
      const requestData = { document_id: 'doc1' };
      const response = await request(app)
        .post('/api/signature-requests')
        .send(requestData);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('document_id and signer_id are required.');
    });
    
    it('should return 400 if document_id is invalid (not found)', async () => {
        mockPrismaClient.document.findUnique.mockResolvedValue(null); // Document does not exist
        const requestData = { document_id: 'nonexistent-doc', signer_id: 2 };
        const response = await request(app)
            .post('/api/signature-requests')
            .send(requestData);
        expect(response.status).toBe(404); // Controller returns 404 for document not found
        expect(response.body.error).toBe('Document not found.');
    });

    it('should return 400 if signer_id is invalid (foreign key constraint)', async () => {
        mockPrismaClient.document.findUnique.mockResolvedValue({ id: 'doc1', owner_id: 1 });
        mockPrismaClient.signatureRequest.create.mockRejectedValue({
            code: 'P2003',
            meta: { field_name: 'SignatureRequest_signer_id_fkey (index)' } 
        });
        const requestData = { document_id: 'doc1', signer_id: 999 }; // Assume 999 is invalid signer
        const response = await request(app)
            .post('/api/signature-requests')
            .send(requestData);
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid signer_id.');
    });
  });

  // --- GET /:id --- (Get Signature Request by ID) ---
  describe('GET /api/signature-requests/:id', () => {
    it('should retrieve an existing request successfully if user is requester', async () => {
      const mockRequest = { id: 'sr1', document_id: 'doc1', signer_id: 2, requester_id: 1, signing_status: SigningStatus.PENDING };
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockRequest);
      
      // req.user.id is 1 (requester)
      const response = await request(app).get('/api/signature-requests/sr1');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRequest);
    });

    it('should retrieve an existing request successfully if user is signer', async () => {
        const mockRequest = { id: 'sr1', document_id: 'doc1', signer_id: 1, requester_id: 2, signing_status: SigningStatus.PENDING };
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockRequest);
        
        // req.user.id is 1 (signer)
        const response = await request(app).get('/api/signature-requests/sr1');
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockRequest);
      });

    it('should fail for a non-existent ID (404)', async () => {
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(null);
      const response = await request(app).get('/api/signature-requests/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Signature request not found.');
    });

    it('should fail if user is not requester or signer (403)', async () => {
        const mockRequest = { id: 'sr1', document_id: 'doc1', signer_id: 2, requester_id: 3, signing_status: SigningStatus.PENDING };
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(mockRequest);
        
        // req.user.id is 1
        const response = await request(app).get('/api/signature-requests/sr1');
        
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('You are not authorized to view this signature request.');
    });
  });

  // --- PUT /:id --- (Update Signature Request) ---
  describe('PUT /api/signature-requests/:id', () => {
    const srId = 'sr1_pending';

    it('should allow signer to approve a PENDING request', async () => {
      const existingRequest = { id: srId, signer_id: 1, requester_id: 2, signing_status: SigningStatus.PENDING };
      const updateData = { signing_status: SigningStatus.APPROVED, signature_visual: 'signature.png' };
      const updatedRequest = { ...existingRequest, ...updateData, signed_at: new Date().toISOString() }; // Controller adds signed_at

      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      mockPrismaClient.signatureRequest.update.mockImplementation(async ({ data }) => ({
        ...existingRequest,
        ...data,
        // signed_at: data.signed_at ? data.signed_at.toISOString() : undefined // Simulate controller behavior
      }));
      
      // req.user.id is 1 (signer)
      const response = await request(app)
        .put(`/api/signature-requests/${srId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.signing_status).toBe(SigningStatus.APPROVED);
      expect(response.body.signature_visual).toBe('signature.png');
      expect(mockPrismaClient.signatureRequest.update).toHaveBeenCalledWith({
        where: { id: srId },
        data: expect.objectContaining({
          signing_status: SigningStatus.APPROVED,
          signature_visual: 'signature.png',
          signed_at: expect.any(Date), // Controller sets this
        }),
      });
    });

    it('should allow signer to reject a PENDING request with a reason', async () => {
      const existingRequest = { id: srId, signer_id: 1, requester_id: 2, signing_status: SigningStatus.PENDING };
      const updateData = { signing_status: SigningStatus.REJECTED, signing_reason: 'Do not agree' };
      const updatedRequest = { ...existingRequest, ...updateData };
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      mockPrismaClient.signatureRequest.update.mockResolvedValue(updatedRequest);
      
      // req.user.id is 1 (signer)
      const response = await request(app)
        .put(`/api/signature-requests/${srId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.signing_status).toBe(SigningStatus.REJECTED);
      expect(response.body.signing_reason).toBe('Do not agree');
    });

    it('should fail if signer tries to reject a PENDING request without a reason (400)', async () => {
        const existingRequest = { id: srId, signer_id: 1, requester_id: 2, signing_status: SigningStatus.PENDING };
        const updateData = { signing_status: SigningStatus.REJECTED }; // No signing_reason
        
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
        
        const response = await request(app)
          .put(`/api/signature-requests/${srId}`)
          .send(updateData);
  
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('A reason is required for rejecting a signature request.');
      });

    it('should NOT allow requester (creator) to approve/reject (403)', async () => {
      const existingRequest = { id: srId, signer_id: 2, requester_id: 1, signing_status: SigningStatus.PENDING };
      const updateData = { signing_status: SigningStatus.APPROVED };
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      
      // req.user.id is 1 (requester)
      const response = await request(app)
        .put(`/api/signature-requests/${srId}`)
        .send(updateData);
      
      expect(response.status).toBe(403);
    });

    it('should NOT allow signer to cancel (403)', async () => {
        // Cancel action is via a specific PUT /:id/cancel route, but general update can set status
        // The controller logic for PUT /:id checks if the user is signer or requester and what status they can set.
        // Signer cannot set status to CANCELLED.
        const existingRequest = { id: srId, signer_id: 1, requester_id: 2, signing_status: SigningStatus.PENDING };
        const updateData = { signing_status: SigningStatus.CANCELLED };
        
        mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
        
        // req.user.id is 1 (signer)
        const response = await request(app)
          .put(`/api/signature-requests/${srId}`)
          .send(updateData);
        
        expect(response.status).toBe(403);
      });

    it('should fail to update a non-PENDING request (e.g. APPROVED to REJECTED by signer) (403)', async () => {
      const existingRequest = { id: 'sr1_approved', signer_id: 1, requester_id: 2, signing_status: SigningStatus.APPROVED };
      const updateData = { signing_status: SigningStatus.REJECTED, signing_reason: "Changed my mind" };
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      
      // req.user.id is 1 (signer)
      const response = await request(app)
        .put('/api/signature-requests/sr1_approved')
        .send(updateData);
      
      expect(response.status).toBe(403); // Or 400 depending on controller's specific message for this
      expect(response.body.error).toContain('You are not authorized to perform this update or the update is not allowed for the current status.');
    });
  });

  // --- PUT /:id/cancel --- (Cancel Signature Request) ---
  describe('PUT /api/signature-requests/:id/cancel', () => {
    const srId = 'sr1_pending_for_cancel';

    it('should allow requester (creator) to cancel a PENDING request', async () => {
      const existingRequest = { id: srId, signer_id: 2, requester_id: 1, signing_status: SigningStatus.PENDING };
      const updatedRequest = { ...existingRequest, signing_status: SigningStatus.CANCELLED };
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      mockPrismaClient.signatureRequest.update.mockResolvedValue(updatedRequest);
      
      // req.user.id is 1 (requester)
      const response = await request(app).put(`/api/signature-requests/${srId}/cancel`).send();

      expect(response.status).toBe(200);
      expect(response.body.signing_status).toBe(SigningStatus.CANCELLED);
    });

    it('should NOT allow non-requester (e.g. signer) to cancel (403)', async () => {
      const existingRequest = { id: srId, signer_id: 1, requester_id: 2, signing_status: SigningStatus.PENDING };
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      
      // req.user.id is 1 (signer)
      const response = await request(app).put(`/api/signature-requests/${srId}/cancel`).send();
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('You are not authorized to cancel this signature request.');
    });

    it('should fail to cancel a non-PENDING request (e.g. an APPROVED one) (400)', async () => {
      const existingRequest = { id: 'sr1_approved', signer_id: 2, requester_id: 1, signing_status: SigningStatus.APPROVED };
      
      mockPrismaClient.signatureRequest.findUnique.mockResolvedValue(existingRequest);
      
      // req.user.id is 1 (requester)
      const response = await request(app).put('/api/signature-requests/sr1_approved/cancel').send();
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(`Signature request cannot be cancelled as its status is ${SigningStatus.APPROVED}.`);
    });
  });

  // --- GET / --- (List Signature Requests) ---
  describe('GET /api/signature-requests', () => {
    it('should retrieve a list of requests for the user (requester or signer)', async () => {
      const mockRequests = [
        { id: 'sr1', document_id: 'doc1', signer_id: 2, requester_id: 1, signing_status: SigningStatus.PENDING },
        { id: 'sr2', document_id: 'doc2', signer_id: 1, requester_id: 3, signing_status: SigningStatus.APPROVED },
      ];
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue(mockRequests);

      const response = await request(app).get('/api/signature-requests');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRequests);
      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { // Controller adds this OR condition by default for the authenticated user
          OR: [
            { requester_id: 1 }, // req.user.id
            { signer_id: 1 },   // req.user.id
          ],
        },
      }));
    });

    it('should filter by document_id', async () => {
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]); // Actual data doesn't matter, just the query
      await request(app).get('/api/signature-requests?document_id=doc1');
      
      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          document_id: 'doc1',
          // The controller also adds the OR condition for user involvement
           OR: [ { requester_id: 1 }, { signer_id: 1 } ],
        }),
      }));
    });

    it('should filter by signer_id', async () => {
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
      await request(app).get('/api/signature-requests?signer_id=2');
      
      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          signer_id: 2,
          OR: [ { requester_id: 1 }, { signer_id: 1 } ],
        }),
      }));
    });

    it('should filter by requester_id', async () => {
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
      await request(app).get('/api/signature-requests?requester_id=3');
      
      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          requester_id: 3,
          OR: [ { requester_id: 1 }, { signer_id: 1 } ],
        }),
      }));
    });
    
    it('should filter by status', async () => {
        mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
        await request(app).get('/api/signature-requests?status=PENDING');
        
        expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({
            signing_status: 'PENDING',
            OR: [ { requester_id: 1 }, { signer_id: 1 } ],
          }),
        }));
      });
  });

  // --- GET /document/:documentId --- (List by Document ID via path param) ---
  describe('GET /api/signature-requests/document/:documentId', () => {
    it('should correctly pass documentId from path to controller as query param', async () => {
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
      await request(app).get('/api/signature-requests/document/docXYZ');

      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          document_id: 'docXYZ', // This is what the route adapter in signatureRequestRoutes.js does
          OR: [ { requester_id: 1 }, { signer_id: 1 } ],
        }),
      }));
    });
  });

  // --- GET /user/:userId --- (List by User ID via path param) ---
  describe('GET /api/signature-requests/user/:userId', () => {
    it('should correctly pass userId from path to controller as requester_id query param', async () => {
      mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
      await request(app).get('/api/signature-requests/user/userABC'); // Assuming userABC is parsed as int by controller if needed

      expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          requester_id: NaN, // "userABC" from path will be set as req.query.requester_id by the route. parseInt("userABC") is NaN
                            // The controller's parseInt(signer_id) or parseInt(requester_id) would make it NaN.
                            // This highlights a potential issue with the route if userId is not an int, or controller needs to handle it.
                            // For the test, we check what is *actually* sent to Prisma.
                            // Let's assume the controller expects an integer for requester_id.
                            // The route `signatureRequestRoutes.js` forwards `req.params.userId` directly to `req.query.requester_id`.
                            // The controller `signatureRequestController.js` then does `parseInt(requester_id)`.
                            // So if `userId` is "userABC", `parseInt("userABC")` is `NaN`.
                            // The Prisma query would then be `where: { requester_id: NaN, ... }`
          OR: [ { requester_id: 1 }, { signer_id: 1 } ],
        }),
      }));
    });

    it('should correctly pass numeric userId from path to controller as requester_id query param', async () => {
        mockPrismaClient.signatureRequest.findMany.mockResolvedValue([]);
        await request(app).get('/api/signature-requests/user/5'); 
  
        expect(mockPrismaClient.signatureRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({
            requester_id: 5, 
            OR: [ { requester_id: 1 }, { signer_id: 1 } ],
          }),
        }));
      });
  });

});
